import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { logActivity, logProfileView } from '@/lib/activity';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;
    const normalizedHandle = handle.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { handle: normalizedHandle },
      include: {
        _count: { select: { blocks: true, parcels: true, estates: true } },
      },
    });

    if (!user) return error('User not found', 404);

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
    });
  } catch (e: any) {
    return error(e.message, 500);
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
    const { displayName, bio, walletAddress } = body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return error('walletAddress is required for authentication', 400);
    }

    const user = await prisma.user.findUnique({ where: { handle: normalizedHandle } });
    if (!user) return error('User not found', 404);

    if (user.walletAddress !== walletAddress) {
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

    if (Object.keys(updates).length === 0) {
      return error('No valid fields to update', 400);
    }

    const updated = await prisma.user.update({
      where: { handle: normalizedHandle },
      data: updates,
    });

    logActivity(walletAddress, 'profile_update', { handle: normalizedHandle, fields: Object.keys(updates) });

    return success({
      walletAddress: updated.walletAddress,
      handle: updated.handle,
      displayName: updated.displayName,
      bio: updated.bio,
    });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
