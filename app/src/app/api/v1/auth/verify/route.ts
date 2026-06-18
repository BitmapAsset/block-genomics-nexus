import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import { logActivity } from '@/lib/activity';
import { consumeChallengeFromMessage } from '@/lib/challenges';
import { deriveGenomeHash } from '@/lib/genome-utils';
import { normalizeHandle, isValidHandle, HANDLE_ERROR } from '@/lib/handle';
import { getInscriptionOwner as ordGetInscriptionOwner, getAddressInscriptions as ordGetAddressInscriptions } from '@/lib/onchain/ord';

/**
 * POST /api/v1/auth/verify
 * Body: { walletAddress, signature, message, blockHeight?, handle?, displayName? }
 * 
 * Step 1: Verify wallet signature (BIP-322, cryptographically enforced — no fallback)
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
      console.warn('[auth] BIP-322 verification error:', e instanceof Error ? e.message : e);
      // SECURITY: On any verifier error, reject — never accept an unverified
      // signature. bip322-js@3.0.0 supports single-key P2TR (bc1p), so a thrown
      // error means an invalid signature or malformed input, not an unsupported
      // address type.
      isValid = false;
    }
    if (!isValid) {
      return error('Invalid signature', 401);
    }

    // SECURITY: Challenge nonce is mandatory for anti-replay protection.
    // Atomically consume the persisted nonce (DB-backed, serverless-safe). The
    // signed message must contain a live, unconsumed nonce issued to this wallet.
    const consumed = await consumeChallengeFromMessage(walletAddress, message, { purpose: 'auth' });
    if (!consumed) {
      return error('No valid challenge found. Request a challenge first via /api/v1/challenge.', 401);
    }

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
        } else if (ownerCheck.unavailable) {
          // FAIL CLOSED: no live indexer could confirm the current holder. Surface
          // a retryable "temporarily unavailable" (503) instead of a hard 403, and
          // do NOT grant ownership.
          return error('On-chain verification temporarily unavailable. Please try again shortly.', 503);
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

    // Reuse existing genome hash if already verified (preserve already-minted
    // genomes), otherwise derive deterministically from block height + owner so
    // the same block+owner always yields the same 256-bit genome.
    const genomeHash = (existingUser?.genomeHash && existingUser?.verified)
      ? existingUser.genomeHash
      : deriveGenomeHash(verifiedBlockHeight || 0, walletAddress);

    // Normalize handle to canonical form ('' when absent)
    const normalizedHandle = normalizeHandle(handle);

    // Validate handle format: only letters, numbers, underscores
    if (normalizedHandle && !isValidHandle(normalizedHandle)) {
      return error(HANDLE_ERROR, 400);
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
          const profileGenomeHash = deriveGenomeHash(verifiedBlockHeight, walletAddress);
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

    // Normalize identically to the claim paths so availability matches reality.
    const normalizedHandle = normalizeHandle(handle);
    if (!isValidHandle(normalizedHandle)) return error(HANDLE_ERROR, 400);

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
 * Verify a specific inscription is CURRENTLY held by the wallet AND maps to the
 * claimed block.
 *
 * SECURITY MODEL (fail closed):
 *   - The current-holder check is MANDATORY. `.bitmap` content is public and
 *     immutable, so a content match alone proves nothing about who holds the
 *     inscription now. We REQUIRE a live indexer to report the current holder
 *     and that holder to equal `walletAddress` (case-sensitive bech32).
 *   - Holder providers, in order: ord (ordinals.com `/r/inscription/<id>` — the
 *     non-recursive JSON API is 406-disabled on the public instance), then
 *     Unisat as a tertiary fallback — applying the SAME address-equality
 *     assertion. Unisat is NEVER a content-only bypass.
 *   - The block-number content match is an ADDITIONAL constraint, not a
 *     substitute for the holder check. There is NO content-only success path.
 *   - If NO provider returns a current holder, we return `unavailable` so the
 *     route surfaces a retryable "temporarily unavailable" — we do NOT verify.
 *
 * Returns:
 *   { verified: true }                       — live holder == wallet AND content matches block
 *   { verified: false, reason }              — a provider answered and the claim is wrong
 *   { verified: false, unavailable: true }   — no live provider could confirm the holder (fail closed)
 */
async function verifyInscriptionOwnership(
  walletAddress: string,
  inscriptionId: string,
  blockHeight: number
): Promise<{ verified: boolean; reason?: string; unavailable?: boolean }> {
  try {
    // ── MANDATORY current-holder check ────────────────────────────
    // `holderAddress` stays null until SOME live indexer reports a current holder.
    let holderAddress: string | null = null;

    // Provider 1: ord (ordinals.com /r/inscription/<id> JSON via the ord client).
    const ordOwner = await ordGetInscriptionOwner(inscriptionId);
    if (ordOwner) {
      holderAddress = ordOwner.address;
    }

    // Provider 2 (tertiary fallback): Unisat — ONLY to learn the current holder,
    // with the SAME equality assertion. Never a content-only bypass.
    if (!holderAddress) {
      try {
        const res = await fetchWithTimeout(
          `https://open-api.unisat.io/v1/indexer/inscription/info/${inscriptionId}`
        );
        if (res.ok) {
          const data = await res.json();
          const info = data?.data;
          if (info?.address && typeof info.address === 'string') {
            holderAddress = info.address;
          }
        }
      } catch { /* Unisat unavailable — fall through to fail-closed below */ }
    }

    // FAIL CLOSED: no live indexer could establish the current holder.
    if (!holderAddress) {
      console.warn(`[verify] No on-chain holder available for ${inscriptionId}; failing closed`);
      return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    }

    // The wallet must CURRENTLY hold the inscription (case-sensitive bech32).
    if (holderAddress !== walletAddress) {
      return { verified: false, reason: 'Inscription is not held by this wallet' };
    }

    // ── ADDITIONAL constraint: content must name the claimed block ──
    // This runs AFTER a successful holder match; it can only tighten the result,
    // never substitute for the holder check. If the content endpoint itself is
    // unavailable we fail closed (cannot confirm this is the block's .bitmap).
    let content: string | null = null;
    try {
      const contentRes = await fetchWithTimeout(`https://ordinals.com/content/${inscriptionId}`);
      if (contentRes.ok) {
        content = (await contentRes.text()).trim();
      }
    } catch { /* content unavailable */ }

    if (content === null) {
      console.warn(`[verify] Holder confirmed for ${inscriptionId} but content unavailable; failing closed`);
      return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    }

    const isMatch =
      content === `${blockHeight}` ||
      content === `${blockHeight}.bitmap`;
    if (!isMatch) {
      return { verified: false, reason: `Inscription content "${content}" does not match block ${blockHeight}` };
    }

    // Held by this wallet now AND content names the claimed block.
    return { verified: true };
  } catch (e) {
    console.error('[verify] Inscription ownership check failed:', e);
    // Unexpected error — fail closed as retryable, never grant ownership.
    return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
  }
}

/**
 * Scan a wallet's CURRENTLY held inscriptions for a .bitmap matching the claimed
 * block.
 *
 * SECURITY MODEL (fail closed):
 *   - The inscription list comes ONLY from live indexers that report what the
 *     wallet holds NOW: ord (`/address/<addr>` → `inscriptions[]`), then Unisat
 *     (`inscription-utxo-data`) as a tertiary fallback. Both are real
 *     current-holding sources, so a content match against a listed inscription
 *     proves both holding and identity.
 *   - The prior "trust our own DB owner when APIs are down" fallback is REMOVED.
 *     Our DB is a cache; trusting it on an outage let a stale/forged record
 *     re-grant a sold block.
 *   - If NO live provider returns the wallet's inscriptions, return found:false
 *     (fail closed). The route then rejects with a clear message.
 */
async function scanWalletForBitmap(
  walletAddress: string,
  blockHeight: number
): Promise<{ found: boolean; inscriptionId?: string }> {
  try {
    let inscriptionIds: string[] | null = null;

    // Provider 1: ord — inscriptions currently held by this address.
    inscriptionIds = await ordGetAddressInscriptions(walletAddress);

    // Provider 2 (tertiary fallback): Unisat UTXO-held inscriptions for the address.
    if (inscriptionIds === null) {
      try {
        const res = await fetchWithTimeout(
          `https://open-api.unisat.io/v1/indexer/address/${walletAddress}/inscription-utxo-data?cursor=0&size=100`
        );
        if (res.ok) {
          const data = await res.json();
          const utxos = data?.data?.utxo || [];
          const ids: string[] = [];
          for (const utxo of utxos) {
            for (const insc of (utxo.inscriptions || [])) {
              if (insc.inscriptionId) ids.push(insc.inscriptionId);
            }
          }
          inscriptionIds = ids;
        }
      } catch { /* Unisat unavailable — fall through to fail-closed below */ }
    }

    // FAIL CLOSED: no live provider could list the wallet's current inscriptions.
    // (An empty array is a real "holds none" negative; null means "down".)
    if (inscriptionIds === null) {
      console.warn(`[verify] No on-chain inscription list available for ${walletAddress}; failing closed`);
      return { found: false };
    }

    // Content-match each currently held inscription against the claimed block
    // (limit to first 50 to avoid timeout). A hit proves current holding AND
    // block identity together.
    for (const id of inscriptionIds.slice(0, 50)) {
      try {
        const contentRes = await fetchWithTimeout(`https://ordinals.com/content/${id}`, {}, 5000);
        if (contentRes.ok) {
          const trimmed = (await contentRes.text()).trim();
          if (trimmed === `${blockHeight}` || trimmed === `${blockHeight}.bitmap`) {
            return { found: true, inscriptionId: id };
          }
        }
      } catch { continue; }
    }

    return { found: false };
  } catch (e) {
    console.error('[verify] Wallet bitmap scan failed:', e);
    return { found: false };
  }
}
