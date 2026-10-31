import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifySignedAction, signedActionHelp } from '@/lib/signed-action';
import { requireLiveBlockOwner, gateDenialResponse } from '@/lib/ownership-gate';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    const { linkId } = await params;
    const body = await req.json();
    const { walletAddress, signature, message } = body;

    if (!signature || !message) {
      return error(`Missing signature or message. ${signedActionHelp({ action: 'vps.unlink', purpose: 'vps' })}`, 401);
    }
    if (!walletAddress || !signature || !message) {
      return error('Missing walletAddress, signature, or message', 400);
    }

    const link = await prisma.vPSLink.findUnique({ where: { id: linkId } });
    if (!link) return error('VPS link not found', 404);

    // The canonical 'vps.unlink' message for this link and its block, used once.
    const auth = await verifySignedAction(walletAddress, message, signature, body, {
      action: 'vps.unlink', method: 'DELETE', path: `/api/v1/vps/${linkId}`,
      blockHeight: link.blockHeight, purpose: 'vps',
    });
    if (!auth.ok) return error(auth.error, auth.status);

    // The wallet that made the link may withdraw it; so may the block's live
    // holder (a link listed against land that changed hands).
    if (link.walletAddress !== walletAddress) {
      const gate = await requireLiveBlockOwner(walletAddress, link.blockHeight);
      if (!gate.ok) return gateDenialResponse(gate);
    }

    await prisma.vPSLink.update({
      where: { id: linkId },
      data: { status: 'unlinked' },
    });

    return success({ unlinked: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
