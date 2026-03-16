import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, verifyWalletSignature } from '@/lib/api-helpers';
import { logActivity, logProfileView } from '@/lib/activity';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;
    const normalizedHandle = handle.toLowerCase();

    // First check BlockProfile table, then fall back to User
    const blockProfile = await prisma.blockProfile.findUnique({
      where: { handle: normalizedHandle },
    });

    if (blockProfile) {
      const [profileViews, activityCount] = await Promise.all([
        prisma.profileView.count({ where: { viewedHandle: normalizedHandle } }).catch(() => 0),
        prisma.activityLog.count({ where: { walletAddress: blockProfile.walletAddress } }).catch(() => 0),
      ]);

      logProfileView(normalizedHandle);

      return success({
        walletAddress: blockProfile.walletAddress,
        handle: blockProfile.handle,
        displayName: blockProfile.displayName,
        bio: blockProfile.bio,
        avatar: blockProfile.avatar,
        genomeHash: blockProfile.genomeHash,
        anchorBlock: blockProfile.blockHeight,
        tier: blockProfile.tier,
        verified: blockProfile.verified,
        createdAt: blockProfile.createdAt,
        blockCount: 1,
        parcelCount: 0,
        estateCount: 0,
        profileViews,
        activityCount,
        pageViews: 0,
        isBlockProfile: true,
        blockHeight: blockProfile.blockHeight,
      });
    }

    const user = await prisma.user.findUnique({
      where: { handle: normalizedHandle },
      include: {
        _count: { select: { blocks: true, parcels: true, estates: true } },
      },
    });

    if (!user) return error('User not found', 404);

    // Fire-and-forget: log profile view + fetch stats in parallel
    const [profileViews, activityCount, pageViews] = await Promise.all([
      prisma.profileView.count({ where: { viewedHandle: normalizedHandle } }).catch(() => 0),
      prisma.activityLog.count({ where: { walletAddress: user.walletAddress } }).catch(() => 0),
      prisma.pageView.count({ where: { walletAddress: user.walletAddress } }).catch(() => 0),
    ]);

    // Log this visit (fire-and-forget)
    logProfileView(normalizedHandle);

    return success({
      walletAddress: user.walletAddress,
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      genomeHash: user.genomeHash,
      anchorBlock: user.anchorBlock,
      tier: user.tier,
      verified: user.verified,
      createdAt: user.createdAt,
      blockCount: user._count.blocks,
      parcelCount: user._count.parcels,
      estateCount: user._count.estates,
      profileViews,
      activityCount,
      pageViews,
      isBlockProfile: false,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;
    const normalizedHandle = handle.toLowerCase();
    const body = await req.json();
    const { displayName, bio, avatar, walletAddress, signature, message } = body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return error('walletAddress is required for authentication', 400);
    }

    // Verify wallet signature
    if (!signature || !message) return error('Authentication required', 401);
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    // Check BlockProfile first, then User
    const blockProfile = await prisma.blockProfile.findUnique({ where: { handle: normalizedHandle } });
    const user = blockProfile ? null : await prisma.user.findUnique({ where: { handle: normalizedHandle } });
    
    const ownerAddress = blockProfile?.walletAddress || user?.walletAddress;
    if (!ownerAddress) return error('User not found', 404);

    if (ownerAddress !== walletAddress) {
      return error('Unauthorized: wallet does not match profile owner', 403);
    }

    const updates: Record<string, string> = {};
    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.length > 50) {
        return error('displayName must be a string of max 50 characters', 400);
      }
      updates.displayName = displayName.trim();
    }
    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 160) {
        return error('bio must be a string of max 160 characters', 400);
      }
      updates.bio = bio.trim();
    }
    if (avatar !== undefined) {
      if (typeof avatar !== 'string' || avatar.length > 500) {
        return error('avatar must be a valid URL string (max 500 chars)', 400);
      }
      // Basic URL validation
      if (avatar && !avatar.match(/^https?:\/\/.+/)) {
        return error('avatar must be a valid HTTP(S) URL', 400);
      }
      updates.avatar = avatar.trim();
    }

    if (Object.keys(updates).length === 0) {
      return error('No valid fields to update', 400);
    }

    const updated = blockProfile
      ? await prisma.blockProfile.update({ where: { handle: normalizedHandle }, data: updates })
      : await prisma.user.update({ where: { handle: normalizedHandle }, data: updates });

    logActivity(walletAddress, 'profile_update', { handle: normalizedHandle, fields: Object.keys(updates) });

    return success({
      walletAddress: updated.walletAddress,
      handle: updated.handle,
      displayName: updated.displayName,
      bio: updated.bio,
      avatar: updated.avatar || null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
