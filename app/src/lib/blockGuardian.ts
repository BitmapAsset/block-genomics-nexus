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
import { summaryFor, type PublicBlockEvent } from '@/lib/block-event-core';

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

/**
 * A guardian's `guardian.registered` event is written right after its row is
 * created (api/v1/guardian), so it lands within this window of `createdAt`.
 * The slack covers the database clock against the app's.
 */
const REGISTERED_AFTER_MS = 10 * 60 * 1000;
const REGISTERED_SLACK_MS = 60 * 1000;

export interface GuardianRegistration {
  /** When the registration was recorded (the event's time). */
  at: string;
  /** The wallet that registered it, when the event names one. */
  by: string | null;
}

/**
 * The newest `guardian.registered` event for the guardian shown, or null.
 *
 * The public summary carries no guardian id, so an event counts as this
 * guardian's only when it was written within minutes of the guardian's
 * creation and its summary is the server's template for this guardian's name
 * (or the template without a name). An earlier guardian's registration, or one
 * for another wallet's guardian on the block, does not match. The answer is a
 * dated fact about who registered it, never a claim about today's holder.
 */
export function guardianRegistration(
  guardian: Pick<BlockGuardianSummary, 'name' | 'createdAt'>,
  events: readonly PublicBlockEvent[],
): GuardianRegistration | null {
  const created = Date.parse(guardian.createdAt);
  if (!Number.isFinite(created)) return null;
  const summaries = new Set([
    summaryFor('guardian.registered', { guardianName: guardian.name }),
    summaryFor('guardian.registered'),
  ]);
  const mine = events
    .filter((e) => {
      if (e.kind !== 'guardian.registered' || !summaries.has(e.summary)) return false;
      const t = Date.parse(e.ts);
      return t >= created - REGISTERED_SLACK_MS && t <= created + REGISTERED_AFTER_MS;
    })
    .sort((a, b) => b.seq - a.seq)[0];
  if (!mine) return null;
  const wallet = mine.actor.type === 'owner' || mine.actor.type === 'owner-session';
  return { at: mine.ts, by: wallet ? mine.actor.id : null };
}
