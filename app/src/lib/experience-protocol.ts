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
import { stableStringify, sha256Hex } from './action-message';

// ─── Manifest versioning ─────────────────────────────────────────

/**
 * Schema version of the experience manifest envelope.
 *
 * This is NOT the experience's own `version` field (which is the operator's
 * build/content version, opaque to us). `manifestVersion` describes the shape of
 * the manifest itself, so a future v2 can add or re-type fields without breaking
 * a v1 host that is still publishing the old shape.
 */
export const MANIFEST_VERSION = 1;
export const SUPPORTED_MANIFEST_VERSIONS = [1] as const;
export type ManifestVersion = (typeof SUPPORTED_MANIFEST_VERSIONS)[number];

/** Well-known path a self-hosted experience publishes its manifest at. */
export const WELL_KNOWN_MANIFEST_PATH = '/.well-known/nexus-experience.json';

/** `sha256:<64 lowercase hex>` — the only content-hash form v1 accepts. */
export const CONTENT_HASH_RE = /^sha256:[0-9a-f]{64}$/;

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

/**
 * Owner-attested integrity digest of the experience's content bundle.
 *
 * We never fetch or verify the bundle itself — that is the client's job at load
 * time. Storing it under the owner's signature is what makes it useful: a client
 * can pin the hash it expects and detect a swapped payload on a host it does not
 * control.
 */
const contentHashSchema = z
  .string()
  .trim()
  .regex(CONTENT_HASH_RE, 'contentHash must be "sha256:" followed by 64 lowercase hex characters');

const manifestVersionSchema = z
  .number()
  .int()
  .refine((v) => (SUPPORTED_MANIFEST_VERSIONS as readonly number[]).includes(v), {
    message: `manifestVersion must be one of: ${SUPPORTED_MANIFEST_VERSIONS.join(', ')}`,
  });

/** The frozen v1 manifest (client-supplied fields only). */
export const experienceManifestSchema = z
  .object({
    manifestVersion: manifestVersionSchema.optional(),
    contentHash: contentHashSchema.optional(),
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

// ─── Canonical manifest hash (integrity) ─────────────────────────
//
// ⚠️  The block between the SHARED MANIFEST CANON markers below is byte-for-byte
// identical to sdk/agent-connect/src/experience-manifest.ts. It decides the
// bytes that get hashed and then signed, so any divergence silently breaks
// BIP-322 verification between a client that signs and the server that checks.
// app/__tests__/lib/experience-manifest-parity.test.ts fails if the two drift.
// Edit both copies together, never one alone.

// ===== BEGIN SHARED MANIFEST CANON (keep byte-identical: app/src/lib/experience-protocol.ts <-> sdk/agent-connect/src/experience-manifest.ts) =====
/**
 * Shape accepted by the canonicalizer: either a client body or a stored row.
 * Deliberately loose so the same function hashes a request and a DB record.
 */
export interface CanonicalManifestInput {
  manifestVersion?: number | null;
  blockHeight: number;
  parcelIndex?: number | null;
  name: string;
  description?: string | null;
  experienceType: string;
  entryUrl: string;
  transport: string;
  healthUrl?: string | null;
  clientRequirements?: unknown;
  capabilities?: string[] | null;
  contentRating?: string | null;
  version: string;
  contentHash?: string | null;
}

/**
 * Normalize a manifest to the exact object that gets hashed.
 *
 * Both sides — the client before signing, and the server when re-deriving the
 * hash from a stored row years later — must produce byte-identical output, so
 * every defaulting rule lives here and nowhere else:
 *
 * - `healthUrl` is resolved to its EFFECTIVE value (`entryUrl` when omitted),
 *   because that is what the server persists. Hashing the raw omitted value
 *   would make a stored row un-rehashable.
 * - Empty/absent optionals are dropped rather than encoded as `null`, so
 *   "omitted" and "explicitly null" hash the same.
 * - An empty `capabilities` array is dropped for the same reason.
 * - `capabilities` order is PRESERVED. It is owner-chosen presentation order,
 *   and sorting it would silently rewrite the operator's intent.
 * - `clientRequirements` is accepted as an object or as the JSON string the DB
 *   stores it in; both normalize to the same object. Key order is irrelevant —
 *   `stableStringify` sorts keys.
 */
export function canonicalManifest(input: CanonicalManifestInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    manifestVersion: input.manifestVersion ?? MANIFEST_VERSION,
    blockHeight: input.blockHeight,
    name: input.name,
    experienceType: input.experienceType,
    entryUrl: input.entryUrl,
    transport: input.transport,
    healthUrl: input.healthUrl ?? input.entryUrl,
    version: input.version,
  };

  if (input.parcelIndex != null) out.parcelIndex = input.parcelIndex;
  if (input.description != null && input.description !== '') out.description = input.description;
  if (input.contentRating != null) out.contentRating = input.contentRating;
  if (input.contentHash != null) out.contentHash = input.contentHash;
  if (input.capabilities != null && input.capabilities.length > 0) out.capabilities = input.capabilities;

  const cr = normalizeClientRequirements(input.clientRequirements);
  if (cr) out.clientRequirements = cr;

  return out;
}

function normalizeClientRequirements(raw: unknown): Record<string, unknown> | null {
  let value = raw;
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ['platform', 'minVersion', 'downloadUrl']) {
    if (obj[key] != null && obj[key] !== '') out[key] = obj[key];
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * SHA-256 hex of the canonical manifest. This is the value bound into the
 * owner's BIP-322 authorization, so it is the anchor of the whole trust chain:
 * deed on Bitcoin → BIP-322 signature → this hash → the stored manifest.
 */
export async function computeManifestHash(input: CanonicalManifestInput): Promise<string> {
  return sha256Hex(stableStringify(canonicalManifest(input)));
}
// ===== END SHARED MANIFEST CANON =====
