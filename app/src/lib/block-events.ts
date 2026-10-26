/**
 * The Living Block event spine, server side: `emitBlockEvent()` and the reads
 * behind `GET /api/v1/blocks/<h>/events`.
 *
 * SAFE BEFORE THE MIGRATION. Two switches keep this inert until production is
 * ready, and both fail toward "do nothing":
 *   - `BG_EVENTS_ENABLED` must be exactly `true` or `1` (default off);
 *   - if the `BlockEvent` table is missing (migration not applied yet), the
 *     first query that says so flips a process-wide flag for TABLE_RECHECK_MS,
 *     emitters no-op and reads answer `{ enabled: false, events: [] }`.
 * An emitter never throws into its route: the write it describes has already
 * committed, and losing the event is better than failing the request.
 *
 * ORDERING: `seq` and `prev` are computed inside one interactive transaction
 * that first takes `pg_advisory_xact_lock(EVENT_LOCK_NS, block)`. Every emit for
 * a block therefore runs one at a time and reads the committed head under the
 * lock, so `seq` is gap-free and `prev` is always the true previous hash. The
 * lock is per block (other blocks never wait) and released at commit/rollback.
 * `@@unique([block, seq])` is the backstop if anything ever bypasses the lock.
 *
 * Failure mode (documented in BUILD-REPORT-bg90): a slow or failed emit (lock
 * wait beyond the 5 s transaction budget, DB error) rolls back the event only.
 * The route's own write stands and the chain simply has no event for it: the
 * chain stays valid (no gap, no fork) and the miss is logged
 * `[block-events] emit failed`. An outbox that retries is a later wave.
 *
 * Every lost event is also counted in-process (`eventStats()`, served by
 * `GET /api/v1/health/events`): per instance, since that process started.
 */

import prisma from '@/lib/prisma';
import { getBrainState, getContentScanner, buildSoulDocument } from '@/lib/brain';
import {
  BG_EVENT_FORMAT,
  EVENT_MAX_BYTES,
  GENESIS_PREV,
  eventHash,
  parseSystemKey,
  sha256Tagged,
  signEd25519,
  summaryFor,
  systemProofMessage,
  ulid,
  type BlockEventKind,
  type EventActor,
  type EventProof,
  type EventSigner,
  type PublicBlockEvent,
  type SummaryFacts,
  type SystemKey,
} from '@/lib/block-event-core';
import { stableStringify } from '@/lib/action-message';

/** Namespace for the per-block advisory lock (first int4 key): "BGEV". */
export const EVENT_LOCK_NS = 0x42474556;
const TX_BUDGET_MS = 5_000;
const TABLE_RECHECK_MS = 60_000;
export const EVENTS_PAGE_MAX = 200;

// ── Switches ─────────────────────────────────────────────────────────────

export function eventsEnabled(): boolean {
  const v = process.env.BG_EVENTS_ENABLED;
  return v === 'true' || v === '1';
}

let tableMissingUntil = 0;

/** Prisma P2021 / Postgres 42P01: the table does not exist (migration not applied). */
export function isTableMissingError(err: unknown): boolean {
  const e = err as { code?: string; meta?: { code?: string }; message?: string } | null;
  if (!e) return false;
  if (e.code === 'P2021' || e.code === '42P01' || e.meta?.code === '42P01') return true;
  return typeof e.message === 'string' && /relation "?(public\.)?"?BlockEvent"? does not exist/i.test(e.message);
}

function noteTableMissing(): void {
  tableMissingUntil = Date.now() + TABLE_RECHECK_MS;
}

function tableKnownMissing(): boolean {
  return Date.now() < tableMissingUntil;
}

// ── Loss counter ─────────────────────────────────────────────────────────

/**
 * What this process has emitted and lost since it started. In-process on
 * purpose (no table, no write on the hot path): on serverless every instance
 * keeps its own counts, and a cold start begins at zero.
 *
 * `lost` counts every event an enabled emitter should have stored and did
 * not: a failed or timed-out transaction (also logged, one `console.warn`
 * each), the emit that found the table missing, and every emit skipped while
 * that table-missing back-off lasts. A dedupe skip is not a loss.
 */
interface EventCounters {
  emitted: number;
  lost: number;
  lastLossAt: number | null;
  lastLossKind: string | null;
  lastLossBlock: number | null;
}

const PROCESS_STARTED_AT = Date.now();
let counters: EventCounters = { emitted: 0, lost: 0, lastLossAt: null, lastLossKind: null, lastLossBlock: null };

function noteLoss(block: number, kind: string): void {
  counters.lost += 1;
  counters.lastLossAt = Date.now();
  counters.lastLossKind = kind;
  counters.lastLossBlock = block;
}

export interface EventStats {
  enabled: boolean;
  emitted: number;
  lost: number;
  lastLossAt: string | null;
  lastLossKind: string | null;
  lastLossBlock: number | null;
  /** End of the current table-missing back-off, or null when none is active. */
  backoffUntil: string | null;
  /** When this process started counting. */
  since: string;
}

export function eventStats(now: number = Date.now()): EventStats {
  return {
    enabled: eventsEnabled(),
    emitted: counters.emitted,
    lost: counters.lost,
    lastLossAt: counters.lastLossAt === null ? null : new Date(counters.lastLossAt).toISOString(),
    lastLossKind: counters.lastLossKind,
    lastLossBlock: counters.lastLossBlock,
    backoffUntil: now < tableMissingUntil ? new Date(tableMissingUntil).toISOString() : null,
    since: new Date(PROCESS_STARTED_AT).toISOString(),
  };
}

/** Tests only. */
export function __resetBlockEventsState(): void {
  tableMissingUntil = 0;
  cachedKeyRaw = undefined;
  cachedKey = null;
  counters = { emitted: 0, lost: 0, lastLossAt: null, lastLossKind: null, lastLossBlock: null };
}

let cachedKeyRaw: string | undefined;
let cachedKey: SystemKey | null = null;

/** The system signing key from `BG_EVENT_SIGNING_KEY`, or null (unsigned mode). */
export function systemKey(): SystemKey | null {
  const raw = process.env.BG_EVENT_SIGNING_KEY;
  if (raw !== cachedKeyRaw) {
    cachedKeyRaw = raw;
    cachedKey = parseSystemKey(raw);
    if (raw && !cachedKey) console.warn('[block-events] BG_EVENT_SIGNING_KEY is set but is not a 32-byte ed25519 seed; running unsigned');
  }
  return cachedKey;
}

// ── Privacy (spec §5.6) ──────────────────────────────────────────────────

/**
 * The only keys a payload may carry. Everything else is dropped before it is
 * hashed or stored, so a route that spreads a request body cannot leak chat
 * text, guardian memory, keys, visitor wallets or IPs into a public event.
 */
const PAYLOAD_KEYS = new Set([
  'objectId', 'objectIds', 'objectType', 'name', 'op', 'counts', 'via',
  'inscriptionId', 'holder',
  'guardianId', 'from', 'to',
  'experienceId', 'experienceType',
]);
const MAX_STR = 120;

export function publicPayload(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input ?? {})) {
    if (!PAYLOAD_KEYS.has(k) || v === undefined || v === null) continue;
    if (typeof v === 'string') out[k] = v.slice(0, MAX_STR);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').slice(0, 20).map((x) => (x as string).slice(0, 64));
    else if (typeof v === 'object') {
      const counts: Record<string, number> = {};
      for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof cv === 'number' && Number.isFinite(cv) && /^[a-z]{1,16}$/.test(ck)) counts[ck] = cv;
      }
      out[k] = counts;
    }
  }
  return out;
}

/**
 * A user-supplied name goes through the existing content judge (the Nexus
 * Brain's deterministic scanner, no network) before it reaches a summary. A
 * flagged name, or a judge failure, is replaced by the template's generic noun.
 */
export async function judgedName(name: unknown, block: number, author: string | null): Promise<string | null> {
  if (typeof name !== 'string') return null;
  const clean = name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60);
  if (!clean) return null;
  try {
    const soul = getBrainState()?.soul ?? buildSoulDocument();
    const res = await getContentScanner().analyze(
      { contentType: 'world_object', contentId: 'event-name', text: clean, authorAddress: author ?? '', blockHeight: block, createdAt: new Date() },
      soul,
    );
    return res.violated ? null : clean;
  } catch {
    return null;
  }
}

// ── Emit ─────────────────────────────────────────────────────────────────

export interface WalletProof {
  scheme: 'bip322';
  address: string;
  message: string;
  signature: string;
}

export interface EmitInput {
  block: number;
  kind: BlockEventKind;
  actor: EventActor;
  /** Public facts only; filtered through `publicPayload`. */
  payload?: Record<string, unknown>;
  /** Facts for the summary template. Names must already be judged (see `judgedName`). */
  summary?: SummaryFacts;
  /** The wallet signature that authorized the action, when there was one. */
  walletProof?: WalletProof | null;
  /**
   * Skip the emit when the newest event of the same kind on this block is
   * younger than `withinMs` and carries the same values for `samePayload`
   * (e.g. a deed re-verified by the same holder). Checked twice: first by one
   * plain read with no lock and no transaction, so the common "already
   * recorded" case never queues behind the block's real writes; then again
   * under the block lock, so two concurrent verifies cannot both pass it.
   */
  dedupe?: { withinMs: number; samePayload: string[] };
}

export interface StoredBlockEvent {
  id: string;
  block: number;
  seq: number;
  kind: string;
  actorType: string;
  actorId: string | null;
  actorHandle: string | null;
  signerScheme: string;
  signerAddress: string | null;
  summary: string;
  payload: unknown;
  payloadHash: string;
  prev: string;
  hash: string;
  ts: Date;
  proofMessage: string;
  proofSignature: string | null;
  attestation: string | null;
  attestationKid: string | null;
}

/** The slice of a Prisma client the emitter uses (tests pass a stand-in). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * The `dedupe` rule as one read on `model` (the client's or the transaction's
 * `blockEvent`). The `ts` bound keeps it to the `(block, ts)` index range of
 * the window; the newest row in that range is the newest of its kind whenever
 * that one is inside the window, so the rule is unchanged.
 */
async function isDuplicate(model: Db, input: EmitInput, payload: Record<string, unknown>): Promise<boolean> {
  const dedupe = input.dedupe;
  if (!dedupe) return false;
  const now = Date.now();
  const last = await model.findFirst({
    where: { block: input.block, kind: input.kind, ts: { gte: new Date(now - dedupe.withinMs) } },
    orderBy: { seq: 'desc' },
    select: { ts: true, payload: true },
  });
  const lastPayload = (last?.payload ?? {}) as Record<string, unknown>;
  return (
    !!last &&
    now - new Date(last.ts).getTime() < dedupe.withinMs &&
    dedupe.samePayload.every((k) => lastPayload[k] === payload[k])
  );
}

/**
 * Append one event to `input.block`'s chain. Call it AFTER the action's own
 * write has committed, and await it (a serverless function may freeze once the
 * response is sent). Returns the stored row, or null when disabled, when the
 * table is missing, when `dedupe` skipped it, or on any failure — never throws.
 */
export async function emitBlockEvent(input: EmitInput, db: Db = prisma): Promise<StoredBlockEvent | null> {
  if (!eventsEnabled()) return null;
  if (tableKnownMissing()) {
    noteLoss(input.block, input.kind);
    return null;
  }
  try {
    if (!Number.isInteger(input.block) || input.block < 0) return null;

    const payload = publicPayload(input.payload ?? {});
    // Unlocked pre-check: no transaction, no advisory lock. Only when it finds
    // nothing does the emit queue for the lock, where the same rule runs again.
    if (input.dedupe && (await isDuplicate(db.blockEvent, input, payload))) return null;
    const summary = summaryFor(input.kind, input.summary);
    const key = systemKey();

    let signer: EventSigner;
    let proofMessage: string;
    let proofSignature: string | null;
    if (input.walletProof) {
      signer = { scheme: 'bip322', address: input.walletProof.address };
      proofMessage = input.walletProof.message;
      proofSignature = input.walletProof.signature;
    } else {
      proofMessage = systemProofMessage(input.block, input.kind, payload);
      signer = key ? { scheme: 'ed25519', address: key.kid } : { scheme: 'unsigned', address: null };
      proofSignature = key ? signEd25519(key.seed, proofMessage) : null;
    }
    const payloadHash = sha256Tagged(proofMessage);
    const actor: EventActor = {
      type: input.actor.type,
      id: input.actor.id ? input.actor.id.slice(0, 100) : null,
      handle: input.actor.handle ? input.actor.handle.slice(0, 60) : null,
    };

    const row = await db.$transaction(
      async (tx: Db) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EVENT_LOCK_NS}::int4, ${input.block}::int4)`;
        if (input.dedupe && (await isDuplicate(tx.blockEvent, input, payload))) return null;
        const head = await tx.blockEvent.findFirst({
          where: { block: input.block },
          orderBy: { seq: 'desc' },
          select: { seq: true, hash: true },
        });
        const seq = head ? head.seq + 1 : 1;
        const prev = head ? head.hash : GENESIS_PREV;
        const ts = new Date();
        const id = ulid(ts.getTime());
        const hashed = { id, block: input.block, seq, kind: input.kind, actor, signer, summary, payloadHash, prev, ts: ts.toISOString() };
        const hash = eventHash(hashed);
        const body = toPublic({ ...hashed, hash });
        if (new TextEncoder().encode(stableStringify(body)).length > EVENT_MAX_BYTES) {
          throw new Error('event exceeds 2 KB');
        }
        return tx.blockEvent.create({
          data: {
            id,
            block: input.block,
            seq,
            kind: input.kind,
            actorType: actor.type,
            actorId: actor.id,
            actorHandle: actor.handle,
            signerScheme: signer.scheme,
            signerAddress: signer.address,
            summary,
            payload,
            payloadHash,
            prev,
            hash,
            ts,
            proofMessage,
            proofSignature,
            attestation: key ? signEd25519(key.seed, hash) : null,
            attestationKid: key ? key.kid : null,
          },
        });
      },
      { maxWait: TX_BUDGET_MS, timeout: TX_BUDGET_MS },
    );
    if (row) counters.emitted += 1;
    return (row ?? null) as StoredBlockEvent | null;
  } catch (err) {
    noteLoss(input.block, input.kind);
    if (isTableMissingError(err)) {
      noteTableMissing();
      return null;
    }
    console.warn('[block-events] emit failed', {
      block: input.block,
      kind: input.kind,
      err: err instanceof Error ? err.message : String(err),
      lost: counters.lost,
    });
    return null;
  }
}

// ── Read ─────────────────────────────────────────────────────────────────

function toPublic(e: {
  id: string; block: number; seq: number; kind: string; actor: EventActor; signer: EventSigner;
  summary: string; payloadHash: string; prev: string; ts: string; hash: string;
}): PublicBlockEvent {
  return {
    format: BG_EVENT_FORMAT,
    id: e.id,
    block: e.block,
    seq: e.seq,
    kind: e.kind,
    actor: e.actor,
    signer: e.signer,
    summary: e.summary,
    payloadHash: e.payloadHash,
    proof: { url: `/api/v1/blocks/${e.block}/events/${e.id}/proof` },
    prev: e.prev,
    hash: e.hash,
    ts: e.ts,
  };
}

export function publicEvent(r: StoredBlockEvent): PublicBlockEvent {
  return toPublic({
    id: r.id,
    block: r.block,
    seq: r.seq,
    kind: r.kind,
    actor: { type: r.actorType as EventActor['type'], id: r.actorId, handle: r.actorHandle },
    signer: { scheme: r.signerScheme as EventSigner['scheme'], address: r.signerAddress },
    summary: r.summary,
    payloadHash: r.payloadHash,
    prev: r.prev,
    ts: new Date(r.ts).toISOString(),
    hash: r.hash,
  });
}

export type EventsPage =
  | { format: typeof BG_EVENT_FORMAT; enabled: false; events: [] }
  | { format: typeof BG_EVENT_FORMAT; enabled: true; block: number; events: PublicBlockEvent[]; lastSeq: number; hasMore: boolean };

const DISABLED: EventsPage = { format: BG_EVENT_FORMAT, enabled: false, events: [] };

/**
 * One page of a block's events in ascending `seq`.
 *   after given  → events with seq > after (gap-fill / catch-up), up to `limit`.
 *   after absent → the newest `limit` events (server render, first load).
 */
export async function listBlockEvents(
  block: number,
  opts: { after?: number | null; limit?: number } = {},
  db: Db = prisma,
): Promise<EventsPage> {
  if (!eventsEnabled() || tableKnownMissing()) return DISABLED;
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 50), 1), EVENTS_PAGE_MAX);
  try {
    let rows: StoredBlockEvent[];
    let hasMore = false;
    if (opts.after != null) {
      rows = await db.blockEvent.findMany({
        where: { block, seq: { gt: opts.after } },
        orderBy: { seq: 'asc' },
        take: limit + 1,
      });
      hasMore = rows.length > limit;
      rows = rows.slice(0, limit);
    } else {
      rows = await db.blockEvent.findMany({ where: { block }, orderBy: { seq: 'desc' }, take: limit });
      rows.reverse();
      hasMore = false;
    }
    const head = await db.blockEvent.findFirst({ where: { block }, orderBy: { seq: 'desc' }, select: { seq: true } });
    return {
      format: BG_EVENT_FORMAT,
      enabled: true,
      block,
      events: rows.map(publicEvent),
      lastSeq: head?.seq ?? 0,
      hasMore,
    };
  } catch (err) {
    if (isTableMissingError(err)) {
      noteTableMissing();
      return DISABLED;
    }
    throw err;
  }
}

/** The proof for one event, or null when it does not exist on this block. */
export async function getEventProof(block: number, id: string, db: Db = prisma): Promise<EventProof | null | 'disabled'> {
  if (!eventsEnabled() || tableKnownMissing()) return 'disabled';
  try {
    const r: StoredBlockEvent | null = await db.blockEvent.findUnique({ where: { id } });
    if (!r || r.block !== block) return null;
    return {
      format: BG_EVENT_FORMAT,
      event: publicEvent(r),
      scheme: r.signerScheme as EventProof['scheme'],
      address: r.signerAddress,
      message: r.proofMessage,
      signature: r.proofSignature,
      payloadHash: r.payloadHash,
      attestation: r.attestation && r.attestationKid ? { kid: r.attestationKid, signature: r.attestation } : null,
    };
  } catch (err) {
    if (isTableMissingError(err)) {
      noteTableMissing();
      return 'disabled';
    }
    throw err;
  }
}

// ── Emitter helpers used by the routes ───────────────────────────────────

/** Guardian live state for `guardian.status` (spec §5.4: only on a change). */
export type GuardianLiveState = 'idle' | 'resting' | 'offline';

/** A self-hosted guardian with no heartbeat for this long reads as offline. */
export const GUARDIAN_OFFLINE_AFTER_MS = 10 * 60 * 1000;

export function guardianLiveState(
  g: { status?: string | null; selfHosted?: boolean | null; lastHeartbeat?: Date | string | null },
  now: number = Date.now(),
): GuardianLiveState {
  const status = g.status ?? 'active';
  if (status === 'paused') return 'resting';
  if (status !== 'active') return 'offline';
  if (!g.selfHosted) return 'idle';
  const last = g.lastHeartbeat ? new Date(g.lastHeartbeat).getTime() : 0;
  return last && now - last < GUARDIAN_OFFLINE_AFTER_MS ? 'idle' : 'offline';
}

/** Emit `guardian.status` iff the live state changed. Returns the event or null. */
export async function emitGuardianStatusIfChanged(
  guardian: { id: string; blockHeight: number; name?: string | null; ownerAddress?: string | null },
  before: GuardianLiveState,
  after: GuardianLiveState,
  walletProof?: WalletProof | null,
  db: Db = prisma,
): Promise<StoredBlockEvent | null> {
  if (before === after) return null;
  const name = await judgedName(guardian.name, guardian.blockHeight, guardian.ownerAddress ?? null);
  return emitBlockEvent(
    {
      block: guardian.blockHeight,
      kind: 'guardian.status',
      actor: { type: 'guardian', id: guardian.id, handle: name },
      payload: { guardianId: guardian.id, from: before, to: after },
      summary: { guardianName: name, status: after },
      walletProof: walletProof ?? null,
    },
    db,
  );
}
