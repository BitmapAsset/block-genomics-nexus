import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifySignedAction } from '@/lib/signed-action';

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
    // The canonical 'vps.health' message for this link and its block, used once.
    const auth = await verifySignedAction(ownerAddress, message, signature, body, {
      action: 'vps.health', method: 'POST', path: `/api/v1/vps/${linkId}/health`,
      blockHeight: link.blockHeight, purpose: 'vps',
    });
    if (!auth.ok) return error(auth.error, auth.status);
    if (link.walletAddress !== ownerAddress) return error('Not the VPS owner', 403);

    const now = new Date();
    await prisma.vPSLink.update({
      where: { id: linkId },
      data: { lastHealthCheck: now, status: 'linked' },
    });

    return success({ healthy: true, lastHealthCheck: now.toISOString() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
