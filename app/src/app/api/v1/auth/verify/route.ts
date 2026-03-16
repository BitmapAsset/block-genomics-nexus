import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import crypto from 'crypto';
import { logActivity } from '@/lib/activity';
import { getChallenge, deleteChallenge } from '@/lib/challenges';

/**
 * POST /api/v1/auth/verify
 * Body: { walletAddress, signature, message, blockHeight?, handle?, displayName? }
 * 
 * Step 1: Verify wallet signature (BIP-322 — currently accepts any non-empty sig)
 * Step 2: Generate genome hash from wallet + block
 * Step 3: Upsert user with tier, handle, genome
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, blockHeight, handle, displayName, inscriptionId } = body;

    if (!walletAddress || !signature || !message) {
      return error('walletAddress, signature, and message are required', 400);
    }

    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    // BIP-322 signature verification — no fallback, must be cryptographically valid
    let isValid = false;
    try {
      const { Verifier } = require('bip322-js');
      isValid = Verifier.verifySignature(walletAddress, message, signature);
    } catch (e: unknown) {
      console.warn('[auth] BIP-322 lib error (likely taproot):', e instanceof Error ? e.message : e);
      // SECURITY: Do NOT accept unverified signatures. Taproot (bc1p) addresses
      // require proper Schnorr verification (e.g. @noble/secp256k1).
      isValid = false;
    }
    if (!isValid) {
      return error('Invalid signature', 401);
    }

    // SECURITY: Challenge nonce is mandatory for anti-replay protection
    const challenge = getChallenge(walletAddress);
    if (!challenge) {
      return error('No challenge found. Request a challenge first via /auth/challenge.', 401);
    }
    if (!message.includes(challenge.nonce)) {
      return error('Invalid or expired challenge nonce', 401);
    }
    deleteChallenge(walletAddress); // one-time use

    // ─── ON-CHAIN BITMAP OWNERSHIP VERIFICATION ─────────────────────
    // If claiming a block, we MUST verify the wallet actually holds a .bitmap inscription for it.
    // BIP-322 only proves wallet control — not bitmap ownership.
    let verifiedBlockHeight = null;
    let tier = 3; // default: no block ownership

    // Check if user already exists (used for skip-on-chain and genome hash reuse)
    const existingUser = await prisma.user.findUnique({ where: { walletAddress } });

    // Skip on-chain check if user already verified for this block (e.g. Step 4 profile creation after Step 3 verify)
    if (blockHeight && existingUser?.verified && existingUser?.tier === 1 && existingUser?.anchorBlock === blockHeight && existingUser?.genomeHash) {
      verifiedBlockHeight = blockHeight;
      tier = 1;
    }

    if (blockHeight && tier !== 1) {
      // If inscriptionId provided, verify it belongs to this wallet on-chain
      if (inscriptionId) {
        const ownerCheck = await verifyInscriptionOwnership(walletAddress, inscriptionId, blockHeight);
        if (ownerCheck.verified) {
          verifiedBlockHeight = blockHeight;
          tier = 1;
        } else {
          return error(`Ownership verification failed: ${ownerCheck.reason}`, 403);
        }
      } else {
        // No inscriptionId — scan wallet for .bitmap inscriptions matching this block
        const scanResult = await scanWalletForBitmap(walletAddress, blockHeight);
        if (scanResult.found) {
          verifiedBlockHeight = blockHeight;
          tier = 1;
        } else {
          return error(
            `No .bitmap inscription for block ${blockHeight} found in this wallet. ` +
            `You must own the .bitmap inscription to verify as Tier 1.`,
            403
          );
        }
      }
    }

    // Reuse existing genome hash if already verified, otherwise generate new one
    const genomeHash = (existingUser?.genomeHash && existingUser?.verified)
      ? existingUser.genomeHash
      : '0x' + crypto.createHash('sha256').update(`${walletAddress}:${verifiedBlockHeight || 0}:${signature}`).digest('hex');

    // Normalize handle to lowercase
    const normalizedHandle = handle?.toLowerCase().replace(/-/g, '_');

    // Validate handle format: only letters, numbers, underscores
    if (normalizedHandle && !/^[a-z0-9_]{1,30}$/.test(normalizedHandle)) {
      return error('Handle can only contain letters, numbers, and underscores (max 30 chars)', 400);
    }

    // Check handle uniqueness if provided (ABSOLUTE global uniqueness across User + BlockProfile)
    // A handle cannot exist in BOTH tables, even for the same wallet
    if (normalizedHandle) {
      const [handleInUser, handleInProfile] = await Promise.all([
        prisma.user.findUnique({ where: { handle: normalizedHandle } }),
        prisma.blockProfile.findUnique({ where: { handle: normalizedHandle } }),
      ]);
      // Allow same wallet to keep/update their OWN User handle
      if (handleInUser && handleInUser.walletAddress !== walletAddress) {
        return error('Handle already taken', 409);
      }
      // Block if handle exists in BlockProfile table — even for same wallet
      // (they must clear it from BlockProfile first to use it as a User handle)
      if (handleInProfile) {
        return error('Handle already taken (registered as a block profile handle)', 409);
      }
    }

    // Upsert user
    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: {
        verified: true,
        tier,
        genomeHash,
        ...(verifiedBlockHeight && { anchorBlock: verifiedBlockHeight }),
        ...(normalizedHandle && { handle: normalizedHandle }),
        ...(displayName !== undefined && { displayName }),
      },
      create: {
        walletAddress,
        verified: true,
        tier,
        genomeHash,
        anchorBlock: verifiedBlockHeight || null,
        handle: normalizedHandle || null,
        displayName: displayName || null,
      },
    });

    // Record handle history if handle was set
    if (normalizedHandle) {
      await prisma.handleHistory.create({
        data: { handle: normalizedHandle, walletAddress, action: 'claimed' },
      });
    }

    // Create/update block record only if ownership was verified on-chain
    if (verifiedBlockHeight) {
      await prisma.block.upsert({
        where: { height: verifiedBlockHeight },
        update: {
          ownerAddress: walletAddress,
          ...(inscriptionId && { inscriptionId }),
        },
        create: {
          height: verifiedBlockHeight,
          ownerAddress: walletAddress,
          ...(inscriptionId && { inscriptionId }),
        },
      });
    }

    // Auto-create BlockProfile for the anchor block if one doesn't exist yet
    if (verifiedBlockHeight && normalizedHandle) {
      try {
        const existingProfile = await prisma.blockProfile.findFirst({
          where: { walletAddress, blockHeight: verifiedBlockHeight },
        });
        if (!existingProfile) {
          const profileGenomeHash = '0x' + crypto.createHash('sha256')
            .update(`${walletAddress}:${verifiedBlockHeight}:profile`)
            .digest('hex');
          await prisma.blockProfile.create({
            data: {
              walletAddress,
              blockHeight: verifiedBlockHeight,
              handle: normalizedHandle,
              displayName: displayName || null,
              genomeHash: profileGenomeHash,
              tier: 1,
              verified: true,
              isPrimary: true,
            },
          });
        }
      } catch (profileErr: unknown) {
        // Don't fail the verify flow if profile creation has a conflict
        console.warn('[auth] Auto-create BlockProfile failed (non-fatal):', profileErr instanceof Error ? profileErr.message : profileErr);
      }
    }

    // Log activity
    logActivity(walletAddress, 'verification', { tier, blockHeight: verifiedBlockHeight, handle: normalizedHandle });

    return success({
      verified: true,
      walletAddress: user.walletAddress,
      handle: user.handle,
      displayName: user.displayName,
      genomeHash: user.genomeHash,
      tier: user.tier,
      anchorBlock: user.anchorBlock,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

/**
 * GET /api/v1/auth/verify?handle=xxx
 * Check handle availability
 */
export async function GET(req: NextRequest) {
  try {
    const handle = req.nextUrl.searchParams.get('handle');
    if (!handle) return error('handle query param required', 400);

    if (handle.length < 3 || handle.length > 20) return error('Handle must be 3-20 characters', 400);
    if (!/^[a-zA-Z0-9_]+$/.test(handle)) return error('Only letters, numbers, underscores', 400);

    const normalizedHandle = handle.toLowerCase();
    const [existingUser, existingProfile] = await Promise.all([
      prisma.user.findUnique({ where: { handle: normalizedHandle } }),
      prisma.blockProfile.findUnique({ where: { handle: normalizedHandle } }),
    ]);
    return success({ handle, available: !existingUser && !existingProfile });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

// ─── ON-CHAIN OWNERSHIP VERIFICATION HELPERS ──────────────────────

const FETCH_TIMEOUT = 8000; // 8s timeout for external API calls

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Verify a specific inscription is owned by the wallet and maps to the claimed block.
 * Uses Unisat open API (ordinals.com JSON API is disabled).
 */
async function verifyInscriptionOwnership(
  walletAddress: string,
  inscriptionId: string,
  blockHeight: number
): Promise<{ verified: boolean; reason?: string }> {
  try {
    // Strategy 1: Unisat API — get inscription info
    try {
      const res = await fetchWithTimeout(
        `https://open-api.unisat.io/v1/indexer/inscription/info/${inscriptionId}`
      );
      if (res.ok) {
        const data = await res.json();
        const info = data?.data;
        if (info) {
          // Check owner address
          if (info.address && info.address !== walletAddress) {
            return { verified: false, reason: 'Inscription is not held by this wallet' };
          }
          // Check content type — .bitmap inscriptions are text/plain
          if (info.contentType && !info.contentType.includes('text')) {
            return { verified: false, reason: 'Inscription is not a text inscription (.bitmap must be text)' };
          }
        }
      }
    } catch { /* Unisat API unavailable, continue */ }

    // Strategy 2: Verify content matches the block
    // Try ordinals.com/content (this endpoint still works even if JSON API is disabled)
    try {
      const contentRes = await fetchWithTimeout(`https://ordinals.com/content/${inscriptionId}`);
      if (contentRes.ok) {
        const content = await contentRes.text();
        const trimmed = content.trim();
        const isMatch =
          trimmed === `${blockHeight}` ||
          trimmed === `${blockHeight}.bitmap` ||
          trimmed === String(blockHeight);
        if (!isMatch) {
          return { verified: false, reason: `Inscription content "${trimmed}" does not match block ${blockHeight}` };
        }
        return { verified: true };
      }
    } catch { /* ordinals content unavailable */ }

    // Strategy 3: If we can't verify content but inscription was provided by the wallet extension,
    // trust the frontend scanner (it already checked content). This is acceptable because:
    // - The user proved wallet control via BIP-322
    // - The inscription ID was provided by their wallet extension which can only see inscriptions they own
    // - We'll do periodic on-chain re-verification via the ownership cron
    // SECURITY: Do NOT fall back to trusting frontend when external APIs are unavailable.
    console.warn(`[verify] Could not verify inscription content for ${inscriptionId}, rejecting until APIs available`);
    return { verified: false, reason: 'On-chain verification temporarily unavailable. Please try again later.' };
  } catch (e) {
    console.error('[verify] Inscription ownership check failed:', e);
    return { verified: false, reason: 'On-chain verification temporarily unavailable. Please try again.' };
  }
}

/**
 * Scan a wallet's inscriptions for a .bitmap matching the claimed block.
 * Uses Unisat open API.
 */
async function scanWalletForBitmap(
  walletAddress: string,
  blockHeight: number
): Promise<{ found: boolean; inscriptionId?: string }> {
  try {
    // Strategy 1: Unisat open API — list wallet inscriptions
    try {
      const res = await fetchWithTimeout(
        `https://open-api.unisat.io/v1/indexer/address/${walletAddress}/inscription-utxo-data?cursor=0&size=100`
      );
      if (res.ok) {
        const data = await res.json();
        const utxos = data?.data?.utxo || [];
        const inscriptionIds: string[] = [];
        for (const utxo of utxos) {
          for (const insc of (utxo.inscriptions || [])) {
            if (insc.inscriptionId) inscriptionIds.push(insc.inscriptionId);
          }
        }

        // Check content of each inscription (limit to first 50 to avoid timeout)
        for (const id of inscriptionIds.slice(0, 50)) {
          try {
            const contentRes = await fetchWithTimeout(`https://ordinals.com/content/${id}`, {}, 5000);
            if (contentRes.ok) {
              const content = await contentRes.text();
              const trimmed = content.trim();
              if (trimmed === `${blockHeight}` || trimmed === `${blockHeight}.bitmap`) {
                return { found: true, inscriptionId: id };
              }
            }
          } catch { continue; }
        }
      }
    } catch { /* Unisat API unavailable */ }

    // Strategy 2: Check if we already have this block in our DB with this owner
    // (secondary verification — trust our own records if external APIs are down)
    try {
      const block = await prisma.block.findUnique({ where: { height: blockHeight } });
      if (block && block.ownerAddress === walletAddress && block.inscriptionId) {
        console.log(`[verify] Block ${blockHeight} found in DB with matching owner, accepting`);
        return { found: true, inscriptionId: block.inscriptionId };
      }
    } catch { /* DB check failed */ }

    return { found: false };
  } catch (e) {
    console.error('[verify] Wallet bitmap scan failed:', e);
    return { found: false };
  }
}
