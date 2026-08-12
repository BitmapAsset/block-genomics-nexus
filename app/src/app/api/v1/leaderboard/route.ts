import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api-rate-limit';

// Legacy Phase 2 route — schema migrated. Returns empty data for backward compat.
export async function GET(req: Request) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-leaderboard' });
  if (rl.response) return rl.response;

  return NextResponse.json({ success: true, data: [], message: 'Schema migrated — use /api/v1/blocks, /api/v1/users, /api/v1/delegations' });
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ success: true, data: null, message: 'Schema migrated — use new API routes' });
}
