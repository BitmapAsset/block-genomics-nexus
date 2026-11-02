/**
 * The public face of a block's guardian, for the guardian card on the block page.
 *
 * The guardian row also carries the owner's LLM key, soul/memory files and
 * monitor token hash; none of that may reach a public page. So the select list
 * is explicit, the row goes through `toPublicGuardian` (lib/guardian-view), and
 * the answer is built from a fixed list of keys. The three LLM columns are read
 * only to work out `llmConfigured` and never leave this function.
 *
 * `totalVisitors` is not read: nothing ever increments it (see
 * lib/guardian-view and the api-invents-nothing contract).
 */

import prisma from '@/lib/prisma';
import { toPublicGuardian } from '@/lib/guardian-view';
import { guardianLiveState, type GuardianLiveState } from '@/lib/block-events';

export interface BlockGuardianSummary {
  name: string;
  status: string;
  /** True when the owner runs the guardian on their own server. */
  selfHosted: boolean;
  lastHeartbeat: string | null;
  totalMessages: number;
  createdAt: string;
  /** True when a hosted guardian has an LLM provider, model and key set. */
  llmConfigured: boolean;
}

/** The keys a guardian summary carries, and nothing else. */
export const BLOCK_GUARDIAN_KEYS = [
  'name',
  'status',
  'selfHosted',
  'lastHeartbeat',
  'totalMessages',
  'createdAt',
  'llmConfigured',
] as const;

export interface BlockGuardianView {
  guardian: BlockGuardianSummary | null;
  /** A block profile handle, for the public chat page at /agent/{handle}. */
  handle: string | null;
  /** True when the lookup failed, so the card says so instead of "no guardian". */
  degraded: boolean;
}

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null);

export async function fetchBlockGuardian(height: number): Promise<BlockGuardianView> {
  try {
    const [row, profile] = await Promise.all([
      prisma.guardianAgent.findFirst({
        where: { blockHeight: height },
        orderBy: { createdAt: 'asc' },
        select: {
          name: true,
          status: true,
          selfHosted: true,
          lastHeartbeat: true,
          totalMessages: true,
          createdAt: true,
          llmApiKey: true,
          llmProvider: true,
          llmModel: true,
        },
      }),
      prisma.blockProfile.findFirst({
        where: { blockHeight: height },
        orderBy: { createdAt: 'asc' },
        select: { handle: true },
      }),
    ]);

    let guardian: BlockGuardianSummary | null = null;
    if (row) {
      const pub = toPublicGuardian(row as Record<string, unknown>);
      guardian = {
        name: String(pub.name ?? ''),
        status: String(pub.status ?? ''),
        selfHosted: pub.selfHosted === true,
        lastHeartbeat: iso(pub.lastHeartbeat),
        totalMessages: typeof pub.totalMessages === 'number' ? pub.totalMessages : 0,
        createdAt: iso(pub.createdAt) ?? '',
        llmConfigured: pub.llmConfigured === true,
      };
    }

    return { guardian, handle: profile?.handle ?? null, degraded: false };
  } catch {
    return { guardian: null, handle: null, degraded: true };
  }
}

/** What the guardian card says about the guardian right now. */
export type GuardianCardKey = 'answers-chat' | 'chat-not-set-up' | 'idle' | 'resting' | 'offline' | 'no-heartbeat';

export interface GuardianCardState {
  key: GuardianCardKey;
  label: string;
  /** The server's own state for this guardian, the one `guardian.status` events carry. */
  live: GuardianLiveState;
}

/**
 * The card's state, on top of `guardianLiveState` (lib/block-events), so the
 * card and the feed's `guardian.status` rows never disagree. This only names
 * the state for a reader; it never runs a second rule:
 *
 *   idle, hosted       → "Answers chat" when an LLM is set up, else "Chat not set up"
 *   idle, self-hosted  → "Idle"
 *   resting            → "Resting"
 *   offline            → "Offline", or "No heartbeat yet" for a running
 *                        self-hosted guardian that has never sent one
 *
 * There is no "Working": no event the code emits carries a building state yet.
 */
export function guardianCardState(
  view: Pick<BlockGuardianSummary, 'status' | 'selfHosted' | 'lastHeartbeat' | 'llmConfigured'>,
  now: number = Date.now(),
): GuardianCardState {
  const live = guardianLiveState(
    { status: view.status, selfHosted: view.selfHosted, lastHeartbeat: view.lastHeartbeat },
    now,
  );
  if (live === 'resting') return { key: 'resting', label: 'Resting', live };
  if (live === 'offline') {
    // Same default as guardianLiveState: a missing status counts as active.
    const running = (view.status ?? 'active') === 'active';
    if (running && view.selfHosted && !view.lastHeartbeat) return { key: 'no-heartbeat', label: 'No heartbeat yet', live };
    return { key: 'offline', label: 'Offline', live };
  }
  if (view.selfHosted) return { key: 'idle', label: 'Idle', live };
  return view.llmConfigured
    ? { key: 'answers-chat', label: 'Answers chat', live }
    : { key: 'chat-not-set-up', label: 'Chat not set up', live };
}
