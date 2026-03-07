/**
 * Brain Appeal System
 * 
 * POST /api/v1/brain/appeal — Submit an appeal or vote on one
 * GET  /api/v1/brain/appeal?contentId=xxx — Check appeal status
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { APPEAL_DURATION_HOURS } from '@/lib/protocol';

export async function POST(req: Request) {
  try {
    const { action, contentId, walletAddress, reason, vote } = await req.json();

    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress required' }, { status: 400 });
    }

    // ─── SUBMIT APPEAL ───
    if (action === 'appeal') {
      if (!contentId) {
        return NextResponse.json({ error: 'contentId required' }, { status: 400 });
      }

      // Check if content is actually hidden
      const verdict = await prisma.contentVerdict.findUnique({ where: { contentId } });
      if (!verdict || verdict.status === 'visible' || verdict.status === 'restored') {
        return NextResponse.json({ error: 'Content is not hidden — nothing to appeal' }, { status: 400 });
      }

      // Check if appeal already exists
      const existing = await prisma.appeal.findFirst({
        where: { contentId, status: 'pending' },
      });
      if (existing) {
        return NextResponse.json({ error: 'Appeal already pending for this content', appealId: existing.id }, { status: 409 });
      }

      // Create appeal
      const appeal = await prisma.appeal.create({
        data: {
          contentId,
          appealedBy: walletAddress,
          reason: reason || null,
          expiresAt: new Date(Date.now() + APPEAL_DURATION_HOURS * 3600_000),
        },
      });

      // Log brain action
      await prisma.brainAction.create({
        data: {
          actionType: 'appeal_start',
          contentId,
          details: JSON.stringify({ appealId: appeal.id, appealedBy: walletAddress, reason }),
        },
      });

      return NextResponse.json({
        success: true,
        appeal: {
          id: appeal.id,
          contentId,
          status: appeal.status,
          expiresAt: appeal.expiresAt,
          votesFor: 0,
          votesAgainst: 0,
        },
      });
    }

    // ─── VOTE ON APPEAL ───
    if (action === 'vote') {
      const appealId = contentId; // Reuse field for appealId in vote context
      if (!appealId || !vote) {
        return NextResponse.json({ error: 'appealId and vote (restore|uphold) required' }, { status: 400 });
      }

      if (vote !== 'restore' && vote !== 'uphold') {
        return NextResponse.json({ error: 'vote must be "restore" or "uphold"' }, { status: 400 });
      }

      const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
      if (!appeal || appeal.status !== 'pending') {
        return NextResponse.json({ error: 'Appeal not found or not pending' }, { status: 404 });
      }

      if (new Date() > appeal.expiresAt) {
        return NextResponse.json({ error: 'Appeal voting period has expired' }, { status: 400 });
      }

      // Check if already voted
      const voters: string[] = appeal.voters ? JSON.parse(appeal.voters) : [];
      if (voters.includes(walletAddress)) {
        return NextResponse.json({ error: 'Already voted on this appeal' }, { status: 409 });
      }

      // Record vote
      voters.push(walletAddress);
      const update = vote === 'restore'
        ? { votesFor: { increment: 1 }, voters: JSON.stringify(voters) }
        : { votesAgainst: { increment: 1 }, voters: JSON.stringify(voters) };

      const updated = await prisma.appeal.update({
        where: { id: appealId },
        data: update,
      });

      return NextResponse.json({
        success: true,
        appeal: {
          id: updated.id,
          votesFor: updated.votesFor,
          votesAgainst: updated.votesAgainst,
          totalVoters: voters.length,
          expiresAt: updated.expiresAt,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action — use "appeal" or "vote"' }, { status: 400 });
  } catch (err) {
    console.error('[Brain Appeal]', err);
    return NextResponse.json({ error: 'Appeal processing failed' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const contentId = url.searchParams.get('contentId');
  const appealId = url.searchParams.get('appealId');

  if (appealId) {
    const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
    if (!appeal) return NextResponse.json({ error: 'Appeal not found' }, { status: 404 });
    
    const voters: string[] = appeal.voters ? JSON.parse(appeal.voters) : [];
    return NextResponse.json({
      success: true,
      appeal: {
        ...appeal,
        totalVoters: voters.length,
        expired: new Date() > appeal.expiresAt,
      },
    });
  }

  if (contentId) {
    const appeals = await prisma.appeal.findMany({
      where: { contentId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, appeals });
  }

  // List recent appeals
  const recent = await prisma.appeal.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({ success: true, appeals: recent });
}
