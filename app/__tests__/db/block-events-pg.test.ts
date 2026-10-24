/**
 * REAL POSTGRES — the ordering guarantee of `emitBlockEvent()` with real
 * transactions: 50 concurrent emits on one block get seq 1..50 with no gaps and
 * a valid chain, and the append-only trigger refuses UPDATE / DELETE /
 * TRUNCATE. Applies the real migration SQL to a throwaway database.
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

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { emitBlockEvent, __resetBlockEventsState } from '@/lib/block-events';
import { verifyChain, type ChainRow } from '@/lib/block-event-core';

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
