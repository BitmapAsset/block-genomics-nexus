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

    // BIP-322 signature verification — no fallback, must be real
    let isValid = false;
    try {
      const { Verifier } = require('bip322-js');
      isValid = Verifier.verifySignature(walletAddress, message, signature);
    } catch (e: any) {
      console.error('[auth] BIP-322 verification error:', e?.message);
      return error('Signature verification unavailable. Please try again.', 500);
    }
    if (!isValid) {
      return error('Invalid signature', 401);
    }

    // Validate challenge nonce (anti-replay)
    const challenge = getChallenge(walletAddress);
    if (challenge) {
      if (!message.includes(challenge.nonce)) {
        return error('Invalid or expired challenge nonce', 401);
      }
      deleteChallenge(walletAddress); // one-time use
    }

    // ─── ON-CHAIN BITMAP OWNERSHIP VERIFICATION ─────────────────────
    // If claiming a block, we MUST verify the wallet actually holds a .bitmap inscription for it.
    // BIP-322 only proves wallet control — not bitmap ownership.
    let verifiedBlockHeight = null;
    let tier = 3; // default: no block ownership

    if (blockHeight) {
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

    // Generate genome hash: SHA-256 of wallet + block + signature
    const genomeInput = `${walletAddress}:${verifiedBlockHeight || 0}:${signature}`;
    const genomeHash = '0x' + crypto.createHash('sha256').update(genomeInput).digest('hex');

    // Normalize handle to lowercase
    const normalizedHandle = handle?.toLowerCase().replace(/-/g, '_');

    // Validate handle format: only letters, numbers, underscores
    if (normalizedHandle && !/^[a-z0-9_]{1,30}$/.test(normalizedHandle)) {
      return error('Handle can only contain letters, numbers, and underscores (max 30 chars)', 400);
    }

    // Check handle uniqueness if provided
    if (normalizedHandle) {
      const existing = await prisma.user.findUnique({ where: { handle: normalizedHandle } });
      if (existing && existing.walletAddress !== walletAddress) {
        return error('Handle already taken', 409);
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
  } catch (e: any) {
    return error(e.message, 500);
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
    const existing = await prisma.user.findUnique({ where: { handle: normalizedHandle } });
    return success({ handle, available: !existing });
  } catch (e: any) {
    return error(e.message, 500);
  }
}

// ─── ON-CHAIN OWNERSHIP VERIFICATION HELPERS ──────────────────────

/**
 * Verify a specific inscription is owned by the wallet and maps to the claimed block
 */
async function verifyInscriptionOwnership(
  walletAddress: string,
  inscriptionId: string,
  blockHeight: number
): Promise<{ verified: boolean; reason?: string }> {
  try {
    // 1. Check inscription exists and get its current owner
    const res = await fetch(`https://ordinals.com/api/inscription/${inscriptionId}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { verified: false, reason: 'Could not fetch inscription from ordinals.com' };
    }
    const data = await res.json();

    // 2. Verify the inscription address matches the wallet
    if (data.address !== walletAddress) {
      return { verified: false, reason: 'Inscription is not held by this wallet' };
    }

    // 3. Verify the inscription content is a .bitmap for the claimed block
    // Fetch inscription content to check it matches the block
    try {
      const contentRes = await fetch(`https://ordinals.com/content/${inscriptionId}`);
      if (contentRes.ok) {
        const content = await contentRes.text();
        const trimmed = content.trim();
        // .bitmap inscriptions contain just the block number or "blocknum.bitmap"
        const isMatch =
          trimmed === `${blockHeight}` ||
          trimmed === `${blockHeight}.bitmap` ||
          trimmed === String(blockHeight);
        if (!isMatch) {
          return { verified: false, reason: `Inscription content "${trimmed}" does not match block ${blockHeight}` };
        }
      }
    } catch {
      // Content fetch failed — still accept if address matches (content check is best-effort)
    }

    return { verified: true };
  } catch (e) {
    console.error('[verify] Inscription ownership check failed:', e);
    return { verified: false, reason: 'On-chain verification temporarily unavailable' };
  }
}

/**
 * Scan a wallet's inscriptions on Unisat API for a .bitmap matching the claimed block
 */
async function scanWalletForBitmap(
  walletAddress: string,
  blockHeight: number
): Promise<{ found: boolean; inscriptionId?: string }> {
  try {
    // Use Unisat open API to list inscriptions
    const res = await fetch(
      `https://open-api.unisat.io/v1/indexer/address/${walletAddress}/inscription-data?cursor=0&size=100`,
      { headers: { Accept: 'application/json' } }
    );

    if (!res.ok) {
      // Fallback: try ordinals.com
      return await scanViaOrdinals(walletAddress, blockHeight);
    }

    const data = await res.json();
    const inscriptions = data?.data?.inscription || [];

    // Check each inscription's content for .bitmap match
    for (const insc of inscriptions) {
      const id = insc.inscriptionId || insc.id;
      if (!id) continue;

      try {
        const contentRes = await fetch(`https://ordinals.com/content/${id}`);
        if (contentRes.ok) {
          const content = await contentRes.text();
          const trimmed = content.trim();
          if (
            trimmed === `${blockHeight}` ||
            trimmed === `${blockHeight}.bitmap` ||
            trimmed === String(blockHeight)
          ) {
            return { found: true, inscriptionId: id };
          }
        }
      } catch {
        continue;
      }
    }

    return { found: false };
  } catch (e) {
    console.error('[verify] Wallet bitmap scan failed:', e);
    // If scan fails, do NOT grant Tier 1 — fail closed
    return { found: false };
  }
}

/**
 * Fallback: scan via ordinals.com
 */
async function scanViaOrdinals(
  walletAddress: string,
  blockHeight: number
): Promise<{ found: boolean; inscriptionId?: string }> {
  try {
    const res = await fetch(`https://ordinals.com/api/address/${walletAddress}/inscriptions?limit=100`);
    if (!res.ok) return { found: false };
    const data = await res.json();
    const inscriptions = data?.inscriptions || data || [];

    for (const insc of inscriptions) {
      const id = typeof insc === 'string' ? insc : insc.id || insc.inscriptionId;
      if (!id) continue;
      try {
        const contentRes = await fetch(`https://ordinals.com/content/${id}`);
        if (contentRes.ok) {
          const content = await contentRes.text();
          const trimmed = content.trim();
          if (trimmed === `${blockHeight}` || trimmed === `${blockHeight}.bitmap`) {
            return { found: true, inscriptionId: id };
          }
        }
      } catch { continue; }
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}
