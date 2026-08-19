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
import { enforceRateLimit } from '@/lib/api-rate-limit';

const BRAIN_SECRET = process.env.BRAIN_SCAN_SECRET;
if (!BRAIN_SECRET) console.warn('[brain/scan] BRAIN_SCAN_SECRET not set — scan endpoint disabled');

export async function POST(req: Request) {
  try {
    // Auth check — only authorized callers can trigger scans
    // FAIL CLOSED: if the secret is unset, an unauthenticated request would
    // compare undefined !== undefined and pass. Refuse instead.
    if (!BRAIN_SECRET) {
      console.error('[brain/scan] BRAIN_SCAN_SECRET not set — refusing request');
      return NextResponse.json({ error: 'Scan endpoint disabled: secret not configured' }, { status: 503 });
    }

    const authHeader = req.headers.get('authorization');
    const body = await req.json().catch(() => ({}));
    const token = authHeader?.replace('Bearer ', '') || body.secret;

    if (token !== BRAIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── 1. SCAN NEW CONTENT ───
    const fetchContent = async (): Promise<ScanTarget[]> => {
      const since = new Date(Date.now() - 3600_000); // Last hour — incremental
      const PER_SOURCE = 50;

      // Gather candidate content across PUBLIC surfaces only.
      // SOVEREIGNTY (hard): only publicly-served, human-visible text is scanned.
      // Private agent-to-agent traffic, agent memory, event payloads, and
      // operational fields (brief stats/pendingPermissions) are NEVER scanned.
      const [messages, briefs, profiles, objects, listings] = await Promise.all([
        // Public block chat.
        prisma.chatMessage.findMany({
          where: { createdAt: { gte: since }, reported: false },
          orderBy: { createdAt: 'desc' },
          take: PER_SOURCE,
        }),
        // Public agent briefs — summary prose only (NOT stats/pendingPermissions).
        prisma.agentBrief.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: PER_SOURCE,
          include: { agent: { select: { walletAddress: true, blockHeight: true } } },
        }),
        // Public per-block profiles — displayName / bio / handle.
        prisma.blockProfile.findMany({
          where: { updatedAt: { gte: since } },
          orderBy: { updatedAt: 'desc' },
          take: PER_SOURCE,
        }),
        // Public, visible world objects — owner-set names.
        prisma.blockObject.findMany({
          where: { updatedAt: { gte: since }, visible: true },
          orderBy: { updatedAt: 'desc' },
          take: PER_SOURCE,
        }),
        // Public delegation listings — the listing row is numeric-only, so the
        // scanned prose is the block label surfaced in that discovery feed.
        prisma.delegationListing.findMany({
          where: { updatedAt: { gte: since }, active: true },
          orderBy: { updatedAt: 'desc' },
          take: PER_SOURCE,
          include: { block: { select: { label: true } } },
        }),
      ]);

      const candidates: ScanTarget[] = [
        ...messages.map((m) => ({
          contentType: 'chat_message' as const,
          contentId: m.id,
          text: m.text,
          mediaUrl: m.mediaUrl || undefined,
          authorAddress: m.senderAddress,
          blockHeight: m.blockHeight,
          createdAt: m.createdAt,
        })),
        ...briefs.map((b) => ({
          contentType: 'brief' as const,
          contentId: b.id,
          text: b.summary,
          authorAddress: b.agent?.walletAddress ?? '',
          blockHeight: b.agent?.blockHeight,
          createdAt: b.createdAt,
        })),
        ...profiles
          .filter((p) => [p.displayName, p.bio, p.handle].some((v) => v && v.trim()))
          .map((p) => ({
            contentType: 'profile' as const,
            contentId: p.id,
            text: [p.displayName, p.bio, p.handle].filter(Boolean).join('\n'),
            authorAddress: p.walletAddress,
            blockHeight: p.blockHeight,
            createdAt: p.updatedAt,
          })),
        ...objects
          .filter((o) => o.name && o.name.trim())
          .map((o) => ({
            contentType: 'world_object' as const,
            contentId: o.id,
            text: o.name ?? '',
            authorAddress: o.ownerAddress,
            blockHeight: o.blockHeight,
            createdAt: o.updatedAt,
          })),
        ...listings
          .filter((l) => l.block?.label && l.block.label.trim())
          .map((l) => ({
            contentType: 'listing' as const,
            contentId: l.id,
            text: l.block?.label ?? '',
            authorAddress: l.ownerAddress,
            blockHeight: l.blockHeight,
            createdAt: l.updatedAt,
          })),
      ];

      if (candidates.length === 0) return [];

      // Filter out anything the Brain already flagged (idempotent across surfaces).
      const brainFlags = await prisma.contentFlag.findMany({
        where: {
          flaggedBy: NEXUS_BRAIN_WALLET,
          contentId: { in: candidates.map((c) => c.contentId) },
        },
        select: { contentId: true },
      });
      const flaggedIds = new Set(brainFlags.map((f) => f.contentId));

      return candidates.filter((c) => !flaggedIds.has(c.contentId));
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
export async function GET(req: Request) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-brain-scan', limit: 20 });
  if (rl.response) return rl.response;

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
