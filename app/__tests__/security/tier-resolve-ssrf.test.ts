/**
 * SIMULATION — `POST /tier/resolve` never lets the caller pick the server it asks (CodeQL #4).
 *
 * The resolver scanned a wallet by fetching our own `/api/v1/inscriptions/scan`
 * at `req.nextUrl.origin`, the origin of the request being served. Behind any
 * proxy that passes the Host header through (or with Next's trustHostHeader),
 * that origin is whatever the caller sent, so the server requested a host the
 * caller chose and stored its answer as the wallet's holdings: a forged scan
 * reporting block 840000 made the caller a tier-1 owner of it.
 *
 * The request below arrives for `attacker.example`. The only network the
 * resolver may touch is the chain's content source; the forged answer must
 * never be asked for, let alone believed.
 */

const WALLET = 'bc1pwalletunderscan0000000000000000000000000000';
const REAL_BLOCK = 208;
const FORGED_BLOCK = 840000;

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

// The wallet's live inscription list (indexers) is stubbed. Content goes
// through the real ord client (default host ordinals.com) into the fetch below,
// so the assertion that only the chain's host is asked covers that client too.
jest.mock('@/lib/onchain/ord', () => ({
  ...jest.requireActual('@/lib/onchain/ord'),
  getAddressInscriptions: async () => ['realbitmapi0'],
}));

import prisma from '@/lib/prisma';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { POST as RESOLVE } from '@/app/api/v1/tier/resolve/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const requested: string[] = [];
const realFetch = global.fetch;

beforeAll(() => {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requested.push(url.href);
    if (url.hostname === 'ordinals.com' && url.pathname === '/content/realbitmapi0') {
      return { ok: true, status: 200, text: async () => `${REAL_BLOCK}.bitmap` } as unknown as Response;
    }
    // Anything else is the attacker's server, answering with a forged scan.
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: { inscriptions: [{ type: 'block', height: FORGED_BLOCK, inscriptionId: 'forged_i0' }] },
      }),
      text: async () => `${FORGED_BLOCK}.bitmap`,
    } as unknown as Response;
  }) as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

beforeEach(() => {
  db.__reset();
  requested.length = 0;
});

it('a request for attacker.example scans the chain, never attacker.example', async () => {
  const { token } = await mintVerifiedSession(WALLET, []);
  const res: any = await RESOLVE({
    json: async () => ({ walletAddress: WALLET, force: true }),
    nextUrl: new URL('http://attacker.example/api/v1/tier/resolve'),
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? `Bearer ${token}` : null) },
  } as never);

  expect(requested.filter((u) => new URL(u).hostname === 'attacker.example')).toEqual([]);
  expect(requested.every((u) => new URL(u).origin === 'https://ordinals.com')).toBe(true);

  expect(res.status).toBe(200);
  const data = (await res.json()).data;
  expect(data.ownedBlocks).toEqual([REAL_BLOCK]);
  expect(data.ownedBlocks).not.toContain(FORGED_BLOCK);
  expect(data.globalTier).toBe(1);
});
