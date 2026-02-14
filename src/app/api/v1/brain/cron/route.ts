/**
 * GET /api/v1/brain/cron
 * 
 * Vercel Cron endpoint — triggers the Brain's autonomous scan cycle.
 * Runs every 5 minutes on Vercel Pro plan.
 * 
 * Vercel crons send a GET request with CRON_SECRET header for auth.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { NEXUS_BRAIN_WALLET, FLAG_THRESHOLD_SOFT, FLAG_THRESHOLD_HARD } from '@/lib/protocol';
import { runOneShotScan, processExpiredAppeals, getBrainStatus } from '@/lib/brain';
import type { ScanTarget, BrainDecision } from '@/lib/brain';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30s max for cron

export async function GET(req: Request) {
  // Verify Vercel cron auth (or our own secret for manual triggers)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const brainSecret = process.env.BRAIN_SCAN_SECRET;

  // Vercel sends CRON_SECRET automatically; also accept our BRAIN_SCAN_SECRET
  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isManualTrigger = brainSecret && authHeader === `Bearer ${brainSecret}`;

  if (!isVercelCron && !isManualTrigger) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ─── SCAN ───
    const fetchContent = async (): Promise<ScanTarget[]> => {
      const recentMessages = await prisma.chatMessage.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 300_000) }, // Last 5 min
          reported: false,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const brainFlags = await prisma.contentFlag.findMany({
        where: {
          flaggedBy: NEXUS_BRAIN_WALLET,
          contentId: { in: recentMessages.map(m => m.id) },
        },
        select: { contentId: true },
      });
      const flaggedIds = new Set(brainFlags.map(f => f.contentId));

      return recentMessages
        .filter(m => !flaggedIds.has(m.id))
        .map(m => ({
          contentType: 'chat_message' as const,
          contentId: m.id,
          text: m.text,
          mediaUrl: m.mediaUrl || undefined,
          authorAddress: m.senderAddress,
          blockHeight: m.blockHeight,
          createdAt: m.createdAt,
        }));
    };

    const persistDecision = async (decision: BrainDecision): Promise<void> => {
      await prisma.brainAction.create({
        data: {
          actionType: decision.type,
          contentId: decision.contentId || null,
          details: JSON.stringify({
            reasoning: decision.reasoning,
            ruleIndex: decision.ruleIndex,
            ruleText: decision.ruleText,
            soulRef: decision.soulInscriptionRef,
            cronTriggered: true,
          }),
        },
      });
    };

    const persistFlag = async (contentId: string, contentType: string, ruleIndex: number): Promise<void> => {
      await prisma.contentFlag.create({
        data: {
          contentType,
          contentId,
          flaggedBy: NEXUS_BRAIN_WALLET,
          isBrainFlag: true,
          ruleIndex,
          reason: `Brain auto-flag: Rule ${ruleIndex} violation`,
        },
      }).catch(() => null);

      const flagCount = await prisma.contentFlag.count({ where: { contentId } });
      const status = flagCount >= FLAG_THRESHOLD_HARD
        ? 'permanent_hide'
        : flagCount >= FLAG_THRESHOLD_SOFT
          ? 'hidden'
          : 'visible';

      await prisma.contentVerdict.upsert({
        where: { contentId },
        create: { contentType, contentId, status, flagCount, hiddenAt: status !== 'visible' ? new Date() : null },
        update: { flagCount, status, hiddenAt: status !== 'visible' ? new Date() : undefined },
      });
    };

    const { state, decisions: scanDecisions } = await runOneShotScan(fetchContent, persistDecision, persistFlag);

    // ─── APPEALS ───
    const fetchExpiredAppeals = async () => {
      const expired = await prisma.appeal.findMany({
        where: { status: 'pending', expiresAt: { lte: new Date() } },
      });
      return Promise.all(expired.map(async (a) => {
        const flags = await prisma.contentFlag.findMany({
          where: { contentId: a.contentId },
          select: { flaggedBy: true },
        });
        return {
          id: a.id,
          contentId: a.contentId,
          votesFor: a.votesFor,
          votesAgainst: a.votesAgainst,
          flaggedBy: flags.map(f => f.flaggedBy).filter(addr => addr !== NEXUS_BRAIN_WALLET),
        };
      }));
    };

    const resolveAppealInDb = async (appealId: string, outcome: 'restored' | 'upheld', reasoning: string) => {
      const appeal = await prisma.appeal.update({
        where: { id: appealId },
        data: { status: outcome, resolvedAt: new Date() },
      });
      if (outcome === 'restored' && appeal) {
        await prisma.contentVerdict.update({
          where: { contentId: appeal.contentId },
          data: { status: 'restored', restoredAt: new Date(), appealId },
        });
      }
      await prisma.brainAction.create({
        data: { actionType: `appeal_${outcome}`, contentId: appeal?.contentId, details: JSON.stringify({ reasoning, appealId }) },
      });
    };

    const issueStrike = async (walletAddress: string) => {
      const strike = await prisma.flagStrike.upsert({
        where: { walletAddress },
        create: { walletAddress, strikeCount: 1 },
        update: { strikeCount: { increment: 1 }, lastStrikeAt: new Date() },
      });
      return strike.strikeCount;
    };

    const revokePrivileges = async (walletAddress: string) => {
      await prisma.flagStrike.update({
        where: { walletAddress },
        data: { suspended: true, suspendedAt: new Date() },
      });
    };

    const appealDecisions = await processExpiredAppeals(fetchExpiredAppeals, resolveAppealInDb, issueStrike, revokePrivileges);

    const all = [...scanDecisions, ...appealDecisions];
    const status = getBrainStatus();

    return NextResponse.json({
      ok: true,
      brain: status?.status,
      soulVerified: status?.soulVerified,
      cycle: status?.scanCycles,
      flags: all.filter(d => d.type === 'flag').length,
      appeals: appealDecisions.length,
      wallet: status?.walletBalance,
    });
  } catch (err) {
    console.error('[NexusBrain Cron]', err);
    return NextResponse.json({ error: 'Brain cron failed' }, { status: 500 });
  }
}
