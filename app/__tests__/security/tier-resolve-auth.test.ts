/**
 * SIMULATION — `POST /tier/resolve` is authenticated and never writes `Block` (bg48 Q-01, bg47 E2E-07).
 *
 * The route took any wallet string, rescanned it on demand (`force: true`), and
 * upserted `Block.ownerAddress` + `inscriptionId` for every block the scanner
 * reported. Two consequences:
 *   - after a sale the DB owner silently became the buyer, so ownership-sync saw
 *     DB == chain forever and the seller's release never ran;
 *   - a holder of a duplicate `N.bitmap` took over block N's record outright.
 * A failed scan also returned [], which wiped a real owner's tier.
 *
 * Here the scanner (`scanAddressForBitmaps`, which the resolver calls
 * in-process) is stubbed; the database is in-memory.
 */

const REAL_OWNER = 'bc1prealowner00000000000000000000000000000000';
const ATTACKER = 'bc1pattacker000000000000000000000000000000000';
const BLOCK = 208;

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

const scanMock = jest.fn();
jest.mock('@/lib/inscription-scan', () => ({
  scanAddressForBitmaps: (...args: unknown[]) => scanMock(...args),
}));

import prisma from '@/lib/prisma';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { POST as RESOLVE } from '@/app/api/v1/tier/resolve/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

function resolveReq(body: Record<string, unknown>, token?: string) {
  return {
    json: async () => body,
    nextUrl: new URL('http://test.local/api/v1/tier/resolve'),
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) },
  } as never;
}

/** What the scanner reports for the wallet: the attacker's cheap duplicate `208.bitmap`. */
function scannerReportsDuplicate() {
  scanMock.mockResolvedValue({
    ok: true,
    inscriptions: [{ type: 'block', height: BLOCK, inscriptionId: 'dup_i0', label: `${BLOCK}.bitmap` }],
  });
}

const blockRow = () => db.block.findUnique({ where: { height: BLOCK } });

beforeEach(async () => {
  db.__reset();
  scanMock.mockReset();
  await db.block.create({ data: { height: BLOCK, ownerAddress: REAL_OWNER, inscriptionId: 'real_i0' } });
  await db.user.create({ data: { walletAddress: REAL_OWNER, ownedBlocks: [BLOCK], resolvedTier: 1, lastOnChainCheck: new Date() } });
  await db.user.create({ data: { walletAddress: ATTACKER, ownedBlocks: [], resolvedTier: 0, lastOnChainCheck: null } });
});

describe('POST /tier/resolve — who may call it', () => {
  it('refuses an unauthenticated caller (401) before any scan or write', async () => {
    scannerReportsDuplicate();
    const res: any = await RESOLVE(resolveReq({ walletAddress: ATTACKER, force: true }));

    expect(res.status).toBe(401);
    expect(scanMock).not.toHaveBeenCalled();
    expect((await blockRow()).ownerAddress).toBe(REAL_OWNER);
  });

  it("refuses a session for a different wallet (403), so nobody re-resolves someone else's tier", async () => {
    scannerReportsDuplicate();
    const { token } = await mintVerifiedSession(ATTACKER, []);
    const res: any = await RESOLVE(resolveReq({ walletAddress: REAL_OWNER, force: true }, token));

    expect(res.status).toBe(403);
    expect(scanMock).not.toHaveBeenCalled();
    expect((await db.user.findUnique({ where: { walletAddress: REAL_OWNER } })).resolvedTier).toBe(1);
  });
});

describe('tier computation is read-only for Block', () => {
  it("a wallet's own forced rescan reports its tier but never rewrites the block's owner or deed id", async () => {
    scannerReportsDuplicate();
    const { token } = await mintVerifiedSession(ATTACKER, []);
    const res: any = await RESOLVE(resolveReq({ walletAddress: ATTACKER, force: true }, token));

    expect(res.status).toBe(200);
    expect(scanMock).toHaveBeenCalledTimes(1);
    expect((await res.json()).data.ownedBlocks).toEqual([BLOCK]);

    const block = await blockRow();
    expect(block.ownerAddress).toBe(REAL_OWNER);
    expect(block.inscriptionId).toBe('real_i0');
    expect(db.__rows('block')).toHaveLength(1);
  });

  it('a failed scan keeps the cached tier instead of wiping it', async () => {
    scanMock.mockResolvedValue({ ok: false, reason: 'list_unavailable' });
    const { token } = await mintVerifiedSession(REAL_OWNER, [BLOCK]);
    const res: any = await RESOLVE(resolveReq({ walletAddress: REAL_OWNER, force: true }, token));

    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.globalTier).toBe(1);
    expect(data.ownedBlocks).toEqual([BLOCK]);
    const user = await db.user.findUnique({ where: { walletAddress: REAL_OWNER } });
    expect(user.ownedBlocks).toEqual([BLOCK]);
    expect(user.resolvedTier).toBe(1);
  });
});
