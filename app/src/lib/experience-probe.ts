/**
 * SSRF-safe server-side health probe for hosted experiences.
 *
 * The probe target is an owner-supplied URL, so it is treated as hostile:
 *   1. scheme/host are re-validated synchronously (experience-protocol guards);
 *   2. the hostname is DNS-resolved and EVERY resolved address must be public —
 *      a name that resolves into a private/link-local/loopback range is refused;
 *   3. redirects are followed manually, re-validating (1)+(2) at every hop, so a
 *      public URL cannot bounce the probe into the internal network;
 *   4. the whole operation is bounded by a 5s AbortController timeout.
 *
 * Residual risk (documented, not silently ignored): between our DNS check and
 * undici's own resolution there is a narrow TOCTOU/DNS-rebinding window. A v1
 * backend accepts this; pinning the resolved IP into the dispatcher is the
 * follow-up hardening.
 */

import net from 'net';
import dns from 'dns/promises';
import {
  assertSafePublicUrl,
  isPrivateIp,
  mapProbeStatus,
  PROBE_TIMEOUT_MS,
  type ExperienceStatus,
} from './experience-protocol';

const MAX_REDIRECTS = 3;
const PROBE_USER_AGENT = 'BlockGenomicsNexus-ExperienceProbe/1.0';

export interface ProbeResult {
  status: ExperienceStatus;
  reachable: boolean;
  latencyMs: number;
  httpStatus?: number;
  reason?: string;
}

/** Every resolved address for `hostname` must be public unicast. */
async function hostResolvesPublic(hostname: string): Promise<boolean> {
  if (net.isIP(hostname) !== 0) return !isPrivateIp(hostname);
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    return false; // NXDOMAIN / resolver failure ⇒ not reachable
  }
  if (!addrs.length) return false;
  return addrs.every((a) => !isPrivateIp(a.address));
}

/** wss:// health targets are probed over https:// on the same authority+path. */
function toProbeUrl(raw: string): URL | null {
  const check = assertSafePublicUrl(raw);
  if (!check.ok || !check.url) return null;
  const url = check.url;
  if (url.protocol === 'wss:') url.protocol = 'https:';
  return url;
}

/**
 * Probe `rawUrl` and map the outcome to an experience status.
 * Never throws — a caller can always persist the returned status.
 */
export async function probeExperienceUrl(rawUrl: string): Promise<ProbeResult> {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);

  let target = toProbeUrl(rawUrl);
  if (!target) {
    return { status: 'unreachable', reachable: false, latencyMs: 0, reason: 'URL failed SSRF pre-flight' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Re-validate the current hop (defends against a redirect chain that walks
      // toward the internal network or downgrades the scheme).
      const safe = assertSafePublicUrl(target.toString());
      if (!safe.ok) {
        return { status: 'unreachable', reachable: false, latencyMs: elapsed(), reason: `blocked hop: ${safe.reason}` };
      }
      if (!(await hostResolvesPublic(target.hostname))) {
        return { status: 'unreachable', reachable: false, latencyMs: elapsed(), reason: 'host resolves to a private address' };
      }

      let res: Response;
      try {
        res = await fetch(target, {
          method: hop === 0 ? 'HEAD' : 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': PROBE_USER_AGENT, accept: '*/*' },
        });
      } catch {
        // HEAD can be rejected by some servers — one GET retry on the first hop.
        if (hop === 0) {
          try {
            res = await fetch(target, {
              method: 'GET',
              redirect: 'manual',
              signal: controller.signal,
              headers: { 'user-agent': PROBE_USER_AGENT, accept: '*/*' },
            });
          } catch {
            return { status: 'unreachable', reachable: false, latencyMs: elapsed(), reason: 'connection failed' };
          }
        } else {
          return { status: 'unreachable', reachable: false, latencyMs: elapsed(), reason: 'connection failed' };
        }
      }

      // Manual redirect handling.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) {
          const latencyMs = elapsed();
          return { status: mapProbeStatus({ reachable: true, latencyMs, httpStatus: res.status }), reachable: true, latencyMs, httpStatus: res.status };
        }
        let next: URL;
        try {
          next = new URL(location, target);
        } catch {
          return { status: 'unreachable', reachable: false, latencyMs: elapsed(), reason: 'malformed redirect target' };
        }
        target = next;
        continue;
      }

      const latencyMs = elapsed();
      return {
        status: mapProbeStatus({ reachable: true, latencyMs, httpStatus: res.status }),
        reachable: true,
        latencyMs,
        httpStatus: res.status,
      };
    }
    return { status: 'unreachable', reachable: false, latencyMs: elapsed(), reason: 'too many redirects' };
  } catch (e: unknown) {
    // AbortError (timeout) or any unexpected failure ⇒ unreachable, never throw.
    const reason = e instanceof Error && e.name === 'AbortError' ? 'probe timed out' : 'probe error';
    return { status: 'unreachable', reachable: false, latencyMs: elapsed(), reason };
  } finally {
    clearTimeout(timer);
  }
}
