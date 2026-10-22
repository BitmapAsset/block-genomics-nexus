/**
 * `GET /api/v1/elements` — the read behind the `bg_world_elements` MCP tool
 * (QA scorecard 2026-10-22 row #1). The read moved here from its previous path;
 * that path keeps answering with a 308 so block-genomics-mcp@0.2.1 still works.
 */

const mockFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { gameElement: { findMany: (...a: unknown[]) => mockFindMany(...(a as [])) } },
}));

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
}));

jest.mock('next/server', () => {
  class NextResponse {
    constructor(
      public body: unknown,
      public status: number,
      public headers: Record<string, string>,
    ) {}
    static json(body: unknown, init?: { status?: number }) {
      return new NextResponse(body, init?.status ?? 200, {});
    }
    static redirect(url: URL, status: number) {
      return new NextResponse(null, status, { location: url.toString() });
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { GET } from '@/app/api/v1/elements/route';
import { GET as LEGACY_GET } from '@/app/api/v1/game/elements/route';
import { INVALID_BLOCK_HEIGHT_MESSAGE } from '@/lib/block-height';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = (url: string) => {
  const u = new URL(url);
  return { url, nextUrl: { search: u.search, searchParams: u.searchParams } } as any;
};

describe('GET /api/v1/elements', () => {
  beforeEach(() => mockFindMany.mockReset());

  it('lists the enabled elements of one block in creation order', async () => {
    mockFindMany.mockResolvedValue([{ id: 'e1' }]);
    const res: any = await GET(req('https://blockgenomics.io/api/v1/elements?blockHeight=840000'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ elements: [{ id: 'e1' }] });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { blockHeight: 840000, enabled: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('rejects an invalid height with 400', async () => {
    const res: any = await GET(req('https://blockgenomics.io/api/v1/elements?blockHeight=abc'));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: INVALID_BLOCK_HEIGHT_MESSAGE });
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

describe('previous read path', () => {
  it('answers 308 to /api/v1/elements and keeps the query string', async () => {
    const res: any = LEGACY_GET(req('https://blockgenomics.io/api/v1/game/elements?blockHeight=840000'));
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('https://blockgenomics.io/api/v1/elements?blockHeight=840000');
  });
});
