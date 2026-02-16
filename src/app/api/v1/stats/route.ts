import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [verifiedAgents, genomesMinted] = await Promise.all([
      // Users with a verified handle = verified agents
      prisma.user.count({ where: { handle: { not: null } } }),
      // Users with a genome hash = genomes minted
      prisma.user.count({ where: { genomeHash: { not: null } } }),
    ]);

    return NextResponse.json({ verifiedAgents, genomesMinted });
  } catch {
    return NextResponse.json({ verifiedAgents: 0, genomesMinted: 0 });
  }
}
