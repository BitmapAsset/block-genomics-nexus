import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { FLAG_THRESHOLD_SOFT, FLAG_THRESHOLD_HARD } from '@/lib/protocol';
import { verifySignedAction } from '@/lib/signed-action';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { contentType, contentId, walletAddress, reason, ruleIndex, signature, message } = body;
    
    if (!contentType || !contentId || !walletAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // The canonical 'brain.flag' message for this body (Block 0), with a
    // one-time 'brain' nonce.
    const auth = await verifySignedAction(walletAddress, message, signature, body, {
      action: 'brain.flag', method: 'POST', path: '/api/v1/brain/flag', blockHeight: 0, purpose: 'brain',
    });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Check if user is suspended from flagging
    const strike = await prisma.flagStrike.findUnique({ where: { walletAddress } });
    if (strike?.suspended) {
      return NextResponse.json({ error: 'Flagging privileges suspended' }, { status: 403 });
    }

    // Create flag (unique per content+user)
    await prisma.contentFlag.create({
      data: { contentType, contentId, flaggedBy: walletAddress, reason, ruleIndex },
    }).catch(() => null); // Ignore duplicate

    // Count flags for this content
    const flagCount = await prisma.contentFlag.count({ where: { contentId } });

    // Upsert verdict
    const status = flagCount >= FLAG_THRESHOLD_HARD ? 'permanent_hide' : (flagCount >= FLAG_THRESHOLD_SOFT ? 'hidden' : 'visible');
    await prisma.contentVerdict.upsert({
      where: { contentId },
      create: { contentType, contentId, status, flagCount, hiddenAt: status !== 'visible' ? new Date() : null },
      update: { flagCount, status, hiddenAt: status !== 'visible' ? new Date() : undefined },
    });

    // Log brain action
    await prisma.brainAction.create({
      data: { actionType: 'flag', contentId, details: JSON.stringify({ flagCount, status, flaggedBy: walletAddress }) },
    });

    return NextResponse.json({ success: true, flagCount, status });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process flag' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-brain-flag' });
  if (rl.response) return rl.response;

  const url = new URL(req.url);
  const contentId = url.searchParams.get('contentId');
  if (!contentId) return NextResponse.json({ error: 'contentId required' }, { status: 400 });
  
  const verdict = await prisma.contentVerdict.findUnique({ where: { contentId } });
  const flagCount = await prisma.contentFlag.count({ where: { contentId } });
  return NextResponse.json({ success: true, verdict, flagCount });
}
