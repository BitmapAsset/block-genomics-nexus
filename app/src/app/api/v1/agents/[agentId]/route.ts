import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { validatePermissions, verifyAgentSignature } from '@/lib/agent-protocol';
import { consumeChallengeFromMessage } from '@/lib/challenges';

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

    /* BIP-322 wallet signature verification */
    if (!verifyAgentSignature(walletAddress, challenge, signature)) {
      return error('Invalid wallet signature', 401);
    }

    // REPLAY PROTECTION: require a server-issued, single-use challenge (purpose
    // 'agent-manage'). Without this an observed signature (e.g. one captured from
    // the register flow) could be replayed to mutate the owner's agents.
    if (!(await consumeChallengeFromMessage(walletAddress, challenge, { purpose: 'agent-manage' }))) {
      return error('Invalid, expired, or already-used challenge — request one from /api/v1/challenge (purpose "agent-manage")', 401);
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

    // Never expose the stored API-key hash in a response.
    const { apiKeyHash: _hash, ...safe } = updated;
    void _hash;
    return success({ ...safe, permissions: JSON.parse(updated.permissions) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
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

    /* BIP-322 wallet signature verification */
    if (!verifyAgentSignature(walletAddress, challenge, signature)) {
      return error('Invalid wallet signature', 401);
    }

    // REPLAY PROTECTION: require a server-issued, single-use challenge (purpose
    // 'agent-manage') so a captured signature cannot be replayed to revoke agents.
    if (!(await consumeChallengeFromMessage(walletAddress, challenge, { purpose: 'agent-manage' }))) {
      return error('Invalid, expired, or already-used challenge — request one from /api/v1/challenge (purpose "agent-manage")', 401);
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
