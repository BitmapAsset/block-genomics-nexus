import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifyAgentSignature } from '@/lib/agent-protocol';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    const { linkId } = await params;
    const body = await req.json();
    const { walletAddress, signature, challenge } = body;

    if (!walletAddress || !signature || !challenge) {
      return error('Missing walletAddress, signature, or challenge', 400);
    }

    /* BIP-322 wallet signature verification */
    if (!verifyAgentSignature(walletAddress, challenge, signature)) {
      return error('Invalid wallet signature', 401);
    }

    const link = await prisma.vPSLink.findUnique({ where: { id: linkId } });
    if (!link) return error('VPS link not found', 404);
    if (link.walletAddress !== walletAddress) return error('Unauthorized', 403);

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
