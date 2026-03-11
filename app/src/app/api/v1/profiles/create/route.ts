import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import crypto from 'crypto';
import { logActivity } from '@/lib/activity';

const HANDLE_RE = /^[a-z0-9_]{1,30}$/;

/**
 * POST /api/v1/profiles/create
 * Create a block-specific profile.
 * Body: { walletAddress, blockHeight, handle, displayName?, bio? }
 * Assumes wallet ownership already verified (user must be verified via /auth/verify first).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, blockHeight, handle, displayName, bio } = body;

    if (!walletAddress || !blockHeight || !handle) {
      return error('walletAddress, blockHeight, and handle are required', 400);
    }

    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    // Validate handle
    const normalizedHandle = handle.toLowerCase().replace(/-/g, '_');
    if (!HANDLE_RE.test(normalizedHandle)) {
      return error('Handle can only contain lowercase letters, numbers, and underscores (max 30 chars)', 400);
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

    // Generate unique genome hash for this profile
    const genomeHash = '0x' + crypto.createHash('sha256')
      .update(`${walletAddress}:${blockHeight}:profile:${Date.now()}`)
      .digest('hex');

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
  } catch (e: any) {
    if (e.code === 'P2002') {
      return error('Handle already taken or duplicate profile', 409);
    }
    return error(e.message, 500);
  }
}
