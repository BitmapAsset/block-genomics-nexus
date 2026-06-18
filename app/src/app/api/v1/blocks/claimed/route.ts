import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Real owned-block set: every height present in the Block table is a genuinely
// claimed block. Returns only heights so the Nexus map can overlay honest
// claimed status. On error, returns an empty set (everything renders unclaimed).
export async function GET() {
  try {
    const blocks = await prisma.block.findMany({ select: { height: true } });
    return NextResponse.json({ heights: blocks.map((b) => b.height) });
  } catch {
    return NextResponse.json({ heights: [] });
  }
}
