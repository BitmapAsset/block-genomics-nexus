/**
 * The tokenless `legacy` grace path was documented to end on 2026-08-15
 * (LEGACY_GRACE_SUNSET; protocol §5.4). The outside audit of 2026-10-20 asked
 * whether the code actually refuses it after that date. It did not:
 * checkAgentToken granted a key-less agent with no date check at all. These
 * tests pin the sunset: granted (with the deprecation flag) through the sunset
 * day, refused with 401 from the next day on, and refused today.
 */

import { checkAgentToken, LEGACY_GRACE_SUNSET } from '@/lib/agent-tokens';

const legacyAgent = { apiKeyHash: null, apiKeyCreatedAt: null };

describe('legacy grace-path sunset', () => {
  it('is 2026-08-15', () => {
    expect(LEGACY_GRACE_SUNSET).toBe('2026-08-15');
  });

  it('still granted on the sunset day itself (back-compat window, flagged legacy)', () => {
    const r = checkAgentToken(legacyAgent, null, new Date('2026-08-15T23:59:59Z'));
    expect(r).toMatchObject({ ok: true, legacy: true, status: 200 });
  });

  it('refused with 401 from the day after the sunset', () => {
    const r = checkAgentToken(legacyAgent, null, new Date('2026-08-16T00:00:00Z'));
    expect(r.ok).toBe(false);
    expect(r.legacy).toBe(false);
    expect(r.status).toBe(401);
    expect(r.reason).toMatch(/retired on 2026-08-15/);
    expect(r.reason).toMatch(/POST \/api\/v1\/agents\/\{agentId\}\/token/);
  });

  it('refused today (default clock), with or without a stray Authorization header', () => {
    expect(checkAgentToken(legacyAgent, null).status).toBe(401);
    expect(checkAgentToken(legacyAgent, 'Bearer bg_agent_anything').status).toBe(401);
  });

  it('leaves active and revoked agents unchanged', () => {
    const revoked = checkAgentToken({ apiKeyHash: null, apiKeyCreatedAt: new Date() }, null);
    expect(revoked.status).toBe(401);
    expect(revoked.reason).toMatch(/revoked/);
    const active = checkAgentToken({ apiKeyHash: 'ab'.repeat(32), apiKeyCreatedAt: new Date() }, null);
    expect(active.status).toBe(401);
    expect(active.reason).toMatch(/Missing Authorization/);
  });
});
