// Tail walk (n >= 942,000) and challengers, on a synthetic chain served by a
// replay fetch. Blocks are real consensus bytes with correct merkle roots; the
// "chain" is whatever hashes the fake ord and Esplora agree on.
import { describe, expect, it } from 'vitest';
import { resolve } from '../src/resolve.js';
import { memoryStores } from '../src/stores.js';
import { toHex } from '../src/bytes.js';
import type { OciPage } from '../src/sources/oci.js';
import { ascii, block, coinbaseTx, envelope, fastLimiter, readVector, replayFetch, scriptPathWitness, segwitTx, tapscript, txidOf, type EnvelopeSpec, type HttpMap } from './helpers.js';

const ORD = 'https://ordinals.com';
const ESP = 'https://blockstream.info/api';
const HOLDER = 'bc1ptestholder00000000000000000000000000000000000000000000';

const revealTx = (...specs: EnvelopeSpec[]) => segwitTx([scriptPathWitness(tapscript(...specs.map(envelope)))]);

interface FakeChain {
  http: HttpMap;
  hashes: Record<number, string>;
  bytes: Record<number, Uint8Array>;
}

/** Blocks from `from` to `tip`; `txsAt[h]` are the non-coinbase txs of block h. */
function fakeChain(from: number, tip: number, txsAt: Record<number, Uint8Array[]>): FakeChain {
  const http: HttpMap = {};
  const hashes: Record<number, string> = {};
  const bytes: Record<number, Uint8Array> = {};
  let prev = '00'.repeat(32);
  let number = 100_000_000;
  for (let h = from; h <= tip; h++) {
    const txs = [coinbaseTx(h), ...(txsAt[h] ?? [])];
    const b = block(txs, prev);
    prev = b.hash;
    hashes[h] = b.hash;
    bytes[h] = b.bytes;
    http[`${ORD}/r/blockhash/${h}`] = { status: 200, body: JSON.stringify(b.hash) };
    http[`${ESP}/block-height/${h}`] = { status: 200, body: b.hash };
    http[`${ORD}/r/block/${h}`] = { status: 200, body: JSON.stringify(toHex(b.bytes)) };
    http[`${ESP}/block/${b.hash}/txids`] = { status: 200, body: JSON.stringify(txs.map(txidOf)) };
    for (const tx of txs.slice(1)) {
      const txid = txidOf(tx);
      http[`${ORD}/r/tx/${txid}`] = { status: 200, body: JSON.stringify(toHex(tx)) };
      http[`${ESP}/tx/${txid}`] = {
        status: 200,
        body: JSON.stringify({ txid, status: { confirmed: true, block_height: h, block_hash: b.hash }, vout: [{ scriptpubkey_address: HOLDER, value: 546 }] }),
      };
      http[`${ESP}/tx/${txid}/outspend/0`] = { status: 200, body: JSON.stringify({ spent: false }) };
      for (let i = 0; i < 8; i++) {
        http[`${ORD}/r/inscription/${txid}i${i}`] = {
          status: 200,
          body: JSON.stringify({ id: `${txid}i${i}`, number: number++, height: h, sat: 1_000_000_000 + number, satpoint: `${txid}:0:0`, address: HOLDER, content_type: 'text/plain', charms: [], delegate: null, value: 546 }),
        };
      }
    }
  }
  http[`${ORD}/r/blockheight`] = { status: 200, body: String(tip) };
  http[`${ESP}/blocks/tip/height`] = { status: 200, body: String(tip) };
  return { http, hashes, bytes };
}

function run(chain: FakeChain, n: number, extra: Partial<Parameters<typeof resolve>[1]> = {}) {
  const limiter = fastLimiter(replayFetch(chain.http));
  return resolve(n, { freshness: 'auth', limiter, stores: memoryStores(), ...extra });
}

describe('walk: first valid claim in reveal order wins', () => {
  const N = 950000;
  const incomplete = revealTx({ body: `${N}.bitmap`, endif: false });
  const encoded = revealTx({ contentType: 'text/plain', body: `${N}.bitmap`, fields: [[9, ascii('br')]] });
  const delegated = revealTx({ body: `${N}.bitmap`, fields: [[11, new Uint8Array(32).fill(3)]] });
  const bare = revealTx({ contentType: 'text/plain', body: `${N}` });
  const spaced = revealTx({ contentType: 'text/plain', body: `${N}.bitmap\n` });
  const valid = revealTx({ contentType: 'text/plain;charset=utf-8', body: `${N}.bitmap` });
  const dup = revealTx({ contentType: 'text/plain', body: `${N}.bitmap` });
  const chain = fakeChain(N, N + 5, { [N]: [incomplete, encoded, delegated, bare, spaced, valid, dup] });

  it('skips every invalid copy with its reason, grants the first valid, marks the later copy not_first', async () => {
    const r = await run(chain, N);
    expect(r.verdict).toBe('canonical');
    expect(r.canonicalId).toBe(`${txidOf(valid)}i0`);
    expect(r.holder).toBe(HOLDER);
    expect(r.firstness).toEqual({ method: 'walk', walkedFrom: N, walkedTo: N });
    expect(r.proof.firstness.walked).toEqual([{ height: N, hash: chain.hashes[N] }]);
    expect(r.ignored).toEqual([
      { id: `envelope:${txidOf(incomplete)}:0:0`, reason: 'incomplete', revealHeight: N },
      { id: `${txidOf(encoded)}i0`, reason: 'content_encoding', revealHeight: N },
      { id: `${txidOf(delegated)}i0`, reason: 'delegate', revealHeight: N },
      { id: `${txidOf(bare)}i0`, reason: 'bare_number', revealHeight: N },
      { id: `${txidOf(spaced)}i0`, reason: 'whitespace', revealHeight: N },
      { id: `${txidOf(dup)}i0`, reason: 'not_first', revealHeight: N },
    ]);
    expect(r.sources.map((s) => `${s.name}:${s.verdict}`)).toEqual(['rblock:agree', 'ord:agree', 'esplora:agree']);
    expect(r.proof.canonical?.contentType).toBe('text/plain;charset=utf-8');
  });

  it('within one tx, the first envelope wins over a later one', async () => {
    const two = revealTx({ body: `${N + 2}.bitmap` }, { body: `${N + 2}.bitmap` });
    const c = fakeChain(N + 2, N + 3, { [N + 2]: [two] });
    const r = await run(c, N + 2);
    expect(r.canonicalId).toBe(`${txidOf(two)}i0`);
    expect(r.ignored).toEqual([{ id: `${txidOf(two)}i1`, reason: 'not_first', revealHeight: N + 2 }]);
  });
});

describe('walk: across blocks, caps, tip and the future', () => {
  const N = 951000;
  const later = revealTx({ contentType: 'text/plain', body: `${N}.bitmap` });
  const chain = fakeChain(N, N + 6, { [N + 2]: [later] });

  it('finds a claim made two blocks later and records every walked block', async () => {
    const r = await run(chain, N);
    expect(r.verdict).toBe('canonical');
    expect(r.canonicalId).toBe(`${txidOf(later)}i0`);
    expect(r.proof.firstness.walked.map((w) => w.height)).toEqual([N, N + 1, N + 2]);
    expect(r.proof.canonical?.revealHeight).toBe(N + 2);
  });

  it('stops at the walk cap with undetermined and a cursor, never a guess', async () => {
    const r = await run(chain, N, { walkCap: 2 });
    expect(r.verdict).toBe('undetermined');
    expect(r.canonicalId).toBeNull();
    expect(r.cursor).toBe(N + 2);
    expect(r.reason).toMatch(/cap/);
  });

  it('says none (up to the tip) when no block holds a valid claim', async () => {
    const r = await run(chain, N + 3, { walkCap: 10 });
    expect(r.verdict).toBe('none');
    expect(r.reason).toBe(`no valid claim up to block ${N + 6}`);
    expect(r.firstness).toEqual({ method: 'walk', walkedFrom: N + 3, walkedTo: N + 6 });
  });

  it('says none for a block that is not mined yet', async () => {
    const r = await run(chain, N + 100);
    expect(r.verdict).toBe('none');
    expect(r.reason).toMatch(/not mined yet/);
  });

  it('a claim for a later height inside a scanned block is not a copy of n', async () => {
    const other = revealTx({ body: `${N + 1}.bitmap` }); // revealed in N, names N+1: valid for N+1
    const c = fakeChain(N, N + 2, { [N]: [other] });
    const r = await run(c, N + 1, { walkCap: 5 });
    // The walk for N+1 starts at block N+1, so the reveal in block N is invisible to it.
    expect(r.verdict).toBe('none');
  });
});

describe('walk: sources must agree', () => {
  const N = 952000;
  const claim = revealTx({ body: `${N}.bitmap` });

  it('undetermined when ord and Esplora name different hashes for a block', async () => {
    const chain = fakeChain(N, N + 1, { [N]: [claim] });
    chain.http[`${ESP}/block-height/${N}`] = { status: 200, body: 'ab'.repeat(32) };
    const r = await run(chain, N);
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toMatch(/hash/);
    expect(r.sources.find((s) => s.name === 'esplora')?.verdict).toBe('disagree');
  });

  it('bad bytes from ord fall back to Esplora raw by the agreed hash', async () => {
    const chain = fakeChain(N, N + 1, { [N]: [claim] });
    const good = chain.bytes[N];
    const bad = Uint8Array.from(good);
    bad[bad.length - 1] ^= 0xff; // locktime of the last tx: changes its txid, so the merkle check fails
    chain.http[`${ORD}/r/block/${N}`] = { status: 200, body: JSON.stringify(toHex(bad)) };
    chain.http[`${ESP}/block/${chain.hashes[N]}/raw`] = { status: 200, body: good };
    const r = await run(chain, N);
    expect(r.verdict).toBe('canonical');
    expect(r.sources.find((s) => s.name === 'rblock')?.verdict).toBe('disagree');
    expect(r.sources.find((s) => s.name === 'mempool-raw')?.verdict).toBe('agree');
  });

  it('undetermined when ord is down', async () => {
    const chain = fakeChain(N, N + 1, { [N]: [claim] });
    chain.http[`${ORD}/r/blockheight`] = { status: 503, body: 'down' };
    const r = await run(chain, N);
    expect(r.verdict).toBe('undetermined');
    expect(r.sources.find((s) => s.name === 'ord')?.verdict).toBe('unreachable');
  });

  it('canonical with no holder when ord and Esplora disagree on the output', async () => {
    const chain = fakeChain(N, N + 1, { [N]: [claim] });
    chain.http[`${ESP}/tx/${txidOf(claim)}/outspend/0`] = { status: 200, body: JSON.stringify({ spent: true }) };
    const r = await run(chain, N);
    expect(r.verdict).toBe('canonical');
    expect(r.holder).toBeNull();
    expect(r.proof.holder).toBeNull();
    expect(r.reason).toMatch(/holder unavailable/);
  });

  it('answers undetermined at the deadline and keeps working in the background', async () => {
    const chain = fakeChain(N, N + 1, { [N]: [claim] });
    const slow = replayFetch(chain.http);
    const delayed = (async (u: RequestInfo | URL) => {
      await new Promise((r) => setTimeout(r, 30));
      return slow(u);
    }) as typeof fetch;
    const stores = memoryStores();
    const r = await resolve(N, { freshness: 'display', limiter: fastLimiter(delayed), stores, deadlineMs: 5 });
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toMatch(/background/);
  });
});

describe('challengers (OCI path, 208)', () => {
  const v = readVector('heights/208.json');
  const deed = v.expected.canonicalId as string;
  const deedHeight = v.expected.canonical.revealHeight as number;

  /** A reveal of `body` at `height`, made consistent across fake ord and Esplora. */
  function challenger(body: string, height: number, http: HttpMap) {
    const tx = revealTx({ contentType: 'text/plain', body });
    const txid = txidOf(tx);
    const hash = (height.toString(16).padStart(8, '0') + 'cd').repeat(7).slice(0, 64);
    http[`${ORD}/r/tx/${txid}`] = { status: 200, body: JSON.stringify(toHex(tx)) };
    http[`${ORD}/r/inscription/${txid}i0`] = {
      status: 200,
      body: JSON.stringify({ id: `${txid}i0`, number: 99_000_000 + height, height, sat: 5, satpoint: `${txid}:0:0`, address: HOLDER, content_type: 'text/plain', charms: [], delegate: null, value: 546 }),
    };
    http[`${ESP}/tx/${txid}`] = { status: 200, body: JSON.stringify({ txid, status: { confirmed: true, block_height: height, block_hash: hash }, vout: [] }) };
    http[`${ORD}/r/blockhash/${height}`] = { status: 200, body: JSON.stringify(hash) };
    http[`${ESP}/block-height/${height}`] = { status: 200, body: hash };
    return `${txid}i0`;
  }

  function context() {
    const http: HttpMap = { ...v.http };
    const stores = memoryStores();
    const page: OciPage = { page: v.oci.page, pageId: v.oci.pageId, sats: v.oci.sparse.sats, satIndexMap: v.oci.sparse.satIndexMap };
    void stores.immutable.set(`oci:${v.oci.pageId}`, page);
    return { http, stores };
  }

  it('a later duplicate is ignored as not_first and the deed stands', async () => {
    const { http, stores } = context();
    const dup = challenger('208.bitmap', deedHeight + 1000, http);
    const r = await resolve(208, { freshness: 'auth', limiter: fastLimiter(replayFetch(http)), stores, challengers: [dup] });
    expect(r.verdict).toBe('canonical');
    expect(r.canonicalId).toBe(deed);
    expect(r.ignored).toEqual([{ id: dup, reason: 'not_first', revealHeight: deedHeight + 1000 }]);
    expect(r.challengers).toEqual([{ id: dup, outcome: 'valid_later', revealHeight: deedHeight + 1000 }]);
  });

  it('a bare "208" is ignored as bare_number', async () => {
    const { http, stores } = context();
    const bareId = challenger('208', deedHeight + 5, http);
    const r = await resolve(208, { freshness: 'auth', limiter: fastLimiter(replayFetch(http)), stores, challengers: [bareId] });
    expect(r.verdict).toBe('canonical');
    expect(r.ignored).toEqual([{ id: bareId, reason: 'bare_number', revealHeight: deedHeight + 5 }]);
  });

  it('a valid claim revealed before the OCI deed makes the verdict disputed, never a grant', async () => {
    const { http, stores } = context();
    const earlier = challenger('208.bitmap', deedHeight - 1000, http);
    const r = await resolve(208, { freshness: 'auth', limiter: fastLimiter(replayFetch(http)), stores, challengers: [earlier] });
    expect(r.verdict).toBe('disputed');
    expect(r.canonicalId).toBeNull();
    expect(r.candidateId).toBe(deed);
    expect(r.holder).toBeNull();
    expect(r.proof.canonical).toBeNull();
    expect(r.challengers[0].outcome).toBe('valid_earlier');
  });

  it('a claim revealed below block 208 itself is inscribed_before_block', async () => {
    const { http, stores } = context();
    const early = challenger('208.bitmap', 207, http);
    const r = await resolve(208, { freshness: 'auth', limiter: fastLimiter(replayFetch(http)), stores, challengers: [early] });
    expect(r.verdict).toBe('canonical');
    expect(r.ignored).toEqual([{ id: early, reason: 'inscribed_before_block', revealHeight: 207 }]);
  });
});
