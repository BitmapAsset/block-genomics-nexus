/**
 * ISOLATED SIMULATION — the ownership gate's DECISION layer (lib/ownership-gate.ts).
 *
 * This is the rule that separates "an agent connected" from "an agent may act".
 * Both seams the gate depends on are injected here — session lookup and the
 * on-chain check — so every branch is provable without a database or a live
 * indexer, the same way the durable-limiter suite proves its decision layer.
 *
 * The cases that matter are the refusals. A gate that grants correctly but also
 * grants a transferred bitmap, an expired token, or a block the caller never
 * proved is not a gate. Each of those is asserted to fail CLOSED, and the
 * indexer-outage case is asserted to be retryable (503) rather than either a
 * grant or a permanent denial.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));

import {
  requireVerifiedBlock,
  gateDenialResponse,
  type GateResult,
} from '@/lib/ownership-gate';
import {
  hashSessionToken,
  sessionCoversBlock,
  looksLikeSessionToken,
  generateSessionToken,
  sessionTokenPrefix,
  VERIFIED_TOKEN_PREFIX,
  type VerifiedSessionRecord,
} from '@/lib/verified-sessions';
import type { OwnershipCheck } from '@/lib/onchain/bitmap-ownership';

const WALLET = 'bc1pownerwalletaddressexample';
const OTHER_WALLET = 'bc1psomeoneelseentirely';
const OWNED_BLOCK = 840000;
const UNOWNED_BLOCK = 999111;
const NOW = 1_800_000_000_000;

const TOKEN = `${VERIFIED_TOKEN_PREFIX}${'a'.repeat(64)}`;

/** A live session record, overridable per case. */
function session(overrides: Partial<VerifiedSessionRecord> = {}): VerifiedSessionRecord {
  return {
    id: 'sess_1',
    tokenHash: hashSessionToken(TOKEN),
    tokenPrefix: sessionTokenPrefix(TOKEN),
    walletAddress: WALLET,
    verifiedBlocks: [OWNED_BLOCK],
    createdAt: new Date(NOW - 1000),
    expiresAt: new Date(NOW + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

const req = (token?: string | null) =>
  ({ headers: { get: (n: string) => (n.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) } });

/** Gate driver with both seams injected. */
function gate(
  opts: {
    token?: string | null;
    record?: VerifiedSessionRecord | null;
    onchain?: OwnershipCheck;
    blockHeight?: number;
    now?: number;
  } = {}
): Promise<GateResult> {
  return requireVerifiedBlock(req(opts.token === undefined ? TOKEN : opts.token), opts.blockHeight ?? OWNED_BLOCK, {
    now: opts.now ?? NOW,
    lookup: async () => (opts.record === undefined ? session() : opts.record),
    verifyOwnership: async () => opts.onchain ?? { verified: true },
  });
}

describe('SIM: ownership gate — grants', () => {
  it('allows a live session writing to a block it proved and still holds', async () => {
    const res = await gate();
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.walletAddress).toBe(WALLET);
  });

  it('attributes the action to the SESSION wallet, never to request-supplied data', async () => {
    const res = await gate({ record: session({ walletAddress: OTHER_WALLET }) });
    expect(res.ok).toBe(true);
    // The caller cannot influence this: it comes from the authenticated session.
    expect(res.walletAddress).toBe(OTHER_WALLET);
  });

  it('passes the target block to the on-chain check, not just any owned block', async () => {
    const seen: Array<[string, number]> = [];
    await requireVerifiedBlock(req(TOKEN), OWNED_BLOCK, {
      now: NOW,
      lookup: async () => session({ verifiedBlocks: [OWNED_BLOCK, 700000] }),
      verifyOwnership: async (w, h) => {
        seen.push([w, h]);
        return { verified: true };
      },
    });
    expect(seen).toEqual([[WALLET, OWNED_BLOCK]]);
  });
});

describe('SIM: ownership gate — identity refusals', () => {
  it('refuses an anonymous caller and explains how to verify', async () => {
    const res = await gate({ token: null });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.code).toBe('unverified');

    const denial = gateDenialResponse(res) as unknown as { body: any };
    expect(denial.body.verify.steps.join(' ')).toContain('/api/v1/session/start');
  });

  it('refuses a token of the wrong kind (agent token is not a session token)', async () => {
    const res = await gate({ token: 'bg_agent_deadbeef' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.code).toBe('unverified');
  });

  it('refuses a well-formed token that matches no session', async () => {
    const res = await gate({ record: null });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('refuses an EXPIRED token even though its scope still names the block', async () => {
    const res = await gate({ record: session({ expiresAt: new Date(NOW - 1) }) });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.reason).toMatch(/expired/i);
  });

  it('refuses a REVOKED token immediately, before its expiry', async () => {
    const res = await gate({ record: session({ revokedAt: new Date(NOW - 5000) }) });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.reason).toMatch(/revoked/i);
  });

  it('refuses a token whose stored hash does not match the presented secret', async () => {
    // A row fetched for this token hash but carrying a different hash must not
    // authenticate — the constant-time comparison is the real check.
    const res = await gate({ record: session({ tokenHash: hashSessionToken('bg_vfy_something_else') }) });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });
});

describe('SIM: ownership gate — scope refusals', () => {
  it('refuses a block the session never proved (scope escape)', async () => {
    const res = await gate({ blockHeight: UNOWNED_BLOCK });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.code).toBe('out_of_scope');
  });

  it('never consults the chain for an out-of-scope block', async () => {
    let called = false;
    await requireVerifiedBlock(req(TOKEN), UNOWNED_BLOCK, {
      now: NOW,
      lookup: async () => session(),
      verifyOwnership: async () => {
        called = true;
        return { verified: true };
      },
    });
    // Scope is checked first, so a scope miss costs no indexer traffic — and an
    // on-chain "yes" cannot rescue a block the session never claimed.
    expect(called).toBe(false);
  });

  it('refuses even when the chain says the wallet owns the out-of-scope block', async () => {
    const res = await gate({ blockHeight: UNOWNED_BLOCK, onchain: { verified: true } });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('out_of_scope');
  });

  it('refuses every block for a session that proved none', async () => {
    const res = await gate({ record: session({ verifiedBlocks: [] }) });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('out_of_scope');
    expect(res.reason).toContain('none');
  });

  it.each([
    ['a negative height', -1],
    ['a fractional height', 1.5],
    ['NaN', Number.NaN],
  ])('rejects %s as a bad request', async (_label, height) => {
    const res = await gate({ blockHeight: height as number });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('bad_request');
  });
});

describe('SIM: ownership gate — live chain refusals', () => {
  it('refuses a TRANSFERRED bitmap even though the token is live and in scope', async () => {
    // The exact failure the action-time re-check exists to catch: verification
    // happened while the wallet owned the block, and it has since been sold.
    const res = await gate({
      onchain: { verified: false, reason: 'Inscription is not held by this wallet' },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.code).toBe('ownership_lost');
    expect(res.reason).toContain('no longer held');
  });

  it('returns a retryable 503 when no indexer can answer, and does NOT grant', async () => {
    const res = await gate({ onchain: { verified: false, unavailable: true } });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(res.code).toBe('onchain_unavailable');

    const denial = gateDenialResponse(res) as unknown as { headers: Map<string, string> };
    expect(denial.headers.get('Retry-After')).toBe('15');
  });

  it('treats an unavailable indexer as a refusal, never as a silent pass', async () => {
    for (const onchain of [
      { verified: false, unavailable: true },
      { verified: false, reason: 'nope' },
    ] as OwnershipCheck[]) {
      expect((await gate({ onchain })).ok).toBe(false);
    }
  });

  it('re-checks the chain on EVERY call rather than trusting the first answer', async () => {
    let calls = 0;
    const drive = () =>
      requireVerifiedBlock(req(TOKEN), OWNED_BLOCK, {
        now: NOW,
        lookup: async () => session(),
        verifyOwnership: async () => {
          calls += 1;
          // Ownership is lost partway through the session's lifetime.
          return calls < 3 ? { verified: true } : { verified: false, reason: 'sold' };
        },
      });

    expect((await drive()).ok).toBe(true);
    expect((await drive()).ok).toBe(true);
    expect((await drive()).ok).toBe(false);
    expect(calls).toBe(3);
  });
});

describe('session token primitives', () => {
  it('mints a distinctly-prefixed 256-bit token', () => {
    const token = generateSessionToken();
    expect(token.startsWith(VERIFIED_TOKEN_PREFIX)).toBe(true);
    expect(token).toHaveLength(VERIFIED_TOKEN_PREFIX.length + 64);
    expect(looksLikeSessionToken(token)).toBe(true);
    // Distinct from the other credential kinds so the tier is obvious on sight.
    expect(looksLikeSessionToken('bg_agent_x')).toBe(false);
    expect(looksLikeSessionToken('bg_sbx_x')).toBe(false);
  });

  it('never repeats a token', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    expect(tokens.size).toBe(200);
  });

  it('exposes only a non-secret fragment as the prefix', () => {
    const token = generateSessionToken();
    const prefix = sessionTokenPrefix(token);
    expect(token.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(token.length);
    // The stored hash must not be derivable from what we display.
    expect(hashSessionToken(token)).not.toContain(prefix);
  });

  it('scopes strictly by exact integer block height', () => {
    const s = session({ verifiedBlocks: [1, 2, 840000] });
    expect(sessionCoversBlock(s, 840000)).toBe(true);
    expect(sessionCoversBlock(s, 840001)).toBe(false);
    expect(sessionCoversBlock(s, 1.0)).toBe(true);
    expect(sessionCoversBlock(s, 1.5)).toBe(false);
    expect(sessionCoversBlock(s, Number.NaN)).toBe(false);
  });
});
