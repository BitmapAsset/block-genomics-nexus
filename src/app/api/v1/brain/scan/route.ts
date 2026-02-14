/**
 * POST /api/v1/brain/scan
 * 
 * Trigger one Brain scan cycle. Designed to be called by:
 *   - Vercel Cron (scheduled)
 *   - Manual trigger from admin
 *   - The Brain's own daemon process
 * 
 * The Brain:
 *   1. Boots (fetches soul from Bitcoin inscription)
 *   2. Scans recent unscanned content
 *   3. Flags violations (as 1 community flag)
 *   4. Processes expired appeals
 *   5. Returns full decision log
 * 
 * Protected by secret token to prevent abuse.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { NEXUS_BRAIN_WALLET, FLAG_THRESHOLD_SOFT, FLAG_THRESHOLD_HARD } from '@/lib/protocol';
import { runOneShotScan, processExpiredAppeals, getBrainStatus } from '@/lib/brain';
import type { ScanTarget, BrainDecision } from '@/lib/brain';

const BRAIN_SECRET = process.env.BRAIN_SCAN_SECRET || 'nexus-brain-dev-secret';

export async function POST(req: Request) {
  try {
    // Auth check — only authorized callers can trigger scans
    const authHeader = req.headers.get('authorization');
    const body = await req.json().catch(() => ({}));
    const token = authHeader?.replace('Bearer ', '') || body.secret;

    if (token !== BRAIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── 1. SCAN NEW CONTENT ───
    const fetchContent = async (): Promise<ScanTarget[]> => {
      // Fetch recent chat messages not yet scanned by Brain
      const recentMessages = await prisma.chatMessage.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 3600_000) }, // Last hour
          reported: false, // Not already flagged manually
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // Filter out messages already flagged by Brain
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
          }),
        },
      });
    };

    const persistFlag = async (contentId: string, contentType: string, ruleIndex: number): Promise<void> => {
      // Create flag as Brain (counts as 1 community flag)
      await prisma.contentFlag.create({
        data: {
          contentType,
          contentId,
          flaggedBy: NEXUS_BRAIN_WALLET,
          isBrainFlag: true,
          ruleIndex,
          reason: `Brain auto-flag: Rule ${ruleIndex} violation detected`,
        },
      }).catch(() => null); // Ignore duplicate

      // Update flag count & verdict
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

    const { state, decisions: scanDecisions } = await runOneShotScan(
      fetchContent,
      persistDecision,
      persistFlag,
    );

    // ─── 2. PROCESS EXPIRED APPEALS ───
    const fetchExpiredAppeals = async () => {
      const expired = await prisma.appeal.findMany({
        where: { status: 'pending', expiresAt: { lte: new Date() } },
      });
      
      // Get flaggers for each appeal's content
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
      await prisma.appeal.update({
        where: { id: appealId },
        data: { status: outcome, resolvedAt: new Date() },
      });

      // If restored, update verdict
      const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
      if (appeal && outcome === 'restored') {
        await prisma.contentVerdict.update({
          where: { contentId: appeal.contentId },
          data: { status: 'restored', restoredAt: new Date(), appealId },
        });
      }

      // Log the action
      await prisma.brainAction.create({
        data: {
          actionType: `appeal_${outcome}`,
          contentId: appeal?.contentId,
          details: JSON.stringify({ reasoning, appealId }),
        },
      });
    };

    const issueStrike = async (walletAddress: string): Promise<number> => {
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

    const appealDecisions = await processExpiredAppeals(
      fetchExpiredAppeals,
      resolveAppealInDb,
      issueStrike,
      revokePrivileges,
    );

    // ─── 3. RETURN RESULTS ───
    const allDecisions = [...scanDecisions, ...appealDecisions];
    const status = getBrainStatus();

    return NextResponse.json({
      success: true,
      brain: {
        status: status?.status,
        soulVerified: status?.soulVerified,
        scanCycle: status?.scanCycles,
        flagsProcessed: status?.flagsProcessed,
        appealsResolved: status?.appealsResolved,
        walletBalance: status?.walletBalance,
      },
      decisions: allDecisions.map(d => ({
        id: d.id,
        type: d.type,
        contentId: d.contentId,
        ruleIndex: d.ruleIndex,
        reasoning: d.reasoning,
        timestamp: d.timestamp,
      })),
      summary: {
        contentScanned: scanDecisions.filter(d => d.type === 'scan_complete').length > 0
          ? 'completed' : 'no content',
        flagsIssued: scanDecisions.filter(d => d.type === 'flag').length,
        appealsResolved: appealDecisions.length,
        totalDecisions: allDecisions.length,
      },
    });
  } catch (err) {
    console.error('[NexusBrain] Scan error:', err);
    return NextResponse.json({ error: 'Brain scan failed' }, { status: 500 });
  }
}

/**
 * GET /api/v1/brain/scan
 * 
 * Returns Brain runtime status (no auth required — transparency).
 */
export async function GET() {
  const status = getBrainStatus();
  if (!status) {
    return NextResponse.json({
      success: true,
      status: 'not_booted',
      message: 'Brain has not been booted yet. Send POST to trigger a scan cycle.',
    });
  }
  return NextResponse.json({ success: true, ...status });
}
