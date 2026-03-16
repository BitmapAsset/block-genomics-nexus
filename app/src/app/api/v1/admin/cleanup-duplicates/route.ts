import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

/**
 * POST /api/v1/admin/cleanup-duplicates
 * One-time cleanup: find any BlockProfile handles that also exist in User table
 * and delete the BlockProfile duplicates. The User table record takes precedence.
 * 
 * Requires admin secret in header: x-admin-secret
 */
export async function POST(req: NextRequest) {
  try {
    const adminSecret = req.headers.get('x-admin-secret');
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return error('Unauthorized', 401);
    }

    // Find all BlockProfile handles
    const blockProfiles = await prisma.blockProfile.findMany({
      select: { id: true, handle: true, walletAddress: true, blockHeight: true },
    });

    const deleted: { id: string; handle: string; blockHeight: number }[] = [];

    for (const bp of blockProfiles) {
      if (!bp.handle) continue;
      const userWithSameHandle = await prisma.user.findUnique({
        where: { handle: bp.handle },
      });
      if (userWithSameHandle) {
        // Duplicate found — delete the BlockProfile record
        await prisma.blockProfile.delete({ where: { id: bp.id } });
        deleted.push({ id: bp.id, handle: bp.handle, blockHeight: bp.blockHeight });
      }
    }

    return success({
      message: `Cleaned up ${deleted.length} duplicate handle(s)`,
      deleted,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
