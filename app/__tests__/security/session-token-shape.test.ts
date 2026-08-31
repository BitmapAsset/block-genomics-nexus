/**
 * Unmintable session tokens are refused before any I/O.
 *
 * The live endpoint treated the seven characters `bg_vfy_` as a credential worth
 * looking up. Three things followed from that, all visible on production:
 *
 *   - any caller could aim a database round trip at an unauthenticated path by
 *     guessing a seven-byte prefix;
 *   - when that lookup failed, the fail-closed branch reported 503 "Session
 *     verification temporarily unavailable", so a forged token read as *our*
 *     outage rather than *their* bad credential;
 *   - `DELETE /api/v1/session` had no shape check at all, so the same forged
 *     token surfaced as a 500 on an unauthenticated route.
 *
 * A token is `bg_vfy_` plus 32 random bytes in hex. Anything else was never
 * issued here and is answered 401 without asking the database.
 */

import {
  authenticateSession,
  generateSessionToken,
  hashSessionToken,
  looksLikeSessionToken,
  revokeSession,
  VERIFIED_TOKEN_PREFIX,
} from '@/lib/verified-sessions';

const WELL_FORMED = VERIFIED_TOKEN_PREFIX + 'a'.repeat(64);

describe('looksLikeSessionToken', () => {
  it('accepts what generateSessionToken emits', () => {
    expect(looksLikeSessionToken(generateSessionToken())).toBe(true);
    expect(looksLikeSessionToken(WELL_FORMED)).toBe(true);
  });

  it.each([
    ['the bare prefix', VERIFIED_TOKEN_PREFIX],
    ['a short stand-in', 'bg_vfy_notarealtoken'],
    ['one byte short', VERIFIED_TOKEN_PREFIX + 'a'.repeat(63)],
    ['one byte long', VERIFIED_TOKEN_PREFIX + 'a'.repeat(65)],
    ['uppercase hex', VERIFIED_TOKEN_PREFIX + 'A'.repeat(64)],
    ['non-hex body', VERIFIED_TOKEN_PREFIX + 'z'.repeat(64)],
    ['a trailing newline', WELL_FORMED + '\n'],
    ['a different credential class', 'bg_sbx_' + 'a'.repeat(64)],
    ['empty', ''],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, token) => {
    expect(looksLikeSessionToken(token as string | null | undefined)).toBe(false);
  });
});

describe('authenticateSession', () => {
  it('answers 401 for a forged token without touching the database', async () => {
    const lookup = jest.fn();

    const res = await authenticateSession(VERIFIED_TOKEN_PREFIX, { lookup });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.code).toBe('invalid_token');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports a missing credential as missing, not invalid', async () => {
    const res = await authenticateSession(null, { lookup: jest.fn() });

    expect(res.status).toBe(401);
    expect(res.code).toBe('missing_token');
    expect(res.reason).toContain('/api/v1/session/start');
  });

  it('still fails closed with a 503 when a WELL-FORMED token cannot be looked up', async () => {
    // The 503 exists for a real outage. Narrowing the shape check must not
    // remove it, or a database blip would start admitting callers.
    const lookup = jest.fn().mockRejectedValue(new Error('connection refused'));

    const res = await authenticateSession(WELL_FORMED, { lookup });

    expect(res.status).toBe(503);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('answers 401 for a well-formed token that was never issued', async () => {
    const lookup = jest.fn().mockResolvedValue(null);

    const res = await authenticateSession(WELL_FORMED, { lookup });

    expect(res.status).toBe(401);
    expect(res.code).toBe('invalid_token');
  });

  it('accepts a live session', async () => {
    const token = generateSessionToken();
    const lookup = jest.fn().mockResolvedValue({
      id: 's1',
      tokenHash: hashSessionToken(token),
      tokenPrefix: token.slice(0, 15),
      walletAddress: 'bc1qexample',
      verifiedBlocks: [840000],
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    });

    const res = await authenticateSession(token, { lookup });

    expect(res.ok).toBe(true);
    expect(res.session?.walletAddress).toBe('bc1qexample');
  });
});

describe('revokeSession', () => {
  it('refuses a forged token without reaching Prisma', async () => {
    // No prisma mock is installed in this suite, so a call through to the client
    // would throw — which is exactly the 500 this guard removes.
    await expect(revokeSession(VERIFIED_TOKEN_PREFIX)).resolves.toBe(false);
    await expect(revokeSession('bg_vfy_notarealtoken')).resolves.toBe(false);
  });
});
