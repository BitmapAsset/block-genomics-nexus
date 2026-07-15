/**
 * Experience Hosting Protocol — types, constants, zod schemas, and the
 * SSRF-safe URL/IP guards shared by the /api/v1/experiences routes.
 *
 * A verified block/parcel owner attaches a SELF-HOSTED experience (web / unreal
 * / unity / godot / minecraft / vr / custom) to their land. The Nexus is the
 * internet layer — registry, discovery, probed health — never the host. Every
 * mutating route re-verifies Bitcoin-anchored ownership (see agent-protocol.ts).
 *
 * SECURITY: entry/health/download URLs are attacker-influenced. The synchronous
 * guards here reject the literal SSRF vectors (non-TLS scheme, embedded creds,
 * localhost, private/link-local/reserved IP literals) at validation time. The
 * DNS-resolution + redirect guards live in experience-probe.ts and run before
 * any outbound request is actually made.
 */

import net from 'net';
import { z } from 'zod';

// ─── Enums / unions ──────────────────────────────────────────────

export const EXPERIENCE_TYPES = [
  'web',
  'unreal',
  'unity',
  'godot',
  'minecraft',
  'vr',
  'custom',
] as const;
export type ExperienceType = (typeof EXPERIENCE_TYPES)[number];

export const TRANSPORTS = ['https', 'wss', 'webrtc', 'custom'] as const;
export type Transport = (typeof TRANSPORTS)[number];

export const CONTENT_RATINGS = ['everyone', 'teen', 'mature'] as const;
export type ContentRating = (typeof CONTENT_RATINGS)[number];

export const EXPERIENCE_STATUSES = ['live', 'degraded', 'unreachable', 'pending'] as const;
export type ExperienceStatus = (typeof EXPERIENCE_STATUSES)[number];

// ─── Limits (kept in one place so schema + docs agree) ───────────

export const NAME_MAX = 64;
export const DESCRIPTION_MAX = 512;
export const CAPABILITIES_MAX = 16;
export const CAPABILITY_LEN_MAX = 64;
export const VERSION_MAX = 32;

/** Probe latency bands (ms). live < LIVE ≤ degraded ≤ TIMEOUT ⇒ unreachable. */
export const PROBE_LIVE_MAX_MS = 2000;
export const PROBE_DEGRADED_MAX_MS = 5000; // also the hard probe timeout
export const PROBE_TIMEOUT_MS = PROBE_DEGRADED_MAX_MS;
/** A registered experience is re-probed on read if its last probe is older. */
export const PROBE_STALE_MS = 15 * 60 * 1000; // 15 min
/** Minimum spacing between on-demand probes for a single experience. */
export const PROBE_RATE_LIMIT_MS = 60 * 1000; // 1/min

// ─── SSRF-safe URL / IP guards (synchronous) ─────────────────────

/**
 * True if `ip` (a valid IPv4 or IPv6 literal) is loopback, private, link-local,
 * CGNAT, multicast, or otherwise not a public unicast address. IPv4-mapped and
 * NAT64-embedded IPv6 addresses are unwrapped and re-checked as IPv4.
 */
export function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true; // not a parseable IP ⇒ treat as unsafe for an IP check
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  const u = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  const inRange = (base: number, prefix: number) => u >>> (32 - prefix) === base >>> (32 - prefix);
  return (
    a === 0 ||                                   // 0.0.0.0/8   this-network
    a === 10 ||                                  // 10/8        private
    a === 127 ||                                 // 127/8       loopback
    (a === 169 && b === 254) ||                  // 169.254/16  link-local
    (a === 172 && b >= 16 && b <= 31) ||         // 172.16/12   private
    (a === 192 && b === 168) ||                  // 192.168/16  private
    (a === 100 && b >= 64 && b <= 127) ||        // 100.64/10   CGNAT
    inRange(0xc0000000, 24) ||                   // 192.0.0/24  IETF
    inRange(0xc0000200, 24) ||                   // 192.0.2/24  TEST-NET-1
    inRange(0xc6120000, 15) ||                   // 198.18/15   benchmark
    inRange(0xc6336400, 24) ||                   // 198.51.100/24 TEST-NET-2
    inRange(0xcb007100, 24) ||                   // 203.0.113/24  TEST-NET-3
    a >= 224                                     // 224/4 multicast + 240/4 reserved + 255.255.255.255
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) — unwrap + recheck.
  const mapped = lower.match(/(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (lower === '::1' || lower === '::') return true;          // loopback / unspecified
  if (lower.startsWith('fe80') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(lower)) return true;                        // fc00::/7 unique-local
  if (/^fec/.test(lower)) return true;                          // fec0::/10 deprecated site-local
  if (lower.startsWith('ff')) return true;                      // ff00::/8 multicast
  return false;
}

export interface UrlCheck {
  ok: boolean;
  reason?: string;
  /** Parsed URL when ok. */
  url?: URL;
}

/**
 * Synchronous SSRF pre-flight for an attacker-supplied URL.
 *
 * Enforces: parseable; scheme ∈ {https, wss} (never http/ws/file/etc); no
 * embedded credentials; host is not localhost/.local; host is not an IP literal
 * in a private/loopback/link-local/reserved range (incl. decimal/hex/octal
 * encodings, which are rejected outright — a public DNS name is never all-numeric).
 *
 * It CANNOT catch a public hostname that resolves to a private IP — that is the
 * job of the DNS + redirect guards in experience-probe.ts.
 */
export function assertSafePublicUrl(raw: unknown): UrlCheck {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'URL must be a non-empty string' };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'URL is not parseable' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'wss:') {
    return { ok: false, reason: `URL scheme must be https or wss (got "${url.protocol.replace(':', '')}")` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'URL must not contain embedded credentials' };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return { ok: false, reason: 'URL has no host' };
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, reason: 'URL host resolves to the local machine' };
  }
  // Reject IP literals in disallowed ranges. net.isIP handles dotted-quad IPv4
  // and IPv6; unusual numeric encodings (0x7f000001, 2130706433, 017700000001)
  // are not valid per net.isIP but ARE accepted by some resolvers, so reject any
  // all-numeric / hex-looking bare host defensively.
  if (net.isIP(host) !== 0) {
    if (isPrivateIp(host)) return { ok: false, reason: 'URL host is a private/reserved IP' };
  } else if (/^(0x[0-9a-f]+|\d+|[0-9a-f]*:[0-9a-f:.]*)$/i.test(host) && !host.includes('.')) {
    // Bare number, hex, or colon-form that isn't a normal dotted hostname.
    return { ok: false, reason: 'URL host is a non-DNS numeric/hex address' };
  }
  return { ok: true, url };
}

/** Map a completed probe outcome to an experience status. */
export function mapProbeStatus(
  outcome: { reachable: boolean; latencyMs: number; httpStatus?: number },
): ExperienceStatus {
  if (!outcome.reachable) return 'unreachable';
  if (outcome.httpStatus != null && outcome.httpStatus >= 500) return 'degraded';
  if (outcome.latencyMs < PROBE_LIVE_MAX_MS) return 'live';
  if (outcome.latencyMs <= PROBE_DEGRADED_MAX_MS) return 'degraded';
  return 'unreachable';
}

// ─── Zod schemas ─────────────────────────────────────────────────

const safeUrl = z.string().superRefine((val, ctx) => {
  const check = assertSafePublicUrl(val);
  if (!check.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.reason ?? 'Unsafe URL' });
  }
});

const clientRequirementsSchema = z
  .object({
    platform: z.string().max(64).optional(),
    minVersion: z.string().max(32).optional(),
    downloadUrl: safeUrl.optional(),
  })
  .strip();

/** The frozen v1 manifest (client-supplied fields only). */
export const experienceManifestSchema = z
  .object({
    blockHeight: z.number().int().nonnegative(),
    parcelIndex: z.number().int().nonnegative().optional(),
    name: z.string().trim().min(1).max(NAME_MAX),
    description: z.string().max(DESCRIPTION_MAX).optional(),
    experienceType: z.enum(EXPERIENCE_TYPES),
    entryUrl: safeUrl,
    transport: z.enum(TRANSPORTS),
    healthUrl: safeUrl.optional(),
    clientRequirements: clientRequirementsSchema.optional(),
    capabilities: z.array(z.string().min(1).max(CAPABILITY_LEN_MAX)).max(CAPABILITIES_MAX).optional(),
    contentRating: z.enum(CONTENT_RATINGS).optional(),
    version: z.string().trim().min(1).max(VERSION_MAX),
  })
  .strip();

export type ExperienceManifest = z.infer<typeof experienceManifestSchema>;

/**
 * Partial manifest for PATCH. `blockHeight`/`parcelIndex` are immutable (the
 * experience stays bound to the land it was registered on) so they are omitted.
 */
export const experienceManifestPatchSchema = experienceManifestSchema
  .omit({ blockHeight: true, parcelIndex: true })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'PATCH body must update at least one field' });

export type ExperienceManifestPatch = z.infer<typeof experienceManifestPatchSchema>;
