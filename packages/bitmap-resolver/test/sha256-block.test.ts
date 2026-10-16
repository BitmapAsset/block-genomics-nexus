import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { toHex } from '../src/bytes.js';
import { headerHash, merkleBranch, parseBlock, parseTx, rootFromBranch } from '../src/parse/block.js';
import { Sha256, sha256, sha256d } from '../src/sha256.js';
import { block, coinbaseTx, readVector, segwitBlock, segwitTx, stripWitness, txidOf } from './helpers.js';

describe('sha256', () => {
  it('matches FIPS vectors', () => {
    expect(toHex(sha256(new Uint8Array(0)))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(toHex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(toHex(sha256(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches node:crypto on random lengths, in one piece and in slices', () => {
    for (const n of [1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 1000, 4097]) {
      const data = new Uint8Array(randomBytes(n));
      const want = createHash('sha256').update(data).digest('hex');
      expect(toHex(sha256(data))).toBe(want);
      const h = new Sha256();
      for (let i = 0; i < n; i += 37) h.update(data.subarray(i, i + 37));
      expect(toHex(h.digest())).toBe(want);
    }
  });

  it('double-hashes the genesis header to the genesis hash', () => {
    const { blocks } = readVector('blocks-small.json');
    expect(headerHash(Uint8Array.from(Buffer.from(blocks['0'].hex.slice(0, 160), 'hex')))).toBe(
      '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
    );
    expect(toHex(sha256d(new Uint8Array(0)))).toBe('5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456');
  });
});

describe('parseBlock on real blocks 0, 170, 208', () => {
  const { blocks } = readVector('blocks-small.json');
  for (const h of ['0', '170', '208']) {
    it(`block ${h}: header hash equals ord and Esplora, merkle root recomputes`, () => {
      const b = blocks[h];
      const parsed = parseBlock(Uint8Array.from(Buffer.from(b.hex, 'hex')));
      expect(parsed.hash).toBe(b.ordHash);
      expect(parsed.hash).toBe(b.esploraHash);
      expect(parsed.merkleOk).toBe(true);
      expect(parsed.witnessOk).toBe(true); // pre-segwit: nothing to commit to
      expect(parsed.computedMerkleRoot).toBe(parsed.header.merkleRoot);
      expect(parsed.txs.length).toBe(b.txCount);
    });
  }

  it('finds the genesis coinbase and the first payment (block 170)', () => {
    const g = parseBlock(Uint8Array.from(Buffer.from(blocks['0'].hex, 'hex')));
    expect(g.txs[0].txid).toBe('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');
    const b170 = parseBlock(Uint8Array.from(Buffer.from(blocks['170'].hex, 'hex')));
    expect(b170.txs.map((t) => t.txid)).toContain('f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16');
  });

  it('detects a flipped byte and refuses trailing bytes', () => {
    const bytes = Uint8Array.from(Buffer.from(blocks['170'].hex, 'hex'));
    const tampered = Uint8Array.from(bytes);
    tampered[tampered.length - 10] ^= 1; // inside the last tx
    const parsed = parseBlock(tampered);
    expect(parsed.hash).toBe(blocks['170'].ordHash); // header untouched
    expect(parsed.merkleOk).toBe(false);
    expect(() => parseBlock(Uint8Array.from([...bytes, 0]))).toThrow(/trailing/);
    expect(() => parseBlock(bytes.subarray(0, bytes.length - 1))).toThrow();
  });
});

describe('synthetic blocks', () => {
  it('computes segwit txids without the witness and builds a valid merkle root', () => {
    const tx = segwitTx([[new Uint8Array(64), new Uint8Array([1, 2, 3])]]);
    const parsed = parseTx(tx);
    expect(parsed.segwit).toBe(true);
    expect(parsed.inputs[0].witness.length).toBe(2);
    const b = block([coinbaseTx(5), tx]);
    const pb = parseBlock(b.bytes);
    expect(pb.hash).toBe(b.hash);
    expect(pb.merkleOk).toBe(true);
    expect(pb.txs[1].txid).toBe(txidOf(tx));
  });

  it('rejects the duplicate-txid merkle mutation (CVE-2012-2459)', () => {
    const cb = coinbaseTx(9);
    const t1 = segwitTx([[new Uint8Array(64), new Uint8Array(3)]]);
    const t2 = segwitTx([[new Uint8Array(64), new Uint8Array(4)]]);
    const honest = block([cb, t1, t2]);
    // Same header (same root), last tx repeated: [cb, t1, t2, t2] has the root of [cb, t1, t2].
    const header = honest.bytes.subarray(0, 80);
    const mutated = Uint8Array.from([...header, 4, ...cb, ...t1, ...t2, ...t2]);
    const parsed = parseBlock(mutated);
    expect(parsed.hash).toBe(honest.hash);
    expect(parsed.computedMerkleRoot).toBe(parsed.header.merkleRoot);
    expect(parsed.merkleOk).toBe(false);
  });

  it('checks the BIP141 witness commitment: segwit data without it, or with a changed witness, fails', () => {
    const t1 = segwitTx([[new Uint8Array(64), new TextEncoder().encode('hello world!!')]]);
    const good = segwitBlock(950000, [t1]);
    const parsed = parseBlock(good.bytes);
    expect(parsed.merkleOk).toBe(true);
    expect(parsed.witnessOk).toBe(true);
    // Same-length witness swap: txids, merkle root and block hash unchanged.
    const forged = Uint8Array.from(good.bytes);
    forged.set(new TextEncoder().encode('950000.bitmap'), Buffer.from(forged).indexOf(Buffer.from('hello world!!')));
    const pf = parseBlock(forged);
    expect(pf.hash).toBe(good.hash);
    expect(pf.merkleOk).toBe(true);
    expect(pf.witnessOk).toBe(false);
    // Segwit txs but a coinbase without any commitment.
    expect(parseBlock(block([coinbaseTx(1), t1]).bytes).witnessOk).toBe(false);
    // No witness data at all: nothing to commit to.
    expect(parseBlock(block([coinbaseTx(2)]).bytes).witnessOk).toBe(true);
  });

  it('a block served with every witness stripped fails: the commitment stays, the reserved value is gone (re-review #1)', () => {
    const t1 = segwitTx([[new Uint8Array(64), new TextEncoder().encode('960000.bitmap')]]);
    const good = segwitBlock(960000, [t1]);
    const header = good.bytes.subarray(0, 80);
    const stripped = Uint8Array.from([...header, 2, ...stripWitness(good.coinbase), ...stripWitness(t1)]);
    const parsed = parseBlock(stripped);
    expect(parsed.hash).toBe(good.hash);
    expect(parsed.merkleOk).toBe(true); // txids do not cover witnesses
    expect(parsed.txs.some((t) => t.segwit)).toBe(false);
    expect(parsed.witnessOk).toBe(false);
    expect(parseBlock(good.bytes).witnessOk).toBe(true);
  });

  it('merkle branches prove inclusion', () => {
    const txs = [coinbaseTx(1), ...Array.from({ length: 6 }, (_, i) => segwitTx([[new Uint8Array(64), Uint8Array.of(i)]]))];
    const pb = parseBlock(block(txs).bytes);
    const ids = pb.txs.map((t) => t.txid);
    for (let i = 0; i < ids.length; i++) expect(rootFromBranch(ids[i], merkleBranch(ids, i), i)).toBe(pb.header.merkleRoot);
    expect(rootFromBranch(ids[2], merkleBranch(ids, 2), 3)).not.toBe(pb.header.merkleRoot);
  });

  it('969788 tail vector: reveal tx is under the header merkle root, header hashes to the block hash', () => {
    const t = readVector('tail-969788.json');
    expect(headerHash(Uint8Array.from(Buffer.from(t.headerHex, 'hex')))).toBe(t.blockHash);
    const tx = parseTx(Uint8Array.from(Buffer.from(t.reveal.hex, 'hex')));
    expect(tx.txid).toBe(t.reveal.txid);
    expect(rootFromBranch(tx.txid, t.reveal.branch, t.reveal.txIndex)).toBe(t.merkleRoot);
    expect(t.reveal.txIndex).toBe(1798);
  });
});
