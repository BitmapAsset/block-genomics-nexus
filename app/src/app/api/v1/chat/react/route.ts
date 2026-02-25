import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, verifyWalletSignature } from '@/lib/api-helpers';

const ALLOWED_EMOJIS = ['❤️', '😂', '🔥', '👍', '👎', '🤯'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messageId, emoji, walletAddress, signature, message } = body;

    if (!messageId || typeof messageId !== 'string') return error('messageId required', 400);
    if (!emoji || !ALLOWED_EMOJIS.includes(emoji)) return error('Invalid emoji', 400);
    if (!walletAddress || typeof walletAddress !== 'string') return error('walletAddress required', 400);
    if (!signature || !message) return error('Authentication required', 401);
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
    }

    // Check message exists
    const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg) return error('Message not found', 404);

    // Toggle: delete if exists, create if not
    const existing = await prisma.chatReaction.findUnique({
      where: { messageId_wallet_emoji: { messageId, wallet: walletAddress, emoji } },
    });

    if (existing) {
      await prisma.chatReaction.delete({ where: { id: existing.id } });
      return success({ action: 'removed', emoji, messageId });
    } else {
      await prisma.chatReaction.create({
        data: { messageId, emoji, wallet: walletAddress },
      });
      return success({ action: 'added', emoji, messageId }, 201);
    }
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
