/**
 * `bg-event/1` — the pure half of the Living Block event spine.
 *
 * No prisma, no env, no Node-only imports: the server emitter
 * (`lib/block-events.ts`), the public routes, the tests and the offline checker
 * (`scripts/verify-event-proof.ts`) all hash and verify through this one module,
 * so "what the server stored" and "what a stranger re-checks" cannot drift.
 *
 * Three things make an event checkable by someone who does not trust us:
 *
 *   payloadHash  sha256 of `proofMessage`, the exact bytes that were signed:
 *                the owner's BIP-322 action message for wallet-signed writes,
 *                or the canonical payload for system events (ed25519).
 *   hash         sha256 of the canonical event body, which includes `prev`.
 *   prev         the previous event's `hash` on the same block (genesis: 64 zeros),
 *                so deleting or editing any row breaks every later link.
 *
 * Canonical JSON is `stableStringify` from `action-message.ts` (sorted keys),
 * the same serialisation the signed world-write body hash already uses.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { stableStringify } from './action-message';
import { verifyBip322 } from './bip322';

export const BG_EVENT_FORMAT = 'bg-event/1';
export const BG_EVENT_PAYLOAD_FORMAT = 'bg-event-payload/1';
export const BG_EVENT_KEYS_FORMAT = 'bg-event-keys/1';

/** `prev` of the first event on a block. */
export const GENESIS_PREV = 'sha256:' + '0'.repeat(64);

export const SUMMARY_MAX = 140;
/** Upper bound on one event's canonical public JSON (spec §5.2: ≤ 2 KB). */
export const EVENT_MAX_BYTES = 2048;

export const BLOCK_EVENT_KINDS = [
  'build.placed',
  'build.changed',
  'build.removed',
  'deed.verified',
  'deed.moved',
  'guardian.registered',
  'guardian.status',
  'experience.listed',
  'experience.removed',
] as const;
export type BlockEventKind = (typeof BLOCK_EVENT_KINDS)[number];

export type SignerScheme = 'bip322' | 'ed25519' | 'unsigned';

export interface EventActor {
  type: 'owner' | 'owner-session' | 'guardian' | 'system';
  id: string | null;
  handle: string | null;
}

export interface EventSigner {
  scheme: SignerScheme;
  /** BIP-322: the wallet address. ed25519: the system key id. unsigned: null. */
  address: string | null;
}

/** The fields the chain hash covers, in `bg-event/1` order. */
export interface HashedEvent {
  id: string;
  block: number;
  seq: number;
  kind: string;
  actor: EventActor;
  signer: EventSigner;
  summary: string;
  payloadHash: string;
  prev: string;
  ts: string; // ISO-8601 with milliseconds, UTC
}

/** The public body served by the events GET and broadcast later (L2). */
export interface PublicBlockEvent extends HashedEvent {
  format: typeof BG_EVENT_FORMAT;
  hash: string;
  proof: { url: string };
}

const utf8 = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(s: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]*$/.test(s) || s.length % 2 !== 0) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** `sha256:<hex>` of a UTF-8 string. Synchronous, so the hot path needs no await. */
export function sha256Tagged(input: string): string {
  return 'sha256:' + hex(sha256(utf8.encode(input)));
}

/** The exact object the chain hash is computed over. Field set is closed. */
export function hashedBody(e: HashedEvent): Record<string, unknown> {
  return {
    format: BG_EVENT_FORMAT,
    id: e.id,
    block: e.block,
    seq: e.seq,
    kind: e.kind,
    actor: { type: e.actor.type, id: e.actor.id, handle: e.actor.handle },
    signer: { scheme: e.signer.scheme, address: e.signer.address },
    summary: e.summary,
    payloadHash: e.payloadHash,
    prev: e.prev,
    ts: e.ts,
  };
}

export function eventHash(e: HashedEvent): string {
  return sha256Tagged(stableStringify(hashedBody(e)));
}

/**
 * The message a system (ed25519) event signs: the block, the kind and the
 * public facts, canonically serialised. Its sha256 is the event's payloadHash.
 */
export function systemProofMessage(block: number, kind: string, payload: Record<string, unknown>): string {
  return stableStringify({ format: BG_EVENT_PAYLOAD_FORMAT, block, kind, payload });
}

// ── Chain verification ────────────────────────────────────────────────────

export interface ChainRow extends HashedEvent {
  hash: string;
}

export type ChainResult =
  | { ok: true; checked: number; head: string }
  | { ok: false; checked: number; brokenAt: number; reason: string };

/**
 * Re-derive the chain over `rows` (any order; sorted by seq here).
 *
 * `from` lets a caller check a window: the expected `prev` and `seq` of the
 * first row. Without it the window must start at the genesis event (seq 1).
 */
export function verifyChain(rows: ChainRow[], from?: { prev: string; seq: number }): ChainResult {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  let expectPrev = from?.prev ?? GENESIS_PREV;
  let expectSeq = from?.seq ?? 1;
  let checked = 0;
  for (const r of sorted) {
    if (r.seq !== expectSeq) return { ok: false, checked, brokenAt: r.seq, reason: `gap: expected seq ${expectSeq}, found ${r.seq}` };
    if (r.prev !== expectPrev) return { ok: false, checked, brokenAt: r.seq, reason: 'prev does not match the previous event hash' };
    const recomputed = eventHash(r);
    if (recomputed !== r.hash) return { ok: false, checked, brokenAt: r.seq, reason: 'stored hash does not match the event body' };
    expectPrev = r.hash;
    expectSeq = r.seq + 1;
    checked++;
  }
  return { ok: true, checked, head: expectPrev };
}

// ── ULID ─────────────────────────────────────────────────────────────────

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** A ULID: 48-bit millisecond time + 80 random bits, Crockford base32. */
export function ulid(now: number = Date.now(), random: (n: number) => Uint8Array = randomBytes): string {
  let t = Math.floor(now);
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = random(10);
  let bits = 0;
  let acc = 0;
  let rand = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      rand += CROCKFORD[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  return time + rand;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

// ── System key (ed25519) ─────────────────────────────────────────────────

export interface SystemKey {
  kid: string;
  seed: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * Parse `BG_EVENT_SIGNING_KEY`: a 32-byte ed25519 seed as 64 hex chars or
 * base64. Anything else is null, and the caller runs unsigned rather than
 * inventing a key.
 */
export function parseSystemKey(raw: string | undefined | null): SystemKey | null {
  if (!raw) return null;
  const s = raw.trim();
  const seed = s.length === 64 ? fromHex(s) : fromBase64(s);
  if (!seed || seed.length !== 32) return null;
  const publicKey = ed25519.getPublicKey(seed);
  return { kid: keyId(publicKey), seed, publicKey };
}

/** Stable, public key id: `bg-sys-` + the first 16 hex chars of sha256(pubkey). */
export function keyId(publicKey: Uint8Array): string {
  return 'bg-sys-' + hex(sha256(publicKey)).slice(0, 16);
}

export function signEd25519(seed: Uint8Array, message: string): string {
  return toBase64(ed25519.sign(utf8.encode(message), seed));
}

export function verifyEd25519(publicKey: Uint8Array, message: string, signatureB64: string): boolean {
  const sig = fromBase64(signatureB64);
  if (!sig || sig.length !== 64) return false;
  try {
    return ed25519.verify(sig, utf8.encode(message), publicKey);
  } catch {
    return false;
  }
}

export interface PublishedKey {
  kid: string;
  alg: 'ed25519';
  publicKey: string; // base64, 32 bytes
  use: string;
}

export function publishedKeys(key: SystemKey | null): { format: string; keys: PublishedKey[] } {
  return {
    format: BG_EVENT_KEYS_FORMAT,
    keys: key
      ? [{ kid: key.kid, alg: 'ed25519', publicKey: toBase64(key.publicKey), use: 'bg-event/1 system signatures and event attestations' }]
      : [],
  };
}

// ── Proof verification (the offline check) ───────────────────────────────

export interface EventProof {
  format: typeof BG_EVENT_FORMAT;
  event: PublicBlockEvent;
  scheme: SignerScheme;
  address: string | null;
  message: string;
  signature: string | null;
  payloadHash: string;
  attestation: { kid: string; signature: string } | null;
}

export interface ProofCheck {
  ok: boolean;
  checks: Record<string, boolean | 'skipped'>;
  reason?: string;
}

/**
 * Re-verify a proof from `GET /api/v1/blocks/<h>/events/<id>/proof` with no
 * network and no trust in the server: the payload hash, the signature under
 * its scheme, the event hash, and the system attestation when one is present.
 *
 * `keys` is the content of `/.well-known/bg-event-keys.json`, fetched once and
 * pinned by the verifier.
 */
export function verifyEventProof(proof: EventProof, keys: PublishedKey[] = []): ProofCheck {
  const checks: Record<string, boolean | 'skipped'> = {};
  const e = proof.event;
  const keyFor = (kid: string) => {
    const k = keys.find((x) => x.kid === kid);
    const pub = k ? fromBase64(k.publicKey) : null;
    return pub && pub.length === 32 && keyId(pub) === kid ? pub : null;
  };

  checks.payloadHash = sha256Tagged(proof.message) === proof.payloadHash && proof.payloadHash === e.payloadHash;
  checks.eventHash = eventHash(e) === e.hash;
  checks.signerMatches = proof.scheme === e.signer.scheme && proof.address === e.signer.address;

  if (proof.scheme === 'bip322') {
    checks.signature = !!proof.address && !!proof.signature && verifyBip322(proof.address, proof.message, proof.signature);
  } else if (proof.scheme === 'ed25519') {
    const pub = proof.address ? keyFor(proof.address) : null;
    checks.signature = !!pub && !!proof.signature && verifyEd25519(pub, proof.message, proof.signature);
  } else {
    checks.signature = 'skipped';
  }

  if (proof.attestation) {
    const pub = keyFor(proof.attestation.kid);
    checks.attestation = !!pub && verifyEd25519(pub, e.hash, proof.attestation.signature);
  } else {
    checks.attestation = 'skipped';
  }

  const failed = Object.entries(checks).find(([, v]) => v === false);
  return failed ? { ok: false, checks, reason: `${failed[0]} failed` } : { ok: true, checks };
}

// ── Summaries (server templates; never free text from an agent) ──────────

export interface SummaryFacts {
  objectType?: string;
  name?: string | null;
  count?: number;
  guardianName?: string | null;
  status?: string;
  experienceName?: string | null;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** One sentence per kind, ≤ 140 chars. Names arrive already judged. */
export function summaryFor(kind: BlockEventKind, f: SummaryFacts = {}): string {
  const thing = f.name ? `“${clip(f.name, 40)}”` : f.objectType ? `a ${clip(f.objectType, 30)}` : 'an object';
  let s: string;
  switch (kind) {
    case 'build.placed':
      s = f.count && f.count > 1 ? `${plural(f.count, 'object')} placed` : `Placed ${thing}`;
      break;
    case 'build.changed':
      s = f.count && f.count > 1 ? `${plural(f.count, 'object')} changed` : `Changed ${thing}`;
      break;
    case 'build.removed':
      s = f.count && f.count > 1 ? `${plural(f.count, 'object')} removed` : `Removed ${thing}`;
      break;
    case 'deed.verified':
      s = 'Deed verified on Bitcoin';
      break;
    case 'deed.moved':
      s = 'The deed moved to a new holder';
      break;
    case 'guardian.registered':
      s = f.guardianName ? `${clip(f.guardianName, 60)} became this block’s guardian` : 'A guardian was registered on this block';
      break;
    case 'guardian.status':
      s = `${f.guardianName ? clip(f.guardianName, 60) : 'The guardian'} is now ${f.status ?? 'idle'}`;
      break;
    case 'experience.listed':
      s = f.experienceName ? `“${clip(f.experienceName, 60)}” listed on this block` : 'An experience was listed on this block';
      break;
    case 'experience.removed':
      s = f.experienceName ? `“${clip(f.experienceName, 60)}” removed from this block` : 'An experience was removed from this block';
      break;
  }
  return clip(s, SUMMARY_MAX);
}
