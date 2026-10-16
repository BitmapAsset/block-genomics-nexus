import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { authenticateSession, sessionTokenFromHeaders } from '@/lib/verified-sessions';

/**
 * Which DM rows a verified session may read in its conversation with `other`.
 *
 * A DM row records only its sender; its recipient is the owner of the block it
 * was sent to ("Private DM with block owner"). So a row belongs to the pair when
 * one party sent it to a block the other owns. The reader's own inbox side is
 * further narrowed to blocks the session proved on-chain, so a stale or poisoned
 * `Block.ownerAddress` alone cannot open someone else's inbox.
 */
async function dmConversationFilter(
  me: string,
  other: string,
  myProvenBlocks: number[]
): Promise<Record<string, unknown>> {
  const [otherBlocks, myBlocks] = await Promise.all([
    prisma.block.findMany({ where: { ownerAddress: other }, select: { height: true } }),
    prisma.block.findMany({ where: { ownerAddress: me }, select: { height: true } }),
  ]);
  const proven = new Set(myProvenBlocks);
  return {
    channel: 'dm',
    OR: [
      { senderAddress: me, blockHeight: { in: otherBlocks.map((b) => b.height) } },
      { senderAddress: other, blockHeight: { in: myBlocks.map((b) => b.height).filter((h) => proven.has(h)) } },
    ],
  };
}

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
    let where: Record<string, unknown> = {};

    if (mode === 'dm') {
      if (!dmWith || !wallet) return error('dmWith and wallet required for DM history', 400);
      // Only one of the two parties may read a conversation, and only after
      // proving it with a verified session. Wallet addresses are public, so the
      // query string alone identifies nobody.
      const auth = await authenticateSession(sessionTokenFromHeaders(req.headers));
      if (!auth.ok || !auth.session) {
        return error(auth.reason ?? 'A verified session is required to read direct messages', auth.status);
      }
      const me = auth.session.walletAddress;
      if (me !== wallet && me !== dmWith) {
        return error('This session belongs to neither party of this conversation', 403);
      }
      where = await dmConversationFilter(me, me === wallet ? dmWith : wallet, auth.session.verifiedBlocks);
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

    // A conversation is per-caller; a shared cache must never replay it to someone else.
    return success({ messages: data, hasMore, oldestId }, 200, mode === 'dm' ? { 'Cache-Control': 'no-store' } : undefined);
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
