import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  try {
    const { height } = await params;
    const blockHeight = parseInt(height, 10);

    if (isNaN(blockHeight) || blockHeight < 0) {
      return NextResponse.json({ error: 'Invalid block height' }, { status: 400 });
    }

    const block = await prisma.block.findUnique({
      where: { height: blockHeight },
      include: {
        genome: true,
        verifications: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!block) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    return NextResponse.json({
      block: {
        height: block.height,
        hash: block.hash,
        previousHash: block.previousHash,
        merkleRoot: block.merkleRoot,
        timestamp: block.timestamp,
        nonce: block.nonce,
        difficulty: block.difficulty,
        txCount: block.txCount,
        size: block.size,
        weight: block.weight,
        version: block.version,
        verificationStatus: block.verificationStatus,
        verifiedAt: block.verifiedAt,
      },
      genome: block.genome
        ? {
            id: block.genome.id,
            sequence: block.genome.sequence,
            integrity: block.genome.integrity,
            complexity: block.genome.complexity,
            generatedAt: block.genome.generatedAt,
          }
        : null,
      recentVerifications: block.verifications.map((v) => ({
        id: v.id,
        agentId: v.agentId,
        status: v.status,
        startedAt: v.startedAt,
        completedAt: v.completedAt,
        scoreAwarded: v.scoreAwarded,
      })),
    });
  } catch (error) {
    console.error('Block fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
