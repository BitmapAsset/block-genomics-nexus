import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * POST /api/v1/admin/cleanup
 * Admin-only: delete a user by wallet address
 * Requires ADMIN_SECRET in Authorization header
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!ADMIN_SECRET || token !== ADMIN_SECRET) {
      return error('Unauthorized', 401);
    }

    const { walletAddress, action } = await req.json();
    if (!walletAddress) return error('walletAddress required', 400);

    if (action === 'delete_user') {
      // Set user as unverified and remove tier (soft delete approach)
      const user = await prisma.user.update({
        where: { walletAddress },
        data: { verified: false, tier: 0, anchorBlock: null, genomeHash: null },
      }).catch(() => null);
      if (!user) return error('User not found', 404);
      
      return success({ deleted: true, handle: user.handle, action: 'soft_deleted' });
    }

    return error('Unknown action', 400);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
