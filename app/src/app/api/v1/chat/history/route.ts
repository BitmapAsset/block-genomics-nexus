import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-chat-history' });
  if (rl.response) return rl.response;

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'block';
    const blockHeight = url.searchParams.get('blockHeight');
    const dmWith = url.searchParams.get('dmWith');
    const wallet = url.searchParams.get('wallet');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    const before = url.searchParams.get('before'); // cursor: message id

    // Build where clause
    const where: Record<string, unknown> = {};

    if (mode === 'dm') {
      if (!dmWith || !wallet) return error('dmWith and wallet required for DM history', 400);
      where.channel = 'dm';
      where.OR = [
        { senderAddress: wallet, text: { contains: dmWith } },
        { senderAddress: dmWith, text: { contains: wallet } },
      ];
      // For encrypted DMs, we match sender/recipient by address pairs
      // Better approach: filter by participants
      delete where.OR;
      where.channel = 'dm';
      where.senderAddress = { in: [wallet, dmWith] };
    } else if (mode === 'global') {
      where.channel = 'global';
    } else {
      // block mode
      if (!blockHeight) return error('blockHeight required for block mode', 400);
      const h = parseBlockHeight(blockHeight);
      if (h === null) return error(INVALID_BLOCK_HEIGHT_MESSAGE, 400);
      where.blockHeight = h;
      where.channel = 'block';
    }

    // Cursor-based pagination
    let cursor: { id: string } | undefined;
    if (before) {
      cursor = { id: before };
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor, skip: 1 } : {}),
      include: {
        sender: {
          select: { handle: true, tier: true, resolvedTier: true, verified: true },
        },
        reactions: {
          select: { emoji: true, wallet: true },
        },
      },
    });

    // Process: reverse to chronological, aggregate reactions
    const data = messages.reverse().map((m) => {
      // Aggregate reactions: { emoji: { count, wallets[] } }
      const reactionMap: Record<string, { count: number; wallets: string[] }> = {};
      for (const r of m.reactions) {
        if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { count: 0, wallets: [] };
        reactionMap[r.emoji].count++;
        reactionMap[r.emoji].wallets.push(r.wallet);
      }

      return {
        id: m.id,
        blockHeight: m.blockHeight,
        senderAddress: m.senderAddress,
        senderHandle: m.sender?.handle || m.senderHandle || 'anon',
        senderTier: m.sender?.tier ?? 3,
        senderResolvedTier: m.sender?.resolvedTier ?? 0,
        senderVerified: m.sender?.verified ?? false,
        text: m.text,
        type: m.type,
        mediaUrl: m.mediaUrl,
        replyToId: m.replyToId,
        channel: m.channel,
        createdAt: m.createdAt,
        reactions: reactionMap,
      };
    });

    const hasMore = messages.length === limit;
    const oldestId = messages.length > 0 ? messages[0].id : null;

    return success({ messages: data, hasMore, oldestId });
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
