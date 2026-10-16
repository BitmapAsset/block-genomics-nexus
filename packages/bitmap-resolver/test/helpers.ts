// Test helpers: synthetic transactions/blocks and an offline replay fetch.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Limiter } from '../src/limiter.js';
import { merkleRoot, parseTx } from '../src/parse/block.js';
import { sha256d } from '../src/sha256.js';
import { fromHex, toHex, toReversedHex } from '../src/bytes.js';

export const VECTORS = fileURLToPath(new URL('./vectors', import.meta.url));
export const readVector = <T = any>(rel: string): T => JSON.parse(readFileSync(join(VECTORS, rel), 'utf8')) as T;

export type HttpMap = Record<string, { status: number; body: string | Uint8Array }>;

/** fetch that only answers from `map` and fails the test on any other URL. */
export function replayFetch(map: HttpMap, log?: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    log?.push(url);
    const hit = map[url];
    if (!hit) throw new Error(`unexpected network request in an offline test: ${url}`);
    return new Response(hit.body as BodyInit, { status: hit.status });
  }) as typeof fetch;
}

/** A limiter with no waiting, for replayed traffic. */
export function fastLimiter(fetchImpl: typeof fetch): Limiter {
  return new Limiter({ fetch: fetchImpl, defaultPolicy: { rps: 1e9, burst: 1e9 }, blockLaneGapMs: 0, maxRetries: 0 });
}

export const ascii = (s: string) => new TextEncoder().encode(s);

export function push(data: Uint8Array): Uint8Array {
  if (data.length === 0) return Uint8Array.of(0x00);
  if (data.length <= 75) return Uint8Array.of(data.length, ...data);
  if (data.length <= 255) return Uint8Array.of(0x4c, data.length, ...data);
  return Uint8Array.of(0x4d, data.length & 0xff, data.length >> 8, ...data);
}

export const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const OP = { FALSE: 0x00, IF: 0x63, ENDIF: 0x68, CHECKSIG: 0xac, DROP: 0x75 };

export interface EnvelopeSpec {
  contentType?: string;
  body?: Uint8Array | string | null;
  /** Extra [tag, value] fields before the body. */
  fields?: [Uint8Array | number, Uint8Array][];
  endif?: boolean;
}

/** OP_FALSE OP_IF "ord" fields… OP_0 body OP_ENDIF */
export function envelope(spec: EnvelopeSpec): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.of(OP.FALSE, OP.IF), push(ascii('ord'))];
  if (spec.contentType !== undefined) parts.push(push(Uint8Array.of(1)), push(ascii(spec.contentType)));
  for (const [tag, value] of spec.fields ?? []) {
    parts.push(push(typeof tag === 'number' ? Uint8Array.of(tag) : tag), push(value));
  }
  if (spec.body !== null && spec.body !== undefined) {
    parts.push(Uint8Array.of(0x00));
    const b = typeof spec.body === 'string' ? ascii(spec.body) : spec.body;
    for (let i = 0; i < b.length; i += 520) parts.push(push(b.subarray(i, i + 520)));
  }
  if (spec.endif !== false) parts.push(Uint8Array.of(OP.ENDIF));
  return cat(...parts);
}

/** A taproot script-path tapscript: <pubkey> OP_CHECKSIG <envelopes…> */
export function tapscript(...envelopes: Uint8Array[]): Uint8Array {
  return cat(push(new Uint8Array(32).fill(7)), Uint8Array.of(OP.CHECKSIG), ...envelopes);
}

export function scriptPathWitness(script: Uint8Array): Uint8Array[] {
  return [new Uint8Array(64).fill(1), script, cat(Uint8Array.of(0xc0), new Uint8Array(32).fill(2))];
}

function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, n >> 8);
  return Uint8Array.of(0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24);
}

const u32 = (n: number) => Uint8Array.of(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24);
const u64 = (n: number) => cat(u32(n % 0x100000000), u32(Math.floor(n / 0x100000000)));

let salt = 0;

/** Segwit tx spending fake outpoints, one per witness, with `outputs` P2TR-looking outputs. */
export function segwitTx(witnesses: Uint8Array[][], outputs = 1): Uint8Array {
  const parts: Uint8Array[] = [u32(2), Uint8Array.of(0x00, 0x01), varint(witnesses.length)];
  for (let i = 0; i < witnesses.length; i++) {
    const prev = new Uint8Array(32);
    prev[0] = ++salt & 0xff;
    prev[1] = (salt >> 8) & 0xff;
    prev[2] = 0xaa;
    parts.push(prev, u32(i), varint(0), u32(0xfffffffd));
  }
  parts.push(varint(outputs));
  for (let i = 0; i < outputs; i++) {
    const spk = cat(Uint8Array.of(0x51, 0x20), new Uint8Array(32).fill(9 + i));
    parts.push(u64(546), varint(spk.length), spk);
  }
  for (const w of witnesses) {
    parts.push(varint(w.length));
    for (const item of w) parts.push(varint(item.length), item);
  }
  parts.push(u32(0));
  return cat(...parts);
}

export function coinbaseTx(height: number): Uint8Array {
  const script = cat(push(u32(height)), push(ascii(`bg${++salt}`)));
  const spk = Uint8Array.of(0x51);
  return cat(u32(1), varint(1), new Uint8Array(32), u32(0xffffffff), varint(script.length), script, u32(0xffffffff), varint(1), u64(312500000), varint(spk.length), spk, u32(0));
}

export const txidOf = (tx: Uint8Array) => parseTx(tx).txid;

/**
 * A segwit block: coinbase with a BIP141 witness commitment over `txs`
 * (reserved value 32 zero bytes), then `txs`.
 */
export function segwitBlock(height: number, txs: Uint8Array[], prevHash = '00'.repeat(32), time = 1_700_000_000) {
  const reserved = new Uint8Array(32);
  const wtxids = ['00'.repeat(32), ...txs.map((t) => parseTx(t).wtxid)];
  const commitment = sha256d(merkleRoot(wtxids), reserved);
  const script = cat(push(u32(height)), push(ascii(`bg${++salt}`)));
  const commitScript = cat(Uint8Array.of(0x6a, 0x24, 0xaa, 0x21, 0xa9, 0xed), commitment);
  const coinbase = cat(
    u32(1),
    Uint8Array.of(0x00, 0x01),
    varint(1),
    new Uint8Array(32),
    u32(0xffffffff),
    varint(script.length),
    script,
    u32(0xffffffff),
    varint(2),
    u64(312500000),
    varint(1),
    Uint8Array.of(0x51),
    u64(0),
    varint(commitScript.length),
    commitScript,
    varint(1),
    varint(32),
    reserved,
    u32(0),
  );
  return { ...block([coinbase, ...txs], prevHash, time), coinbase };
}

/** Block bytes + hash for txs (coinbase first is the caller's job). */
export function block(txs: Uint8Array[], prevHash = '00'.repeat(32), time = 1_700_000_000): { bytes: Uint8Array; hash: string } {
  const root = merkleRoot(txs.map((t) => txidOf(t)));
  const header = cat(u32(0x20000000), fromHex(prevHash).reverse(), root, u32(time), u32(0x17034219), u32(salt++));
  const bytes = cat(header, varint(txs.length), ...txs);
  return { bytes, hash: toReversedHex(sha256d(header)) };
}

export const hexJson = (bytes: Uint8Array) => JSON.stringify(toHex(bytes));

/** Esplora's `vin` array (witness only) for a raw tx, as /tx/<txid> reports it. */
export const esploraVin = (tx: Uint8Array) => parseTx(tx).inputs.map((i) => ({ witness: i.witness.map((w) => toHex(w)) }));
