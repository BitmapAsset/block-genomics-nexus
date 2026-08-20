/**
 * SSRF-safe fetch of a manifest published by a self-hosted experience.
 *
 * Federation means we read a document from a server we do not control, at a URL
 * an untrusted party chose. That is the textbook SSRF setup, so the fetch is
 * bounded on every axis an attacker could push on:
 *
 *   scheme     https only. Not wss (this is a document read, not a socket), and
 *              never http — a downgrade would expose the response to the network.
 *   address    literal private/loopback/link-local IPs rejected synchronously,
 *              then EVERY DNS-resolved address must be public unicast.
 *   redirects  followed manually, at most 3 hops, with both checks re-run per
 *              hop — a public URL cannot bounce us into the internal network.
 *   time       one AbortController budget across the whole chain.
 *   size       the body is read in bounded chunks and aborted past the cap, so a
 *              multi-gigabyte or never-ending response cannot exhaust memory.
 *   type       content-type must be JSON — an HTML error page or a binary blob
 *              is refused before parsing.
 *
 * Residual risk, stated rather than hidden: the same narrow DNS-rebinding TOCTOU
 * window documented in experience-probe.ts applies here — between our resolution
 * and undici's, a hostile resolver could flip the answer. Pinning the resolved
 * address into the dispatcher is the follow-up hardening for both call sites.
 *
 * This fetcher NEVER throws and never returns partial trust: either a parsed
 * JSON document that cleared every guard, or a reason it did not.
 */

import { assertSafePublicUrl, WELL_KNOWN_MANIFEST_PATH } from './experience-protocol';
import { hostResolvesPublic } from './experience-probe';

/** Hard ceiling on a manifest document. A real one is a few hundred bytes. */
export const MANIFEST_MAX_BYTES = 64 * 1024;
/** Whole-operation budget, including redirects. */
export const MANIFEST_FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const FETCH_USER_AGENT = 'BlockGenomicsNexus-ManifestFetch/1.0';

export type ManifestFetchResult =
  | { ok: true; document: Record<string, unknown>; url: string; bytes: number }
  | { ok: false; reason: string };

/**
 * Resolve the well-known manifest URL for an entry URL.
 * `wss://` entries are read over `https://` on the same authority.
 */
export function wellKnownManifestUrl(entryUrl: string): string | null {
  const check = assertSafePublicUrl(entryUrl);
  if (!check.ok || !check.url) return null;
  const url = check.url;
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return null;
  return new URL(WELL_KNOWN_MANIFEST_PATH, url.origin).toString();
}

/** True when `contentType` is JSON (or a `+json` structured suffix). */
function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const type = contentType.split(';')[0].trim().toLowerCase();
  return type === 'application/json' || type === 'text/json' || type.endsWith('+json');
}

/** Read at most `MANIFEST_MAX_BYTES`, aborting the stream past the cap. */
async function readCapped(res: Response): Promise<{ ok: true; text: string; bytes: number } | { ok: false; reason: string }> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MANIFEST_MAX_BYTES) {
    return { ok: false, reason: `manifest exceeds ${MANIFEST_MAX_BYTES} bytes` };
  }

  const body = res.body;
  // No stream (mocked fetch, or an empty body): fall back to text(), still capped.
  if (!body || typeof body.getReader !== 'function') {
    const text = await res.text();
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > MANIFEST_MAX_BYTES) return { ok: false, reason: `manifest exceeds ${MANIFEST_MAX_BYTES} bytes` };
    return { ok: true, text, bytes };
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
      if (total > MANIFEST_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: `manifest exceeds ${MANIFEST_MAX_BYTES} bytes` };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'connection failed while reading manifest' };
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(joined), bytes: total };
}

/**
 * Fetch and parse a remote manifest document. Never throws.
 */
export async function fetchRemoteManifest(rawUrl: string): Promise<ManifestFetchResult> {
  const initial = assertSafePublicUrl(rawUrl);
  if (!initial.ok || !initial.url) {
    return { ok: false, reason: initial.reason ?? 'URL failed SSRF pre-flight' };
  }
  if (initial.url.protocol !== 'https:') {
    return { ok: false, reason: 'manifest URL must be https' };
  }

  let target = initial.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_FETCH_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const safe = assertSafePublicUrl(target.toString());
      if (!safe.ok) return { ok: false, reason: `blocked hop: ${safe.reason}` };
      if (target.protocol !== 'https:') return { ok: false, reason: 'blocked hop: scheme downgraded from https' };
      if (!(await hostResolvesPublic(target.hostname))) {
        return { ok: false, reason: 'host resolves to a private address' };
      }

      let res: Response;
      try {
        res = await fetch(target, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': FETCH_USER_AGENT, accept: 'application/json' },
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

      if (!res.ok) return { ok: false, reason: `host returned HTTP ${res.status}` };
      if (!isJsonContentType(res.headers.get('content-type'))) {
        return { ok: false, reason: 'manifest content-type is not JSON' };
      }

      const read = await readCapped(res);
      if (!read.ok) return { ok: false, reason: read.reason };

      let parsed: unknown;
      try {
        parsed = JSON.parse(read.text);
      } catch {
        return { ok: false, reason: 'manifest is not valid JSON' };
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, reason: 'manifest must be a JSON object' };
      }

      return { ok: true, document: parsed as Record<string, unknown>, url: target.toString(), bytes: read.bytes };
    }
    return { ok: false, reason: 'too many redirects' };
  } catch (e: unknown) {
    const reason = e instanceof Error && e.name === 'AbortError' ? 'manifest fetch timed out' : 'manifest fetch error';
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
