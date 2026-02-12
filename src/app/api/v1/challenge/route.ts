import { NextRequest, NextResponse } from 'next/server';

// Legacy Phase 2 route — schema migrated.
export async function GET() {
  return NextResponse.json({ success: true, data: null, message: 'Schema migrated — use /api/v1/auth/verify' });
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ success: true, data: null, message: 'Schema migrated — use /api/v1/auth/verify' });
}
