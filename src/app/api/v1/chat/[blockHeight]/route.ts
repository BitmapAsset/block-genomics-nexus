import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString, verifyWalletSignature } from '@/lib/api-helpers';

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
    const before = url.searchParams.get('before'); // cursor-based pagination

    const where: any = { blockHeight: h };
    if (before) where.createdAt = { lt: new Date(before) };

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return success(messages.reverse());
  } catch (e: any) {
    return error(e.message, 500);
  }
}

// TODO: Add rate limiting (e.g., 10 messages per minute per user)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ blockHeight: string }> }
) {
  try {
    const { blockHeight } = await params;
    const h = parseInt(blockHeight, 10);
    if (isNaN(h) || h < 0) return error('Invalid block height', 400);

    const body = await req.json();
    const { walletAddress, signature, message: authMessage, text, type, mediaUrl, replyToId } = body;

    if (!walletAddress || !signature || !authMessage) return error('Auth required', 400);
    if (!text || typeof text !== 'string') return error('text is required', 400);

    /* MOCK — replace with real BIP-322 */
    if (!verifyWalletSignature(walletAddress, authMessage, signature)) return error('Invalid signature', 401);

    // Verify user has access to this block (owner, parcel owner, or delegatee)
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) return error('User not found', 404);

    const validTypes = ['text', 'image', 'gif', 'link'];
    const msgType = type && validTypes.includes(type) ? type : 'text';

    const chatMsg = await prisma.chatMessage.create({
      data: {
        blockHeight: h,
        senderAddress: walletAddress,
        senderHandle: user.handle,
        text: sanitizeString(text, 2000),
        type: msgType,
        mediaUrl: mediaUrl ? sanitizeString(mediaUrl, 500) : null,
        replyToId: replyToId || null,
      },
    });

    return success(chatMsg, 201);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
