// Consensus block and transaction decoding (Bitcoin Core serialization, as
// returned by ord's /r/block, /r/tx and Esplora's /block/<hash>/raw).
//
// A block authenticates itself: the header's double SHA-256 is the block hash,
// and the header commits to every txid through the merkle root. `parseBlock`
// recomputes both, so bytes from any source can be checked against a hash that
// two independent sources agree on.

import { equalBytes, toReversedHex } from '../bytes.js';
import { Sha256, sha256d } from '../sha256.js';

export interface ParsedInput {
  /** Display txid of the spent output. */
  prevTxid: string;
  prevVout: number;
  /** Witness stack items (views into the source bytes). Empty when the tx has no witness. */
  witness: Uint8Array[];
}

export interface ParsedTx {
  index: number;
  txid: string;
  inputs: ParsedInput[];
  outputCount: number;
  segwit: boolean;
}

export interface BlockHeader {
  version: number;
  prevHash: string;
  merkleRoot: string;
  time: number;
  bits: number;
  nonce: number;
}

export interface ParsedBlock {
  hash: string;
  header: BlockHeader;
  txs: ParsedTx[];
  /** Merkle root recomputed from the parsed txids, display order. */
  computedMerkleRoot: string;
  merkleOk: boolean;
  size: number;
}

class Reader {
  pos = 0;
  constructor(readonly bytes: Uint8Array) {}

  need(n: number): void {
    if (this.pos + n > this.bytes.length) throw new Error('unexpected end of data');
  }

  take(n: number): Uint8Array {
    this.need(n);
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  u8(): number {
    this.need(1);
    return this.bytes[this.pos++];
  }

  u32(): number {
    this.need(4);
    const b = this.bytes;
    const p = this.pos;
    this.pos += 4;
    return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
  }

  i32(): number {
    return this.u32() | 0;
  }

  varint(): number {
    const first = this.u8();
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const v = this.u8() | (this.u8() << 8);
      return v;
    }
    if (first === 0xfe) return this.u32();
    const lo = this.u32();
    const hi = this.u32();
    const v = hi * 0x100000000 + lo;
    if (!Number.isSafeInteger(v)) throw new Error('varint too large');
    return v;
  }
}

function readTx(r: Reader, index: number): ParsedTx {
  const bytes = r.bytes;
  const start = r.pos;
  r.take(4); // version
  // Segwit marker 0x00 + flag 0x01 after the version. Every block transaction
  // has at least one input, so a 0x00 here can only be the marker.
  const segwit = bytes[r.pos] === 0x00 && bytes[r.pos + 1] === 0x01;
  if (segwit) r.take(2);
  const bodyStart = r.pos;

  const inputCount = r.varint();
  const inputs: ParsedInput[] = [];
  for (let i = 0; i < inputCount; i++) {
    const prev = r.take(32);
    const prevVout = r.u32();
    r.take(r.varint()); // scriptSig
    r.take(4); // sequence
    inputs.push({ prevTxid: toReversedHex(prev), prevVout, witness: [] });
  }

  const outputCount = r.varint();
  for (let i = 0; i < outputCount; i++) {
    r.take(8); // value
    r.take(r.varint()); // scriptPubKey
  }
  const bodyEnd = r.pos;

  if (segwit) {
    for (const input of inputs) {
      const count = r.varint();
      for (let k = 0; k < count; k++) input.witness.push(r.take(r.varint()));
    }
  }
  r.take(4); // locktime
  const end = r.pos;

  // The txid commits to the transaction without marker, flag and witness.
  const h = new Sha256();
  if (segwit) {
    h.update(bytes.subarray(start, start + 4));
    h.update(bytes.subarray(bodyStart, bodyEnd));
    h.update(bytes.subarray(end - 4, end));
  } else {
    h.update(bytes.subarray(start, end));
  }
  const txid = toReversedHex(sha256dFinish(h));

  return { index, txid, inputs, outputCount, segwit };
}

function sha256dFinish(inner: Sha256): Uint8Array {
  return new Sha256().update(inner.digest()).digest();
}

/** Decode one transaction (e.g. /r/tx hex). Throws on trailing bytes. */
export function parseTx(bytes: Uint8Array): ParsedTx {
  const r = new Reader(bytes);
  const tx = readTx(r, 0);
  if (r.pos !== bytes.length) throw new Error('trailing bytes after transaction');
  return tx;
}

/** Merkle root over txids (display order in, internal bytes out). */
export function merkleRoot(txids: string[]): Uint8Array {
  if (txids.length === 0) throw new Error('no transactions');
  let layer = txids.map((t) => hexToBytesReversed(t));
  while (layer.length > 1) {
    if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]);
    const next: Uint8Array[] = [];
    for (let i = 0; i < layer.length; i += 2) next.push(sha256d(layer[i], layer[i + 1]));
    layer = next;
  }
  return layer[0];
}

function hexToBytesReversed(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[31 - i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Sibling hashes (display order) proving txids[index] is under the merkle root. */
export function merkleBranch(txids: string[], index: number): string[] {
  if (index < 0 || index >= txids.length) throw new Error('index out of range');
  let layer = txids.map((t) => hexToBytesReversed(t));
  let i = index;
  const branch: string[] = [];
  while (layer.length > 1) {
    if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]);
    branch.push(toReversedHex(layer[i ^ 1]));
    const next: Uint8Array[] = [];
    for (let k = 0; k < layer.length; k += 2) next.push(sha256d(layer[k], layer[k + 1]));
    layer = next;
    i >>= 1;
  }
  return branch;
}

/** Merkle root (display order) from a txid, its branch and its index. */
export function rootFromBranch(txid: string, branch: string[], index: number): string {
  let h = hexToBytesReversed(txid);
  let i = index;
  for (const sibling of branch) {
    const s = hexToBytesReversed(sibling);
    h = i & 1 ? sha256d(s, h) : sha256d(h, s);
    i >>= 1;
  }
  return toReversedHex(h);
}

/** Hash of an 80-byte header, display order. */
export function headerHash(header: Uint8Array): string {
  if (header.length !== 80) throw new Error('header must be 80 bytes');
  return toReversedHex(sha256d(header));
}

/**
 * Decode a full block. Throws on malformed or trailing bytes. The caller still
 * has to compare `hash` with the hash its sources report for the height, and
 * require `merkleOk`.
 */
export function parseBlock(bytes: Uint8Array): ParsedBlock {
  const r = new Reader(bytes);
  const headerBytes = r.take(80);
  const header: BlockHeader = {
    version: new Reader(headerBytes).i32(),
    prevHash: toReversedHex(headerBytes.subarray(4, 36)),
    merkleRoot: toReversedHex(headerBytes.subarray(36, 68)),
    time: new Reader(headerBytes.subarray(68, 72)).u32(),
    bits: new Reader(headerBytes.subarray(72, 76)).u32(),
    nonce: new Reader(headerBytes.subarray(76, 80)).u32(),
  };
  const count = r.varint();
  const txs: ParsedTx[] = [];
  for (let i = 0; i < count; i++) txs.push(readTx(r, i));
  if (r.pos !== bytes.length) throw new Error('trailing bytes after block');

  const txids = txs.map((t) => t.txid);
  const root = merkleRoot(txids);
  // A repeated txid is the CVE-2012-2459 mutation: same root, extra copies of
  // the last transactions. Core rejects such blocks, so do we.
  const unique = new Set(txids).size === txids.length;
  return {
    hash: headerHash(headerBytes),
    header,
    txs,
    computedMerkleRoot: toReversedHex(root),
    merkleOk: unique && equalBytes(root, headerBytes.subarray(36, 68)),
    size: bytes.length,
  };
}
