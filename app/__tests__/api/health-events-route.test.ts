/**
 * `GET /api/v1/health/events`: the in-process loss counter of the Living Block
 * event spine. Every emit lost past the transaction budget and every emit lost
 * to a missing table is counted; a dedupe skip is not. One structured
 * `console.warn` per failed emit, none for the table-missing back-off.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
      headers: new Map(Object.entries(init?.headers ?? {})),
    }),
  },
}));

const mockEnforce = jest.fn();
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: (...a: unknown[]) => mockEnforce(...a),
}));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import { GET } from '@/app/api/v1/health/events/route';
import { emitBlockEvent, __resetBlockEventsState } from '@/lib/block-events';
import { createEventStore } from '../helpers/event-store';

/* eslint-disable @typescript-eslint/no-explicit-any */
const BLOCK = 718840;
const owner = { type: 'owner' as const, id: 'bc1pholder', handle: null };

async function health(): Promise<{ res: any; data: any }> {
  const res: any = await GET({ nextUrl: new URL('http://test.local/api/v1/health/events'), headers: new Headers() } as any);
  return { res, data: (await res.json()).data };
}

/** A client whose transaction never gets the lock in time (what Prisma throws past `timeout`). */
function timingOutStore() {
  const db = createEventStore();
  db.$transaction = async () => {
    throw Object.assign(new Error('Transaction API error: Transaction already closed: the timeout for this transaction was 5000 ms'), { code: 'P2028' });
  };
  return db;
}

beforeEach(() => {
  __resetBlockEventsState();
  mockEnforce.mockReset();
  mockEnforce.mockResolvedValue({ response: null, headers: {} });
  delete process.env.BG_EVENTS_ENABLED;
  // Events are published only under a system key.
  process.env.BG_EVENT_SIGNING_KEY = '5a'.repeat(32);
});

afterAll(() => {
  delete process.env.BG_EVENTS_ENABLED;
  delete process.env.BG_EVENT_SIGNING_KEY;
});

it('flag off: enabled false, zero counts, no-store, rate-limited like the other health routes', async () => {
  const { res, data } = await health();
  expect(res.status).toBe(200);
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(mockEnforce).toHaveBeenCalledWith(expect.anything(), { bucket: 'v1-health-events' });
  expect(data).toMatchObject({ enabled: false, emitted: 0, lost: 0, lastLossAt: null, backoffUntil: null, scope: 'instance' });
  expect(data.note).toMatch(/per server instance since its process started/);
  expect(Object.keys(data).sort()).toEqual(['backoffUntil', 'emitted', 'enabled', 'lastLossAt', 'lost', 'note', 'scope', 'since']);
});

it('a 429 from the limiter is returned as is', async () => {
  const limited = { status: 429 };
  mockEnforce.mockResolvedValueOnce({ response: limited, headers: {} });
  const res: any = await GET({ nextUrl: new URL('http://test.local/api/v1/health/events'), headers: new Headers() } as any);
  expect(res).toBe(limited);
});

it('counts emitted, lost past the budget (one warn each), table-missing losses and the back-off; dedupe skips are not losses', async () => {
  process.env.BG_EVENTS_ENABLED = 'true';
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  const ok = createEventStore();
  await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, ok);
  const dedupe = { withinMs: 60_000, samePayload: ['holder'] };
  await emitBlockEvent({ block: BLOCK, kind: 'deed.verified', actor: owner, payload: { holder: 'bc1pholder' }, dedupe }, ok);
  await emitBlockEvent({ block: BLOCK, kind: 'deed.verified', actor: owner, payload: { holder: 'bc1pholder' }, dedupe }, ok);
  let { data } = await health();
  expect(data).toMatchObject({ enabled: true, emitted: 2, lost: 0, lastLossAt: null, backoffUntil: null });

  // Lost past the 5 s budget.
  const before = Date.now();
  expect(await emitBlockEvent({ block: BLOCK, kind: 'build.changed', actor: owner }, timingOutStore())).toBeNull();
  ({ data } = await health());
  expect(data).toMatchObject({ emitted: 2, lost: 1, backoffUntil: null });
  expect(Date.parse(data.lastLossAt)).toBeGreaterThanOrEqual(before);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]).toEqual([
    '[block-events] emit failed',
    { block: BLOCK, kind: 'build.changed', err: expect.stringContaining('timeout'), lost: 1 },
  ]);

  // Table missing: the emit that finds out, then every emit during the back-off.
  const missing = createEventStore({ missing: true });
  expect(await emitBlockEvent({ block: 840000, kind: 'build.placed', actor: owner }, missing)).toBeNull();
  ({ data } = await health());
  expect(data.lost).toBe(2);
  expect(Date.parse(data.backoffUntil)).toBeGreaterThan(Date.now() + 55_000);
  const tx = jest.spyOn(missing, '$transaction');
  expect(await emitBlockEvent({ block: 840000, kind: 'build.placed', actor: owner }, missing)).toBeNull();
  expect(tx).not.toHaveBeenCalled();
  ({ data } = await health());
  expect(data.lost).toBe(3);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

it('flag off emitters are not losses', async () => {
  await emitBlockEvent({ block: BLOCK, kind: 'build.placed', actor: owner }, timingOutStore());
  const { data } = await health();
  expect(data).toMatchObject({ enabled: false, emitted: 0, lost: 0 });
});
