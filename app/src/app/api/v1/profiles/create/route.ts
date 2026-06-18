import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress, verifyWalletSignature } from '@/lib/api-helpers';
import { deriveGenomeHash } from '@/lib/genome-utils';
import { logActivity } from '@/lib/activity';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { normalizeHandle, isValidHandle, HANDLE_ERROR } from '@/lib/handle';

const HANDLE_RE = /^[a-z0-9_]{1,30}$/;

/**
 * POST /api/v1/profiles/create
 * Create a block-specific profile.
 * Body: { walletAddress, blockHeight, handle, signature, message, displayName?, bio? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, blockHeight, handle, displayName, bio, signature, message } = body;

    if (!walletAddress || !blockHeight || !handle) {
      return error('walletAddress, blockHeight, and handle are required', 400);
    }

    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    // SECURITY: Require wallet signature verification
    if (!signature || !message) {
      return error('signature and message are required', 401);
    }
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    // ACTION BINDING + REPLAY PROTECTION: the signature must authorize THIS
    // profile creation on THIS block, and the one-time nonce is consumed so a
    // captured request cannot be replayed or re-pointed.
    const binding = verifyActionBinding(message, {
      action: 'profile.create',
      method: 'POST',
      path: '/api/v1/profiles/create',
      blockHeight,
      bodyHash: await hashBody(body),
    });
    if (!binding.ok) {
      return error(binding.reason || 'Invalid authorization', 401);
    }
    if (!(await consumeChallenge(binding.nonce!, { address: walletAddress, purpose: 'profile' }))) {
      return error('Invalid or already-used challenge nonce', 401);
    }

    // Validate handle
    const normalizedHandle = normalizeHandle(handle);
    if (!isValidHandle(normalizedHandle)) {
      return error(HANDLE_ERROR, 400);
    }

    // Check user exists and is verified
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user || !user.verified) {
      return error('Wallet must be verified first via /auth/verify', 403);
    }

    // Check wallet owns this block
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block || block.ownerAddress !== walletAddress) {
      return error('Wallet does not own this block', 403);
    }

    // Check handle uniqueness across both User and BlockProfile tables
    // Handle must be GLOBALLY unique — cannot exist in both tables, even for same wallet
    const [existingUser, existingProfile] = await Promise.all([
      prisma.user.findUnique({ where: { handle: normalizedHandle } }),
      prisma.blockProfile.findUnique({ where: { handle: normalizedHandle } }),
    ]);

    if (existingUser) {
      return error('Handle already taken (registered as a user handle). Clear it from your user profile first if you want to use it here.', 409);
    }
    if (existingProfile) {
      if (existingProfile.walletAddress === walletAddress && existingProfile.blockHeight === blockHeight) {
        return error(`You already have a profile on this block as @${normalizedHandle}`, 409);
      }
      return error('Handle already taken', 409);
    }

    // Check if profile already exists for this wallet+block
    const existingBlockProfile = await prisma.blockProfile.findUnique({
      where: { walletAddress_blockHeight: { walletAddress, blockHeight } },
    });
    if (existingBlockProfile) {
      return error(`You already have a profile on block ${blockHeight} as @${existingBlockProfile.handle}`, 409);
    }

    // Deterministic genome: same block+owner always yields the same 256-bit hash.
    const genomeHash = deriveGenomeHash(blockHeight, walletAddress);

    const profile = await prisma.blockProfile.create({
      data: {
        walletAddress,
        blockHeight,
        handle: normalizedHandle,
        displayName: displayName || null,
        bio: bio || null,
        genomeHash,
        tier: 1,
        verified: true,
      },
    });

    // Record handle history
    await prisma.handleHistory.create({
      data: { handle: normalizedHandle, walletAddress, action: 'claimed_block_profile' },
    });

    logActivity(walletAddress, 'block_profile_created', { blockHeight, handle: normalizedHandle });

    return success(profile);
  } catch (e: unknown) {
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'P2002') {
      return error('Handle already taken or duplicate profile', 409);
    }
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
