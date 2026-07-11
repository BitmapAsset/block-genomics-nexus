/**
 * Agent API tokens — Bearer auth for the per-agent runtime routes
 * (events GET, heartbeat POST, brief POST).
 *
 * A token is a 256-bit cryptographically-random secret. We store only its
 * SHA-256 hash and compare in constant time. bcrypt/argon2 are deliberately NOT
 * used: their slow-hash property defends low-entropy human passwords against
 * brute force; against a 2^256 random space it buys nothing and would add
 * latency on the hot path (heartbeats are ~30s/agent). This mirrors the existing
 * in-repo `monitor-tokens.ts` pattern for GuardianAgent.
 *
 * Token lifecycle is a 3-state machine over (apiKeyHash, apiKeyCreatedAt):
 *   (null,  null)  → legacy   : registered before tokens; tokenless access is
 *                               granted with a deprecation warning (grace path).
 *   (hash,  set )  → active   : a valid `Authorization: Bearer <token>` required.
 *   (null,  set )  → revoked  : a key existed and was revoked; the agent is
 *                               LOCKED (all runtime calls 401) until the owner
 *                               rotates a new key. Revoke never re-opens the
 *                               tokenless grace path.
 *
 * LEGACY GRACE-PATH SUNSET: 2026-08-15. After that date the tokenless `legacy`
 * branch is removed — every agent must present a Bearer token. Prod has 0
 * pre-token agents, so this affects no live agent; the grace path exists only for
 * correctness/back-compat. Tracked in docs/protocol/NEXUS-PROTOCOL-v1.md.
 */

import crypto from 'crypto';

/** Date after which the tokenless legacy grace path is removed (ISO date). */
export const LEGACY_GRACE_SUNSET = '2026-08-15';

const TOKEN_PREFIX = 'bg_agent_';

/** Mint a fresh plaintext token (returned to the owner exactly once). */
export function generateAgentToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
}

/** SHA-256 hash (hex) of a token, for at-rest storage + comparison. */
export function hashAgentToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Mint a token + the row fields to persist it. Used inline at register (atomic create). */
export function mintAgentToken(): { token: string; apiKeyHash: string; apiKeyCreatedAt: Date } {
  const token = generateAgentToken();
  return { token, apiKeyHash: hashAgentToken(token), apiKeyCreatedAt: new Date() };
}

/** Constant-time compare of two SHA-256 hex digests. */
function timingSafeEqualHex(a: string, b: string): boolean {
  let ba: Buffer;
  let bb: Buffer;
  try {
    ba = Buffer.from(a, 'hex');
    bb = Buffer.from(b, 'hex');
  } catch {
    return false;
  }
  // SHA-256 is always 32 bytes; unequal length can't be equal and timingSafeEqual
  // throws on length mismatch, so guard first (the length of the *stored* hash is
  // not secret, so this branch leaks nothing useful).
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

export type AgentTokenState = 'active' | 'legacy' | 'revoked';

type AgentKeyFields = { apiKeyHash: string | null; apiKeyCreatedAt: Date | null };

export function agentTokenState(agent: AgentKeyFields): AgentTokenState {
  if (agent.apiKeyHash) return 'active';
  if (agent.apiKeyCreatedAt) return 'revoked';
  return 'legacy';
}

export interface AgentAuthResult {
  ok: boolean;
  /** true when access was granted through the legacy (tokenless) grace path. */
  legacy: boolean;
  status: number;
  reason?: string;
}

export const LEGACY_TOKEN_WARNING =
  'DEPRECATION: this agent has no API key. Tokenless access is deprecated and will be ' +
  `removed after ${LEGACY_GRACE_SUNSET} — rotate a key via POST /api/v1/agents/{agentId}/token. ` +
  'See docs/protocol/NEXUS-PROTOCOL-v1.md.';

/**
 * Authenticate a runtime request against an agent's key state.
 * - active  → require a valid Bearer token (constant-time).
 * - revoked → always denied until a new key is rotated.
 * - legacy  → granted, `legacy:true` so the caller can attach a deprecation warning.
 */
export function checkAgentToken(agent: AgentKeyFields, authHeader: string | null | undefined): AgentAuthResult {
  const state = agentTokenState(agent);

  if (state === 'active') {
    const token = extractBearerToken(authHeader);
    if (!token) {
      return { ok: false, legacy: false, status: 401, reason: 'Missing Authorization: Bearer <agent token>' };
    }
    const match = timingSafeEqualHex(hashAgentToken(token), agent.apiKeyHash as string);
    return match
      ? { ok: true, legacy: false, status: 200 }
      : { ok: false, legacy: false, status: 401, reason: 'Invalid agent token' };
  }

  if (state === 'revoked') {
    return {
      ok: false,
      legacy: false,
      status: 401,
      reason: 'Agent API token revoked — rotate a new key (POST /api/v1/agents/{agentId}/token)',
    };
  }

  // legacy grace: no key ever issued.
  return { ok: true, legacy: true, status: 200 };
}
