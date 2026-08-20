import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { validateMonitorAuth } from '@/lib/monitor-tokens';

const VALID_COMMANDS = [
  'update_personality',
  'update_soul',
  'update_agent',
  'update_auto_responses',
  'pause',
  'resume',
  'get_status',
] as const;

export async function POST(req: NextRequest) {
  try {
    const { guardianId, command, params } = await req.json();

    if (!guardianId || !command) {
      return error('guardianId and command are required');
    }

    if (!VALID_COMMANDS.includes(command)) {
      return error(`Invalid command. Valid: ${VALID_COMMANDS.join(', ')}`);
    }

    const guardian = await validateMonitorAuth(
      req.headers.get('authorization'),
      guardianId
    );
    if (!guardian) return error('Unauthorized', 401);

    switch (command) {
      case 'update_personality': {
        if (!params?.personality) return error('params.personality is required');
        await prisma.guardianAgent.update({
          where: { id: guardianId },
          data: { personality: params.personality },
        });
        return success({ updated: 'personality' });
      }

      case 'update_soul': {
        if (!params?.soulMd) return error('params.soulMd is required');
        await prisma.guardianAgent.update({
          where: { id: guardianId },
          data: { soulMd: params.soulMd },
        });
        return success({ updated: 'soulMd' });
      }

      case 'update_agent': {
        if (!params?.agentMd) return error('params.agentMd is required');
        await prisma.guardianAgent.update({
          where: { id: guardianId },
          data: { agentMd: params.agentMd },
        });
        return success({ updated: 'agentMd' });
      }

      case 'update_auto_responses': {
        if (!params?.autoResponses) return error('params.autoResponses is required');
        await prisma.guardianAgent.update({
          where: { id: guardianId },
          data: { autoResponses: JSON.stringify(params.autoResponses) },
        });
        return success({ updated: 'autoResponses' });
      }

      case 'pause': {
        await prisma.guardianAgent.update({
          where: { id: guardianId },
          data: { status: 'paused' },
        });
        return success({ status: 'paused' });
      }

      case 'resume': {
        await prisma.guardianAgent.update({
          where: { id: guardianId },
          data: { status: 'active' },
        });
        return success({ status: 'active' });
      }

      case 'get_status': {
        const conversations = await prisma.guardianConversation.count({
          where: { guardianId },
        });
        const events = await prisma.guardianEvent.count({
          where: { guardianId },
        });
        return success({
          id: guardian.id,
          name: guardian.name,
          status: guardian.status,
          blockHeight: guardian.blockHeight,
          ownerAddress: guardian.ownerAddress,
          // No `totalVisitors`. Nothing in the app ever increments it — the only
          // write anywhere in the codebase sets it to 0 when a block changes
          // hands — so serving it as a statistic published a permanent zero as
          // if it were a measurement. `empire-stats` already dropped it for this
          // reason; this was the last surface still reporting it. There is no
          // honest version to relabel, which is the call #136 made about RANK.
          // `totalMessages` below is real: guardian/chat increments it per message.
          totalMessages: guardian.totalMessages,
          totalConversations: conversations,
          totalEvents: events,
          selfHosted: guardian.selfHosted,
          lastHeartbeat: guardian.lastHeartbeat,
          createdAt: guardian.createdAt,
          updatedAt: guardian.updatedAt,
        });
      }

      default:
        return error('Unknown command');
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
