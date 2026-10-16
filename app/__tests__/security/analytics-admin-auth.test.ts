/**
 * bg56 E2E-05 — `/api/v1/analytics` returned the full admin dashboard (user
 * counts, sessions, top searches, top pages) to anyone who passed
 * `?wallet=<an admin address>`. A wallet address is public (on-chain and in
 * `/users/list`), so that was authorization by a known string, not
 * authentication.
 *
 * Fix: require a VERIFIED SESSION (bg_vfy_, proving BIP-322 control) whose wallet
 * is in ADMIN_WALLETS. The query param is ignored.
 */

const ADMIN = 'bc1padmin00000000000000000000000000000000000000';
const NON_ADMIN = 'bc1pnobody0000000000000000000000000000000000000';

const ADMIN_SESSION = 'bg_vfy_' + 'a'.repeat(64);
const NONADMIN_SESSION = 'bg_vfy_' + 'b'.repeat(64);

process.env.ADMIN_WALLETS = ADMIN;

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      async json() {
        return body;
      },
    }),
  },
}));

// The analytics aggregates must never run unless auth passes; a bare object is
// enough because a reached query would throw (surfacing an auth bypass as noise
// rather than a silent 200).
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));

import { hashSessionToken, type VerifiedSessionRecord } from '@/lib/verified-sessions';

const sessions = new Map<string, VerifiedSessionRecord>();
function addSession(token: string, walletAddress: string) {
  const tokenHash = hashSessionToken(token);
  sessions.set(tokenHash, {
    id: `s_${token.slice(-3)}`,
    tokenHash,
    tokenPrefix: token.slice(0, 15),
    walletAddress,
    verifiedBlocks: [],
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
  });
}
addSession(ADMIN_SESSION, ADMIN);
addSession(NONADMIN_SESSION, NON_ADMIN);

jest.mock('@/lib/verified-sessions', () => {
  const actual = jest.requireActual('@/lib/verified-sessions');
  return {
    ...actual,
    authenticateSession: async (token: string | null | undefined) => {
      if (!actual.looksLikeSessionToken(token)) return { ok: false, status: 401 };
      const rec = sessions.get(actual.hashSessionToken(token));
      return rec ? { ok: true, status: 200, session: rec } : { ok: false, status: 401 };
    },
  };
});

import { GET } from '@/app/api/v1/analytics/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
function reqWith(headers: Record<string, string>, query = '') {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (n: string) => lower[n.toLowerCase()] ?? null },
    nextUrl: { searchParams: new URLSearchParams(query) },
  } as any;
}

describe('bg56 E2E-05: analytics requires a verified admin session', () => {
  it('401 with no session, even when ?wallet= names a real admin', async () => {
    const res: any = await GET(reqWith({}, `wallet=${ADMIN}`));
    expect(res.status).toBe(401);
  });

  it('403 for a verified session whose wallet is not an admin', async () => {
    const res: any = await GET(reqWith({ authorization: `Bearer ${NONADMIN_SESSION}` }, `wallet=${ADMIN}`));
    expect(res.status).toBe(403);
  });

  it('a forged admin wallet in the query param does not help without a session', async () => {
    const res: any = await GET(reqWith({ 'x-bg-session': 'bg_vfy_' + 'f'.repeat(64) }, `wallet=${ADMIN}`));
    expect(res.status).toBe(401);
  });
});
