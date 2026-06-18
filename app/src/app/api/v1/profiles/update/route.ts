import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, verifyWalletSignature } from '@/lib/api-helpers';
import { normalizeHandle, isValidHandle, HANDLE_ERROR } from '@/lib/handle';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, blockHeight, displayName, bio, handle, signature, message } = body;

    if (!walletAddress || !blockHeight) {
      return error('walletAddress and blockHeight are required', 400);
    }

    // SECURITY: Require wallet signature verification
    if (!signature || !message) {
      return error('signature and message are required', 401);
    }
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    // Target the profile by the COMPOSITE key so we always edit the right block.
    const existing = await prisma.blockProfile.findUnique({
      where: { walletAddress_blockHeight: { walletAddress, blockHeight } },
    });

    if (!existing) {
      return error('Block profile not found', 404);
    }

    const updateData: { displayName?: string | null; bio?: string | null; handle?: string } = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (bio !== undefined) updateData.bio = bio;

    // Handle change: normalize → validate → enforce GLOBAL uniqueness across both
    // namespaces → write race-safe (DB unique constraint + P2002 catch) → record
    // release of the old handle and claim of the new one in HandleHistory.
    const previousHandle = existing.handle;
    let normalizedHandle: string | null = null;
    if (handle !== undefined) {
      normalizedHandle = normalizeHandle(handle);
      if (!isValidHandle(normalizedHandle)) {
        return error(HANDLE_ERROR, 400);
      }

      if (normalizedHandle !== previousHandle) {
        // GLOBAL uniqueness: a handle cannot live in EITHER namespace already.
        const [handleInUser, handleInProfile] = await Promise.all([
          prisma.user.findUnique({ where: { handle: normalizedHandle } }),
          prisma.blockProfile.findUnique({ where: { handle: normalizedHandle } }),
        ]);
        if (handleInUser) {
          return error('Handle already taken (registered as a user handle)', 409);
        }
        if (handleInProfile && handleInProfile.id !== existing.id) {
          return error('Handle already taken', 409);
        }
        updateData.handle = normalizedHandle;
      } else {
        // Same normalized value (e.g. only casing changed) — nothing to claim/release.
        normalizedHandle = null;
      }
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.blockProfile.update({
          where: { id: existing.id },
          data: updateData,
        });

        // RELEASE ON EDIT: free the old handle + record the new claim.
        if (normalizedHandle) {
          await tx.handleHistory.create({
            data: { handle: previousHandle, walletAddress, action: 'released_block_profile' },
          });
          await tx.handleHistory.create({
            data: { handle: normalizedHandle, walletAddress, action: 'claimed_block_profile' },
          });
        }

        return result;
      });

      return success(updated);
    } catch (e: unknown) {
      // CLAIM RACE: another writer grabbed the handle between our check and write.
      if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'P2002') {
        return error('Handle already taken', 409);
      }
      throw e;
    }
  } catch (err) {
    console.error('Profile update error:', err);
    return error('Failed to update profile', 500);
  }
}
