/**
 * SSRF guard for owner-supplied outbound endpoints (guardian `llmEndpoint` and
 * `agentEndpoint`).
 *
 * A block owner can point their guardian's LLM at a custom endpoint, and a
 * visitor chatting with that guardian — or the per-block heartbeat — makes the
 * server fetch it. Without a guard that turns "owns one cheap bitmap" into
 * "server-side request to any address the server can reach", with the response
 * reflected back to the chatter (bg48 Q-15). The experience-hosting routes
 * already defend their owner-supplied URLs; this reuses the exact same audited
 * primitives so the two surfaces cannot drift.
 *
 * Posture (identical to experience-probe.ts):
 *   1. `assertSafePublicUrl` — https only, no embedded creds, no localhost/.local,
 *      no private/reserved IP literal (incl. decimal/hex/octal encodings).
 *   2. `hostResolvesPublic` — DNS-resolve the host; EVERY address must be public
 *      unicast, so a public name pointing at an internal IP is refused.
 *   3. The caller fetches with `redirect: 'error'`, so a 3xx cannot bounce the
 *      request toward the internal network. Real LLM endpoints answer 2xx to a
 *      POST and never redirect.
 *
 * Residual risk (documented, not silently ignored): the same narrow
 * TOCTOU / DNS-rebinding window experience-probe.ts calls out — between our DNS
 * check and undici's own resolution. Pinning the resolved IP into the dispatcher
 * is the follow-up hardening; `redirect: 'error'` plus https-only keeps the
 * window small.
 */

import { assertSafePublicUrl } from '@/lib/experience-protocol';
import { hostResolvesPublic } from '@/lib/experience-probe';

export interface OutboundUrlCheck {
  ok: boolean;
  reason?: string;
  /** Normalised URL string to fetch, present only when ok. */
  url?: string;
}

/**
 * Validate an owner-supplied endpoint before the server fetches it.
 *
 * Only https is allowed (LLM/agent APIs are https). Returns a reason on refusal
 * so callers can surface a non-leaky message; never throws.
 */
export async function assertSafeOutboundUrl(raw: unknown): Promise<OutboundUrlCheck> {
  const pre = assertSafePublicUrl(raw);
  if (!pre.ok || !pre.url) return { ok: false, reason: pre.reason ?? 'URL failed SSRF pre-flight' };
  if (pre.url.protocol !== 'https:') {
    return { ok: false, reason: 'endpoint must be https' };
  }
  if (!(await hostResolvesPublic(pre.url.hostname))) {
    return { ok: false, reason: 'endpoint host resolves to a private or unresolvable address' };
  }
  return { ok: true, url: pre.url.toString() };
}
