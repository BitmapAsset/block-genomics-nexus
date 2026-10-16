// Tail walk (n >= 942,000) and challengers, on a synthetic chain served by a
// replay fetch. Blocks are real consensus bytes with correct merkle roots; the
// "chain" is whatever hashes the fake ord and Esplora agree on.
import { describe, expect, it } from 'vitest';
import { resolve } from '../src/resolve.js';
import { verifyProof } from '../src/verify.js';
import { computeBundleHash } from '../src/proof.js';
import type { ProofBundle } from '../src/types.js';
import { memoryStores } from '../src/stores.js';
import { toHex } from '../src/bytes.js';
import type { OciPage } from '../src/sources/oci.js';
import { ascii, envelope, esploraVin, fastLimiter, readVector, replayFetch, scriptPathWitness, segwitBlock, segwitTx, tapscript, txidOf, type EnvelopeSpec, type HttpMap } from './helpers.js';

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
    const b = segwitBlock(h, txsAt[h] ?? [], prev);
    const txs = [b.coinbase, ...(txsAt[h] ?? [])];
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
        body: JSON.stringify({ txid, status: { confirmed: true, block_height: h, block_hash: b.hash }, vin: esploraVin(tx), vout: [{ scriptpubkey_address: HOLDER, value: 546 }] }),
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

describe('verifyProof on walk bundles (review #4)', () => {
  const N = 955000;
  const first = revealTx({ contentType: 'text/plain', body: `${N}.bitmap` });
  const dup = revealTx({ contentType: 'text/plain', body: `${N}.bitmap` });
  const chain = fakeChain(N, N + 1, { [N]: [first, dup] });
  const verify = (b: ProofBundle, extra = {}) => verifyProof(b, { limiter: fastLimiter(replayFetch(chain.http)), stores: memoryStores(), ...extra });
  const reseal = (b: Omit<ProofBundle, 'bundleHash'> & { bundleHash?: string }) => ({ ...b, bundleHash: computeBundleHash(b as ProofBundle) }) as ProofBundle;

  it('an honest walk bundle re-scans clean', async () => {
    const r = await run(chain, N);
    expect(r.canonicalId).toBe(`${txidOf(first)}i0`);
    expect(await verify(r.proof)).toEqual({ ok: true, diffs: [], holderDiffs: [], notes: [] });
  });

  it('a re-sealed bundle that drops the walked blocks is caught', async () => {
    const r = await run(chain, N);
    const forged = reseal({ ...r.proof, firstness: { ...r.proof.firstness, walked: [] } });
    const v = await verify(forged);
    expect(v.ok).toBe(false);
    expect(v.diffs.join('\n')).toMatch(/no walked blocks/);
  });

  it('a re-sealed bundle naming the later duplicate is caught by the re-scan', async () => {
    const r = await run(chain, N);
    const c = r.proof.canonical!;
    const dupId = `${txidOf(dup)}i0`;
    const ins = JSON.parse(chain.http[`${ORD}/r/inscription/${dupId}`].body as string);
    const forged = reseal({ ...r.proof, holder: null, canonical: { ...c, id: dupId, revealTxid: txidOf(dup), number: ins.number, sat: String(ins.sat) } });
    const v = await verify(forged);
    expect(v.ok).toBe(false);
    expect(v.diffs.join('\n')).toMatch(new RegExp(`first valid claim in block ${N} is ${txidOf(first)}i0`));
  });

  it('a forged none is caught when a walked block holds a valid claim', async () => {
    const r = await run(chain, N);
    const forged = reseal({ ...r.proof, verdict: 'none', canonical: null, holder: null, checkedAtHeight: N });
    const v = await verify(forged);
    expect(v.ok).toBe(false);
    expect(v.diffs.join('\n')).toMatch(/but the bundle says none/);
  });

  it('a "not mined yet" none verifies while true; once mined, a claim in the new block makes it out of date', async () => {
    const r = await run(chain, N + 100);
    expect(r.verdict).toBe('none');
    expect(r.proof.firstness.walked).toEqual([]);
    expect(await verify(r.proof)).toEqual({ ok: true, diffs: [], holderDiffs: [], notes: [] });
    const claim = revealTx({ body: `${N + 100}.bitmap` });
    const ahead = fakeChain(N + 100, N + 100, { [N + 100]: [claim] });
    const v = await verifyProof(r.proof, { limiter: fastLimiter(replayFetch({ ...chain.http, ...ahead.http })), stores: memoryStores() });
    expect(v.ok).toBe(false);
    expect(v.diffs.join('\n')).toMatch(/out of date/);
    const empty = fakeChain(N + 100, N + 100, {});
    expect(await verifyProof(r.proof, { limiter: fastLimiter(replayFetch({ ...chain.http, ...empty.http })), stores: memoryStores() })).toEqual({
      ok: true,
      diffs: [],
      holderDiffs: [],
      notes: [],
    });
  });

  it('a none over walked blocks is out of date once a later block holds the deed (re-review #4a)', async () => {
    const M = 957000;
    const early = fakeChain(M, M + 1, {});
    const r = await run(early, M, { walkCap: 5 });
    expect(r.verdict).toBe('none');
    expect(r.proof.checkedAtHeight).toBe(M + 1);
    // The deed lands in M+2, after the bundle was made.
    const deed = revealTx({ body: `${M}.bitmap` });
    const grown = fakeChain(M, M + 2, { [M + 2]: [deed] });
    // The grown chain stands in for the same chain later: point the bundle's walked hashes at it.
    const bundle = reseal({ ...r.proof, firstness: { ...r.proof.firstness, walked: [M, M + 1].map((h) => ({ height: h, hash: grown.hashes[h] })) } });
    const v = await verifyProof(bundle, { limiter: fastLimiter(replayFetch(grown.http)), stores: memoryStores() });
    expect(v.ok).toBe(false);
    expect(v.diffs.join('\n')).toMatch(new RegExp(`valid claim ${txidOf(deed)}i0 in block ${M + 2}.*out of date`));
  });

  it('a none says how many newer blocks it did not re-scan', async () => {
    const M = 958000;
    const r = await run(fakeChain(M, M, {}), M, { walkCap: 5 });
    const grown = fakeChain(M, M + 6, {});
    const bundle = reseal({ ...r.proof, firstness: { ...r.proof.firstness, walked: [{ height: M, hash: grown.hashes[M] }] } });
    const v = await verifyProof(bundle, { limiter: fastLimiter(replayFetch(grown.http)), stores: memoryStores() });
    expect(v.ok).toBe(true);
    expect(v.notes).toEqual([`3 block(s) mined after checkedAtHeight ${M} not re-scanned; re-resolve for a current answer`]);
  });

  it('rejects bundle shapes the resolver never produces, and says what it did not re-check', async () => {
    const r = await run(chain, N);
    const low = reseal({ ...r.proof, height: 900000 });
    expect((await verify(low)).diffs.join('\n')).toMatch(/firstness.method "walk" for 900000: the resolver uses oci there/);
    // A method the resolver never writes (or none) cannot skip the first-ness checks (third review).
    const odd = reseal({ ...r.proof, firstness: { ...r.proof.firstness, method: 'x' as never } });
    expect((await verify(odd)).diffs.join('\n')).toMatch(/firstness.method "x" for 955000: the resolver uses walk there/);
    const { method: _m, ...noMethod } = r.proof.firstness;
    void _m;
    const missing = reseal({ ...r.proof, firstness: noMethod as never });
    expect((await verify(missing)).ok).toBe(false);
    const weird = reseal({ ...r.proof, verdict: 'maybe' as never });
    expect((await verify(weird)).diffs.join('\n')).toMatch(/unknown verdict "maybe"/);
    const ociNone = reseal({ ...r.proof, verdict: 'none', canonical: null, holder: null, firstness: { method: 'oci', walked: [] } });
    expect((await verify(ociNone)).diffs.join('\n')).toMatch(/not authoritative about absence/);
    const disputed = reseal({ ...r.proof, verdict: 'disputed', canonical: null, holder: null });
    const v = await verify(disputed);
    expect(v.notes).toEqual(['a disputed bundle is checked for its hash and walked block hashes only']);
  });

  it('a long walk re-scans the first and last block and says so', async () => {
    const M = 956000;
    const late = revealTx({ body: `${M}.bitmap` });
    const long = fakeChain(M, M + 5, { [M + 4]: [late] });
    const r = await run(long, M, { walkCap: 10 });
    expect(r.proof.firstness.walked).toHaveLength(5);
    const v = await verifyProof(r.proof, { limiter: fastLimiter(replayFetch(long.http)), stores: memoryStores() });
    expect(v.ok).toBe(true);
    expect(v.notes).toEqual(['re-scanned 2 of 5 walked blocks (first and last)']);
  });
});

describe('walk: unbound first claim (review #9)', () => {
  it('a null sat alone is not unbound (ord without a sat index reports null for everything)', async () => {
    const N = 953500;
    const claim = revealTx({ body: `${N}.bitmap` });
    const chain = fakeChain(N, N + 1, { [N]: [claim] });
    const url = `${ORD}/r/inscription/${txidOf(claim)}i0`;
    const ins = JSON.parse(chain.http[url].body as string);
    chain.http[url] = { status: 200, body: JSON.stringify({ ...ins, sat: null }) };
    const r = await run(chain, N);
    expect(r.verdict).toBe('canonical');
    expect(r.sat).toBeNull();
  });

  it('an inscription ord calls unbound (zero-value input: no sat) makes the verdict undetermined', async () => {
    const N = 953000;
    const claim = revealTx({ body: `${N}.bitmap` });
    const chain = fakeChain(N, N + 1, { [N]: [claim] });
    const url = `${ORD}/r/inscription/${txidOf(claim)}i0`;
    const ins = JSON.parse(chain.http[url].body as string);
    chain.http[url] = { status: 200, body: JSON.stringify({ ...ins, sat: null, charms: ['unbound'] }) };
    const r = await run(chain, N);
    expect(r.verdict).toBe('undetermined');
    expect(r.caveats).toEqual(['unbound']);
    expect(r.candidateId).toBe(`${txidOf(claim)}i0`);
  });
});

describe('walk: challengers against a walk (review #2)', () => {
  const N = 954000;

  function presented(chain: FakeChain, height: number) {
    // A valid N.bitmap reveal the fake ord and Esplora place at `height`.
    const tx = revealTx({ contentType: 'text/plain', body: `${N}.bitmap` });
    const txid = txidOf(tx);
    const hash = chain.hashes[height] ?? (height.toString(16).padStart(8, '0') + 'ef').repeat(7).slice(0, 64);
    chain.http[`${ORD}/r/tx/${txid}`] = { status: 200, body: JSON.stringify(toHex(tx)) };
    chain.http[`${ORD}/r/inscription/${txid}i0`] = {
      status: 200,
      body: JSON.stringify({ id: `${txid}i0`, number: 1, height, sat: 77, satpoint: `${txid}:0:0`, address: HOLDER, content_type: 'text/plain', charms: [], delegate: null, value: 546 }),
    };
    chain.http[`${ESP}/tx/${txid}`] = { status: 200, body: JSON.stringify({ txid, status: { confirmed: true, block_height: height, block_hash: hash }, vin: esploraVin(tx), vout: [] }) };
    chain.http[`${ORD}/r/blockhash/${height}`] = { status: 200, body: JSON.stringify(hash) };
    chain.http[`${ESP}/block-height/${height}`] = { status: 200, body: hash };
    return `${txid}i0`;
  }

  it('a valid claim revealed after the walked range turns none into undetermined with a cursor, never disputed', async () => {
    const chain = fakeChain(N, N + 2, {});
    const id = presented(chain, N + 3); // a block that landed after the tip was read
    const r = await run(chain, N, { walkCap: 10, challengers: [id] });
    expect(r.verdict).toBe('undetermined');
    expect(r.cursor).toBe(N + 3);
    expect(r.challengers).toEqual([{ id, outcome: 'valid_no_candidate', revealHeight: N + 3 }]);
  });

  it('a valid claim inside blocks the walk scanned and found empty is disputed', async () => {
    const chain = fakeChain(N, N + 2, {});
    const id = presented(chain, N + 1);
    const r = await run(chain, N, { walkCap: 10, challengers: [id] });
    expect(r.verdict).toBe('disputed');
    expect(r.reason).toMatch(/scanned without finding/);
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

  it('a forged witness (same-length body swap, txids unchanged) is caught and Esplora raw is used', async () => {
    const decoy = revealTx({ contentType: 'text/plain', body: 'hello world!!' }); // 13 bytes, like "952000.bitmap"
    const chain = fakeChain(N, N + 1, { [N]: [decoy] });
    const good = chain.bytes[N];
    const forged = Uint8Array.from(good);
    const from = Buffer.from('hello world!!');
    const at = Buffer.from(forged).indexOf(from);
    expect(at).toBeGreaterThan(0);
    forged.set(Buffer.from(`${N}.bitmap`), at);
    chain.http[`${ORD}/r/block/${N}`] = { status: 200, body: JSON.stringify(toHex(forged)) };
    chain.http[`${ESP}/block/${chain.hashes[N]}/raw`] = { status: 200, body: good };
    const r = await run(chain, N, { walkCap: 2 });
    // The honest block has no claim for N, so the forged one must not win.
    expect(r.verdict).toBe('none');
    expect(r.sources.find((s) => s.name === 'rblock')?.detail).toMatch(/witness commitment/);
    expect(r.sources.find((s) => s.name === 'mempool-raw')?.verdict).toBe('agree');
  });

  it('a forged witness from both byte sources is undetermined, never a grant', async () => {
    const decoy = revealTx({ contentType: 'text/plain', body: 'hello world!!' });
    const chain = fakeChain(N, N + 1, { [N]: [decoy] });
    const forged = Uint8Array.from(chain.bytes[N]);
    forged.set(Buffer.from(`${N}.bitmap`), Buffer.from(forged).indexOf(Buffer.from('hello world!!')));
    chain.http[`${ORD}/r/block/${N}`] = { status: 200, body: JSON.stringify(toHex(forged)) };
    chain.http[`${ESP}/block/${chain.hashes[N]}/raw`] = { status: 200, body: forged };
    const r = await run(chain, N);
    expect(r.verdict).toBe('undetermined');
    expect(r.canonicalId).toBeNull();
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
    http[`${ESP}/tx/${txid}`] = { status: 200, body: JSON.stringify({ txid, status: { confirmed: true, block_height: height, block_hash: hash }, vin: esploraVin(tx), vout: [] }) };
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

  it('a challenger whose witness Esplora reports differently is unavailable, and the verdict stops being canonical', async () => {
    const { http, stores } = context();
    const id = challenger('208.bitmap', deedHeight + 7, http);
    const url = `${ESP}/tx/${id.slice(0, 64)}`;
    const body = JSON.parse(http[url].body as string);
    const w = body.vin[0].witness[1] as string; // the tapscript
    body.vin[0].witness[1] = w.slice(0, -2) + (w.endsWith('68') ? '69' : '68');
    http[url] = { status: 200, body: JSON.stringify(body) };
    const r = await resolve(208, { freshness: 'auth', limiter: fastLimiter(replayFetch(http)), stores, challengers: [id] });
    expect(r.challengers).toEqual([{ id, outcome: 'unavailable' }]);
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toMatch(/witness/);
  });

  it('a later valid claim is not called not_first when the OCI candidate is not established (review #7)', async () => {
    const { http, stores } = context();
    // Make ord report a different sat for the deed: the OCI candidate is no longer confirmed.
    const insUrl = `${ORD}/r/inscription/${deed}`;
    http[insUrl] = { status: 200, body: JSON.stringify({ ...JSON.parse(http[insUrl].body as string), sat: 1 }) };
    const later = challenger('208.bitmap', deedHeight + 50, http);
    const r = await resolve(208, { freshness: 'auth', limiter: fastLimiter(replayFetch(http)), stores, challengers: [later] });
    expect(r.verdict).toBe('undetermined');
    expect(r.challengers).toEqual([{ id: later, outcome: 'valid_no_candidate', revealHeight: deedHeight + 50 }]);
    expect(r.ignored).toEqual([]);
  });

  it('a claim revealed below block 208 itself is inscribed_before_block', async () => {
    const { http, stores } = context();
    const early = challenger('208.bitmap', 207, http);
    const r = await resolve(208, { freshness: 'auth', limiter: fastLimiter(replayFetch(http)), stores, challengers: [early] });
    expect(r.verdict).toBe('canonical');
    expect(r.ignored).toEqual([{ id: early, reason: 'inscribed_before_block', revealHeight: 207 }]);
  });
});
