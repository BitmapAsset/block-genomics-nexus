/**
 * The two envelope parsers read the same inscriptions out of the same witness.
 *
 * The deed resolver (vendor/bitmap-resolver/parse/envelope) and the Esplora sat
 * tracker (lib/onchain/sat-tracker) each parse ord envelopes. The tracker now
 * picks the tapscript with the resolver's own `tapscriptOf`, so a two-item
 * witness whose last item starts 0x50 is an annex in both (no tapscript). The
 * rest of the two parsers is pinned here case by case: per input, the same
 * complete envelopes, numbered the same across inputs, with the same pointer,
 * body and unrecognized-even-field flag. A tracker `ScriptParseError` is the
 * resolver dropping that input's envelopes. Incomplete envelopes are not
 * compared (the resolver reports them with no id; ord never numbers them).
 */

import { parseEnvelopes } from '@/vendor/bitmap-resolver/parse/envelope';
import type { ParsedTx } from '@/vendor/bitmap-resolver/parse/block';
import {
  envelopesInTapscript,
  parseEnvelopeFields,
  ScriptParseError,
  tapscriptOf,
} from '@/lib/onchain/sat-tracker';

// ─── Script building ─────────────────────────────────────────────

const bytes = (...parts: Array<number | number[] | Uint8Array>): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'number' ? [p] : Array.from(p))));
const ascii = (s: string) => Uint8Array.from(Buffer.from(s, 'ascii'));

function push(data: Uint8Array): Uint8Array {
  if (data.length === 0) return bytes(0x00);
  if (data.length <= 75) return bytes(data.length, data);
  if (data.length <= 255) return bytes(0x4c, data.length, data);
  return bytes(0x4d, data.length & 0xff, data.length >> 8, data);
}

const OP_FALSE = bytes(0x00);
const OP_IF = 0x63;
const OP_ENDIF = 0x68;
const OP_CHECKSIG = 0xac;
const ORD = push(ascii('ord'));
const KEY = bytes(0x20, new Array(32).fill(0x11), OP_CHECKSIG);
const SIG = new Uint8Array(64).fill(0x22);
const CONTROL = bytes(0xc0, new Array(32).fill(0x33));
const ANNEX = bytes(0x50, 0x01, 0x02);

interface EnvelopeSpec {
  fields?: Array<[Uint8Array, Uint8Array]>;
  body?: Uint8Array[];
  /** Raw bytes spliced in after the fields (opcodes, pushnums). */
  raw?: Uint8Array;
  falseOp?: Uint8Array;
  endif?: boolean;
}

function envelope(spec: EnvelopeSpec = {}): Uint8Array {
  const fields = spec.fields ?? [[bytes(0x01), ascii('text/plain;charset=utf-8')]];
  const parts: Uint8Array[] = [spec.falseOp ?? OP_FALSE, bytes(OP_IF), ORD];
  for (const [tag, value] of fields) parts.push(push(tag), push(value));
  if (spec.raw) parts.push(spec.raw);
  if (spec.body) {
    parts.push(push(new Uint8Array(0)));
    for (const chunk of spec.body) parts.push(push(chunk));
  }
  if (spec.endif !== false) parts.push(bytes(OP_ENDIF));
  return bytes(...parts);
}

const script = (...envelopes: Uint8Array[]) => bytes(KEY, ...envelopes);
const spend = (tapscript: Uint8Array) => [SIG, tapscript, CONTROL];
const BITMAP = { body: [ascii('840000.bitmap')] };

// ─── The two readings ────────────────────────────────────────────

interface Reading {
  input: number;
  index: number;
  pointer: number | null;
  body: string | null;
  unrecognizedEvenField: boolean;
}

/** The tracker's rule for a pointer value: little-endian, at most 8 significant bytes. */
function decodePointer(v: Uint8Array | null): number | null {
  if (v === null || !v.subarray(8).every((b) => b === 0)) return null;
  let n = 0;
  for (let i = Math.min(8, v.length) - 1; i >= 0; i--) n = n * 256 + v[i];
  return Number.isSafeInteger(n) ? n : null;
}

const hex = (b: Uint8Array | null) => (b === null ? null : Buffer.from(b).toString('hex'));

function resolverReading(witnesses: Uint8Array[][]): Reading[] {
  const tx: ParsedTx = {
    index: 1,
    txid: 'ab'.repeat(32),
    wtxid: 'cd'.repeat(32),
    inputs: witnesses.map((witness) => ({ prevTxid: '00'.repeat(32), prevVout: 0, witness })),
    outputCount: 1,
    outputScripts: [new Uint8Array(0)],
    segwit: true,
  };
  return parseEnvelopes(tx)
    .filter((e) => e.complete)
    .map((e) => ({
      input: e.input,
      index: e.index as number,
      pointer: decodePointer(e.pointer),
      body: hex(e.body),
      unrecognizedEvenField: e.unrecognizedEvenField,
    }));
}

function trackerReading(witnesses: Uint8Array[][]): Reading[] {
  const out: Reading[] = [];
  let counter = 0;
  witnesses.forEach((witness, input) => {
    const tapscript = tapscriptOf(witness);
    if (!tapscript) return;
    let payloads: Uint8Array[][];
    try {
      payloads = envelopesInTapscript(tapscript);
    } catch (e) {
      if (!(e instanceof ScriptParseError)) throw e;
      payloads = [];
    }
    for (const payload of payloads) {
      const f = parseEnvelopeFields(payload);
      out.push({ input, index: counter++, pointer: f.pointer, body: hex(f.body), unrecognizedEvenField: f.unrecognizedEvenField });
    }
  });
  return out;
}

// ─── Cases ───────────────────────────────────────────────────────

const POINTER = bytes(0x02);
const cases: Array<[string, Uint8Array[][], number]> = [
  ['plain envelope', [spend(script(envelope(BITMAP)))], 1],
  ['OP_FALSE as OP_0', [spend(script(envelope({ ...BITMAP, falseOp: bytes(0x00) })))], 1],
  ['OP_FALSE as an empty OP_PUSHDATA1', [spend(script(envelope({ ...BITMAP, falseOp: bytes(0x4c, 0x00) })))], 1],
  ['pushnum opcodes in the body', [spend(script(envelope({ raw: bytes(0x00, 0x51, 0x4f, 0x60) })))], 1],
  ['pushnum as a tag (OP_2 = pointer)', [spend(script(envelope({ fields: [[bytes(0x01), ascii('text/plain')]], raw: bytes(0x52, 0x01, 0x05), body: [ascii('x')] })))], 1],
  ['abandoned envelope (non-push opcode inside), then a complete one', [spend(script(envelope({ raw: bytes(0x75) }), envelope(BITMAP)))], 1],
  ['envelope with no OP_ENDIF', [spend(script(envelope({ ...BITMAP, endif: false })))], 0],
  ['truncated push after a complete envelope', [spend(bytes(script(envelope(BITMAP)), 0x05, 0x01, 0x02))], 0],
  ['truncated OP_PUSHDATA1', [spend(bytes(script(envelope(BITMAP)), 0x4c))], 0],
  ['two envelopes in one input', [spend(script(envelope(BITMAP), envelope({ body: [ascii('second')] })))], 2],
  ['envelopes across two inputs', [spend(script(envelope(BITMAP))), spend(script(envelope({ body: [ascii('b')] })))], 2],
  ['an input without an envelope between two with one', [spend(script(envelope(BITMAP))), spend(KEY), spend(script(envelope({ body: [ascii('c')] })))], 2],
  ['pointer, well-formed', [spend(script(envelope({ fields: [[POINTER, bytes(0x10, 0x27)]], ...BITMAP })))], 1],
  ['pointer, 9 bytes with a zero tail', [spend(script(envelope({ fields: [[POINTER, bytes(1, 0, 0, 0, 0, 0, 0, 0, 0)]], ...BITMAP })))], 1],
  ['pointer, oversized', [spend(script(envelope({ fields: [[POINTER, bytes(1, 0, 0, 0, 0, 0, 0, 0, 1)]], ...BITMAP })))], 1],
  ['duplicate pointer tag', [spend(script(envelope({ fields: [[POINTER, bytes(1)], [POINTER, bytes(2)]], ...BITMAP })))], 1],
  ['duplicate content type (odd tag)', [spend(script(envelope({ fields: [[bytes(0x01), ascii('a')], [bytes(0x01), ascii('b')]], ...BITMAP })))], 1],
  ['unrecognized even tag', [spend(script(envelope({ fields: [[bytes(0x04), bytes(1)]], ...BITMAP })))], 1],
  ['unrecognized odd tag', [spend(script(envelope({ fields: [[bytes(0x15), bytes(1)]], ...BITMAP })))], 1],
  ['two-byte even tag', [spend(script(envelope({ fields: [[bytes(0x02, 0x01), bytes(1)]], ...BITMAP })))], 1],
  ['field key without a value', [spend(script(envelope({ fields: [], raw: push(bytes(0x01)) })))], 1],
  ['no body', [spend(script(envelope({ fields: [[bytes(0x01), ascii('text/plain')]] })))], 1],
  ['witness of 2 items (script, control block)', [[script(envelope(BITMAP)), CONTROL]], 1],
  ['witness of 3 items with an annex', [[script(envelope(BITMAP)), CONTROL, ANNEX]], 1],
  ['witness of 4 items with an annex', [[SIG, script(envelope(BITMAP)), CONTROL, ANNEX]], 1],
  ['witness of 2 items whose last item starts 0x50', [[script(envelope(BITMAP)), ANNEX]], 0],
  ['witness whose last item is empty', [[SIG, script(envelope(BITMAP)), new Uint8Array(0)]], 1],
  ['witness of 1 item', [[script(envelope(BITMAP))]], 0],
  ['empty witness', [[]], 0],
];

describe('envelope parity: resolver and sat tracker', () => {
  it.each(cases)('%s', (_name, witnesses, expected) => {
    const resolver = resolverReading(witnesses);
    expect(trackerReading(witnesses)).toEqual(resolver);
    expect(resolver).toHaveLength(expected);
  });

  it('a two-item witness ending in 0x50 has no tapscript in either parser', () => {
    const witness = [script(envelope(BITMAP)), ANNEX];
    expect(tapscriptOf(witness)).toBeNull();
    expect(trackerReading([witness])).toEqual([]);
  });

  it('the pointer case reads the same offset in both', () => {
    const witnesses = [spend(script(envelope({ fields: [[POINTER, bytes(0x10, 0x27)]], ...BITMAP })))];
    expect(trackerReading(witnesses)[0].pointer).toBe(10_000);
    expect(resolverReading(witnesses)[0].pointer).toBe(10_000);
  });
});
