/**
 * `GET /api/v1/game/state` stores nothing.
 *
 * A read answers the stored row, or the same shape with default values when
 * there is none, without writing. A `wallet` that is not a Bitcoin address is
 * a 400 before any database call. POST is unchanged and not exercised here.
 */

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number }) {
      return new NextResponse(body, init);
    }
  }
  return { NextResponse, NextRequest: class {} };
});

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
}));

const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
jest.mock('@/lib/prisma', () => {
  const client = {
    gameState: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      upsert: jest.fn(),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

import { GET } from '@/app/api/v1/game/state/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const WALLET = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';

function get(query: string): Promise<any> {
  const url = `http://test.local/api/v1/game/state?${query}`;
  return GET({ url, nextUrl: new URL(url), headers: { get: () => null } } as never) as Promise<any>;
}

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue(null);
  mockCreate.mockReset().mockImplementation(async ({ data }: any) => ({ id: 'row_1', ...data }));
});

describe('GET /api/v1/game/state', () => {
  it('with no stored row: 200 with default values, and nothing created', async () => {
    const res = await get(`blockHeight=840000&wallet=${WALLET}`);
    expect(res.status).toBe(200);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      state: {
        id: null,
        blockHeight: 840000,
        walletAddress: WALLET,
        score: 0,
        xp: 0,
        level: 1,
        coins: 0,
        collected: null,
        questProgress: null,
        achievements: null,
        inventory: null,
        totalTimeMs: 0,
        lastVisit: null,
        createdAt: null,
        updatedAt: null,
      },
    });
  });

  it('refuses a wallet that is not a Bitcoin address with 400 and no database call', async () => {
    const res = await get('blockHeight=840000&wallet=x');
    expect(res.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('with a stored row: returns it as before', async () => {
    const row = { id: 'row_9', blockHeight: 840000, walletAddress: WALLET, score: 12 };
    mockFindUnique.mockResolvedValue(row);
    const res = await get(`blockHeight=840000&wallet=${WALLET}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: row });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('still refuses a missing height with 400', async () => {
    const res = await get(`wallet=${WALLET}`);
    expect(res.status).toBe(400);
  });
});
