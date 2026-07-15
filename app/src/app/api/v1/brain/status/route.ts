/**
 * GET /api/v1/brain/status
 * 
 * Enhanced Brain status endpoint — returns full operational state
 * including soul verification, wallet balance, and runtime metrics.
 * 
 * Public endpoint — full transparency, no auth required.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  MORAL_CODE,
  NEXUS_BRAIN_WALLET,
  NEXUS_BRAIN_HANDLE,
  MORAL_CODE_INSCRIPTION_ID,
  SOUL_FILE_INSCRIPTION_ID,
  SOUL_TEXT_INSCRIPTION_ID,
  SOUL_JSON_INSCRIPTION_ID,
  SOUL_JSON_INSCRIPTION_NUMBER,
  FLAG_THRESHOLD_SOFT,
  FLAG_THRESHOLD_HARD,
  APPEAL_DURATION_HOURS,
  APPEAL_RESTORE_MAJORITY,
  FALSE_FLAG_STRIKE_LIMIT,
  BRAIN_FEE_PERCENT,
} from '@/lib/protocol';
import { fetchBrainWalletBalance, getBrainStatus } from '@/lib/brain';

export async function GET() {
  try {
    // Fetch all stats in parallel
    const [
      totalFlags,
      totalHidden,
      totalRestored,
      totalActions,
      totalAppeals,
      pendingAppeals,
      recentActions,
      brainFlags,
      walletBalance,
    ] = await Promise.all([
      prisma.contentFlag.count(),
      prisma.contentVerdict.count({ where: { status: { in: ['hidden', 'permanent_hide'] } } }),
      prisma.contentVerdict.count({ where: { status: 'restored' } }),
      prisma.brainAction.count(),
      prisma.appeal.count(),
      prisma.appeal.count({ where: { status: 'pending' } }),
      prisma.brainAction.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.contentFlag.count({ where: { isBrainFlag: true } }),
      fetchBrainWalletBalance(),
    ]);

    // Runtime state (may be null if the Brain has not booted in this process).
    // soulVerified reflects the REAL verification outcome, not just "we tried".
    const runtimeStatus = getBrainStatus();

    return NextResponse.json({
      success: true,
      runtime: runtimeStatus
        ? {
            status: runtimeStatus.status,
            soulVerified: runtimeStatus.soulVerified,
            scanCycles: runtimeStatus.scanCycles,
            uptimeMs: runtimeStatus.uptime,
          }
        : { status: 'not_booted', soulVerified: false, scanCycles: 0, uptimeMs: 0 },
      identity: {
        handle: NEXUS_BRAIN_HANDLE,
        name: 'Nexus Brain',
        role: 'Autonomous Moral Guardian',
        tier: 1,
        wallet: NEXUS_BRAIN_WALLET,
      },
      inscriptions: {
        moralCode: MORAL_CODE_INSCRIPTION_ID,
        soulText: SOUL_TEXT_INSCRIPTION_ID,
        soulFile: SOUL_FILE_INSCRIPTION_ID,
        soulJson: { id: SOUL_JSON_INSCRIPTION_ID, number: SOUL_JSON_INSCRIPTION_NUMBER },
      },
      moralCode: MORAL_CODE,
      parameters: {
        flagThresholdSoft: FLAG_THRESHOLD_SOFT,
        flagThresholdHard: FLAG_THRESHOLD_HARD,
        appealDurationHours: APPEAL_DURATION_HOURS,
        appealRestoreMajority: APPEAL_RESTORE_MAJORITY,
        falseFlagStrikeLimit: FALSE_FLAG_STRIKE_LIMIT,
        feePercent: BRAIN_FEE_PERCENT,
      },
      stats: {
        totalFlags,
        totalHidden,
        totalRestored,
        totalActions,
        totalAppeals,
        pendingAppeals,
        brainFlags,
        communityOverrideRate: totalHidden > 0
          ? `${((totalRestored / (totalHidden + totalRestored)) * 100).toFixed(1)}%`
          : '0%',
        walletBalanceSats: walletBalance,
      },
      recentActions: recentActions.map(a => ({
        id: a.id,
        type: a.actionType,
        contentId: a.contentId,
        details: a.details ? (() => { try { return JSON.parse(a.details); } catch { return a.details; } })() : null,
        timestamp: a.createdAt,
      })),
      constraints: [
        'NEVER censor content alone — always requires community consensus',
        'NEVER modify its own moral code — changes require a new Bitcoin inscription',
        'NEVER access private keys beyond its own operational wallet',
        'NEVER override parcel owner sovereignty',
        'NEVER discriminate by tier, wallet age, or verification status',
        'NEVER make decisions when soul cannot be verified from inscription',
        'NEVER hide content that does not violate one of the 5 moral rules',
        'ALWAYS explain reasoning for every action',
        'ALWAYS publish all decisions to transparency dashboard',
        'ALWAYS allow appeals — no decision is final without community vote',
      ],
    });
  } catch (err) {
    console.error('[Brain Status]', err);
    return NextResponse.json({ error: 'Failed to fetch brain status' }, { status: 500 });
  }
}
