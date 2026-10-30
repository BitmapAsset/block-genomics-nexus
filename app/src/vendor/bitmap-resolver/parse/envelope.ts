// Ord envelope parser.
//
// Follows ord (src/inscriptions/envelope.rs) for what counts as an inscription
// and how it is numbered, because the inscription id is what ord, wallets and
// marketplaces use:
//
//   OP_FALSE OP_IF "ord" (<tag> <value>)* [OP_0 <body push>*] OP_ENDIF
//
// - The tapscript is the second-to-last witness item, or the third-to-last when
//   the last item is a taproot annex (starts 0x50), as rust-bitcoin's
//   Witness::tapscript() picks it. No leaf-version check, as in ord.
// - Inside an envelope only pushes are allowed. OP_1NEGATE and OP_1..OP_16 count
//   as pushes of 0x81 / 1..16 (ord marks those "pushnum"). Any other opcode
//   ends the attempt: no inscription.
// - The body starts at the first empty push in a tag position; everything
//   after it is concatenated.
// - A truncated push anywhere in the tapscript makes ord drop every envelope of
//   that input.
// - Inscription index i in `<txid>i<i>` counts complete envelopes across all
//   inputs of the transaction, in input order.
//
// Envelopes that reach the end of the script without OP_ENDIF are reported too,
// with `complete: false` and no id, so a resolver can say why a body that reads
// "N.bitmap" was ignored. They never become inscriptions in ord.
//
// Known differences from the block parser LiveOCI imports (bbbb2172…i0): it
// numbers incomplete envelopes as if they were inscriptions, skips non-push
// opcodes inside an envelope instead of rejecting it, keeps parsing after a
// truncated push, and only reads taproot script paths with a control block.
// Those only touch non-standard envelopes; this parser sides with ord.

import type { ParsedTx } from './block';

export interface Envelope {
  /** `<txid>i<index>` for complete envelopes; null when incomplete. */
  id: string | null;
  txid: string;
  input: number;
  /** Envelope position within its input (complete envelopes only, as in ord). */
  offset: number;
  /** Inscription index within the transaction; null when incomplete. */
  index: number | null;
  complete: boolean;
  body: Uint8Array | null;
  /** First value of each tag, keyed by the tag byte(s) as hex ("01", "09", ...). */
  fields: Map<string, Uint8Array>;
  contentType: Uint8Array | null;
  contentEncoding: Uint8Array | null;
  delegate: Uint8Array | null;
  pointer: Uint8Array | null;
  duplicateField: boolean;
  incompleteField: boolean;
  unrecognizedEvenField: boolean;
  pushnum: boolean;
  stutter: boolean;
}

type Token = { push: Uint8Array; num?: boolean } | { op: number };

const EMPTY = new Uint8Array(0);
const OP_IF = 0x63;
const OP_ENDIF = 0x68;
const ORD = [0x6f, 0x72, 0x64];

/** Split a script into tokens. Returns null on a truncated push (ord: error). */
export function tokenize(script: Uint8Array): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < script.length) {
    const op = script[i++];
    let size = -1;
    if (op <= 0x4b) {
      size = op;
    } else if (op === 0x4c) {
      if (i + 1 > script.length) return null;
      size = script[i];
      i += 1;
    } else if (op === 0x4d) {
      if (i + 2 > script.length) return null;
      size = script[i] | (script[i + 1] << 8);
      i += 2;
    } else if (op === 0x4e) {
      if (i + 4 > script.length) return null;
      size = (script[i] | (script[i + 1] << 8) | (script[i + 2] << 16) | (script[i + 3] << 24)) >>> 0;
      i += 4;
    }
    if (size >= 0) {
      if (i + size > script.length) return null;
      out.push({ push: size === 0 ? EMPTY : script.subarray(i, i + size) });
      i += size;
    } else if (op === 0x4f) {
      out.push({ push: Uint8Array.of(0x81), num: true });
    } else if (op >= 0x51 && op <= 0x60) {
      out.push({ push: Uint8Array.of(op - 0x50), num: true });
    } else {
      out.push({ op });
    }
  }
  return out;
}

/** rust-bitcoin Witness::tapscript(): which witness item ord reads envelopes from. */
export function tapscriptOf(witness: Uint8Array[]): Uint8Array | null {
  const n = witness.length;
  if (n === 0) return null;
  const annex = n >= 2 && witness[n - 1].length > 0 && witness[n - 1][0] === 0x50;
  if (annex) return n >= 3 ? witness[n - 3] : null;
  return n >= 2 ? witness[n - 2] : null;
}

const isEmptyPush = (t: Token | undefined): boolean =>
  t !== undefined && 'push' in t && !t.num && t.push.length === 0;

interface RawEnvelope {
  payload: { bytes: Uint8Array; num: boolean }[];
  complete: boolean;
  pushnum: boolean;
  stutter: boolean;
}

/** Envelopes in one tapscript, in order. Mirrors RawEnvelope::from_tapscript. */
function rawEnvelopes(tokens: Token[]): RawEnvelope[] {
  const out: RawEnvelope[] = [];
  let stuttered = false;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i++];
    if (!('push' in t) || t.push.length !== 0 || t.num) continue;
    // OP_FALSE seen; expect OP_IF "ord".
    const next = tokens[i];
    if (!next || !('op' in next) || next.op !== OP_IF) {
      stuttered = isEmptyPush(next);
      continue;
    }
    i++;
    const tag = tokens[i];
    if (!tag || !('push' in tag) || tag.push.length !== 3 || tag.push[0] !== ORD[0] || tag.push[1] !== ORD[1] || tag.push[2] !== ORD[2]) {
      stuttered = isEmptyPush(tag);
      continue;
    }
    i++;
    const payload: { bytes: Uint8Array; num: boolean }[] = [];
    let pushnum = false;
    let ended: 'endif' | 'eof' | 'abort' = 'eof';
    while (i < tokens.length) {
      const p = tokens[i++];
      if ('op' in p) {
        ended = p.op === OP_ENDIF ? 'endif' : 'abort';
        break;
      }
      if (p.num) pushnum = true;
      payload.push({ bytes: p.push, num: !!p.num });
    }
    if (ended === 'endif') {
      // ord leaves `stuttered` as it was after a successful envelope.
      out.push({ payload, complete: true, pushnum, stutter: stuttered });
    } else if (ended === 'eof') {
      // ord: not an envelope. Reported so the resolver can name the reason.
      out.push({ payload, complete: false, pushnum, stutter: stuttered });
      stuttered = false;
    } else {
      // A non-push opcode inside: ord abandons the attempt (stutter = false).
      stuttered = false;
    }
  }
  return out;
}

/** Envelopes of one transaction, numbered like ord. */
export function parseEnvelopes(tx: ParsedTx): Envelope[] {
  const out: Envelope[] = [];
  let index = 0;
  tx.inputs.forEach((input, inputIndex) => {
    const script = tapscriptOf(input.witness);
    if (!script) return;
    // Cheap pre-check: nearly no script contains the "ord" marker.
    if (!containsOrd(script)) return;
    const tokens = tokenize(script);
    if (!tokens) return; // ord drops every envelope of an input whose script does not decode
    let offset = 0;
    for (const raw of rawEnvelopes(tokens)) {
      const parsed = parsePayload(raw);
      if (raw.complete) {
        out.push({ ...parsed, id: `${tx.txid}i${index}`, txid: tx.txid, input: inputIndex, offset, index, complete: true });
        index++;
        offset++;
      } else {
        out.push({ ...parsed, id: null, txid: tx.txid, input: inputIndex, offset, index: null, complete: false });
      }
    }
  });
  return out;
}

function containsOrd(script: Uint8Array): boolean {
  for (let i = 0; i + 2 < script.length; i++) {
    if (script[i] === 0x6f && script[i + 1] === 0x72 && script[i + 2] === 0x64) return true;
  }
  return false;
}

type PayloadFacts = Omit<Envelope, 'id' | 'txid' | 'input' | 'offset' | 'index' | 'complete'>;

/** Mirrors `impl From<RawEnvelope> for ParsedEnvelope`. */
function parsePayload(raw: RawEnvelope): PayloadFacts {
  const items = raw.payload.map((p) => p.bytes);
  let bodyAt = -1;
  for (let i = 0; i < items.length; i += 2) {
    if (items[i].length === 0) {
      bodyAt = i;
      break;
    }
  }
  const fieldEnd = bodyAt === -1 ? items.length : bodyAt;
  const all = new Map<string, Uint8Array[]>();
  let incompleteField = false;
  for (let i = 0; i < fieldEnd; i += 2) {
    if (i + 1 >= fieldEnd) {
      incompleteField = true;
      break;
    }
    const key = hexKey(items[i]);
    const list = all.get(key);
    if (list) list.push(items[i + 1]);
    else all.set(key, [items[i + 1]]);
  }
  let duplicateField = false;
  for (const values of all.values()) if (values.length > 1) duplicateField = true;

  // Tag::take: the first value of a known tag is consumed; chunked tags
  // (metadata 05, properties 11) consume every value.
  const take = (key: string, chunked = false): Uint8Array | null => {
    const values = all.get(key);
    if (!values || values.length === 0) return null;
    if (chunked) {
      all.delete(key);
      return concat(values);
    }
    const first = values.shift() as Uint8Array;
    if (values.length === 0) all.delete(key);
    return first;
  };
  const fields = new Map<string, Uint8Array>();
  for (const [k, v] of all) fields.set(k, v[0]);

  const contentEncoding = take('09');
  const contentType = take('01');
  const delegate = take('0b');
  take('05', true); // metadata
  take('07'); // metaprotocol
  while (take('03') !== null) {
    // parents (array tag): every value consumed
  }
  const pointer = take('02');
  take('11', true); // properties
  take('13'); // property encoding
  take('0d'); // rune

  let unrecognizedEvenField = false;
  for (const key of all.keys()) {
    if (key.length >= 2 && parseInt(key.slice(0, 2), 16) % 2 === 0) unrecognizedEvenField = true;
  }

  return {
    body: bodyAt === -1 ? null : concat(items.slice(bodyAt + 1)),
    fields,
    contentType,
    contentEncoding,
    delegate,
    pointer,
    duplicateField,
    incompleteField,
    unrecognizedEvenField,
    pushnum: raw.pushnum,
    stutter: raw.stutter,
  };
}

function hexKey(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
