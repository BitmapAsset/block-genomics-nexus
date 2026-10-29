/**
 * REAL POSTGRES — `bg-world/1` round trip on the real `BlockEvent` table with no
 * schema change: world.place → a stored event (TEXT kind, JSONB payload) → the
 * manifest from `GET /api/v1/blocks/<h>/world` lists it; world.theme changes the
 * theme; world.remove takes the placement off; the chain stays valid.
 *
 * Skipped unless BG_EVENTS_PG_TEST_URL points at a LOCAL throwaway server (host
 * localhost / 127.0.0.1 only). It works in its own database (`bg92_world_test`,
 * created on that server on first use and kept) so it never races
 * `block-events-pg.test.ts`, which rebuilds the table in the URL's own database.
 * The table is created from the real migration once, then emptied before and
 * after each run (the append-only triggers are paused for the TRUNCATE only).
 */

function worldDbUrl(): string {
  const raw = process.env.BG_EVENTS_PG_TEST_URL || 'postgresql://skip@127.0.0.1:1/skip';
  const u = new URL(raw);
  u.pathname = '/bg92_world_test';
  return u.toString();
}

jest.mock('@/lib/prisma', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { PrismaClient: Client } = require('@prisma/client');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const raw = process.env.BG_EVENTS_PG_TEST_URL || 'postgresql://skip@127.0.0.1:1/skip';
  const u = new URL(raw);
  u.pathname = '/bg92_world_test';
  const real = new Client({ datasources: { db: { url: u.toString() } } });
  return { __esModule: true, default: real, prisma: real };
});
jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null, headers: {} }), WORLD_WRITE_LIMIT: 60 }));
jest.mock('@/lib/block-summary', () => {
  const actual = jest.requireActual('@/lib/block-summary');
  return { ...actual, getTipHeight: async () => 972_600, getBlockSummary: jest.fn() };
});
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
    }),
  },
}));

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import routePrisma from '@/lib/prisma';
import { getBlockSummary } from '@/lib/block-summary';
import { __resetBlockEventsState, emitBlockEvent } from '@/lib/block-events';
import { verifyChain, type ChainRow } from '@/lib/block-event-core';
import { emitWorldEvent } from '@/lib/block-event-emitters';
import { GET as worldGet } from '@/app/api/v1/blocks/[height]/world/route';

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

maybe('bg-world/1 on real Postgres', () => {
  let admin: PrismaClient;
  let db: PrismaClient;
  const BLOCK = 612888;
  const OWNER = 'bc1pworldpgowner0000000000000000000000000000000000000000000';
  const TOWER = { parcel: 418, asset: 'tower', x_m: 230.49, y_m: 610.47, rot_deg: 0, scale: 1 };
  const VSIZE = (
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8')) as { vsize: number[] }
  ).vsize;

  const manifest = async () => {
    const res = (await worldGet({ headers: { get: () => null } } as never, { params: Promise.resolve({ height: String(BLOCK) }) })) as unknown as {
      status: number;
      body: { enabled: boolean; theme: string; placements: Array<Record<string, unknown>>; head: { id: string; seq: number } | null };
    };
    expect(res.status).toBe(200);
    return res.body;
  };

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: URL_! } } });
    const exists = await admin.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM pg_database WHERE datname = 'bg92_world_test'`);
    if (!exists[0]?.n) await admin.$executeRawUnsafe('CREATE DATABASE bg92_world_test');
    await admin.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$`);
    db = new PrismaClient({ datasources: { db: { url: worldDbUrl() } } });
    const table = await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename = 'BlockEvent'`);
    if (table[0]?.n) {
      await emptyTable();
    } else {
      const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'migrations', '20261023180000_add_block_event', 'migration.sql'), 'utf8');
      for (const stmt of splitSql(sql)) await db.$executeRawUnsafe(stmt);
    }
    (getBlockSummary as jest.Mock).mockResolvedValue({ height: BLOCK, vsize: VSIZE });
    process.env.BG_EVENTS_ENABLED = 'true';
    process.env.BG_EVENT_SIGNING_KEY = '7c'.repeat(32);
    __resetBlockEventsState();
  });

  /** The table is append-only by trigger; a test database empties it with the user triggers paused. */
  async function emptyTable() {
    await db.$executeRawUnsafe('ALTER TABLE "BlockEvent" DISABLE TRIGGER USER');
    await db.$executeRawUnsafe('TRUNCATE "BlockEvent"');
    await db.$executeRawUnsafe('ALTER TABLE "BlockEvent" ENABLE TRIGGER USER');
  }

  afterAll(async () => {
    await emptyTable();
    await db.$disconnect();
    await (routePrisma as unknown as PrismaClient).$disconnect();
    await admin.$disconnect();
    delete process.env.BG_EVENTS_ENABLED;
    delete process.env.BG_EVENT_SIGNING_KEY;
  });

  it('place → event → manifest, theme, remove-after-place, valid chain', async () => {
    const placed = await emitWorldEvent({
      block: BLOCK,
      kind: 'world.place',
      ownerAddress: OWNER,
      via: 'session',
      fields: { ...TOWER, params: { color: '#f7931a', floors: 12, lit: true } },
    });
    expect(placed).not.toBeNull();

    // The real row: TEXT kind, JSONB payload, system-signed over the payload.
    const row = await db.blockEvent.findUnique({ where: { id: placed!.id } });
    expect(row).toMatchObject({ block: BLOCK, seq: 1, kind: 'world.place', actorType: 'owner-session', signerScheme: 'ed25519' });
    expect(row!.payload).toEqual({ ...TOWER, params: { color: '#f7931a', floors: 12, lit: true }, via: 'session' });

    let m = await manifest();
    expect(m.enabled).toBe(true);
    expect(m.theme).toBe('photoreal');
    expect(m.placements).toHaveLength(1);
    expect(m.placements[0]).toMatchObject({ id: placed!.id, ...TOWER, params: { color: '#f7931a', floors: 12, lit: true } });
    expect(m.head).toEqual({ id: placed!.id, seq: 1 });

    const second = await emitWorldEvent({ block: BLOCK, kind: 'world.place', ownerAddress: OWNER, via: 'session', fields: { ...TOWER, parcel: 0, asset: 'house', x_m: 50, y_m: 40 } });
    await emitWorldEvent({ block: BLOCK, kind: 'world.theme', ownerAddress: OWNER, via: 'session', fields: { theme: 'brick' } });
    const removed = await emitWorldEvent({ block: BLOCK, kind: 'world.remove', ownerAddress: OWNER, via: 'session', fields: { placementId: placed!.id } });
    expect(removed).not.toBeNull();

    m = await manifest();
    expect(m.theme).toBe('brick');
    expect(m.placements.map((p) => p.id)).toEqual([second!.id]);
    expect(m.head).toEqual({ id: removed!.id, seq: 4 });

    const rows = await db.blockEvent.findMany({ where: { block: BLOCK }, orderBy: { seq: 'asc' } });
    const chain: ChainRow[] = rows.map((r) => ({
      id: r.id, block: r.block, seq: r.seq, kind: r.kind,
      actor: { type: r.actorType as 'owner-session', id: r.actorId, handle: r.actorHandle },
      signer: { scheme: r.signerScheme as 'ed25519', address: r.signerAddress },
      summary: r.summary, payloadHash: r.payloadHash, prev: r.prev, ts: r.ts.toISOString(), hash: r.hash,
    }));
    expect(verifyChain(chain)).toMatchObject({ ok: true, checked: 4 });
  });

  it('other kinds on the same block never reach the manifest', async () => {
    const before = await manifest();
    await emitBlockEvent({
      block: BLOCK,
      kind: 'build.placed',
      actor: { type: 'owner', id: OWNER, handle: null },
      payload: { objectId: 'o1', objectType: 'cube' },
    });
    const after = await manifest();
    expect(after.placements).toEqual(before.placements);
    expect(after.head).toEqual(before.head);
  });
});
