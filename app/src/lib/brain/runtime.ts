/**
 * Nexus Brain — Autonomous Runtime
 * 
 * The daemon that never sleeps. This is the Brain's heartbeat.
 * 
 * Lifecycle:
 *   1. BOOT    → Fetch soul from Bitcoin inscription
 *   2. VERIFY  → Validate soul integrity hash
 *   3. SCAN    → Periodically scan new content
 *   4. JUDGE   → Analyze against moral code (from inscription)
 *   5. ACT     → Flag violations (as 1 community flag)
 *   6. APPEAL  → Resolve expired appeals via community vote
 *   7. REPEAT  → Loop forever
 * 
 * The Brain reads its soul from Bitcoin on EVERY boot.
 * If it can't reach the inscription, it enters DEGRADED mode
 * and makes NO moderation decisions until soul is restored.
 * 
 * This runtime is designed to be run as:
 *   - A Next.js API route (serverless, triggered by cron)
 *   - A standalone Node.js process (long-running daemon)
 *   - A Docker sidecar container
 */

import type {
  BrainState,
  BrainRuntimeConfig,
  ScanTarget,
  BrainDecision,
} from './types';
import { DEFAULT_BRAIN_CONFIG } from './types';
import {
  fetchSoulFromInscription,
  fetchBrainWalletBalance,
  verifyMoralCodeInscription,
} from './inscription';
import { analyzeContent, createDecision, resolveAppeal, shouldIssueStrike, shouldRevokeFlagging } from './engine';

/* ═══════════════════════════════════════════
   BRAIN SINGLETON
   ═══════════════════════════════════════════ */

let brainState: BrainState | null = null;

/**
 * Tracks whether the last soul fetch was a real inscription verification.
 * True only when fetchSoulFromInscription returned source='inscription' AND
 * verified=true (i.e., the soul was fetched from the Bitcoin inscription AND
 * passed verifySoulIntegrity/verifySoulContent). Any degraded boot or
 * failed re-verification resets this to false.
 *
 * Consumed by getBrainStatus().soulVerified so the transparency dashboard
 * never claims a verified soul in DEGRADED mode.
 */
let lastSoulInscriptionVerified = false;

/**
 * Get current Brain state (or null if not booted).
 */
export function getBrainState(): BrainState | null {
  return brainState;
}

/* ═══════════════════════════════════════════
   BOOT SEQUENCE
   ═══════════════════════════════════════════ */

/**
 * Boot the Nexus Brain.
 * 
 * 1. Fetches soul from Bitcoin inscription
 * 2. Verifies integrity
 * 3. Loads moral code
 * 4. Checks wallet balance
 * 5. Sets status to ONLINE (or DEGRADED if inscription unavailable)
 */
export async function bootBrain(
  config: BrainRuntimeConfig = DEFAULT_BRAIN_CONFIG,
): Promise<BrainState> {
  console.log('[NexusBrain] ═══ BOOTING ═══');
  console.log('[NexusBrain] Fetching soul from Bitcoin inscription...');

  const { soul, source, verified } = await fetchSoulFromInscription(config);
  const inscriptionVerified = source === 'inscription' && verified;
  lastSoulInscriptionVerified = inscriptionVerified;

  console.log(`[NexusBrain] Soul loaded from: ${source} | Verified: ${verified}`);
  console.log(`[NexusBrain] Moral code: ${soul.moralCode.length} rules`);
  console.log(`[NexusBrain] Constraints: ${soul.constraints.length} immutable constraints`);

  // Check wallet balance
  const balance = await fetchBrainWalletBalance(config);
  console.log(`[NexusBrain] Wallet balance: ${balance !== null ? `${balance} sats` : 'unknown'}`);

  // Verify moral code inscription matches
  const moralVerify = await verifyMoralCodeInscription(config);
  if (moralVerify.matches) {
    console.log('[NexusBrain] Moral code inscription verified ✓');
  } else {
    console.warn('[NexusBrain] Could not verify moral code inscription — using soul document values');
  }

  brainState = {
    status: inscriptionVerified ? 'online' : 'degraded',
    soul,
    soulInscriptionId: soul.integrityHash || 'unknown',
    lastSoulVerification: new Date(),
    flagsProcessed: 0,
    appealsResolved: 0,
    walletBalanceSats: balance,
    bootedAt: new Date(),
    scanCycle: 0,
  };

  if (brainState.status === 'degraded') {
    console.warn('[NexusBrain] ⚠️  DEGRADED MODE — inscription unreachable, using fallback soul');
    console.warn('[NexusBrain] Brain will NOT make moderation decisions in degraded mode');
  } else {
    console.log('[NexusBrain] ✅ ONLINE — Soul verified from Bitcoin inscription');
  }

  return brainState;
}

/* ═══════════════════════════════════════════
   SCAN CYCLE
   ═══════════════════════════════════════════ */

/**
 * Execute one scan cycle: fetch new content, analyze, flag violations.
 * Returns decisions made during this cycle.
 * 
 * In DEGRADED mode, scans but does NOT flag — only logs potential issues.
 */
export async function executeScanCycle(
  fetchContent: () => Promise<ScanTarget[]>,
  persistDecision: (decision: BrainDecision) => Promise<void>,
  persistFlag: (contentId: string, contentType: string, ruleIndex: number) => Promise<void>,
): Promise<BrainDecision[]> {
  if (!brainState?.soul) {
    console.error('[NexusBrain] Cannot scan — Brain not booted');
    return [];
  }

  brainState.scanCycle++;
  const decisions: BrainDecision[] = [];

  // Fetch new content to scan
  const targets = await fetchContent();
  
  if (targets.length === 0) {
    return decisions;
  }

  console.log(`[NexusBrain] Scan cycle #${brainState.scanCycle} — ${targets.length} items`);

  for (const target of targets) {
    const result = analyzeContent(target, brainState.soul);

    if (result.violated) {
      brainState.flagsProcessed++;

      const decision = createDecision('flag', brainState.soul, {
        contentId: target.contentId,
        contentType: target.contentType,
        ruleIndex: result.ruleIndex,
        reasoning: result.reasoning,
      });

      decisions.push(decision);

      // In ONLINE mode, actually flag the content
      if (brainState.status === 'online') {
        try {
          await persistFlag(target.contentId, target.contentType, result.ruleIndex!);
          await persistDecision(decision);
        } catch (err) {
          console.error(`[NexusBrain] Failed to persist flag for ${target.contentId}:`, err);
        }
      } else {
        console.warn(`[NexusBrain] DEGRADED — would flag ${target.contentId} but not acting`);
      }
    }
  }

  // Log scan completion
  const scanDecision = createDecision('scan_complete', brainState.soul, {
    reasoning: `Scan cycle #${brainState.scanCycle}: ${targets.length} items scanned, ${decisions.length} violations flagged.`,
  });
  decisions.push(scanDecision);

  return decisions;
}

/* ═══════════════════════════════════════════
   APPEAL PROCESSOR
   ═══════════════════════════════════════════ */

/**
 * Process expired appeals — resolve them based on community votes.
 * Called periodically by the runtime loop.
 */
export async function processExpiredAppeals(
  fetchExpiredAppeals: () => Promise<Array<{
    id: string;
    contentId: string;
    votesFor: number;
    votesAgainst: number;
    flaggedBy: string[];
  }>>,
  resolveAppealInDb: (appealId: string, outcome: 'restored' | 'upheld', reasoning: string) => Promise<void>,
  issueStrike: (walletAddress: string) => Promise<number>,
  revokePrivileges: (walletAddress: string) => Promise<void>,
): Promise<BrainDecision[]> {
  if (!brainState?.soul) return [];

  const expired = await fetchExpiredAppeals();
  const decisions: BrainDecision[] = [];

  for (const appeal of expired) {
    const { outcome, reasoning } = resolveAppeal(
      appeal.votesFor,
      appeal.votesAgainst,
      brainState.soul,
    );

    // Resolve the appeal
    await resolveAppealInDb(appeal.id, outcome, reasoning);
    brainState.appealsResolved++;

    const decision = createDecision(
      outcome === 'restored' ? 'appeal_restore' : 'appeal_uphold',
      brainState.soul,
      { contentId: appeal.contentId, reasoning },
    );
    decisions.push(decision);

    // If restored, check if flaggers should get strikes
    if (outcome === 'restored') {
      for (const flaggerAddr of appeal.flaggedBy) {
        const result = analyzeContent(
          { contentType: 'chat_message', contentId: appeal.contentId, authorAddress: flaggerAddr, createdAt: new Date() },
          brainState.soul,
        );
        
        if (shouldIssueStrike(null, outcome, result)) {
          const newStrikeCount = await issueStrike(flaggerAddr);
          
          decisions.push(createDecision('strike_issued', brainState.soul, {
            reasoning: `Strike issued to ${flaggerAddr.slice(0, 12)}... (${newStrikeCount} total) — flagged content that community restored.`,
          }));

          if (shouldRevokeFlagging(newStrikeCount, brainState.soul)) {
            await revokePrivileges(flaggerAddr);
            decisions.push(createDecision('privilege_revoked', brainState.soul, {
              reasoning: `Flagging privileges revoked for ${flaggerAddr.slice(0, 12)}... — reached ${newStrikeCount} strikes (limit: ${brainState.soul.parameters.falseFlagStrikeLimit}).`,
            }));
          }
        }
      }
    }
  }

  return decisions;
}

/* ═══════════════════════════════════════════
   SOUL RE-VERIFICATION
   ═══════════════════════════════════════════ */

/**
 * Periodically re-fetch and verify the soul from inscription.
 * If the inscription becomes unreachable, switch to DEGRADED.
 * If it comes back, switch to ONLINE.
 */
export async function verifySoul(
  config: BrainRuntimeConfig = DEFAULT_BRAIN_CONFIG,
): Promise<BrainDecision | null> {
  if (!brainState) return null;

  const { soul, source, verified } = await fetchSoulFromInscription(config);
  brainState.lastSoulVerification = new Date();

  const wasOnline = brainState.status === 'online';
  const nowOnline = source === 'inscription' && verified;

  // Keep the inscription-verification flag in sync with the current
  // fetch outcome so getBrainStatus().soulVerified stays truthful when
  // the soul flips DEGRADED↔ONLINE.
  lastSoulInscriptionVerified = nowOnline;

  brainState.status = nowOnline ? 'online' : 'degraded';
  brainState.soul = soul;

  // State transition logging
  if (wasOnline && !nowOnline) {
    console.warn('[NexusBrain] ⚠️  Transition: ONLINE → DEGRADED');
    return createDecision('soul_verified', soul, {
      reasoning: 'Soul inscription became unreachable — entering DEGRADED mode. No moderation decisions will be made.',
    });
  }
  if (!wasOnline && nowOnline) {
    console.log('[NexusBrain] ✅ Transition: DEGRADED → ONLINE');
    return createDecision('soul_verified', soul, {
      reasoning: 'Soul inscription re-verified from Bitcoin — resuming full operation.',
    });
  }

  return null;
}

/* ═══════════════════════════════════════════
   PUBLIC API (for Next.js API routes)
   ═══════════════════════════════════════════ */

/**
 * One-shot scan: Boot (if needed), scan content, return results.
 * Designed for serverless (Vercel cron) invocation.
 */
export async function runOneShotScan(
  fetchContent: () => Promise<ScanTarget[]>,
  persistDecision: (decision: BrainDecision) => Promise<void>,
  persistFlag: (contentId: string, contentType: string, ruleIndex: number) => Promise<void>,
): Promise<{ state: BrainState; decisions: BrainDecision[] }> {
  // Boot if needed
  if (!brainState) {
    await bootBrain();
  }

  const decisions = await executeScanCycle(fetchContent, persistDecision, persistFlag);
  
  return { state: brainState!, decisions };
}

/**
 * Get the Brain's status summary for the transparency dashboard.
 */
export function getBrainStatus(): {
  status: string;
  soulSource: string;
  soulVerified: boolean;
  uptime: number;
  flagsProcessed: number;
  appealsResolved: number;
  scanCycles: number;
  walletBalance: number | null;
  moralCode: string[];
  constraints: string[];
} | null {
  if (!brainState?.soul) return null;

  // soulVerified reflects the REAL verification outcome — true only when the
  // soul was fetched from the Bitcoin inscription AND passed integrity/content
  // verification on the most recent fetch. Consistent with status === 'online'.
  // (Previously this was `lastSoulVerification !== null`, which was true after
  // any boot attempt, including DEGRADED. That was misleading.)
  const soulVerified = lastSoulInscriptionVerified && brainState.status === 'online';

  return {
    status: brainState.status,
    soulSource: brainState.soulInscriptionId,
    soulVerified,
    uptime: Date.now() - brainState.bootedAt.getTime(),
    flagsProcessed: brainState.flagsProcessed,
    appealsResolved: brainState.appealsResolved,
    scanCycles: brainState.scanCycle,
    walletBalance: brainState.walletBalanceSats,
    moralCode: [...brainState.soul.moralCode],
    constraints: [...brainState.soul.constraints],
  };
}
