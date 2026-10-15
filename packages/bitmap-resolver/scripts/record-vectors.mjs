// One-time live recording of the offline test vectors. Polite by construction:
// every request goes through the package limiter (ordinals.com 2 rps, /r/block
// one at a time >= 5 s apart), runs sequentially, and an in-run HTTP cache
// makes each URL a single network request however many resolves need it.
//
//   npm run record-vectors        (writes test/vectors/**)
//
// Re-running replaces the vectors with a new snapshot; holders will have moved.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LIMITS,
  Limiter,
  OCI_PAGES,
  decodeOciPage,
  fromHexForScripts,
  memoryStores,
  merkleBranch,
  ociPageFor,
  ociPosition,
  ociSat,
  ociSatIndex,
  parseBlock,
  resolve,
  rootFromBranch,
  verifyProof,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'test', 'vectors');
const HEIGHTS = [0, 208, 95238, 275798, 433445, 528999, 563851, 612888, 614347, 640860, 718222, 718840, 720143,
  738505, 745506, 745966, 840000, 935550];
const SMALL_BLOCKS = [0, 170, 208];
const TAIL = 969788;

const httpCache = new Map(); // url -> { status, headers, bytes }
let touched = null; // Set of urls for the resolve in progress
let networkRequests = 0;

async function cachingFetch(url, init) {
  const key = String(url);
  touched?.add(key);
  let hit = httpCache.get(key);
  if (!hit) {
    networkRequests++;
    const res = await fetch(url, init);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const headers = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    hit = { status: res.status, headers, bytes };
    if (res.status === 200 || res.status === 404) httpCache.set(key, hit);
  }
  return new Response(hit.bytes, { status: hit.status, headers: { 'content-type': hit.headers['content-type'] ?? 'application/octet-stream' } });
}

const limiter = new Limiter({ ...DEFAULT_LIMITS, fetch: cachingFetch, userAgent: 'bitmap-resolver/0.1 (Block Genomics test vectors; polite, 2 rps)' });
const sha256hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (rel, value) => {
  const path = join(OUT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 1) + '\n');
};
const isOciPage = (url) => OCI_PAGES.some((id) => url.endsWith('/content/' + id));

const recordedAt = new Date().toISOString();
const summary = [];

for (const height of HEIGHTS) {
  touched = new Set();
  const t0 = Date.now();
  const result = await resolve(height, { freshness: 'auth', limiter, stores: memoryStores() });
  const proofCheck = await verifyProof(result.proof, { limiter });
  const urls = [...touched];
  touched = null;

  const page = ociPageFor(height);
  const pageUrl = urls.find(isOciPage);
  const pageBytes = httpCache.get(pageUrl)?.bytes;
  if (!pageBytes) throw new Error(`no OCI page recorded for ${height}`);
  const decoded = decodeOciPage(page, new TextDecoder().decode(pageBytes));
  const sat = ociSat(decoded, height);
  const satIndex = ociSatIndex(height, decoded);
  const position = ociPosition(height);

  const http = {};
  for (const url of urls.filter((u) => !isOciPage(u)).sort()) {
    const r = httpCache.get(url);
    http[url] = { status: r.status, body: new TextDecoder().decode(r.bytes) };
  }

  write(`heights/${height}.json`, {
    height,
    recordedAt,
    rule: result.rule,
    expected: {
      verdict: result.verdict,
      canonicalId: result.canonicalId,
      sat: result.sat,
      satIndex,
      holder: result.holder,
      satpoint: result.satpoint,
      checkedAtHeight: result.checkedAtHeight,
      canonical: result.proof.canonical,
    },
    oci: {
      page,
      pageId: OCI_PAGES[page],
      pageSha256: sha256hex(pageBytes),
      pageBytes: pageBytes.length,
      position,
      sat,
      satIndex,
      // Enough of the decoded page to replay this height offline; the real page
      // (~2.35 MB) is not stored. Its hash above pins what was decoded.
      sparse: {
        sats: { [position]: sat },
        satIndexMap: decoded.satIndexMap === null ? null : satIndex ? { [height]: satIndex } : {},
      },
    },
    http,
  });
  summary.push({ height, ms: Date.now() - t0, verdict: result.verdict, canonicalId: result.canonicalId, holder: result.holder, proofOk: proofCheck.ok, reason: result.reason });
  console.error(height, result.verdict, result.canonicalId, result.holder, proofCheck.ok ? 'proof ok' : proofCheck.diffs);
}

// Small real blocks for the parser tests.
const blocks = {};
for (const h of SMALL_BLOCKS) {
  const hex = JSON.parse(new TextDecoder().decode((await limiter.get(`https://ordinals.com/r/block/${h}`, { lane: 'block', accept: 'application/json' })).bytes));
  const ordHash = JSON.parse(new TextDecoder().decode((await limiter.get(`https://ordinals.com/r/blockhash/${h}`, { accept: 'application/json' })).bytes));
  const esploraHash = new TextDecoder().decode((await limiter.get(`https://blockstream.info/api/block-height/${h}`)).bytes).trim();
  const parsed = parseBlock(fromHexForScripts(hex));
  blocks[h] = { hex, ordHash, esploraHash, txCount: parsed.txs.length, merkleRoot: parsed.header.merkleRoot };
  console.error('block', h, parsed.hash === ordHash && ordHash === esploraHash ? 'hash ok' : 'HASH MISMATCH', parsed.merkleOk ? 'merkle ok' : 'MERKLE BAD');
}
write('blocks-small.json', { recordedAt, blocks });

// Tail: the 969788 claim, as an SPV-style vector (header + merkle branch), no block bytes.
{
  const t0 = Date.now();
  const result = await resolve(TAIL, { freshness: 'auth', limiter, stores: memoryStores(), walkCap: 1 });
  const blockHex = JSON.parse(new TextDecoder().decode(httpCache.get(`https://ordinals.com/r/block/${TAIL}`).bytes));
  const bytes = fromHexForScripts(blockHex);
  const block = parseBlock(bytes);
  const c = result.proof.canonical;
  const txIndex = block.txs.findIndex((t) => t.txid === c.revealTxid);
  const branch = merkleBranch(block.txs.map((t) => t.txid), txIndex);
  const revealHex = JSON.parse(new TextDecoder().decode((await limiter.get(`https://ordinals.com/r/tx/${c.revealTxid}`, { accept: 'application/json' })).bytes));
  write(`tail-${TAIL}.json`, {
    height: TAIL,
    recordedAt,
    blockHash: block.hash,
    headerHex: blockHex.slice(0, 160),
    blockBytes: bytes.length,
    blockSha256: sha256hex(bytes),
    txCount: block.txs.length,
    merkleRoot: block.header.merkleRoot,
    reveal: { txIndex, txid: c.revealTxid, hex: revealHex, branch, branchRoot: rootFromBranch(c.revealTxid, branch, txIndex) },
    expected: { verdict: result.verdict, canonicalId: result.canonicalId, holder: result.holder, satpoint: result.satpoint, canonical: c },
    ignored: result.ignored,
  });
  summary.push({ height: TAIL, ms: Date.now() - t0, verdict: result.verdict, canonicalId: result.canonicalId, holder: result.holder });
  console.error(TAIL, result.verdict, result.canonicalId, result.holder);
}

write('SUMMARY.json', { recordedAt, networkRequests, limiter: limiter.stats(), summary });
console.log(JSON.stringify({ networkRequests, limiter: limiter.stats(), summary }, null, 1));
