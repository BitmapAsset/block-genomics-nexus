/**
 * `DELETE /api/v1/session` — the route behind the `bg_session_revoke` MCP tool.
 *
 * On production a forged `bg_vfy_…` string reached the revoke query and the
 * resulting exception came back as 500 "Internal server error" — an
 * unauthenticated caller turning a bad credential into a server fault. A token
 * that could never have been minted is now refused with a 401 before the
 * database is asked anything.
 *
 * The idempotent branch is pinned too: a WELL-FORMED but unknown token still
 * answers 200 `revoked:false`, because reporting "no such session" would turn
 * this endpoint into an oracle for which tokens exist.
 */

const mockUpdateMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { verifiedSession: { updateMany: (...a: unknown[]) => mockUpdateMany(...(a as [])) } },
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
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init?.status ?? 200, init?.headers ?? {});
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { DELETE } from '@/app/api/v1/session/route';
import { VERIFIED_TOKEN_PREFIX } from '@/lib/verified-sessions';

/* eslint-disable @typescript-eslint/no-explicit-any */

const WELL_FORMED = VERIFIED_TOKEN_PREFIX + 'a'.repeat(64);

const call = (auth?: string) =>
  DELETE({
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' && auth ? `Bearer ${auth}` : null) },
  } as any) as any;

beforeEach(() => {
  mockUpdateMany.mockReset().mockResolvedValue({ count: 0 });
});

describe('forged credentials', () => {
  it.each([
    ['the bare prefix', VERIFIED_TOKEN_PREFIX],
    ['a short stand-in', 'bg_vfy_forged'],
    ['a non-hex body', VERIFIED_TOKEN_PREFIX + 'z'.repeat(64)],
  ])('answers 401 for %s and never queries', async (_label, token) => {
    const res = await call(token);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Invalid session token' });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('answers 401 when no credential is sent', async () => {
    expect((await call()).status).toBe(401);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe('real credentials', () => {
  it('stays idempotent for a well-formed token that is unknown or already revoked', async () => {
    const res = await call(WELL_FORMED);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { revoked: false } });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('revokes a live session', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const res = await call(WELL_FORMED);

    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(true);
  });
});
