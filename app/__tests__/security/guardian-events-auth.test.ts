/**
 * A guardian's event log (visitor messages left for the owner, among others)
 * is read with that guardian's monitor token, as `guardian/monitor/events` is.
 *
 * Real route + real monitor-token hashing; mocked seams: DB (in memory), the
 * per-IP read limiter.
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});
jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null, headers: {} }) }));

import prisma from '@/lib/prisma';
import { generateMonitorToken } from '@/lib/monitor-tokens';
import { GET } from '@/app/api/v1/guardian/events/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const VISITOR_TEXT = 'private note for the owner 7c1e';

function req(query: string, headers: Record<string, string> = {}) {
  const u = new URL('http://localhost/api/v1/guardian/events' + query);
  return { url: u.toString(), nextUrl: u, headers: new Headers(headers) } as any;
}

let tokenA: string;
let tokenB: string;

beforeEach(async () => {
  db.__reset();
  for (const id of ['grd_a', 'grd_b']) {
    await db.guardianAgent.create({ data: { id, blockHeight: id === 'grd_a' ? 840000 : 840001, ownerAddress: `bc1p${id}`, name: id, soulMd: 's', status: 'active' } });
  }
  tokenA = await generateMonitorToken('grd_a', 'bc1pgrd_a');
  tokenB = await generateMonitorToken('grd_b', 'bc1pgrd_b');
  await db.guardianEvent.create({
    data: { guardianId: 'grd_a', eventType: 'escalation', handled: false, data: JSON.stringify({ visitorAddress: null, visitorHandle: 'v', message: VISITOR_TEXT }) },
  });
});

describe('GET /api/v1/guardian/events needs the monitor token of that guardian', () => {
  it('no authorization: 401, no event', async () => {
    const res: any = await GET(req('?guardianId=grd_a'));
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain(VISITOR_TEXT);
  });

  it("another guardian's token: 401", async () => {
    const res: any = await GET(req('?guardianId=grd_a', { authorization: `Bearer ${tokenB}` }));
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain(VISITOR_TEXT);
  });

  it('its own token: 200 with the events', async () => {
    const res: any = await GET(req('?guardianId=grd_a&eventType=escalation', { authorization: `Bearer ${tokenA}` }));
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(JSON.stringify(res.body)).toContain(VISITOR_TEXT);
  });

  it('a revoked token: 401', async () => {
    await db.guardianAgent.update({ where: { id: 'grd_a' }, data: { monitorTokenHash: null } });
    const res: any = await GET(req('?guardianId=grd_a', { authorization: `Bearer ${tokenA}` }));
    expect(res.status).toBe(401);
  });
});
