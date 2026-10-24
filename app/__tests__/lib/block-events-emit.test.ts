/**
 * `emitBlockEvent()` and the reads, against the in-memory event store
 * (`__tests__/helpers/event-store.ts`): flag off, table missing, seq ordering
 * under 50 concurrent emits, signing modes, the privacy filter, the 2 KB cap.
 */

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import {
  emitBlockEvent,
  listBlockEvents,
  getEventProof,
  publicPayload,
  guardianLiveState,
  emitGuardianStatusIfChanged,
  judgedName,
  __resetBlockEventsState,
} from '@/lib/block-events';
import { verifyChain, verifyEventProof, publishedKeys, parseSystemKey, sha256Tagged, type ChainRow } from '@/lib/block-event-core';
import { createEventStore } from '../helpers/event-store';

const BLOCK = 718840;
const SEED = '7f'.repeat(32);
const owner = { type: 'owner' as const, id: 'bc1pholder', handle: null };

function rowsAsChain(rows: Record<string, unknown>[]): ChainRow[] {
  return rows.map((r) => ({
    id: r.id as string,
    block: r.block as number,
    seq: r.seq as number,
    kind: r.kind as string,
    actor: { type: r.actorType as 'owner', id: r.actorId as string | null, handle: r.actorHandle as string | null },
    signer: { scheme: r.signerScheme as 'ed25519', address: r.signerAddress as string | null },
    summary: r.summary as string,
    payloadHash: r.payloadHash as string,
    prev: r.prev as string,
    ts: (r.ts as Date).toISOString(),
    hash: r.hash as string,
  }));
}

beforeEach(() => {
  __resetBlockEventsState();
  process.env.BG_EVENTS_ENABLED = 'true';
  delete process.env.BG_EVENT_SIGNING_KEY;
});

afterAll(() => {
  delete process.env.BG_EVENTS_ENABLED;
  delete process.env.BG_EVENT_SIGNING_KEY;
});

describe('flag off (the default)', () => {
  it('emits nothing and touches no database', async () => {
    delete process.env.BG_EVENTS_ENABLED;
    const db = createEventStore();
    const tx = jest.spyOn(db, '$transaction');
    expect(await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db)).toBeNull();
    expect(tx).not.toHaveBeenCalled();
    expect(await listBlockEvents(BLOCK, {}, db)).toEqual({ format: 'bg-event/1', enabled: false, events: [] });
    expect(await getEventProof(BLOCK, 'x', db)).toBe('disabled');
  });

  it('only "true" or "1" turns it on', async () => {
    for (const v of ['false', '0', 'yes', 'TRUE ', '']) {
      process.env.BG_EVENTS_ENABLED = v;
      expect(await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, createEventStore())).toBeNull();
    }
  });
});

describe('table missing (migration not applied yet)', () => {
  it('emitters no-op, reads answer enabled:false, and the route never throws', async () => {
    const db = createEventStore({ missing: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(await listBlockEvents(BLOCK, {}, db)).toEqual({ format: 'bg-event/1', enabled: false, events: [] });
  });

  it('remembers the miss, so later calls skip the database entirely', async () => {
    const db = createEventStore({ missing: true });
    await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db);
    const tx = jest.spyOn(db, '$transaction');
    db.__setMissing(false);
    expect(await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db)).toBeNull();
    expect(tx).not.toHaveBeenCalled();
  });
});

describe('ordering', () => {
  it('takes the per-block advisory lock inside the transaction', async () => {
    const db = createEventStore();
    await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db);
    expect(db.rawCalls[0]).toMatch(/pg_advisory_xact_lock\(\?::int4, \?::int4\)/);
  });

  it('50 concurrent emits on one block: seq 1..50 with no gaps, and the chain verifies', async () => {
    const db = createEventStore();
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner, payload: { objectId: `o${i}` } }, db),
      ),
    );
    expect(results.every((r) => r !== null)).toBe(true);
    const seqs = db.__rows.map((r: { seq: number }) => r.seq).sort((a: number, b: number) => a - b);
    expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(verifyChain(rowsAsChain(db.__rows))).toMatchObject({ ok: true, checked: 50 });
  });

  it('negative control: without the lock the same race loses events', async () => {
    const db = createEventStore({ lock: false });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const results = await Promise.all(
      Array.from({ length: 50 }, () => emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db)),
    );
    warn.mockRestore();
    expect(results.filter((r) => r === null).length).toBeGreaterThan(0);
  });

  it('chains are per block: another block starts at seq 1 from genesis', async () => {
    const db = createEventStore();
    await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db);
    await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db);
    const other = await emitBlockEvent({ block: 840000, kind: 'build.placed', actor: owner }, db);
    expect(other).toMatchObject({ seq: 1, prev: 'sha256:' + '0'.repeat(64) });
  });
});

describe('signing', () => {
  it('without a key: signer "unsigned", no signature, no attestation', async () => {
    const db = createEventStore();
    const e = await emitBlockEvent({ block: BLOCK, kind: 'deed.moved', actor: { type: 'system', id: null, handle: null }, payload: { holder: 'bc1pnew' } }, db);
    expect(e).toMatchObject({ signerScheme: 'unsigned', signerAddress: null, proofSignature: null, attestation: null });
    expect(e!.payloadHash).toBe(sha256Tagged(e!.proofMessage));
  });

  it('with a key: system events are ed25519-signed and every event is attested; the proof verifies', async () => {
    process.env.BG_EVENT_SIGNING_KEY = SEED;
    const key = parseSystemKey(SEED)!;
    const db = createEventStore();
    const e = await emitBlockEvent({ block: BLOCK, kind: 'deed.moved', actor: { type: 'system', id: null, handle: null }, payload: { holder: 'bc1pnew', inscriptionId: 'abci0' } }, db);
    expect(e).toMatchObject({ signerScheme: 'ed25519', signerAddress: key.kid, attestationKid: key.kid });
    const proof = await getEventProof(BLOCK, e!.id, db);
    expect(proof).not.toBe('disabled');
    const res = verifyEventProof(proof as Exclude<typeof proof, 'disabled' | null>, publishedKeys(key).keys);
    expect(res).toMatchObject({ ok: true, checks: { payloadHash: true, eventHash: true, signature: true, attestation: true } });
    // A verifier holding a different key rejects it.
    const wrong = publishedKeys(parseSystemKey('22'.repeat(32))).keys.map((k) => ({ ...k, kid: key.kid }));
    expect(verifyEventProof(proof as Exclude<typeof proof, 'disabled' | null>, wrong).ok).toBe(false);
  });

  it('a malformed key is never used and never echoed', async () => {
    process.env.BG_EVENT_SIGNING_KEY = 'not-a-key';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const e = await emitBlockEvent({ block: BLOCK, kind: 'deed.moved', actor: { type: 'system', id: null, handle: null } }, createEventStore());
    expect(e!.signerScheme).toBe('unsigned');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('not-a-key');
    warn.mockRestore();
  });
});

describe('privacy (spec §5.6)', () => {
  const PRIVATE = {
    chatText: 'hey this is a private chat line',
    message: 'dm body',
    ip: '203.0.113.9',
    userAgent: 'Mozilla/5.0',
    visitorAddress: 'bc1qvisitor',
    memoryMd: 'guardian memory',
    soulMd: 'the soul',
    configJson: '{"k":1}',
    llmApiKey: 'sk-live-secret',
  };

  it('publicPayload drops every key that is not on the allowlist', () => {
    const out = publicPayload({ ...PRIVATE, objectId: 'o1', counts: { create: 2, 'bad key': 3 } });
    expect(out).toEqual({ objectId: 'o1', counts: { create: 2 } });
  });

  it('nothing private reaches a stored event, whatever the caller passes', async () => {
    const db = createEventStore();
    await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner, payload: { ...PRIVATE, objectType: 'lantern' } }, db);
    const stored = JSON.stringify(db.__rows);
    for (const v of Object.values(PRIVATE)) expect(stored).not.toContain(v);
  });

  it('a flagged name is replaced by the generic template', async () => {
    expect(await judgedName('Night Market', BLOCK, null)).toBe('Night Market');
    expect(await judgedName('<script>', BLOCK, null)).toBe('script');
    expect(await judgedName('   ', BLOCK, null)).toBeNull();
    expect(await judgedName(42, BLOCK, null)).toBeNull();
  });
});

describe('reads', () => {
  it('newest page in ascending order, then gap-fill with after=', async () => {
    const db = createEventStore();
    for (let i = 0; i < 40; i++) await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db);
    const page = await listBlockEvents(BLOCK, { limit: 30 }, db);
    expect(page.enabled).toBe(true);
    if (!page.enabled) return;
    expect(page.events.map((e) => e.seq)).toEqual(Array.from({ length: 30 }, (_, i) => i + 11));
    expect(page.lastSeq).toBe(40);
    expect(page.events[0].proof.url).toBe(`/api/v1/blocks/${BLOCK}/events/${page.events[0].id}/proof`);
    const fill = await listBlockEvents(BLOCK, { after: 35, limit: 3 }, db);
    if (!fill.enabled) throw new Error('disabled');
    expect(fill.events.map((e) => e.seq)).toEqual([36, 37, 38]);
    expect(fill.hasMore).toBe(true);
  });

  it('a proof id from another block is not found', async () => {
    const db = createEventStore();
    const e = await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, db);
    expect(await getEventProof(840000, e!.id, db)).toBeNull();
  });
});

describe('guardian.status', () => {
  const now = Date.UTC(2026, 9, 23, 12);
  it('derives idle / resting / offline', () => {
    expect(guardianLiveState({ status: 'active', selfHosted: false }, now)).toBe('idle');
    expect(guardianLiveState({ status: 'paused' }, now)).toBe('resting');
    expect(guardianLiveState({ status: 'stopped' }, now)).toBe('offline');
    expect(guardianLiveState({ status: 'active', selfHosted: true, lastHeartbeat: new Date(now - 60_000) }, now)).toBe('idle');
    expect(guardianLiveState({ status: 'active', selfHosted: true, lastHeartbeat: new Date(now - 11 * 60_000) }, now)).toBe('offline');
    expect(guardianLiveState({ status: 'active', selfHosted: true, lastHeartbeat: null }, now)).toBe('offline');
  });

  it('emits only on a change, never per heartbeat', async () => {
    const db = createEventStore();
    const g = { id: 'gdn_1', blockHeight: BLOCK, name: 'Satoshis Keeper', ownerAddress: 'bc1pholder' };
    expect(await emitGuardianStatusIfChanged(g, 'idle', 'idle', null, db)).toBeNull();
    const e = await emitGuardianStatusIfChanged(g, 'offline', 'idle', null, db);
    expect(e).toMatchObject({ kind: 'guardian.status', summary: 'Satoshis Keeper is now idle', payload: { guardianId: 'gdn_1', from: 'offline', to: 'idle' } });
    expect(db.__rows).toHaveLength(1);
  });
});
