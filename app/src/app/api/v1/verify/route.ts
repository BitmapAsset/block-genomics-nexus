import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api-rate-limit';

// Retired. It used to answer 200 `success:true` to anything, so a client that
// posted a signed challenge here believed it had verified. Wallet sign-in is
// POST /api/v1/auth/verify (challenge from POST /api/v1/challenge).
const GONE = {
  success: false as const,
  code: 'gone',
  error: 'This endpoint is retired. Sign in with POST /api/v1/auth/verify (get a challenge from POST /api/v1/challenge first).',
  use: '/api/v1/auth/verify',
};

async function gone(req: Request) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-verify' });
  if (rl.response) return rl.response;
  return NextResponse.json(GONE, { status: 410, headers: { ...rl.headers, 'Cache-Control': 'no-store' } });
}

export async function GET(req: Request) {
  return gone(req);
}

export async function POST(req: Request) {
  return gone(req);
}
