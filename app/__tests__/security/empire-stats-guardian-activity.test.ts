/**
 * The public empire stats answer names the kind of a guardian's latest
 * activity. The event itself (for an escalation: the message a visitor left
 * for the owner, with their handle and address) stays in the guardian's event
 * log, which is read with that guardian's monitor token.
 *
 * Real route; mocked seams: DB (in memory, plus the `distinct` / `select` /
 * `groupBy` this route asks for), the per-IP read limiter.
 */

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse };
});

jest.mock('@/lib/prisma', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  const pick = (row: any, select: any) =>
    select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) : row;
  const baseEvents = client.guardianEvent.findMany;
  client.guardianEvent.findMany = jest.fn(async (args: any = {}) => {
    let rows = await baseEvents(args);
    if (args.distinct) {
      const seen = new Set<string>();
      rows = rows.filter((r: any) => {
        const key = args.distinct.map((f: string) => String(r[f])).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return rows.map((r: any) => pick(r, args.select));
  });
  client.blockObject.groupBy = async ({ by, where }: any) => {
    const rows = await client.blockObject.findMany({ where });
    const counts = new Map<string, { row: any; n: number }>();
    for (const r of rows) {
      const key = by.map((f: string) => String(r[f])).join('|');
      const cur = counts.get(key) ?? { row: r, n: 0 };
      cur.n += 1;
      counts.set(key, cur);
    }
    return [...counts.values()].map(({ row, n }) => ({
      ...Object.fromEntries(by.map((f: string) => [f, row[f]])),
      _count: { id: n },
    }));
  };
  return { __esModule: true, default: client, prisma: client };
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
});
jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null, headers: {} }) }));

import prisma from '@/lib/prisma';
import { GET } from '@/app/api/v1/profiles/empire-stats/[address]/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

// Made-up values: no real person, no real address.
const OWNER = 'bc1pownerexample0000000000000000000000000000000000000000000';
const OTHER_OWNER = 'bc1potherownerexample000000000000000000000000000000000000';
const VISITOR_MESSAGE = 'please ring the lantern bell twice, nine-four-three 3c9e';
const VISITOR_HANDLE = 'moonlit-heron-58b2';
const VISITOR_ADDRESS = 'bc1qvisitorexample00000000000000000000d41f';
const SUMMARY_TEXT = 'owner summary text that stays in the log a7d0';

const MESSAGE_LABEL = 'A visitor left a message';
const ACTIVITY_LABEL = 'Guardian activity';

const T_OLD = new Date('2026-10-01T10:00:00Z');
const T_NEW = new Date('2026-10-02T12:30:00Z');
const T_BEAT_A = new Date('2026-10-03T08:00:00Z');
const T_BEAT_B = new Date('2026-10-03T09:00:00Z');

function req() {
  const u = new URL(`http://localhost/api/v1/profiles/empire-stats/${OWNER}`);
  return { url: u.toString(), nextUrl: u, headers: new Headers() } as any;
}

async function call() {
  const res: any = await GET(req(), { params: Promise.resolve({ address: OWNER }) });
  return res;
}

async function setLatestEvent(eventType: string, data: string | null) {
  await db.guardianEvent.create({
    data: { guardianId: 'grd_a', eventType, handled: false, data, createdAt: new Date('2026-10-04T00:00:00Z') },
  });
}

beforeEach(async () => {
  db.__reset();
  (db.guardianEvent.findMany as jest.Mock).mockClear();

  await db.user.create({ data: { walletAddress: OWNER, ownedBlocks: [840100, 840102] } });
  await db.block.create({ data: { height: 840100, ownerAddress: OWNER } });
  await db.block.create({ data: { height: 840101, ownerAddress: OWNER } });
  await db.block.create({ data: { height: 850000, ownerAddress: OTHER_OWNER } });
  await db.blockProfile.create({ data: { id: 'bp_1', walletAddress: OWNER, blockHeight: 840103 } });

  await db.guardianAgent.create({
    data: { id: 'grd_a', blockHeight: 840100, ownerAddress: OWNER, name: 'Lantern Keeper', soulMd: 's', status: 'active', lastHeartbeat: T_BEAT_A },
  });
  await db.guardianAgent.create({
    data: { id: 'grd_b', blockHeight: 840101, ownerAddress: OWNER, name: 'Quiet Gate', soulMd: 's', status: 'paused', lastHeartbeat: T_BEAT_B },
  });
  await db.guardianAgent.create({
    data: { id: 'grd_c', blockHeight: 850000, ownerAddress: OTHER_OWNER, name: 'Elsewhere', soulMd: 's', status: 'active' },
  });

  // Guardian A: an older event, then the latest one, an escalation holding a visitor's message.
  await db.guardianEvent.create({
    data: { guardianId: 'grd_a', eventType: 'status_change', handled: true, data: JSON.stringify({ summary: SUMMARY_TEXT }), createdAt: T_OLD },
  });
  await db.guardianEvent.create({
    data: {
      guardianId: 'grd_a',
      eventType: 'escalation',
      handled: false,
      data: JSON.stringify({ visitorAddress: VISITOR_ADDRESS, visitorHandle: VISITOR_HANDLE, message: VISITOR_MESSAGE }),
      createdAt: T_NEW,
    },
  });
  // Another owner's guardian has its own escalation; it never shows up here.
  await db.guardianEvent.create({
    data: { guardianId: 'grd_c', eventType: 'escalation', handled: false, data: JSON.stringify({ message: 'elsewhere 11aa' }), createdAt: T_NEW },
  });

  for (const h of [840100, 840100, 840100, 840103, 999999, 999999]) {
    await db.blockObject.create({ data: { blockHeight: h } });
  }
});

function detail(body: any, blockHeight: number) {
  return body.data.guardianDetails.find((g: any) => g.blockHeight === blockHeight);
}

describe('GET /api/v1/profiles/empire-stats/[address] names the latest guardian activity without its content', () => {
  it("answers 200 without the visitor's message, handle or address", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(VISITOR_MESSAGE);
    expect(serialized).not.toContain(VISITOR_HANDLE);
    expect(serialized).not.toContain(VISITOR_ADDRESS);
    expect(serialized).not.toContain('lantern bell');
  });

  it("guardian A's last action is the fixed label at the event time; guardian B's is null", async () => {
    const res = await call();
    const a = detail(res.body, 840100);
    const b = detail(res.body, 840101);
    expect(a.lastAction).toBe(MESSAGE_LABEL);
    expect(new Date(a.lastActionTime).getTime()).toBe(T_NEW.getTime());
    expect(b.lastAction).toBeNull();
    expect(b.lastActionTime).toBeNull();
  });

  it('the event log content is not read for this answer', async () => {
    await call();
    const calls = (db.guardianEvent.findMany as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [args] of calls) {
      expect(args.select).toBeDefined();
      expect(args.select.data).toBeFalsy();
    }
  });

  it('the other fields are unchanged', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(Object.keys(d).sort()).toEqual(
      ['activeGuardians', 'guardianDetails', 'ownedBlocks', 'totalBlocks', 'totalWorldObjects'],
    );
    expect(d.totalBlocks).toBe(4);
    expect([...d.ownedBlocks].sort()).toEqual([840100, 840101, 840102, 840103]);
    expect(d.activeGuardians).toBe(1);
    expect(d.totalWorldObjects).toBe(4);
    expect(d.guardianDetails).toHaveLength(2);

    const a = detail(res.body, 840100);
    const b = detail(res.body, 840101);
    const keys = ['blockHeight', 'lastAction', 'lastActionTime', 'lastHeartbeat', 'name', 'status', 'worldObjectCount'];
    expect(Object.keys(a).sort()).toEqual(keys);
    expect(Object.keys(b).sort()).toEqual(keys);
    expect(a).toMatchObject({ status: 'active', name: 'Lantern Keeper', worldObjectCount: 3 });
    expect(new Date(a.lastHeartbeat).getTime()).toBe(T_BEAT_A.getTime());
    expect(b).toMatchObject({ status: 'paused', name: 'Quiet Gate', worldObjectCount: 0 });
    expect(new Date(b.lastHeartbeat).getTime()).toBe(T_BEAT_B.getTime());
    expect(JSON.stringify(res.body)).not.toContain('Elsewhere');
  });

  it('an event whose data is not JSON still answers 200 with the label', async () => {
    await setLatestEvent('escalation', `not json { ${VISITOR_MESSAGE}`);
    const res = await call();
    expect(res.status).toBe(200);
    expect(detail(res.body, 840100).lastAction).toBe(MESSAGE_LABEL);
    expect(JSON.stringify(res.body)).not.toContain(VISITOR_MESSAGE);
  });

  it('any other or unknown event type answers the general label, never a summary from the event', async () => {
    await setLatestEvent('status_change', JSON.stringify({ summary: SUMMARY_TEXT, message: VISITOR_MESSAGE }));
    const res = await call();
    expect(detail(res.body, 840100).lastAction).toBe(ACTIVITY_LABEL);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(SUMMARY_TEXT);
    expect(serialized).not.toContain(VISITOR_MESSAGE);
  });

  it('an event without data answers the label of its type', async () => {
    await setLatestEvent('escalation', null);
    const res = await call();
    expect(detail(res.body, 840100).lastAction).toBe(MESSAGE_LABEL);
  });
});
