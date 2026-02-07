import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { trustScore: 'desc' },
      take: 50,
      select: {
        id: true,
        address: true,
        displayName: true,
        trustScore: true,
        totalVerifications: true,
        successfulVerifications: true,
        rank: true,
        badges: true,
        lastActiveAt: true,
      },
    });

    const totalBlocks = await prisma.block.count();
    const verifiedBlocks = await prisma.block.count({ where: { verificationStatus: 'verified' } });
    const totalVerifications = await prisma.verification.count();

    return NextResponse.json({
      leaderboard: agents,
      stats: { totalBlocks, verifiedBlocks, totalVerifications, totalAgents: agents.length },
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
