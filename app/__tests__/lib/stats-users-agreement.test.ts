/**
 * Source-of-truth agreement test.
 *
 * Guards the prod bug where /api/v1/stats and /api/v1/users/list reported
 * different "verified agent" counts (stats counted users with a handle; the
 * list counted verified users + verified block profiles). Both now derive from
 * countVerifiedAgents(), so they must always agree on the same dataset.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// In-memory prisma stand-in covering the queries these routes issue.
jest.mock('@/lib/prisma', () => {
  const users: any[] = [
    { walletAddress: 'w1', handle: 'alice', verified: true, genomeHash: 'g1', createdAt: new Date(3) },
    // Verified but NO handle — old stats logic (handle not null) would miss this.
    { walletAddress: 'w2', handle: null, verified: true, genomeHash: 'g2', createdAt: new Date(2) },
    // Has a handle but NOT verified — old stats logic would wrongly count this.
    { walletAddress: 'w3', handle: 'carol', verified: false, genomeHash: null, createdAt: new Date(1) },
    { walletAddress: 'w4', handle: null, verified: false, genomeHash: null, createdAt: new Date(0) },
  ];
  const blockProfiles: any[] = [
    { walletAddress: 'w5', blockHeight: 100, handle: 'bp1', verified: true, genomeHash: 'g3', createdAt: new Date(4) },
    { walletAddress: 'w6', blockHeight: 101, handle: 'bp2', verified: false, genomeHash: null, createdAt: new Date(5) },
  ];

  const matches = (row: any, where: any): boolean => {
    if (!where) return true;
    if (where.verified !== undefined && row.verified !== where.verified) return false;
    if (where.handle?.not === null && row.handle === null) return false;
    if (where.genomeHash?.not === null && row.genomeHash === null) return false;
    return true;
  };
  const list = (rows: any[]) => ({
    count: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length,
    findMany: async ({ where, take, skip = 0 }: any = {}) => {
      let res = rows.filter((r) => matches(r, where));
      if (skip) res = res.slice(skip);
      if (take) res = res.slice(0, take);
      return res;
    },
  });

  const client = {
    user: list(users),
    blockProfile: list(blockProfiles),
    block: { count: async () => 7 },
  };
  return { __esModule: true, default: client, prisma: client };
});

import { GET as statsGET } from '@/app/api/v1/stats/route';
import { GET as usersListGET } from '@/app/api/v1/users/list/route';

describe('/stats and /users/list verified-agent agreement', () => {
  it('report the same verified-agent total from one source of truth', async () => {
    // Anonymous request — no sandbox credential, so the sandbox gate passes through.
    const statsRes: any = await statsGET({ headers: { get: () => null } } as any);
    const stats = await statsRes.json();

    const listRes: any = await usersListGET({ url: 'http://test/api/v1/users/list?limit=50&offset=0' } as any);
    const listBody = await listRes.json();
    const listTotal = listBody.data.total;

    // Dataset has 2 verified users + 1 verified block profile = 3.
    expect(stats.verifiedAgents).toBe(3);
    expect(listTotal).toBe(3);
    expect(stats.verifiedAgents).toBe(listTotal);
  });
});
