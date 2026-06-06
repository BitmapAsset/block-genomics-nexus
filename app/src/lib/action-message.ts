// Canonical, action-bound signed-message format shared by client and server.
//
// A bare nonce only proves "this wallet signed something fresh". It does NOT bind
// the signature to a specific action, so a captured signature could be replayed
// against a *different* endpoint (substitution). This module defines a canonical
// string that binds: the action, HTTP method, exact route path, the block/parcel
// being mutated, a hash of the request body, the one-time nonce, and an expiry.
//
// The client signs buildActionMessage(...) verbatim. The server reconstructs the
// expected binding from the *actual* request and calls verifyActionBinding(...)
// before atomically consuming the nonce. Replay (nonce already used) and
// substitution (binding mismatch) both become impossible.
//
// Pure module: no prisma, no node-only imports. Uses Web Crypto (globalThis.crypto),
// available in both the browser and the Next.js server runtime.
//
// ⚠️  The block between the SHARED SIGNING CORE markers below is byte-for-byte
// identical to sdk/agent-connect/src/action-message.ts. It is the signing
// surface: any divergence changes the signed bytes and breaks BIP-322
// verification across the app and the agent SDK. The parity test
// app/__tests__/lib/action-message-parity.test.ts fails if the two regions
// drift. Edit both copies together, never one alone.

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

/** Parse a canonical message back into a binding, or null if malformed. */
export function parseActionMessage(message: string): ActionBinding | null {
  if (typeof message !== 'string') return null;
  const lines = message.split('\n');
  if (lines[0] !== HEADER) return null;
  const field = (label: string): string | null => {
    const line = lines.find((l) => l.startsWith(label + ': '));
    return line ? line.slice(label.length + 2) : null;
  };
  const action = field('Action');
  const method = field('Method');
  const path = field('Path');
  const blockRaw = field('Block');
  const bodyHash = field('Body');
  const nonce = field('Nonce');
  const expiresRaw = field('Expires');
  if (action === null || method === null || path === null || blockRaw === null || bodyHash === null || nonce === null || expiresRaw === null) {
    return null;
  }
  const blockHeight = Number(blockRaw);
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(blockHeight) || !Number.isFinite(expiresAt)) return null;
  return { action, method, path, blockHeight, bodyHash, nonce, expiresAt };
}

export interface ExpectedBinding {
  action: string; // semantic label the route authorizes, e.g. 'world.create'
  method: string;
  path: string;
  blockHeight: number;
  bodyHash: string;
}

export interface BindingResult {
  ok: boolean;
  reason?: string;
  nonce?: string;
}

/**
 * Server-side: confirm the signed message's binding matches the actual request.
 * Caller must have already verified the BIP-322 signature over `message`, and
 * must atomically consume the returned `nonce` afterwards (the parsed Nonce
 * field, not any substring of the message).
 *
 * @param now epoch ms (injectable for tests).
 */
export function verifyActionBinding(
  message: string,
  expected: ExpectedBinding,
  now: number = Date.now()
): BindingResult {
  const parsed = parseActionMessage(message);
  if (!parsed) return { ok: false, reason: 'Malformed authorization message' };
  if (parsed.action !== expected.action) return { ok: false, reason: 'Action binding mismatch' };
  if (parsed.method.toUpperCase() !== expected.method.toUpperCase()) {
    return { ok: false, reason: 'Method binding mismatch' };
  }
  if (parsed.path !== expected.path) return { ok: false, reason: 'Path binding mismatch' };
  if (parsed.blockHeight !== expected.blockHeight) return { ok: false, reason: 'Block binding mismatch' };
  if (parsed.bodyHash !== expected.bodyHash) return { ok: false, reason: 'Body binding mismatch' };
  if (!(parsed.expiresAt > now)) return { ok: false, reason: 'Authorization expired' };
  return { ok: true, nonce: parsed.nonce };
}
