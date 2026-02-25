import { NextRequest, NextResponse } from 'next/server';

// Legacy Phase 2 route — schema migrated. Returns empty data for backward compat.
export async function GET() {
  return NextResponse.json({ success: true, data: [], message: 'Schema migrated — use /api/v1/blocks, /api/v1/users, /api/v1/delegations' });
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ success: true, data: null, message: 'Schema migrated — use new API routes' });
}
