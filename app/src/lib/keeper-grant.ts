// The keeper grant text (bg-grant/1): the one plain-text message a block's
// holder signs to connect exactly one agent key to the guardian of that block.
//
// The server builds the text from checked fields (`buildGrantMessage`). A text a
// client submits counts only when it equals the server's own rebuild of the
// fields parsed out of it, compared whole with `===`; `parseGrantMessage` only
// extracts fields, so that one comparison is the only place the wording is
// judged.
//
// The agent name allows no colon and no double quote (nor newlines, control or
// non-ASCII characters), so no part of a name can look like an `Allows:` or
// `Never:` line or close the quotes around the name in line 1.
//
// Line 1 names the agent and its key check, so the wallet's own screen carries
// the comparison with what the agent shows in its own chat.
//
// keyCheck is the hex part of `keyId` in lib/block-event-core.ts (`bg-sys-` +
// the first 16 hex of SHA-256 of the key bytes), in four groups; keeper-grant
// (7) checks the two agree.
//
// The agent key is `ed25519:` + the 32 key bytes in base64url: the key travels in
// a link and a text line, and base64url has no `+`, `/` or `=` (event keys use
// standard base64).
//
// Pure module: imports only `crypto` from Node.

import crypto from 'crypto';

export const GRANT_VERSION = 'bg-grant/1';
export const KEEPER_SCOPES = ['inbox'] as const;
export type KeeperScope = (typeof KEEPER_SCOPES)[number];
export const SCOPE_WORDS: Record<KeeperScope, string> = { inbox: "read the guardian's messages" };
export const NEVER_LINE = 'Never: sign for you, move funds, change ownership, act on another block except as a visitor';
export const GRANT_DAYS = [30, 90, 365] as const;
export const DEFAULT_GRANT_DAYS = 90;
export const DEFAULT_SCOPES: KeeperScope[] = ['inbox'];
export const GRANT_NONCE_TTL_MS = 10 * 60 * 1000;
export const MAX_GRANT_TEXT_CHARS = 1000;
export const AGENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/;
export const WALLET_PATTERN = /^(bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{8,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/;
export const MAX_GRANT_MS = 366 * 24 * 60 * 60 * 1000;
export const MIN_GRANT_MS = 60 * 60 * 1000;

export interface GrantFields {
  blockHeight: number;
  walletAddress: string;
  agentName: string;
  agentKey: string;
  scopes: KeeperScope[];
  validUntil: string;
  nonce: string;
  expiresAt: string;
}

export const KEEPER_SENTENCES = {
  bad_json: 'The request body must be a JSON object.',
  bad_block: 'blockHeight must be a whole number from 0 to 9999999.',
  bad_wallet: 'walletAddress must be a mainnet Bitcoin address: bech32 in lower case (bc1...) or legacy (1... or 3...).',
  bad_agent_name: 'agentName must be 1 to 32 letters, digits, spaces, dots, dashes or underscores, starting with a letter or digit.',
  bad_agent_key: 'agentKey must be ed25519: followed by the 32-byte public key in base64url (43 characters).',
  bad_scopes: 'scopes must be a list drawn from: inbox.',
  bad_days: 'days must be 30, 90 or 365.',
  bad_grant_text: 'The text is not a grant text this server built. Prepare a new one and sign it unchanged.',
  bad_valid_until: 'The grant must end between 1 hour and 366 days from now. Prepare a new one.',
  bad_expires: 'A grant text must expire within 11 minutes. Prepare a new one.',
  grant_text_expired: 'This grant text has expired. Prepare a new one and sign it.',
  bad_signature: 'The signature does not match the wallet named in the text.',
  nonce_used: 'This grant text was already used or has expired. Prepare a new one and sign it.',
  no_grant: 'This block has no agent grant.',
  grant_changed: 'The grant on this block changed while the request ran. Nothing was removed.',
  rate_limited: 'Too many requests. Retry after the number of seconds in Retry-After.',
  keeper_unavailable: 'Keeper grants are not available yet. Retry later.',
} as const;
export type KeeperCode = keyof typeof KEEPER_SENTENCES;
export const GATE_RETRY_SENTENCE = 'Ownership could not be confirmed on-chain right now. Nothing was changed; sign again to retry later.';

const KEY_PREFIX = 'ed25519:';
const KEY_PATTERN = /^ed25519:[A-Za-z0-9_-]{43}$/;
const HEIGHT_TEXT = /^(0|[1-9][0-9]{0,6})$/;
const NONCE_PATTERN = /^[0-9a-f]{64}$/;
const MAX_HEIGHT = 9999999;

export function checkAgentName(s: unknown): s is string {
  return typeof s === 'string' && AGENT_NAME_PATTERN.test(s) && s === s.trimEnd() && !s.includes('  ');
}

export function checkAgentKey(s: unknown): s is string {
  if (typeof s !== 'string' || !KEY_PATTERN.test(s)) return false;
  const body = s.slice(KEY_PREFIX.length);
  const bytes = Buffer.from(body, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === body;
}

export function checkWallet(s: unknown): s is string {
  return typeof s === 'string' && WALLET_PATTERN.test(s);
}

export function checkHeight(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_HEIGHT;
}

/** An array of known scope names, at least one; deduped, in KEEPER_SCOPES order. Anything else: null. */
export function normalizeScopes(input: unknown): KeeperScope[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const seen = new Set<KeeperScope>();
  for (const s of input) {
    if (typeof s !== 'string') return null;
    const scope = KEEPER_SCOPES.find((k) => k === s);
    if (!scope) return null;
    seen.add(scope);
  }
  return KEEPER_SCOPES.filter((k) => seen.has(k));
}

/** The first 16 hex of SHA-256 over the 32 key bytes, in four groups of four. */
export function keyCheck(agentKey: string): string {
  const bytes = Buffer.from(agentKey.slice(KEY_PREFIX.length), 'base64url');
  const hex = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12), hex.slice(12, 16)].join('-');
}

/** The twelve lines, joined with `\n`, no trailing newline. */
export function buildGrantMessage(f: GrantFields): string {
  const kc = keyCheck(f.agentKey);
  return [
    `blockgenomics.io: connect agent "${f.agentName}" (key check ${kc}) to the guardian of block ${f.blockHeight}`,
    `Version: ${GRANT_VERSION}`,
    `Block: ${f.blockHeight}`,
    `Wallet: ${f.walletAddress}`,
    `Agent: ${f.agentName}`,
    `Agent key: ${f.agentKey}`,
    `Key check: ${kc}`,
    `Allows: ${f.scopes.map((s) => SCOPE_WORDS[s]).join('; ')}`,
    NEVER_LINE,
    `Valid until: ${f.validUntil} unless revoked or the block is sold`,
    `Nonce: ${f.nonce}`,
    `Expires: ${f.expiresAt}`,
  ].join('\n');
}

function isRoundTripIso(s: string): boolean {
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).toISOString() === s;
}

/**
 * Extract the fields of a bg-grant/1 text. Checks the line count, the labels in
 * their order and every field's rule; it does not judge line 1, the Never line,
 * the rest of the Valid until line or the Key check value (the caller's rebuild
 * comparison does) and does not judge the clock (`checkClock`).
 */
export function parseGrantMessage(message: unknown): GrantFields | null {
  if (typeof message !== 'string' || message.includes('\r')) return null;
  const lines = message.split('\n');
  if (lines.length !== 12) return null;
  if (lines[1] !== `Version: ${GRANT_VERSION}`) return null;
  const value = (index: number, label: string): string | null =>
    lines[index].startsWith(label) ? lines[index].slice(label.length) : null;

  const block = value(2, 'Block: ');
  const walletAddress = value(3, 'Wallet: ');
  const agentName = value(4, 'Agent: ');
  const agentKey = value(5, 'Agent key: ');
  const keyCheckValue = value(6, 'Key check: ');
  const allows = value(7, 'Allows: ');
  const validLine = value(9, 'Valid until: ');
  const nonce = value(10, 'Nonce: ');
  const expiresAt = value(11, 'Expires: ');
  if (
    block === null || walletAddress === null || agentName === null || agentKey === null ||
    keyCheckValue === null || allows === null || validLine === null || nonce === null || expiresAt === null
  ) {
    return null;
  }

  if (!HEIGHT_TEXT.test(block)) return null;
  const blockHeight = Number(block);
  if (!checkHeight(blockHeight)) return null;
  if (!checkWallet(walletAddress) || !checkAgentName(agentName) || !checkAgentKey(agentKey)) return null;

  const phrases = allows.split('; ');
  const named: KeeperScope[] = [];
  for (const phrase of phrases) {
    const scope = KEEPER_SCOPES.find((k) => SCOPE_WORDS[k] === phrase);
    if (!scope) return null;
    named.push(scope);
  }
  const scopes = normalizeScopes(named);
  if (!scopes) return null;

  const validUntil = validLine.split(' ')[0];
  if (!isRoundTripIso(validUntil) || !validUntil.endsWith('.000Z')) return null;
  if (!NONCE_PATTERN.test(nonce)) return null;
  if (!isRoundTripIso(expiresAt)) return null;

  return { blockHeight, walletAddress, agentName, agentKey, scopes, validUntil, nonce, expiresAt };
}

/** The clock rules of a grant text, in order: its nonce expiry, the expiry's upper bound, the grant lifetime. */
export function checkClock(
  f: GrantFields,
  now: number,
): 'grant_text_expired' | 'bad_expires' | 'bad_valid_until' | null {
  const expires = Date.parse(f.expiresAt);
  if (expires <= now) return 'grant_text_expired';
  if (expires > now + GRANT_NONCE_TTL_MS + 60_000) return 'bad_expires';
  const validUntil = Date.parse(f.validUntil);
  if (!(validUntil > now + MIN_GRANT_MS && validUntil <= now + MAX_GRANT_MS)) return 'bad_valid_until';
  return null;
}
