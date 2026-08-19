import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(req: Request) {
  const rl = await enforceRateLimit(req, { bucket: 'health' });
  if (rl.response) return rl.response;

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'error', database: 'disconnected' }, { status: 500 });
  }
}
