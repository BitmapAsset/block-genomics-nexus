import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { FLAG_THRESHOLD_SOFT, FLAG_THRESHOLD_HARD } from '@/lib/protocol';
import { verifySignedAction } from '@/lib/signed-action';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { requireLiveBlockOwner, gateDenialResponse } from '@/lib/ownership-gate';

/**
 * Flags per IP per window. Tighter than the read bucket (120 a minute): a flag
 * is a signed write that costs a live ownership check and three rows.
 */
const FLAG_WRITE_LIMIT = 10;
const FLAG_WRITE_WINDOW_MS = 60_000;

export async function POST(req: Request) {
  // Charged before the body is read, so an over-limit caller costs nothing.
  const rl = await enforceRateLimit(req, {
    bucket: 'v1-brain-flag-write',
    limit: FLAG_WRITE_LIMIT,
    windowMs: FLAG_WRITE_WINDOW_MS,
  });
  if (rl.response) return rl.response;

  try {
    const body = await req.json();
    const { contentType, contentId, walletAddress, reason, ruleIndex, signature, message, voterBlock } = body;
    
    if (!contentType || !contentId || !walletAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    // A flag names one block its sender holds: one wallet with no bitmap is not
    // a voice in community moderation.
    if (!Number.isInteger(voterBlock) || voterBlock < 0) {
      return NextResponse.json({ error: 'voterBlock (a block you hold, as an integer) is required' }, { status: 400 });
    }

    // The canonical 'brain.flag' message for this body, bound to voterBlock,
    // with a one-time 'brain' nonce.
    const auth = await verifySignedAction(walletAddress, message, signature, body, {
      action: 'brain.flag', method: 'POST', path: '/api/v1/brain/flag', blockHeight: voterBlock, purpose: 'brain',
    });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // The verified signer must hold voterBlock on-chain right now (the same
    // gate, and the same retryable 503, as every owner write).
    const gate = await requireLiveBlockOwner(walletAddress, voterBlock);
    if (!gate.ok) return gateDenialResponse(gate);

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
      data: { actionType: 'flag', contentId, details: JSON.stringify({ flagCount, status, flaggedBy: walletAddress, voterBlock }) },
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
