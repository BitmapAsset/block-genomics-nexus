// Canonical, action-bound signed-message format.
//
// The signing core below is byte-for-byte identical to the server module at
// app/src/lib/action-message.ts. The agent SDK and the Block Genomics server
// MUST produce byte-identical messages for a given action, otherwise the
// server's binding check (and therefore the BIP-322 signature) fails.
//
// A bare nonce only proves "this wallet signed something fresh". It does NOT bind
// the signature to a specific action, so a captured signature could be replayed
// against a different endpoint. This canonical string binds: the action, HTTP
// method, exact route path, the block/parcel being mutated, a hash of the request
// body, the one-time nonce, and an expiry.
//
// Pure module: no node-only imports. Uses Web Crypto (globalThis.crypto), which
// is available in Node >=18, Deno, Bun, Cloudflare Workers, and the browser.
//
// ⚠️  The block between the SHARED SIGNING CORE markers below is enforced
// byte-for-byte identical to app/src/lib/action-message.ts by the parity test
// app/__tests__/lib/action-message-parity.test.ts. Edit both copies together.
// The server-only parse/verify helpers intentionally live only in the app copy.

// ===== BEGIN SHARED SIGNING CORE (keep byte-identical: app/src/lib/action-message.ts <-> sdk/agent-connect/src/action-message.ts) =====
const PREFIX = 'Block Genomics Authorization';
const VERSION = 'v1';
const HEADER = `${PREFIX} ${VERSION}`;

export interface ActionBinding {
  action: string; // semantic label, e.g. 'world.create'
  method: string; // HTTP method, uppercased
  path: string; // exact route path incl. resource id, e.g. '/api/v1/world/abc'
  blockHeight: number; // the block / parcel id being mutated
  bodyHash: string; // sha256 hex of the canonical request body (sans auth fields)
  nonce: string; // one-time nonce issued by /api/v1/challenge
  expiresAt: number; // epoch ms; signature is invalid after this
}

/**
 * Deterministic JSON stringify with sorted keys. Drops undefined-valued keys to
 * mirror JSON.stringify semantics, so a body hashed on the client matches the
 * same body after it round-trips through JSON.stringify -> fetch -> req.json().
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map((v) => stableStringify(v ?? null)).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** SHA-256 hex of a UTF-8 string, via Web Crypto (browser + server). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Fields that are auth envelope, not request intent — excluded from the body hash. */
const AUTH_FIELDS = new Set(['signature', 'message']);

/**
 * Canonical hash of a request body's *intent* (everything except the auth
 * envelope). Both the client (before signing) and the server (after parsing)
 * call this on the same logical object and must get the same hash.
 */
export async function hashBody(body: Record<string, unknown>): Promise<string> {
  const intent: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!AUTH_FIELDS.has(k)) intent[k] = v;
  }
  return sha256Hex(stableStringify(intent));
}

/** Build the exact canonical string the wallet signs. */
export function buildActionMessage(b: ActionBinding): string {
  return [
    HEADER,
    `Action: ${b.action}`,
    `Method: ${b.method.toUpperCase()}`,
    `Path: ${b.path}`,
    `Block: ${b.blockHeight}`,
    `Body: ${b.bodyHash}`,
    `Nonce: ${b.nonce}`,
    `Expires: ${b.expiresAt}`,
  ].join('\n');
}
// ===== END SHARED SIGNING CORE =====
