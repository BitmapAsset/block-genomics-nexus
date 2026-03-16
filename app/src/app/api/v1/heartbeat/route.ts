/**
 * GET /api/v1/heartbeat — Bitcoin Block Heartbeat
 * 
 * Triggered by Vercel Cron (every 5 min) or any external poller.
 * Checks if a new Bitcoin block has been mined. If yes, pulses all
 * Guardian health checks. If no new block, returns immediately.
 * 
 * This is platform-agnostic — the poller is just a trigger.
 * The heartbeat itself is driven by Bitcoin block production.
 * 
 * Bitcoin's heartbeat IS the protocol's heartbeat. ⛏️
 */

import { NextResponse } from 'next/server';
import { executeBlockHeartbeat } from '@/lib/bitcoin-heartbeat';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  // Auth: Vercel cron or manual trigger with secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const heartbeatSecret = process.env.HEARTBEAT_SECRET;

  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isManual = heartbeatSecret && authHeader === `Bearer ${heartbeatSecret}`;
  const { searchParams } = new URL(req.url);
  const force = searchParams.get('force') === 'true';

  if (!isVercelCron && !isManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await executeBlockHeartbeat(force);

    return NextResponse.json({
      ok: true,
      ...result,
      message: result.newBlock
        ? `⛏️ Block #${result.blockHeight} — ${result.guardiansChecked} guardians pulsed`
        : `No new block (still at #${result.blockHeight})`,
    });
  } catch (err: unknown) {
    console.error('[Bitcoin Heartbeat]', err);
    return NextResponse.json(
      { error: 'Heartbeat failed', detail: err instanceof Error ? err.message : undefined },
      { status: 500 }
    );
  }
}
