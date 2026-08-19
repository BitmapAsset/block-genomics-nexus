/**
 * GET /api/v1/brain/heartbeat-chain
 * 
 * Public endpoint — returns the Brain's heartbeat hash chain.
 * No auth needed. Transparency is the point.
 */

import { NextResponse } from 'next/server';
import { getChainForExport, verifyChain, getChainTip } from '@/lib/brain/heartbeat-chain';
import prisma from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-brain-heartbeat-chain' });
  if (rl.response) return rl.response;

  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 1000);
    const fromBlockHeight = url.searchParams.get('from')
      ? parseInt(url.searchParams.get('from')!, 10)
      : undefined;
    const shouldVerify = url.searchParams.get('verify') === 'true';

    const entries = await getChainForExport({ limit, fromBlockHeight });
    const chainLength = await prisma.brainHeartbeat.count();
    const tip = await getChainTip();

    let verified: boolean | undefined;
    if (shouldVerify) {
      verified = verifyChain(entries);
    }

    return NextResponse.json({
      ok: true,
      chainLength,
      latestHash: tip?.hash ?? null,
      latestBlockHeight: tip?.blockHeight ?? null,
      verified: verified ?? null,
      entries,
    });
  } catch (err) {
    console.error('[HeartbeatChain API]', err);
    return NextResponse.json({ error: 'Failed to fetch heartbeat chain' }, { status: 500 });
  }
}
