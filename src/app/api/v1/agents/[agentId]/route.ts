import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { validatePermissions, verifyAgentSignature } from '@/lib/agent-protocol';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const body = await req.json();
    const { endpointUrl, permissions, walletAddress, signature, challenge } = body;

    if (!walletAddress || !signature || !challenge) {
      return error('Missing walletAddress, signature, or challenge', 400);
    }

    /* MOCK — replace with real BIP-322 */
    if (!verifyAgentSignature(walletAddress, challenge, signature)) {
      return error('Invalid wallet signature', 401);
    }

    const agent = await prisma.bitmapAgent.findUnique({ where: { id: agentId } });
    if (!agent) return error('Agent not found', 404);
    if (agent.walletAddress !== walletAddress) return error('Unauthorized', 403);
    if (agent.status === 'revoked') return error('Agent has been revoked', 403);

    const data: Record<string, unknown> = {};
    if (endpointUrl) data.endpointUrl = endpointUrl;
    if (permissions) {
      const check = validatePermissions(permissions);
      if (!check.valid) return error(`Invalid permissions: ${check.invalid.join(', ')}`, 400);
      data.permissions = JSON.stringify(permissions);
    }

    const updated = await prisma.bitmapAgent.update({
      where: { id: agentId },
      data,
    });

    return success({ ...updated, permissions: JSON.parse(updated.permissions) });
  } catch (e: any) {
    return error(e.message, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const body = await req.json();
    const { walletAddress, signature, challenge } = body;

    if (!walletAddress || !signature || !challenge) {
      return error('Missing walletAddress, signature, or challenge', 400);
    }

    /* MOCK — replace with real BIP-322 */
    if (!verifyAgentSignature(walletAddress, challenge, signature)) {
      return error('Invalid wallet signature', 401);
    }

    const agent = await prisma.bitmapAgent.findUnique({ where: { id: agentId } });
    if (!agent) return error('Agent not found', 404);
    if (agent.walletAddress !== walletAddress) return error('Unauthorized', 403);

    // Revoke agent — kill all active sessions
    await prisma.$transaction([
      prisma.bitmapAgent.update({
        where: { id: agentId },
        data: { status: 'revoked' },
      }),
      prisma.agentSession.updateMany({
        where: { agentId, endedAt: null },
        data: { endedAt: new Date() },
      }),
    ]);

    // Log the revocation event
    await prisma.agentEvent.create({
      data: {
        agentId,
        type: 'permission_request',
        payload: JSON.stringify({ action: 'revoked', by: walletAddress }),
      },
    });

    return success({ revoked: true });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
