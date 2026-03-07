import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, blockHeight, displayName, bio, handle } = body;

    if (!walletAddress || !blockHeight) {
      return error('walletAddress and blockHeight are required', 400);
    }

    const existing = await prisma.blockProfile.findUnique({
      where: { walletAddress_blockHeight: { walletAddress, blockHeight } },
    });

    if (!existing) {
      return error('Block profile not found', 404);
    }

    const updateData: Record<string, string> = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (bio !== undefined) updateData.bio = bio;

    if (handle !== undefined && handle !== existing.handle) {
      const taken = await prisma.blockProfile.findUnique({
        where: { handle },
      });
      if (taken && taken.id !== existing.id) {
        return error('Handle already taken', 409);
      }
      updateData.handle = handle;
    }

    const updated = await prisma.blockProfile.update({
      where: { id: existing.id },
      data: updateData,
    });

    return success(updated);
  } catch (err) {
    console.error('Profile update error:', err);
    return error('Failed to update profile', 500);
  }
}
