import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, verifyWalletSignature } from '@/lib/api-helpers';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    const { linkId } = await params;

    // Verify wallet signature
    const body = await _req.json().catch(() => ({} as Record<string, string>));
    const { ownerAddress, signature, message } = body;

    const link = await prisma.vPSLink.findUnique({ where: { id: linkId } });
    if (!link) return error('VPS link not found', 404);
    if (link.status === 'unlinked') return error('VPS link is unlinked', 403);

    // Auth: wallet signature matching owner
    if (!ownerAddress || !signature || !message) {
      return error('Authentication required', 401);
    }
    if (link.walletAddress !== ownerAddress) return error('Not the VPS owner', 403);
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    const now = new Date();
    await prisma.vPSLink.update({
      where: { id: linkId },
      data: { lastHealthCheck: now, status: 'linked' },
    });

    return success({ healthy: true, lastHealthCheck: now.toISOString() });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
