import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString } from '@/lib/api-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ blockHeight: string }> }
) {
  try {
    const { blockHeight } = await params;
    const h = parseInt(blockHeight, 10);
    if (isNaN(h) || h < 0) return error('Invalid block height', 400);

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    const after = url.searchParams.get('after'); // ISO timestamp for polling

    const where: Record<string, unknown> = { blockHeight: h };
    if (after) where.createdAt = { gt: new Date(after) };

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: {
            handle: true,
            tier: true,
            verified: true,
          },
        },
      },
    });

    // Flatten sender data into each message
    const data = messages.reverse().map((m) => ({
      id: m.id,
      blockHeight: m.blockHeight,
      senderAddress: m.senderAddress,
      senderHandle: m.sender?.handle || m.senderHandle || 'anon',
      senderTier: m.sender?.tier ?? 3,
      senderVerified: m.sender?.verified ?? false,
      text: m.text,
      type: m.type,
      mediaUrl: m.mediaUrl,
      replyToId: m.replyToId,
      createdAt: m.createdAt,
    }));

    return success(data);
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}

// Simple in-memory rate limiter: 1 msg per 2 seconds per wallet
const rateLimitMap = new Map<string, number>();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ blockHeight: string }> }
) {
  try {
    const { blockHeight } = await params;
    const h = parseInt(blockHeight, 10);
    if (isNaN(h) || h < 0) return error('Invalid block height', 400);

    const body = await req.json();
    const { senderAddress, senderHandle, text, type } = body;

    if (!senderAddress || typeof senderAddress !== 'string') return error('senderAddress is required', 400);
    if (!text || typeof text !== 'string' || !text.trim()) return error('text is required', 400);

    // Rate limit: 1 message per 2 seconds per wallet
    const now = Date.now();
    const lastSent = rateLimitMap.get(senderAddress) || 0;
    if (now - lastSent < 2000) {
      return error('Rate limited — wait 2 seconds between messages', 429);
    }
    rateLimitMap.set(senderAddress, now);

    // Clean up old entries periodically
    if (rateLimitMap.size > 1000) {
      const cutoff = now - 10000;
      for (const [k, v] of rateLimitMap) {
        if (v < cutoff) rateLimitMap.delete(k);
      }
    }

    const validTypes = ['text', 'image', 'gif', 'link'];
    const msgType = type && validTypes.includes(type) ? type : 'text';

    const chatMsg = await prisma.chatMessage.create({
      data: {
        blockHeight: h,
        senderAddress,
        senderHandle: senderHandle ? sanitizeString(senderHandle, 50) : 'anon',
        text: sanitizeString(text, 2000),
        type: msgType,
      },
    });

    return success(chatMsg, 201);
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
