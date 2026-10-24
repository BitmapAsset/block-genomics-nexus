/**
 * One helper per `bg-event/1` source (spec §5.4), so each route adds one awaited
 * line after its own write commits and the event shape lives in one place.
 *
 * Every helper goes through `emitBlockEvent()`, so all of them are inert while
 * `BG_EVENTS_ENABLED` is off or the `BlockEvent` table is missing, never throw,
 * and pass their payload through the §5.6 allowlist.
 *
 * WHICH SIGNATURES ARE PUBLISHED. A `walletProof` is stored and served by the
 * proof endpoint, so it is passed ONLY for messages that cannot authorize
 * anything again once used: action-bound messages whose one-time nonce the
 * route has just consumed (world writes, signed experience manifests) and
 * nonce-carrying challenge messages (auth/verify, session/verify, heartbeat).
 * `verifyUnboundWalletSignature` refuses both shapes, and the bound routes
 * refuse a spent nonce. The guardian register / PATCH / DELETE signatures are
 * UNBOUND (any message the wallet signed passes there, and is replayable on
 * those routes), so publishing them would hand anyone a reusable owner
 * credential: guardian events are therefore system-signed, never wallet-proofed.
 */

import {
  emitBlockEvent,
  emitGuardianStatusIfChanged,
  eventsEnabled,
  guardianLiveState,
  judgedName,
  type GuardianLiveState,
  type StoredBlockEvent,
  type WalletProof,
} from '@/lib/block-events';
import type { BlockEventKind, EventActor } from '@/lib/block-event-core';

export type { WalletProof } from '@/lib/block-events';

/** A wallet-signed action proof, or null when any part is missing. */
export function walletProofOf(address: unknown, message: unknown, signature: unknown): WalletProof | null {
  if (typeof address !== 'string' || typeof message !== 'string' || typeof signature !== 'string') return null;
  if (!address || !message || !signature) return null;
  return { scheme: 'bip322', address, message, signature };
}

// ── World writes → build.placed / build.changed / build.removed ──────────

export type WorldOp = 'create' | 'update' | 'delete';

const WORLD_KIND: Record<WorldOp, BlockEventKind> = {
  create: 'build.placed',
  update: 'build.changed',
  delete: 'build.removed',
};

export interface WorldWriteEvent {
  block: number;
  /** The deed holder the route proved (wallet path) or the session's wallet. */
  ownerAddress: string;
  /** `wallet`: an action-bound BIP-322 signature. `session`: a bg_vfy_ token (never stored). */
  via: 'wallet' | 'session';
  ops: Array<{ op: WorldOp; id: string; objectType?: string | null; name?: unknown }>;
  walletProof?: WalletProof | null;
}

/**
 * One signed world write → exactly one event. A batch that mixes operations is
 * one `build.changed` with per-op counts, so a single signature never fans out
 * into several events that each claim it.
 */
export async function emitWorldWrite(w: WorldWriteEvent): Promise<StoredBlockEvent | null> {
  if (!eventsEnabled()) return null;
  if (w.ops.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const o of w.ops) counts[o.op] = (counts[o.op] ?? 0) + 1;
  const kinds = Object.keys(counts) as WorldOp[];
  const kind = kinds.length === 1 ? WORLD_KIND[kinds[0]] : 'build.changed';
  const single = w.ops.length === 1 ? w.ops[0] : null;
  const name = single ? await judgedName(single.name, w.block, w.ownerAddress) : null;
  const objectType = single?.objectType ?? null;

  const actor: EventActor = { type: w.via === 'wallet' ? 'owner' : 'owner-session', id: w.ownerAddress, handle: null };
  return emitBlockEvent({
    block: w.block,
    kind,
    actor,
    payload: {
      op: single ? single.op : 'batch',
      via: w.via,
      counts,
      ...(single ? { objectId: single.id, objectType, name } : { objectIds: w.ops.map((o) => o.id) }),
    },
    summary: single ? { objectType: objectType ?? undefined, name } : { count: w.ops.length },
    walletProof: w.via === 'wallet' ? (w.walletProof ?? null) : null,
  });
}

// ── Wallet verify / ownership checks → deed.verified ─────────────────────

/** Re-verification by the same holder inside this window adds no event. */
export const DEED_VERIFIED_DEDUPE_SIGNED_MS = 60 * 60 * 1000;
/** A public, unsigned ownership check re-confirms at most once a day. */
export const DEED_VERIFIED_DEDUPE_OBSERVED_MS = 24 * 60 * 60 * 1000;

export interface DeedVerifiedEvent {
  block: number;
  holder: string;
  inscriptionId?: string | null;
  /** `auth` / `session`: the holder signed a challenge. `ownership-check`: a public read observed it. */
  via: 'auth' | 'session' | 'ownership-check';
  walletProof?: WalletProof | null;
}

export async function emitDeedVerified(d: DeedVerifiedEvent): Promise<StoredBlockEvent | null> {
  if (!eventsEnabled()) return null;
  const signed = d.via !== 'ownership-check' && !!d.walletProof;
  return emitBlockEvent({
    block: d.block,
    kind: 'deed.verified',
    actor: signed ? { type: 'owner', id: d.holder, handle: null } : { type: 'system', id: null, handle: null },
    payload: { holder: d.holder, inscriptionId: d.inscriptionId ?? null, via: d.via },
    walletProof: signed ? d.walletProof : null,
    dedupe: {
      withinMs: signed ? DEED_VERIFIED_DEDUPE_SIGNED_MS : DEED_VERIFIED_DEDUPE_OBSERVED_MS,
      samePayload: ['holder'],
    },
  });
}

// ── Ownership cron → deed.moved ──────────────────────────────────────────

export async function emitDeedMoved(m: { block: number; holder: string; inscriptionId?: string | null }): Promise<StoredBlockEvent | null> {
  if (!eventsEnabled()) return null;
  return emitBlockEvent({
    block: m.block,
    kind: 'deed.moved',
    actor: { type: 'system', id: null, handle: null },
    payload: { holder: m.holder, inscriptionId: m.inscriptionId ?? null, via: 'ownership-cron' },
  });
}

// ── Guardian → guardian.registered / guardian.status ─────────────────────

export interface GuardianRow {
  id: string;
  blockHeight: number;
  name?: string | null;
  ownerAddress?: string | null;
  status?: string | null;
  selfHosted?: boolean | null;
  lastHeartbeat?: Date | string | null;
}

export async function emitGuardianRegistered(g: GuardianRow): Promise<StoredBlockEvent | null> {
  if (!eventsEnabled()) return null;
  const name = await judgedName(g.name, g.blockHeight, g.ownerAddress ?? null);
  return emitBlockEvent({
    block: g.blockHeight,
    kind: 'guardian.registered',
    actor: { type: 'owner', id: g.ownerAddress ?? null, handle: null },
    payload: { guardianId: g.id, name },
    summary: { guardianName: name },
  });
}

/**
 * `guardian.status` for a write that may have moved the guardian between idle,
 * resting and offline. No event when the state is unchanged (spec §5.4: never
 * per heartbeat). `walletProof` only for nonce-consumed messages (heartbeat).
 */
export async function emitGuardianTransition(
  before: GuardianRow | GuardianLiveState,
  after: GuardianRow,
  walletProof?: WalletProof | null,
  now: number = Date.now(),
): Promise<StoredBlockEvent | null> {
  if (!eventsEnabled()) return null;
  const from = typeof before === 'string' ? before : guardianLiveState(before, now);
  const to = guardianLiveState(after, now);
  return emitGuardianStatusIfChanged(
    { id: after.id, blockHeight: after.blockHeight, name: after.name, ownerAddress: after.ownerAddress },
    from,
    to,
    walletProof ?? null,
  );
}

// ── Experiences → experience.listed / experience.removed ─────────────────

export async function emitExperience(
  kind: 'experience.listed' | 'experience.removed',
  e: { id: string; blockHeight: number; name?: string | null; experienceType?: string | null; walletAddress: string },
  walletProof?: WalletProof | null,
): Promise<StoredBlockEvent | null> {
  if (!eventsEnabled()) return null;
  const name = await judgedName(e.name, e.blockHeight, e.walletAddress);
  return emitBlockEvent({
    block: e.blockHeight,
    kind,
    actor: { type: 'owner', id: e.walletAddress, handle: null },
    payload: { experienceId: e.id, experienceType: e.experienceType ?? null, name },
    summary: { experienceName: name },
    walletProof: walletProof ?? null,
  });
}
