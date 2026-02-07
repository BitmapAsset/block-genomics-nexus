import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        genomes: {
          include: { block: true },
          orderBy: { generatedAt: 'desc' },
        },
        verifications: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({
      agent: {
        id: agent.id,
        address: agent.address,
        displayName: agent.displayName,
        avatarUrl: agent.avatarUrl,
        trustScore: agent.trustScore,
        totalVerifications: agent.totalVerifications,
        successfulVerifications: agent.successfulVerifications,
        failedVerifications: agent.failedVerifications,
        rank: agent.rank,
        badges: agent.badges,
        createdAt: agent.createdAt,
        lastActiveAt: agent.lastActiveAt,
      },
      genomes: agent.genomes.map((g) => ({
        id: g.id,
        blockHeight: g.blockHeight,
        blockHash: g.blockHash,
        sequence: g.sequence,
        integrity: g.integrity,
        complexity: g.complexity,
        generatedAt: g.generatedAt,
      })),
      recentVerifications: agent.verifications.map((v) => ({
        id: v.id,
        blockHeight: v.blockHeight,
        status: v.status,
        startedAt: v.startedAt,
        completedAt: v.completedAt,
        scoreAwarded: v.scoreAwarded,
      })),
    });
  } catch (error) {
    console.error('Agent fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
