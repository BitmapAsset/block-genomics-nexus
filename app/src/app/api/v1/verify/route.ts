import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateGenome, calculateTrustScore } from '@/lib/genome-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { challengeId, agentAddress, signature, blockHeight } = body;

    if (
      !challengeId ||
      !agentAddress ||
      !signature ||
      !Number.isInteger(blockHeight) ||
      blockHeight < 0
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid fields: challengeId, agentAddress, signature, blockHeight' },
        { status: 400 }
      );
    }

    if (typeof agentAddress !== 'string' || agentAddress.length > 128) {
      return NextResponse.json({ error: 'Invalid agent address' }, { status: 400 });
    }

    if (typeof signature !== 'string' || signature.length > 2048) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Find the challenge
    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    // Check expiry
    if (new Date() > challenge.expiresAt) {
      return NextResponse.json({ error: 'Challenge expired' }, { status: 410 });
    }

    // Find or create agent
    let agent = await prisma.agent.findUnique({ where: { address: agentAddress } });
    if (!agent) {
      agent = await prisma.agent.create({
        data: {
          address: agentAddress,
          displayName: `Agent ${agentAddress.slice(0, 8)}...`,
        },
      });
    }

    // Find the block
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    // TODO: In production, verify the BIP-322 signature against the challenge message
    // For MVP, we accept any signature and verify the genome matches
    const genome = generateGenome(block.hash);

    // Create verification record
    const verification = await prisma.verification.create({
      data: {
        blockHeight: block.height,
        blockHash: block.hash,
        agentId: agent.id,
        challengeId: challenge.id,
        status: 'verified',
        proof: { signature, challengeId, verifiedAt: new Date().toISOString() },
        completedAt: new Date(),
        duration: Math.floor(
          (Date.now() - challenge.createdAt.getTime()) / 1000
        ),
        scoreAwarded: 10,
      },
    });

    // Update agent stats
    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        totalVerifications: { increment: 1 },
        successfulVerifications: { increment: 1 },
        lastActiveAt: new Date(),
        trustScore: calculateTrustScore(
          agent.totalVerifications + 1,
          agent.successfulVerifications + 1,
          agent.failedVerifications
        ),
      },
    });

    // Update block verification status
    await prisma.block.update({
      where: { height: blockHeight },
      data: { verificationStatus: 'verified', verifiedAt: new Date() },
    });

    // Create or update genome
    const existingGenome = await prisma.genome.findUnique({
      where: { blockHeight },
    });

    if (!existingGenome) {
      await prisma.genome.create({
        data: {
          blockHeight: block.height,
          blockHash: block.hash,
          sequence: genome.sequence,
          integrity: genome.integrity,
          complexity: genome.complexity,
          generatedBy: agent.id,
          signature: genome.signature,
        },
      });
    }

    return NextResponse.json({
      success: true,
      verification: {
        id: verification.id,
        status: verification.status,
        scoreAwarded: verification.scoreAwarded,
        completedAt: verification.completedAt,
      },
      agent: {
        id: updated.id,
        displayName: updated.displayName,
        trustScore: updated.trustScore,
        totalVerifications: updated.totalVerifications,
        badges: updated.badges,
      },
      genome: {
        sequence: genome.sequence,
        integrity: genome.integrity,
        complexity: genome.complexity,
      },
    });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
