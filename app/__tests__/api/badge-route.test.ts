/**
 * Tests for src/app/api/v1/badge/[id]/route.ts
 *
 * Covers: valid handle → tier badge, block-height → owner tier, malformed id → 400,
 * unknown id → T0 200, and DB failure → T0 200 (never unhandled 500).
 *
 * The route is a Next.js App Router handler that imports prisma and
 * crownShieldSVGString. We mock both so the test needs no DB or React runtime.
 */

// ── Mocks ────────────────────────────────────────────────────────────────
const mockFindFirst = jest.fn();
const mockFindUnique = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    block: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
  },
}));

jest.mock('@/lib/crown-shield-svg', () => ({
  crownShieldSVGString: (tier: number, verified: boolean, size: number) =>
    `<svg data-tier="${tier}" data-verified="${verified}" data-size="${size}" />`,
}));

// Minimal NextResponse shim: we only need json() + a body/status container.
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
    static json(body: unknown, init?: { status?: number }) {
      const r = new NextResponse(JSON.stringify(body), { status: init?.status ?? 200 });
      r.body = body;
      return r;
    }
    async json() {
      return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
    }
    async text() {
      return typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { GET } from '@/app/api/v1/badge/[id]/route';

// ── Helpers ──────────────────────────────────────────────────────────────
function req() {
  // The route only uses params, not the request object.
  return {} as unknown as import('next/server').NextRequest;
}

async function callBadge(id: string) {
  const res = (await GET(req(), { params: Promise.resolve({ id }) })) as unknown as {
    body: unknown;
    status: number;
    headers: Map<string, string>;
  };
  // For 4xx we return NextResponse.json(...) which stores the parsed object in .body.
  // For 200 we construct new NextResponse(svgString), so .body is a string.
  return {
    status: res.status,
    body: res.body,
    contentType: res.headers.get('Content-Type'),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────
describe('GET /api/v1/badge/[id]', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockFindUnique.mockReset();
  });

  it('returns 400 for empty id', async () => {
    const { status, body } = await callBadge('');
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'Invalid badge ID' });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('returns 400 for illegal characters', async () => {
    const { status, body } = await callBadge('bad id/../etc');
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'Invalid badge ID' });
  });

  it('returns T0 unverified badge for unknown handle (never 500)', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);

    const { status, body, contentType } = await callBadge('does_not_exist');

    expect(status).toBe(200);
    expect(contentType).toBe('image/svg+xml');
    expect(body).toContain('data-tier="0"');
    expect(body).toContain('data-verified="false"');
  });

  it('renders tier badge for a resolved user handle', async () => {
    mockFindFirst.mockResolvedValue({ resolvedTier: 1 });

    const { status, body } = await callBadge('nexus_brain');

    expect(status).toBe(200);
    expect(body).toContain('data-tier="1"');
    expect(body).toContain('data-verified="true"');
  });

  it('renders T0 for a user whose tier has not resolved on-chain', async () => {
    mockFindFirst.mockResolvedValue({ resolvedTier: 0 });

    const { status, body } = await callBadge('unresolved_user');

    expect(status).toBe(200);
    expect(body).toContain('data-tier="0"');
    expect(body).toContain('data-verified="false"');
  });

  it('block-height id ("1") resolves via block.owner.resolvedTier', async () => {
    // No user matches "1"
    mockFindFirst.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({ owner: { resolvedTier: 1 } });

    const { status, body } = await callBadge('1');

    expect(status).toBe(200);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { height: 1 },
      select: { owner: { select: { resolvedTier: true } } },
    });
    expect(body).toContain('data-tier="1"');
    expect(body).toContain('data-verified="true"');
  });

  it('block-height id with no block returns T0 (never 500)', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);

    const { status, body } = await callBadge('1');

    expect(status).toBe(200);
    expect(body).toContain('data-tier="0"');
  });

  it('strips ".svg" suffix from the id before lookup', async () => {
    mockFindFirst.mockResolvedValue({ resolvedTier: 2 });

    const { status, body } = await callBadge('nexus_brain.svg');

    expect(status).toBe(200);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ handle: 'nexus_brain' }, { walletAddress: 'nexus_brain' }] },
      }),
    );
    expect(body).toContain('data-tier="2"');
  });

  it('does NOT surface a 500 when Prisma throws — falls back to T0 unverified', async () => {
    // Silence the expected "[badge] tier lookup failed" log for this case.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindFirst.mockRejectedValue(new Error('DB unreachable'));

    const { status, body, contentType } = await callBadge('any_id');

    expect(status).toBe(200);
    expect(contentType).toBe('image/svg+xml');
    expect(body).toContain('data-tier="0"');
    expect(body).toContain('data-verified="false"');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('rejects absurdly long ids as 400 (defense-in-depth)', async () => {
    const longId = 'a'.repeat(200);
    const { status } = await callBadge(longId);
    expect(status).toBe(400);
  });
});
