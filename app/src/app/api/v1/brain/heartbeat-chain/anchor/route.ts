/**
 * GET /api/v1/brain/heartbeat-chain/anchor
 * 
 * Returns the latest chain tip formatted for Bitcoin inscription.
 * ~120 bytes, deterministic, ready to inscribe.
 */

import { NextResponse } from 'next/server';
import { getChainTip } from '@/lib/brain/heartbeat-chain';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-brain-heartbeat-chain-anchor' });
  if (rl.response) return rl.response;

  try {
    const tip = await getChainTip();

    if (!tip) {
      return NextResponse.json({
        ok: false,
        error: 'No heartbeat entries yet — chain is empty',
      }, { status: 404 });
    }

    const anchor = `BG_BRAIN_ANCHOR|block:${tip.blockHeight}|cycle:${tip.scanCycle}|sha256:${tip.hash}`;

    return NextResponse.json({
      ok: true,
      anchor,
      bytes: Buffer.byteLength(anchor, 'utf8'),
      blockHeight: tip.blockHeight,
      scanCycle: tip.scanCycle,
      hash: tip.hash,
      createdAt: tip.createdAt,
    });
  } catch (err) {
    console.error('[HeartbeatChain Anchor]', err);
    return NextResponse.json({ error: 'Failed to generate anchor' }, { status: 500 });
  }
}
