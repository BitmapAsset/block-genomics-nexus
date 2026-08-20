/**
 * Allowlisted, SSRF-safe JSON reader for marketplace venues.
 *
 * This is the federation lane's discipline (`experience-manifest-fetch.ts`) with
 * one deliberate tightening. Federation reads a URL an untrusted party chose, so
 * it can only *deny* — reject private addresses and hope the public internet is
 * fine. This lane knows every host it will ever talk to before it starts, so it
 * *allows*: the request must be aimed at a hostname the adapter declared, and a
 * redirect to any other host is refused rather than followed.
 *
 * That inversion is worth the extra code. Federation's model can be walked
 * somewhere unintended by a hostile redirect chain that stays technically
 * public; an allowlist cannot, because "public" was never the test.
 *
 * Bounded on every axis, same as federation:
 *
 *   scheme     https only — never http, and not wss (this is a document read).
 *   host       must be an exact case-insensitive match in the adapter allowlist.
 *   address    literal private/loopback/link-local IPs rejected synchronously,
 *              then every DNS-resolved address must be public unicast. An
 *              allowlisted hostname whose DNS answer points inside the network
 *              is still refused — allowlisting a name is not trusting its owner's
 *              resolver.
 *   redirects  followed manually, at most 2 hops, re-validated against the same
 *              allowlist per hop.
 *   time       one AbortController budget across the whole chain.
 *   size       body read in bounded chunks, aborted past the cap.
 *   type       content-type must be JSON.
 *
 * Residual risk, stated rather than hidden: the same DNS-rebinding TOCTOU window
 * documented in `experience-probe.ts` applies here — between our resolution and
 * undici's, a hostile resolver could flip the answer. The allowlist narrows the
 * blast radius (an attacker must first control DNS for a host we shipped in the
 * source) but does not close the window. Pinning the resolved address into the
 * dispatcher remains the follow-up hardening for all three call sites.
 *
 * Never throws. Returns parsed JSON that cleared every guard, or a reason.
 */

import { assertSafePublicUrl } from '@/lib/experience-protocol';
import { hostResolvesPublic } from '@/lib/experience-probe';

/** Hard ceiling on a venue response. Real ones are a few KB. */
export const VENUE_MAX_BYTES = 256 * 1024;
/** Whole-operation budget, including redirects. */
export const VENUE_FETCH_TIMEOUT_MS = 4000;
/**
 * Two hops. A venue API redirecting at all is unusual; more than twice is a
 * venue that has lost track of its own routing, and we are not obliged to chase
 * it while a page render waits.
 */
const MAX_REDIRECTS = 2;
const FETCH_USER_AGENT = 'BlockGenomicsNexus-MarketFetch/1.0';

export type VenueFetchResult =
  | { ok: true; body: unknown; status: number }
  | { ok: false; reason: string };

/** True when `contentType` is JSON (or a `+json` structured suffix). */
function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const type = contentType.split(';')[0].trim().toLowerCase();
  return type === 'application/json' || type === 'text/json' || type.endsWith('+json');
}

/** True when `hostname` is an exact (case-insensitive) member of `allowedHosts`. */
export function hostIsAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  // Exact match only. No suffix matching: `evil-magiceden.us` and
  // `magiceden.us.attacker.com` both end or start with an allowlisted string,
  // and a suffix rule would wave at least one of them through.
  return allowedHosts.some((allowed) => allowed.toLowerCase() === host);
}

/** Read at most `VENUE_MAX_BYTES`, aborting the stream past the cap. */
async function readCapped(
  res: Response
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > VENUE_MAX_BYTES) {
    return { ok: false, reason: `venue response exceeds ${VENUE_MAX_BYTES} bytes` };
  }

  const body = res.body;
  // No stream (mocked fetch, or an empty body): fall back to text(), still capped.
  if (!body || typeof body.getReader !== 'function') {
    const text = await res.text();
    if (new TextEncoder().encode(text).length > VENUE_MAX_BYTES) {
      return { ok: false, reason: `venue response exceeds ${VENUE_MAX_BYTES} bytes` };
    }
    return { ok: true, text };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > VENUE_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: `venue response exceeds ${VENUE_MAX_BYTES} bytes` };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'connection failed while reading venue response' };
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(joined) };
}

/**
 * GET a JSON document from an allowlisted venue host.
 *
 * @param rawUrl - Absolute https URL, host must be in `allowedHosts`.
 * @param allowedHosts - The calling adapter's declared hostnames.
 * @param headers - Extra request headers (e.g. a venue API key).
 */
export async function fetchVenueJson(
  rawUrl: string,
  allowedHosts: readonly string[],
  headers: Record<string, string> = {}
): Promise<VenueFetchResult> {
  if (allowedHosts.length === 0) {
    return { ok: false, reason: 'venue declared no allowed hosts' };
  }

  const initial = assertSafePublicUrl(rawUrl);
  if (!initial.ok || !initial.url) {
    return { ok: false, reason: initial.reason ?? 'URL failed SSRF pre-flight' };
  }
  if (initial.url.protocol !== 'https:') {
    return { ok: false, reason: 'venue URL must be https' };
  }
  if (!hostIsAllowed(initial.url.hostname, allowedHosts)) {
    return { ok: false, reason: 'venue host is not allowlisted' };
  }

  let target = initial.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VENUE_FETCH_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const safe = assertSafePublicUrl(target.toString());
      if (!safe.ok) return { ok: false, reason: `blocked hop: ${safe.reason}` };
      if (target.protocol !== 'https:') {
        return { ok: false, reason: 'blocked hop: scheme downgraded from https' };
      }
      // Re-checked per hop, not just on entry: this is the guard that makes a
      // redirect chain unable to walk us off the allowlist.
      if (!hostIsAllowed(target.hostname, allowedHosts)) {
        return { ok: false, reason: 'blocked hop: venue host is not allowlisted' };
      }
      if (!(await hostResolvesPublic(target.hostname))) {
        return { ok: false, reason: 'venue host resolves to a private address' };
      }

      let res: Response;
      try {
        res = await fetch(target, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': FETCH_USER_AGENT, accept: 'application/json', ...headers },
        });
      } catch {
        return { ok: false, reason: 'connection failed' };
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return { ok: false, reason: 'redirect without a location' };
        let next: URL;
        try {
          next = new URL(location, target);
        } catch {
          return { ok: false, reason: 'malformed redirect target' };
        }
        target = next;
        continue;
      }

      if (!res.ok) return { ok: false, reason: `venue returned HTTP ${res.status}` };
      if (!isJsonContentType(res.headers.get('content-type'))) {
        return { ok: false, reason: 'venue content-type is not JSON' };
      }

      const read = await readCapped(res);
      if (!read.ok) return { ok: false, reason: read.reason };

      let parsed: unknown;
      try {
        parsed = JSON.parse(read.text);
      } catch {
        return { ok: false, reason: 'venue response is not valid JSON' };
      }

      return { ok: true, body: parsed, status: res.status };
    }
    return { ok: false, reason: 'too many redirects' };
  } catch (e: unknown) {
    const reason =
      e instanceof Error && e.name === 'AbortError' ? 'venue fetch timed out' : 'venue fetch error';
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
