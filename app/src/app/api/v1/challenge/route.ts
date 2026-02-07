import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createChallenge, generateGenome } from '@/lib/genome-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blockHeight } = body;

    if (typeof blockHeight !== 'number' || blockHeight < 0) {
      return NextResponse.json({ error: 'Invalid block height' }, { status: 400 });
    }

    // Fetch block data from mempool.space if not in our DB
    let block = await prisma.block.findUnique({ where: { height: blockHeight } });

    if (!block) {
      // Fetch from mempool.space API
      try {
        const hashRes = await fetch(`https://mempool.space/api/block-height/${blockHeight}`);
        if (!hashRes.ok) throw new Error('Block not found on Bitcoin network');
        const blockHash = await hashRes.text();

        const blockRes = await fetch(`https://mempool.space/api/block/${blockHash}`);
        if (!blockRes.ok) throw new Error('Failed to fetch block data');
        const blockData = await blockRes.json();

        block = await prisma.block.create({
          data: {
            height: blockHeight,
            hash: blockData.id,
            previousHash: blockData.previousblockhash || '',
            merkleRoot: blockData.merkle_root || '',
            timestamp: blockData.timestamp,
            nonce: Math.min(blockData.nonce || 0, 2147483647),
            difficulty: blockData.difficulty || 0,
            txCount: blockData.tx_count || 0,
            size: blockData.size || 0,
            weight: blockData.weight || 0,
            version: blockData.version || 0,
          },
        });
      } catch {
        return NextResponse.json(
          { error: 'Block not found. Provide a valid Bitcoin block height.' },
          { status: 404 }
        );
      }
    }

    // Generate challenge
    const challenge = createChallenge(block.height, block.hash);

    // Generate expected genome
    const genome = generateGenome(block.hash);

    // Store challenge in DB
    const stored = await prisma.challenge.create({
      data: {
        blockHeight: block.height,
        blockHash: block.hash,
        challengeType: 'bip322-sign',
        difficulty: 1.0,
        payload: JSON.stringify({
          message: challenge.message,
          nonce: challenge.nonce,
          timestamp: challenge.timestamp,
          expectedGenome: genome.sequence,
        }),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min expiry
      },
    });

    return NextResponse.json({
      challengeId: stored.id,
      blockHeight: block.height,
      blockHash: block.hash,
      message: challenge.message,
      nonce: challenge.nonce,
      expiresAt: stored.expiresAt,
      genome: {
        sequence: genome.sequence,
        integrity: genome.integrity,
        complexity: genome.complexity,
      },
    });
  } catch (error) {
    console.error('Challenge creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
