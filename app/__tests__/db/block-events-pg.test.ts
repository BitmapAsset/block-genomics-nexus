/**
 * REAL POSTGRES — the ordering guarantee of `emitBlockEvent()` with real
 * transactions: 50 concurrent emits on one block get seq 1..50 with no gaps and
 * a valid chain, and the append-only trigger refuses UPDATE / DELETE /
 * TRUNCATE. Plus the public `GET /api/v1/ownership/verify` under load: 50
 * concurrent live matches on one block store at most one `deed.verified`, and
 * once it is recorded a GET never opens a transaction (so never takes the
 * block's advisory lock). Applies the real migration SQL to a throwaway database.
 *
 * Skipped unless BG_EVENTS_PG_TEST_URL points at a LOCAL throwaway database
 * (host localhost / 127.0.0.1 only; anything else is refused, so this can never
 * be aimed at production). Example:
 *
 *   docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=pg postgres:16
 *   BG_EVENTS_PG_TEST_URL=postgresql://postgres:pg@127.0.0.1:55432/postgres npx jest __tests__/db/block-events-pg.test.ts
 *
 * The same properties run without a database in block-events-emit.test.ts
 * against the in-memory store (helpers/event-store.ts).
 */

// The route under test reads `@/lib/prisma`: point it at the same throwaway
// database, and count `$transaction` (the only way to the advisory lock).
jest.mock('@/lib/prisma', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { PrismaClient: Client } = require('@prisma/client');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const real = new Client({ datasources: { db: { url: process.env.BG_EVENTS_PG_TEST_URL || 'postgresql://skip@127.0.0.1:1/skip' } } });
  const client = {
    get blockEvent() {
      return real.blockEvent;
    },
    $transaction: jest.fn((fn: unknown, opts: unknown) => real.$transaction(fn, opts)),
    __real: real,
  };
  return { __esModule: true, default: client, prisma: client };
});
jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null }) }));
const mockVerifyOwnership = jest.fn();
jest.mock('@/lib/ownership-sync', () => ({ verifyBlockOwnership: (...a: unknown[]) => mockVerifyOwnership(...a) }));

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import routePrisma from '@/lib/prisma';
import { emitBlockEvent, eventStats, EVENT_LOCK_NS, __resetBlockEventsState } from '@/lib/block-events';
import { verifyChain, type ChainRow } from '@/lib/block-event-core';
import { GET as ownershipVerifyGet } from '@/app/api/v1/ownership/verify/route';

const URL_ = process.env.BG_EVENTS_PG_TEST_URL;
const local = !!URL_ && /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL_);
const maybe = local ? describe : describe.skip;

function splitSql(sql: string): string[] {
  const noComments = sql.replace(/^\s*--.*$/gm, '');
  const out: string[] = [];
  let cur = '';
  let inDollar = false;
  for (let i = 0; i < noComments.length; i++) {
    if (noComments.startsWith('$$', i)) {
      inDollar = !inDollar;
      cur += '$$';
      i++;
      continue;
    }
    const ch = noComments[i];
    if (ch === ';' && !inDollar) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

maybe('BlockEvent on real Postgres', () => {
  // Built in beforeAll: describe.skip still runs this callback to collect tests.
  let db: PrismaClient;
  const BLOCK = 718840;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: URL_! } } });
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS "BlockEvent" CASCADE');
    // A stock Postgres has none of Supabase's roles. In the real chain the
    // replayable baseline (20260715043118) creates them before this migration
    // runs; here only this migration is applied, so create them the same way.
    await db.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$`);
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'migrations', '20261023180000_add_block_event', 'migration.sql'), 'utf8');
    // Prisma runs one statement per call, and the migration has dollar-quoted
    // bodies containing ';', so split outside $$ … $$ only.
    for (const stmt of splitSql(sql)) await db.$executeRawUnsafe(stmt);
    process.env.BG_EVENTS_ENABLED = 'true';
    __resetBlockEventsState();
  });

  afterAll(async () => {
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS "BlockEvent" CASCADE');
    await db.$disconnect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (routePrisma as any).__real.$disconnect();
    delete process.env.BG_EVENTS_ENABLED;
  });

  it('50 concurrent emits: seq 1..50, no gaps, valid chain', async () => {
    const out = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: { type: 'owner', id: 'bc1pholder', handle: null }, payload: { objectId: `o${i}` } }, db),
      ),
    );
    expect(out.filter((e) => e === null)).toHaveLength(0);
    const rows = await db.blockEvent.findMany({ where: { block: BLOCK }, orderBy: { seq: 'asc' } });
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const chain: ChainRow[] = rows.map((r) => ({
      id: r.id, block: r.block, seq: r.seq, kind: r.kind,
      actor: { type: r.actorType as 'owner', id: r.actorId, handle: r.actorHandle },
      signer: { scheme: r.signerScheme as 'unsigned', address: r.signerAddress },
      summary: r.summary, payloadHash: r.payloadHash, prev: r.prev, ts: r.ts.toISOString(), hash: r.hash,
    }));
    expect(verifyChain(chain)).toMatchObject({ ok: true, checked: 50 });
  }, 60_000);

  it('50 concurrent live-match GETs /ownership/verify on one block: ≤ 1 deed.verified; once recorded, no GET takes the lock', async () => {
    const HOLDER_BLOCK = 840000;
    const holder = 'bc1pexampleholder0000000000000000000000008978';
    mockVerifyOwnership.mockResolvedValue({
      blockHeight: HOLDER_BLOCK, dbOwnerAddress: holder, onChainOwnerAddress: holder, inscriptionId: 'insc-840000i0',
      match: true, indeterminate: false, action: 'none',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = (routePrisma as any).$transaction as jest.Mock;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const get = () => ownershipVerifyGet({ nextUrl: new URL(`http://test.local/api/v1/ownership/verify?blockHeight=${HOLDER_BLOCK}`), headers: new Headers() } as any);

    tx.mockClear();
    const first = await Promise.all(Array.from({ length: 50 }, get));
    expect(first.map((r) => r.status)).toEqual(Array(50).fill(200));
    const stored = await db.blockEvent.findMany({ where: { block: HOLDER_BLOCK } });
    expect(stored.length).toBeLessThanOrEqual(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ kind: 'deed.verified', seq: 1 });
    console.log(`[bg91] first burst: ${tx.mock.calls.length} of 50 GETs entered the locked emit, ${stored.length} event stored`);

    tx.mockClear();
    const again = await Promise.all(Array.from({ length: 50 }, get));
    expect(again.map((r) => r.status)).toEqual(Array(50).fill(200));
    expect(tx).not.toHaveBeenCalled();
    expect(await db.blockEvent.count({ where: { block: HOLDER_BLOCK } })).toBe(1);
  }, 60_000);

  it('an emit stuck behind the block lock past the 5 s budget is lost, counted once and logged once', async () => {
    const STUCK = 900001;
    __resetBlockEventsState();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Another session holds this block's advisory lock for 7 s.
    const holder = db.$transaction(
      async (t) => {
        await t.$executeRaw`SELECT pg_advisory_xact_lock(${EVENT_LOCK_NS}::int4, ${STUCK}::int4)`;
        await t.$executeRaw`SELECT pg_sleep(7)`;
      },
      { maxWait: 5_000, timeout: 20_000 },
    );
    await new Promise((r) => setTimeout(r, 500));
    const t0 = Date.now();
    const out = await emitBlockEvent({ block: STUCK, kind: 'build.placed', actor: { type: 'owner', id: 'bc1pholder', handle: null } }, db);
    const waited = Date.now() - t0;
    await holder;
    expect(out).toBeNull();
    expect(waited).toBeGreaterThanOrEqual(4_500);
    expect(await db.blockEvent.count({ where: { block: STUCK } })).toBe(0);
    const s = eventStats();
    expect(s).toMatchObject({ enabled: true, emitted: 0, lost: 1, lastLossKind: 'build.placed', lastLossBlock: STUCK, backoffUntil: null });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe('[block-events] emit failed');
    expect(warn.mock.calls[0][1]).toMatchObject({ block: STUCK, kind: 'build.placed', lost: 1 });
    console.log(`[bg91] stuck emit returned after ${waited} ms: ${JSON.stringify(String((warn.mock.calls[0][1] as { err: string }).err).trim().slice(0, 200))}`);
    warn.mockRestore();
  }, 30_000);

  it('the table is append-only, even for the owner role', async () => {
    await expect(db.$executeRawUnsafe(`UPDATE "BlockEvent" SET "summary" = 'x' WHERE "seq" = 1`)).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "BlockEvent"`)).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`TRUNCATE "BlockEvent"`)).rejects.toThrow(/append-only/);
  });
});

if (!local) {
  it('skipped: BG_EVENTS_PG_TEST_URL is not a local throwaway database', () => {
    expect(local).toBe(false);
  });
}
