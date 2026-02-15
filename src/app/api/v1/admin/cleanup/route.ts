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
      // Clean up related records first
      await prisma.handleHistory.deleteMany({ where: { walletAddress } }).catch(() => {});
      await prisma.activityLog.deleteMany({ where: { walletAddress } }).catch(() => {});
      await prisma.userSession.deleteMany({ where: { walletAddress } }).catch(() => {});
      await prisma.pageView.deleteMany({ where: { walletAddress } }).catch(() => {});
      
      const user = await prisma.user.delete({ where: { walletAddress } }).catch(() => null);
      if (!user) return error('User not found', 404);
      
      return success({ deleted: true, handle: user.handle });
    }

    return error('Unknown action', 400);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
