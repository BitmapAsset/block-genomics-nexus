/**
 * Esplora sat tracker: "who holds this inscription now?" without an ord server.
 *
 * WHY: ord hosts are the primary holder source, and on 2026-10-22 every public
 * one (ordinals.com and the Magic Eden mirror) started answering scripted
 * requests with a Cloudflare 403 block. Esplora (mempool.space,
 * blockstream.info) still answers, and ord's location rules are deterministic,
 * so the holder can be derived from raw transactions:
 *
 *   1. Genesis. Parse the reveal tx's witnesses the way ord does
 *      (`RawEnvelope::from_transaction`): the n-th envelope across inputs is
 *      inscription `<txid>i<n>`. Its sat is the first sat of its input (inputs
 *      laid end to end by value), unless a valid `pointer` field (tag 2) names
 *      an offset below the total output value.
 *   2. Outputs take sats first-in-first-out by value, so the offset picks the
 *      output. An offset past the last output went to fees.
 *   3. Transfers. Follow `outspend` until the output is unspent; each spending
 *      tx is laid out the same way (its inputs end to end, then FIFO).
 *
 * FAILS CLOSED. Every case this does not model exactly answers `unknown` with a
 * reason, never a best guess: unconfirmed reveal, more than one envelope in the
 * inscribing input, unrecognized even fields (ord binds those inscriptions to
 * no sat), zero-value inputs, sats spent to fees (ord hands them to the miner),
 * OP_RETURN outputs, data that does not line up between calls, an exhausted
 * time or hop budget, and every network or provider failure. Where ord itself
 * has a rule for odd input — an input whose script does not parse contributes
 * no envelopes — the rule is followed, not guessed around.
 *
 * TRUST: providers are tried in order and one trace never mixes providers, so
 * a trace reads one consistent view of the chain. Each NEW location a trace
 * reaches is then confirmed by the other provider (same output address, not
 * spent in a block); if it disagrees the answer is unknown. If no other
 * provider can be reached the single answer stands, which is the trust
 * ordinals.com alone had.
 *
 * CACHE: the location reached is cached per inscription once the transaction
 * that created it is buried six blocks deep, so a repeated check is one
 * `outspend` call. The cached point is only ever a starting position: every
 * check still asks the chain whether it has been spent since.
 */

import { CHAIN_USER_AGENT } from '@/lib/onchain/user-agent';
import { ESPLORA_BASES } from '@/lib/onchain/esplora';

const REQUEST_TIMEOUT_MS = 6000;
/** Wall-clock budget for one whole trace on one provider. */
const TRACE_BUDGET_MS = 15_000;
const MAX_HOPS = 64;
/** Confirmations before a location is cached as a starting point. */
const CACHE_MIN_CONFIRMATIONS = 6;
const TIP_TTL_MS = 60_000;
const MAX_CACHED = 5_000;
/**
 * Traces running at once per process; the rest queue. A crawler sweeping
 * distinct blocks would otherwise turn into a burst against a free public API.
 */
const MAX_CONCURRENT_TRACES = 4;

// ─── Public shapes ───────────────────────────────────────────────

export interface TrackedHolder {
  status: 'ok';
  address: string;
  /** `<txid>:<vout>:<offset>`, same shape as ord's satpoint. */
  satpoint: string;
  /** `esplora:<host>` of the provider that answered. */
  source: string;
  /** Spends followed on this call (0 when the cached or genesis output is unspent). */
  hops: number;
}

export interface UntrackedHolder {
  status: 'unknown';
  reason: string;
}

export type TrackResult = TrackedHolder | UntrackedHolder;

/** On by default; `OWNERSHIP_SAT_TRACKER=0` (or false/off) turns it off. */
export function isSatTrackerEnabled(): boolean {
  const v = (process.env.OWNERSHIP_SAT_TRACKER ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off');
}

// ─── Inscription id ──────────────────────────────────────────────

export function parseInscriptionId(id: string): { txid: string; index: number } | null {
  const m = /^([0-9a-f]{64})i(0|[1-9][0-9]{0,9})$/.exec(id);
  if (!m) return null;
  const index = Number(m[2]);
  return Number.isSafeInteger(index) ? { txid: m[1], index } : null;
}

// ─── Script + envelope parsing (ord rules) ───────────────────────

type Token = { push: Uint8Array } | { op: number };

const OP_IF = 0x63;
const OP_ENDIF = 0x68;
const OP_PUSHNUM_NEG1 = 0x4f;
const OP_PUSHNUM_1 = 0x51;
const OP_PUSHNUM_16 = 0x60;
const PROTOCOL_ID = [0x6f, 0x72, 0x64]; // "ord"

export class ScriptParseError extends Error {}

/** Non-minimal-tolerant tokenizer, like rust-bitcoin's `instructions()`. A truncated push throws. */
export function tokenizeScript(script: Uint8Array): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < script.length) {
    const op = script[i++];
    let len: number;
    if (op <= 0x4b) {
      len = op;
    } else if (op === 0x4c) {
      if (i + 1 > script.length) throw new ScriptParseError('truncated OP_PUSHDATA1');
      len = script[i];
      i += 1;
    } else if (op === 0x4d) {
      if (i + 2 > script.length) throw new ScriptParseError('truncated OP_PUSHDATA2');
      len = script[i] | (script[i + 1] << 8);
      i += 2;
    } else if (op === 0x4e) {
      if (i + 4 > script.length) throw new ScriptParseError('truncated OP_PUSHDATA4');
      len = (script[i] | (script[i + 1] << 8) | (script[i + 2] << 16)) + script[i + 3] * 0x1000000;
      i += 4;
    } else {
      tokens.push({ op });
      continue;
    }
    if (i + len > script.length) throw new ScriptParseError('push past end of script');
    tokens.push({ push: script.subarray(i, i + len) });
    i += len;
  }
  return tokens;
}

const isEmptyPush = (t: Token | undefined) => t !== undefined && 'push' in t && t.push.length === 0;
const isOp = (t: Token | undefined, op: number) => t !== undefined && 'op' in t && t.op === op;
const isProtocolPush = (t: Token | undefined) =>
  t !== undefined && 'push' in t && t.push.length === 3 && PROTOCOL_ID.every((b, i) => t.push[i] === b);

/**
 * Envelope payloads in one tapscript, in order (`RawEnvelope::from_tapscript`).
 * Each envelope is `OP_FALSE OP_IF "ord" <pushes…> OP_ENDIF`; a non-push opcode
 * inside invalidates that envelope and scanning resumes after it.
 */
export function envelopesInTapscript(script: Uint8Array): Uint8Array[][] {
  const tokens = tokenizeScript(script);
  const envelopes: Uint8Array[][] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i++];
    if (!isEmptyPush(t)) continue;
    if (!isOp(tokens[i], OP_IF)) continue;
    i++;
    if (!isProtocolPush(tokens[i])) continue;
    i++;

    const payload: Uint8Array[] = [];
    let closed = false;
    while (i < tokens.length) {
      const p = tokens[i++];
      if ('push' in p) {
        payload.push(p.push);
      } else if (p.op === OP_ENDIF) {
        closed = true;
        break;
      } else if (p.op === OP_PUSHNUM_NEG1) {
        payload.push(Uint8Array.of(0x81));
      } else if (p.op >= OP_PUSHNUM_1 && p.op <= OP_PUSHNUM_16) {
        payload.push(Uint8Array.of(p.op - OP_PUSHNUM_1 + 1));
      } else {
        break; // invalid envelope; keep scanning after this opcode
      }
    }
    if (closed) envelopes.push(payload);
  }
  return envelopes;
}

/** rust-bitcoin `Witness::tapscript`: second-to-last element, after removing an annex. */
export function tapscriptOf(witness: Uint8Array[]): Uint8Array | null {
  const n = witness.length;
  if (n >= 3 && witness[n - 1][0] === 0x50) return witness[n - 3];
  if (n >= 2) return witness[n - 2];
  return null;
}

export interface EnvelopeFields {
  /** Little-endian u64 from tag 2, when it is well-formed. */
  pointer: number | null;
  unrecognizedEvenField: boolean;
  contentEncoding: boolean;
  delegate: boolean;
  /** Bytes after the body separator, or null when there is no body. */
  body: Uint8Array | null;
}

const TAG_POINTER = 2;
const TAG_CONTENT_ENCODING = 9;
const TAG_DELEGATE = 11;
/** Tags ord takes out of the field map before testing for unrecognized even tags. */
const KNOWN_TAGS = new Set([1, 2, 3, 5, 7, 9, 11, 13, 17]);

/** The fields of one envelope that decide where its sat goes (`ParsedEnvelope::from`). */
export function parseEnvelopeFields(payload: Uint8Array[]): EnvelopeFields {
  let bodyAt = payload.length;
  for (let i = 0; i < payload.length; i += 2) {
    if (payload[i].length === 0) {
      bodyAt = i;
      break;
    }
  }

  let pointerValue: Uint8Array | null = null;
  let unrecognizedEvenField = false;
  let contentEncoding = false;
  let delegate = false;
  for (let i = 0; i + 1 < bodyAt; i += 2) {
    const key = payload[i];
    const value = payload[i + 1];
    const single = key.length === 1 ? key[0] : null;
    if (single === TAG_POINTER && pointerValue === null) pointerValue = value;
    if (single === TAG_CONTENT_ENCODING) contentEncoding = true;
    if (single === TAG_DELEGATE) delegate = true;
    // Duplicates of a known tag stay in ord's map after the first is taken;
    // only pointer (2) is even, so a second pointer is an unrecognized even field.
    const known = single !== null && KNOWN_TAGS.has(single) && !(single === TAG_POINTER && value !== pointerValue);
    if (!known && key.length > 0 && key[0] % 2 === 0) unrecognizedEvenField = true;
  }

  let pointer: number | null = null;
  if (pointerValue !== null && pointerValue.subarray(8).every((b) => b === 0)) {
    let v = 0;
    for (let i = Math.min(8, pointerValue.length) - 1; i >= 0; i--) v = v * 256 + pointerValue[i];
    pointer = Number.isSafeInteger(v) ? v : null;
  }

  let body: Uint8Array | null = null;
  if (bodyAt < payload.length) {
    const parts = payload.slice(bodyAt + 1);
    const total = parts.reduce((n, p) => n + p.length, 0);
    body = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      body.set(p, o);
      o += p.length;
    }
  }

  return { pointer, unrecognizedEvenField, contentEncoding, delegate, body };
}

// ─── Esplora access ──────────────────────────────────────────────

interface EsploraVin {
  txid: string;
  vout: number;
  is_coinbase?: boolean;
  witness?: string[];
  prevout?: { value?: number } | null;
}

interface EsploraVout {
  value: number;
  scriptpubkey_type?: string;
  scriptpubkey_address?: string;
}

interface EsploraTx {
  txid: string;
  vin: EsploraVin[];
  vout: EsploraVout[];
  status?: { confirmed?: boolean; block_height?: number };
}

interface EsploraOutspend {
  spent: boolean;
  txid?: string;
  vin?: number;
  status?: { confirmed?: boolean; block_height?: number };
}

class Unknown extends Error {}
class ProviderDown extends Error {}

function hostOf(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}

class Esplora {
  constructor(readonly base: string, private readonly deadline: number) {}

  async get(path: string, kind: 'json' | 'text'): Promise<unknown> {
    const remaining = Math.min(REQUEST_TIMEOUT_MS, this.deadline - Date.now());
    if (remaining <= 0) throw new Unknown('time_budget');
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        headers: { Accept: kind === 'json' ? 'application/json' : 'text/plain', 'User-Agent': CHAIN_USER_AGENT },
        signal: AbortSignal.timeout(remaining),
      });
    } catch {
      throw new ProviderDown(`network ${path}`);
    }
    if (res.status === 404) throw new Unknown('not_found');
    if (!res.ok) throw new ProviderDown(`http_${res.status} ${path}`);
    try {
      return kind === 'json' ? await res.json() : (await res.text()).trim();
    } catch {
      throw new ProviderDown(`bad_body ${path}`);
    }
  }

  async tx(txid: string): Promise<EsploraTx> {
    const tx = (await this.get(`/tx/${txid}`, 'json')) as EsploraTx;
    if (!tx || tx.txid !== txid || !Array.isArray(tx.vin) || !Array.isArray(tx.vout)) throw new Unknown('tx_mismatch');
    return tx;
  }

  async outspend(txid: string, vout: number): Promise<EsploraOutspend> {
    const o = (await this.get(`/tx/${txid}/outspend/${vout}`, 'json')) as EsploraOutspend;
    if (!o || typeof o.spent !== 'boolean') throw new Unknown('outspend_shape');
    return o;
  }
}

let tipCache: { base: string; height: number; at: number } | null = null;

async function tipHeight(esplora: Esplora): Promise<number | null> {
  if (tipCache && tipCache.base === esplora.base && Date.now() - tipCache.at < TIP_TTL_MS) return tipCache.height;
  try {
    const height = Number.parseInt(String(await esplora.get('/blocks/tip/height', 'text')), 10);
    if (!Number.isSafeInteger(height) || height <= 0) return null;
    tipCache = { base: esplora.base, height, at: Date.now() };
    return height;
  } catch {
    return null;
  }
}

// ─── Tracking ────────────────────────────────────────────────────

interface Location {
  txid: string;
  vout: number;
  offset: number;
  address: string;
  /** Height of the block that confirmed `txid`. */
  height: number;
}

const cache = new Map<string, Location>();
/** Per inscription, the last location a second provider agreed with. */
const crossChecked = new Map<string, string>();

const locationKey = (l: Location) => `${l.txid}:${l.vout}:${l.offset}:${l.address}`;

function remember<V>(map: Map<string, V>, key: string, value: V): void {
  if (map.size >= MAX_CACHED && !map.has(key)) {
    const oldest = map.keys().next();
    if (!oldest.done) map.delete(oldest.value);
  }
  map.set(key, value);
}

let running = 0;
const waiting: (() => void)[] = [];

async function withTraceSlot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_TRACES) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Test seam. */
export function __resetSatTracker(): void {
  cache.clear();
  crossChecked.clear();
  tipCache = null;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) throw new Unknown('bad_witness_hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function inputValue(vin: EsploraVin): number {
  const v = vin.prevout?.value;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new Unknown('missing_prevout');
  return v;
}

/** The output holding absolute offset `offset`, filling outputs in order by value. */
export function locateOffset(outputs: { value: number }[], offset: number): { vout: number; offset: number } | null {
  let start = 0;
  for (let vout = 0; vout < outputs.length; vout++) {
    const end = start + outputs[vout].value;
    if (offset < end) return { vout, offset: offset - start };
    start = end;
  }
  return null;
}

function landOn(tx: EsploraTx, absolute: number): Location {
  for (const out of tx.vout) {
    if (typeof out?.value !== 'number' || !Number.isSafeInteger(out.value) || out.value < 0) throw new Unknown('bad_output');
  }
  const hit = locateOffset(tx.vout, absolute);
  if (!hit) throw new Unknown('sat_in_fees');
  const out = tx.vout[hit.vout];
  if (out.scriptpubkey_type === 'op_return') throw new Unknown('burned');
  if (typeof out.scriptpubkey_address !== 'string' || out.scriptpubkey_address.length === 0) throw new Unknown('no_address');
  if (tx.status?.confirmed !== true || typeof tx.status.block_height !== 'number') throw new Unknown('unconfirmed');
  return { txid: tx.txid, vout: hit.vout, offset: hit.offset, address: out.scriptpubkey_address, height: tx.status.block_height };
}

interface Genesis {
  input: number;
  fields: EnvelopeFields;
}

/** Find inscription `index`'s envelope in the reveal tx, by ord's numbering. */
function findEnvelope(reveal: EsploraTx, index: number): Genesis {
  let counter = 0;
  for (let input = 0; input < reveal.vin.length; input++) {
    const vin = reveal.vin[input];
    if (vin.is_coinbase) throw new Unknown('coinbase');
    const witness = (vin.witness ?? []).map(hexToBytes);
    const tapscript = tapscriptOf(witness);
    if (!tapscript) continue;
    let envelopes: Uint8Array[][];
    try {
      envelopes = envelopesInTapscript(tapscript);
    } catch (e) {
      // ord discards every envelope of an input whose script does not parse
      // (`if let Ok(..) = from_tapscript`), which is also what a non-taproot
      // witness element usually looks like here. It numbers none of them.
      if (!(e instanceof ScriptParseError)) throw e;
      envelopes = [];
    }
    if (index < counter + envelopes.length) {
      if (envelopes.length > 1) throw new Unknown('multiple_envelopes_in_input');
      return { input, fields: parseEnvelopeFields(envelopes[index - counter]) };
    }
    counter += envelopes.length;
  }
  throw new Unknown('envelope_not_found');
}

function genesisLocation(reveal: EsploraTx, index: number): Location {
  if (reveal.status?.confirmed !== true) throw new Unknown('reveal_unconfirmed');
  const { input, fields } = findEnvelope(reveal, index);
  if (fields.unrecognizedEvenField) throw new Unknown('unbound');

  let start = 0;
  for (let i = 0; i < input; i++) start += inputValue(reveal.vin[i]);
  if (inputValue(reveal.vin[input]) === 0) throw new Unknown('unbound');

  const totalOut = reveal.vout.reduce((n, o) => n + (typeof o?.value === 'number' ? o.value : 0), 0);
  const offset = fields.pointer !== null && fields.pointer < totalOut ? fields.pointer : start;
  return landOn(reveal, offset);
}

async function traceOn(
  esplora: Esplora,
  inscriptionId: string,
  txid: string,
  index: number,
): Promise<{ holder: TrackedHolder; loc: Location }> {
  let loc = cache.get(inscriptionId) ?? genesisLocation(await esplora.tx(txid), index);
  const tip = await tipHeight(esplora);
  const progress: { deepest: Location | null } = { deepest: null };
  const noteDepth = (l: Location) => {
    if (tip !== null && tip - l.height + 1 >= CACHE_MIN_CONFIRMATIONS) progress.deepest = l;
  };
  noteDepth(loc);

  let hops = 0;
  try {
    while (true) {
      const spend = await esplora.outspend(loc.txid, loc.vout);
      // ord indexes blocks, so a spend still in the mempool has not moved the
      // inscription yet: the holder is the confirmed one.
      if (!spend.spent || spend.status?.confirmed !== true) {
        const holder: TrackedHolder = {
          status: 'ok',
          address: loc.address,
          satpoint: `${loc.txid}:${loc.vout}:${loc.offset}`,
          source: `esplora:${hostOf(esplora.base)}`,
          hops,
        };
        return { holder, loc };
      }
      if (++hops > MAX_HOPS) throw new Unknown('hop_budget');
      if (typeof spend.txid !== 'string' || !Number.isInteger(spend.vin)) throw new Unknown('outspend_shape');

      const next = await esplora.tx(spend.txid);
      const k = spend.vin as number;
      const vin = next.vin[k];
      if (!vin || vin.txid !== loc.txid || vin.vout !== loc.vout) throw new Unknown('spend_mismatch');

      let start = 0;
      for (let i = 0; i < k; i++) start += inputValue(next.vin[i]);
      loc = landOn(next, start + loc.offset);
      noteDepth(loc);
    }
  } finally {
    if (progress.deepest) remember(cache, inscriptionId, progress.deepest);
  }
}

/**
 * Ask the providers other than `primary` whether they see the same output at
 * `loc`, with the same address, not spent in a block. The first one that
 * answers decides; `unreachable` when none does.
 */
async function confirmElsewhere(primary: string, loc: Location): Promise<'agree' | 'disagree' | 'unreachable'> {
  for (const base of ESPLORA_BASES) {
    if (base === primary) continue;
    const esplora = new Esplora(base, Date.now() + 2 * REQUEST_TIMEOUT_MS);
    try {
      const tx = await esplora.tx(loc.txid);
      if (tx.status?.confirmed !== true || tx.vout[loc.vout]?.scriptpubkey_address !== loc.address) return 'disagree';
      const spend = await esplora.outspend(loc.txid, loc.vout);
      return spend.spent && spend.status?.confirmed === true ? 'disagree' : 'agree';
    } catch (e) {
      if (e instanceof ProviderDown) continue;
      // An unknown transaction or a malformed answer is a disagreement too.
      return 'disagree';
    }
  }
  return 'unreachable';
}

/**
 * Current holder of `inscriptionId`, derived from Esplora alone.
 *
 * Never throws. `unknown` carries a short machine reason for logs; callers
 * treat every `unknown` as "on-chain truth unavailable".
 */
export async function trackInscriptionHolder(inscriptionId: string): Promise<TrackResult> {
  const id = parseInscriptionId(inscriptionId);
  if (!id) return { status: 'unknown', reason: 'bad_inscription_id' };
  return withTraceSlot(() => trackOn(inscriptionId, id));
}

async function trackOn(inscriptionId: string, id: { txid: string; index: number }): Promise<TrackResult> {
  let lastReason = 'no_provider';
  for (const base of ESPLORA_BASES) {
    const esplora = new Esplora(base, Date.now() + TRACE_BUDGET_MS);
    try {
      const { holder, loc } = await traceOn(esplora, inscriptionId, id.txid, id.index);
      const key = locationKey(loc);
      if (crossChecked.get(inscriptionId) !== key) {
        const verdict = await confirmElsewhere(base, loc);
        if (verdict === 'disagree') {
          cache.delete(inscriptionId);
          crossChecked.delete(inscriptionId);
          console.warn(`[sat-tracker] providers disagree on ${inscriptionId} at ${holder.satpoint}; answering unknown`);
          return { status: 'unknown', reason: 'esplora_disagreement' };
        }
        if (verdict === 'agree') remember(crossChecked, inscriptionId, key);
      }
      return holder;
    } catch (e) {
      if (e instanceof ProviderDown) {
        lastReason = 'provider_down';
        console.warn(`[sat-tracker] ${hostOf(base)} unavailable: ${e.message}`);
        continue;
      }
      const reason = e instanceof Unknown ? e.message : 'internal_error';
      if (!(e instanceof Unknown)) console.warn('[sat-tracker] unexpected failure:', e instanceof Error ? e.message : e);
      return { status: 'unknown', reason };
    }
  }
  return { status: 'unknown', reason: lastReason };
}

/**
 * The inscription's body as text, read from its reveal transaction.
 *
 * This is what ord's `/content/<id>` serves when the envelope has no
 * content-encoding and no delegate; with either one (or no body) the answer is
 * null rather than bytes that differ from what ord would serve.
 */
export async function readInscriptionBodyFromChain(inscriptionId: string): Promise<string | null> {
  const id = parseInscriptionId(inscriptionId);
  if (!id) return null;
  for (const base of ESPLORA_BASES) {
    const esplora = new Esplora(base, Date.now() + REQUEST_TIMEOUT_MS);
    try {
      const reveal = await esplora.tx(id.txid);
      if (reveal.status?.confirmed !== true) return null;
      const { fields } = findEnvelope(reveal, id.index);
      if (fields.contentEncoding || fields.delegate || fields.body === null) return null;
      return new TextDecoder('utf-8', { fatal: true }).decode(fields.body);
    } catch (e) {
      if (e instanceof ProviderDown) continue;
      return null;
    }
  }
  return null;
}
