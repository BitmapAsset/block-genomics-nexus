import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import { logActivity } from '@/lib/activity';
import { consumeChallengeFromMessage } from '@/lib/challenges';
import { deriveGenomeHash } from '@/lib/genome-utils';
import { normalizeHandle, isValidHandle, HANDLE_ERROR } from '@/lib/handle';
import { verifyBip322 } from '@/lib/bip322';
import { verifyInscriptionOwnership, scanWalletForBitmap } from '@/lib/onchain/bitmap-ownership';
import { enforceRateLimit } from '@/lib/api-rate-limit';

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

    // BIP-322 signature verification — no fallback, must be cryptographically valid.
    // Accepts the base64 / base64url / hex encodings different ordinals wallets emit.
    if (!verifyBip322(walletAddress, message, signature)) {
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
        if (scanResult.verified) {
          verifiedBlockHeight = blockHeight;
          tier = 1;
        } else if (scanResult.unavailable) {
          // FAIL CLOSED, retryable: no indexer could list the wallet's holdings,
          // which is not the same answer as "this wallet holds nothing".
          return error('On-chain verification temporarily unavailable. Please try again shortly.', 503);
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
  const rl = await enforceRateLimit(req, { bucket: 'v1-auth-verify' });
  if (rl.response) return rl.response;

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
