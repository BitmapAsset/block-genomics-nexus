/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The two block routes return a block's row without its four stream columns.
 *
 * A stream is shown only through the livestream routes, which apply the rule
 * of lib/stream-visibility.ts (the starter holds the block, for 12 hours). A
 * block route that returned the whole row would hand out the link and the
 * starter's wallet of a stream that rule hides.
 */

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockGetBlockHashAtHeight = jest.fn();

jest.mock('@/lib/prisma', () => {
  const client = {
    block: {
      findUnique: (...a: unknown[]) => mockFindUnique(...(a as [])),
      update: (...a: unknown[]) => mockUpdate(...(a as [])),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  PUBLIC_READ_LIMIT: 120,
}));

jest.mock('@/lib/sandbox-keys', () => ({
  sandboxGate: async () => ({ response: null, headers: {}, authenticated: false }),
}));

jest.mock('@/lib/onchain/esplora', () => ({
  getBlockHashAtHeight: (...a: unknown[]) => mockGetBlockHashAtHeight(...(a as [])),
}));

jest.mock('next/server', () => {
  class NextResponse {
    constructor(
      public body: unknown,
      public status: number,
      public headers: Record<string, string>,
    ) {}
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init?.status ?? 200, init?.headers ?? {});
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { GET as GET_V1 } from '@/app/api/v1/blocks/[height]/route';
import { GET as GET_LEGACY } from '@/app/api/v1/block/[height]/route';

const STREAM_KEYS = ['streamUrl', 'streamType', 'streamStartedAt', 'streamOwner'];

const row = () => ({
  height: 840000,
  hash: 'ab'.repeat(32),
  ownerAddress: null,
  owner: null,
  _count: { parcels: 0 },
  streamUrl: 'https://www.twitch.tv/somechannel',
  streamType: 'broadcast',
  streamStartedAt: new Date(),
  streamOwner: 'bc1pmadeup000000000000000000000000000000000000000000000000000',
});

const req = () => ({ headers: { get: () => null } }) as any;
const params = () => ({ params: Promise.resolve({ height: '840000' }) });

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpdate.mockReset().mockResolvedValue({});
  mockGetBlockHashAtHeight.mockReset().mockResolvedValue(null);
});

it('B1 GET_V1 for 840000', async () => {
  mockFindUnique.mockResolvedValue(row());
  const res: any = await GET_V1(req(), params());
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveProperty('hash');
  for (const k of STREAM_KEYS) expect(Object.keys(res.body.data)).not.toContain(k);
});

it('B2 GET_LEGACY for 840000', async () => {
  mockFindUnique.mockResolvedValue(row());
  const res: any = await GET_LEGACY(req(), params());
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveProperty('height');
  for (const k of STREAM_KEYS) expect(Object.keys(res.body.data)).not.toContain(k);
});
