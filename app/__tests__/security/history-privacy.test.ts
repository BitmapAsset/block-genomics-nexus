/**
 * SIMULATION — a wallet's activity history is the wallet's own business, and a
 * public read writes nothing (bg47 E2E-02, E2E-04).
 *
 *   E2E-02 — GET /history?wallet=<any> returned login timestamps, challenge
 *            events and metadata for any wallet. Addresses are public.
 *   E2E-04 — GET /users/by-wallet/<addr> inserted ActivityLog{action:'login'}
 *            for the looked-up wallet, so anyone could fake another user's
 *            login history (and the CLI/SDK did it on every lookup).
 */

const OWNER = 'bc1powner000000000000000000000000000000000000';
const STRANGER = 'bc1pstranger00000000000000000000000000000000';

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

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  PUBLIC_READ_LIMIT: 120,
}));

import prisma from '@/lib/prisma';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { GET as HISTORY } from '@/app/api/v1/history/route';
import { GET as BY_WALLET } from '@/app/api/v1/users/by-wallet/[address]/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

function historyReq(wallet: string, token?: string) {
  return {
    nextUrl: new URL(`http://test.local/api/v1/history?wallet=${wallet}`),
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) },
  } as never;
}

beforeEach(async () => {
  db.__reset();
  await db.user.create({ data: { walletAddress: OWNER, handle: 'owner', ownedBlocks: [] } });
  await db.activityLog.create({ data: { walletAddress: OWNER, action: 'login', metadata: { method: 'wallet' } } });
});

describe('GET /history?wallet=', () => {
  it('refuses a caller with no session (401) and returns no rows', async () => {
    const res: any = await HISTORY(historyReq(OWNER));
    expect(res.status).toBe(401);
    expect((await res.json()).data).toBeUndefined();
  });

  it("refuses another wallet's session (403)", async () => {
    const { token } = await mintVerifiedSession(STRANGER, []);
    const res: any = await HISTORY(historyReq(OWNER, token));
    expect(res.status).toBe(403);
  });

  it("returns the wallet's history to its own session, uncached", async () => {
    const { token } = await mintVerifiedSession(OWNER, []);
    const res: any = await HISTORY(historyReq(OWNER, token));

    expect(res.status).toBe(200);
    expect((await res.json()).data.activities).toHaveLength(1);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('GET /users/by-wallet/<addr>', () => {
  it('answers without writing a "login" (or any) activity row for the looked-up wallet', async () => {
    const before = db.__rows('activityLog').length;

    const res: any = await BY_WALLET({ headers: { get: () => null } } as never, { params: Promise.resolve({ address: OWNER }) } as never);
    await new Promise((r) => setImmediate(r)); // the old write was fire-and-forget

    expect(res.status).toBe(200);
    expect((await res.json()).data.walletAddress).toBe(OWNER);
    expect(db.__rows('activityLog')).toHaveLength(before);
  });
});
