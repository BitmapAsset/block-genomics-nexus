// Facts about one inscription, each from two sources where the rule needs it:
//
//   envelope  ord /r/tx/<txid> bytes, parsed here. The txid authenticates
//             everything but the witness (the txid must be the one we asked
//             for); the witness, where the envelope lives, must equal the
//             witness Esplora reports for the same tx.
//   height    ord /r/inscription `height` and Esplora /tx/<txid> block_height,
//             and the block hash at that height from ord and Esplora.
//   holder    ord /r/inscription satpoint + address, Esplora outspend (unspent)
//             and the output's address.

import { latin1, toHex, utf8OrNull } from './bytes.js';
import type { Context } from './context.js';
import { parseTx } from './parse/block.js';
import { parseEnvelopes } from './parse/envelope.js';
import { sha256 } from './sha256.js';
import { decodeOciPage, OCI_PAGE_SHA256, OCI_PAGES, type OciPage } from './sources/oci.js';

/** Confirmations before facts and block hashes are cached as immutable. */
export const FINAL_DEPTH = 6;

export class ResolveFailure extends Error {
  constructor(
    message: string,
    readonly kind: 'unreachable' | 'disagree',
  ) {
    super(message);
    this.name = 'ResolveFailure';
  }
}

export interface RevealFacts {
  id: string;
  revealTxid: string;
  vin: number;
  envelopeIndex: number;
  bodyHex: string | null;
  complete: boolean;
  contentType: string | null;
  contentEncodingHex: string | null;
  delegateHex: string | null;
  unrecognizedEvenField: boolean;
  revealHeight: number;
  revealBlockHash: string;
  number: number;
  charms: string[];
  sat: number | null;
}

export function parseInscriptionId(id: string): { txid: string; index: number } {
  const m = /^([0-9a-f]{64})i(\d{1,10})$/.exec(id);
  if (!m) throw new Error(`not an inscription id: ${id}`);
  return { txid: m[1], index: Number(m[2]) };
}

export function decodeText(bytes: Uint8Array | null): string | null {
  if (!bytes) return null;
  return utf8OrNull(bytes) ?? latin1(bytes);
}

/** ord tip, with Esplora's tip as a sanity bound. TTL 30 s. */
export async function tipHeight(ctx: Context): Promise<number> {
  const cached = (await ctx.stores.ttl.get('tip')) as number | undefined;
  if (typeof cached === 'number') return cached;
  let tip: number;
  try {
    tip = await ctx.ord.blockHeight(ctx.signal);
    ctx.mark('ord', 'agree');
  } catch (e) {
    ctx.mark('ord', 'unreachable', (e as Error).message);
    throw new ResolveFailure(`ord tip unavailable: ${(e as Error).message}`, 'unreachable');
  }
  try {
    const other = await ctx.esplora.tipHeight(ctx.signal);
    if (Math.abs(other - tip) > 3) {
      ctx.mark('esplora', 'disagree', `tip ${other} vs ord ${tip}`);
      throw new ResolveFailure(`tips disagree: ord ${tip}, esplora ${other}`, 'disagree');
    }
    ctx.mark('esplora', 'agree');
  } catch (e) {
    if (e instanceof ResolveFailure) throw e;
    // Esplora down: the tip stands on ord alone; later Esplora checks decide.
    ctx.mark('esplora', 'unreachable', (e as Error).message);
  }
  await ctx.stores.ttl.set('tip', tip, 30_000);
  return tip;
}

/** Block hash at `height` that ord and Esplora agree on. Cached once final. */
export async function agreedBlockHash(ctx: Context, height: number, tip: number): Promise<string> {
  const key = `blockhash:${height}`;
  const cached = (await ctx.stores.immutable.get(key)) as string | undefined;
  if (typeof cached === 'string') return cached;
  let a: string | null;
  let b: string | null;
  try {
    a = await ctx.ord.blockHash(height, ctx.signal);
    ctx.mark('ord', 'agree');
  } catch (e) {
    ctx.mark('ord', 'unreachable', (e as Error).message);
    throw new ResolveFailure(`ord block hash ${height}: ${(e as Error).message}`, 'unreachable');
  }
  try {
    b = await ctx.esplora.blockHash(height, ctx.signal);
    ctx.mark('esplora', 'agree');
  } catch (e) {
    ctx.mark('esplora', 'unreachable', (e as Error).message);
    throw new ResolveFailure(`esplora block hash ${height}: ${(e as Error).message}`, 'unreachable');
  }
  if (!a || !b || a !== b) {
    ctx.mark('esplora', 'disagree', `block ${height}: ord ${a}, esplora ${b}`);
    throw new ResolveFailure(`block ${height} hash: ord ${a ?? 'none'}, esplora ${b ?? 'none'}`, 'disagree');
  }
  if (height <= tip - FINAL_DEPTH + 1) await ctx.stores.immutable.set(key, a);
  return a;
}

/** Reveal facts for an inscription id, checked across ord and Esplora. */
export async function revealFacts(ctx: Context, id: string, tip: number): Promise<RevealFacts> {
  const key = `fact:${id}`;
  const cached = (await ctx.stores.immutable.get(key)) as RevealFacts | undefined;
  if (cached && typeof cached === 'object') return cached;

  const { txid, index } = parseInscriptionId(id);
  const ord = await call(ctx, 'ord', () => ctx.ord.inscription(id, ctx.signal));
  if (!ord) throw new ResolveFailure(`ord does not know inscription ${id}`, 'disagree');
  const raw = await call(ctx, 'ord', () => ctx.ord.tx(txid, ctx.signal));
  if (!raw) throw new ResolveFailure(`ord has no reveal tx ${txid}`, 'disagree');
  let tx;
  try {
    tx = parseTx(raw);
  } catch (e) {
    ctx.mark('ord', 'disagree', `reveal tx ${txid} does not parse`);
    throw new ResolveFailure(`reveal tx ${txid} does not parse: ${(e as Error).message}`, 'disagree');
  }
  if (tx.txid !== txid) {
    ctx.mark('ord', 'disagree', `tx bytes hash to ${tx.txid}, not ${txid}`);
    throw new ResolveFailure(`reveal tx bytes hash to ${tx.txid}, not ${txid}`, 'disagree');
  }
  const envelope = parseEnvelopes(tx).find((e) => e.index === index);
  if (!envelope) {
    ctx.mark('ord', 'disagree', `no envelope ${index} in ${txid}`);
    throw new ResolveFailure(`no envelope ${index} in reveal tx ${txid} (parser and ord differ)`, 'disagree');
  }

  const esplora = await call(ctx, 'esplora', () => ctx.esplora.tx(txid, ctx.signal));
  if (!esplora || !esplora.status?.confirmed || typeof esplora.status.block_height !== 'number') {
    ctx.mark('esplora', 'disagree', `reveal ${txid} not confirmed per esplora`);
    throw new ResolveFailure(`esplora has no confirmed reveal ${txid}`, 'disagree');
  }
  // Txids do not commit to witness data, so the envelope bytes need a second
  // source: Esplora's own copy of every input's witness must match ord's.
  for (let i = 0; i < tx.inputs.length; i++) {
    const ours = tx.inputs[i].witness.map((w) => toHex(w));
    const theirs = esplora.vin?.[i]?.witness ?? [];
    if (ours.length !== theirs.length || ours.some((w, k) => w !== theirs[k])) {
      ctx.mark('esplora', 'disagree', `witness of ${txid} input ${i} differs from ord's`);
      throw new ResolveFailure(`the reveal witness (input ${i}) differs between ord and esplora`, 'disagree');
    }
  }
  if (esplora.status.block_height !== ord.height) {
    ctx.mark('esplora', 'disagree', `reveal height esplora ${esplora.status.block_height} vs ord ${ord.height}`);
    throw new ResolveFailure(`reveal height: ord ${ord.height}, esplora ${esplora.status.block_height}`, 'disagree');
  }
  const hash = await agreedBlockHash(ctx, ord.height, tip);
  if (esplora.status.block_hash !== hash) {
    ctx.mark('esplora', 'disagree', `reveal block hash mismatch at ${ord.height}`);
    throw new ResolveFailure(`reveal block hash mismatch at ${ord.height}`, 'disagree');
  }

  const facts: RevealFacts = {
    id,
    revealTxid: txid,
    vin: envelope.input,
    envelopeIndex: index,
    bodyHex: envelope.body ? toHex(envelope.body) : null,
    complete: envelope.complete,
    contentType: decodeText(envelope.contentType),
    contentEncodingHex: envelope.contentEncoding ? toHex(envelope.contentEncoding) : null,
    delegateHex: envelope.delegate ? toHex(envelope.delegate) : null,
    unrecognizedEvenField: envelope.unrecognizedEvenField,
    revealHeight: ord.height,
    revealBlockHash: hash,
    number: ord.number,
    charms: ord.charms,
    sat: ord.sat,
  };
  if (ord.height <= tip - FINAL_DEPTH + 1) await ctx.stores.immutable.set(key, facts);
  return facts;
}

export interface Holder {
  address: string;
  satpoint: string;
  outpoint: string;
  unspentPer: ('ord' | 'esplora')[];
}

/**
 * Live holder: ord and Esplora must agree that the satpoint's output is unspent
 * and pays `address`. Otherwise null with a reason. Display answers are cached
 * 60 s; auth answers are always live.
 */
export async function liveHolder(
  ctx: Context,
  id: string,
  freshness: 'auth' | 'display',
): Promise<{ holder: Holder | null; reason?: string }> {
  const key = `holder:${id}`;
  if (freshness === 'display') {
    const hit = (await ctx.stores.ttl.get(key)) as { holder: Holder | null; reason?: string } | undefined;
    if (hit) return hit;
  }
  const out = await holderUncached(ctx, id);
  if (freshness === 'display' && out.holder) await ctx.stores.ttl.set(key, out, 60_000);
  return out;
}

async function holderUncached(ctx: Context, id: string): Promise<{ holder: Holder | null; reason?: string }> {
  let ins;
  try {
    ins = await ctx.ord.inscription(id, ctx.signal);
    ctx.mark('ord', 'agree');
  } catch (e) {
    ctx.mark('ord', 'unreachable', (e as Error).message);
    return { holder: null, reason: `ord unreachable: ${(e as Error).message}` };
  }
  if (!ins) return { holder: null, reason: 'ord does not know the inscription' };
  if (!ins.address) return { holder: null, reason: 'ord reports no address (unbound or non-standard output)' };
  const m = /^([0-9a-f]{64}):(\d+):(\d+)$/.exec(ins.satpoint);
  if (!m) return { holder: null, reason: `unexpected satpoint ${ins.satpoint}` };
  const outTxid = m[1];
  const vout = Number(m[2]);
  try {
    const spend = await ctx.esplora.outspend(outTxid, vout, ctx.signal);
    const tx = await ctx.esplora.tx(outTxid, ctx.signal);
    if (!spend || !tx) {
      ctx.mark('esplora', 'disagree', `esplora does not know ${outTxid}:${vout}`);
      return { holder: null, reason: `esplora does not know output ${outTxid}:${vout}` };
    }
    if (spend.spent) {
      ctx.mark('esplora', 'disagree', `${outTxid}:${vout} is spent per esplora`);
      return { holder: null, reason: 'the output ord names is already spent per esplora (indexer lag?)' };
    }
    // Fail closed: only an explicit `spent: false` is evidence the output is
    // unspent. A 200 carrying `{}`, `[]` or `spent: null` says nothing.
    if (spend.spent !== false) {
      ctx.mark('esplora', 'disagree', `esplora outspend for ${outTxid}:${vout} has no spent flag`);
      return { holder: null, reason: `esplora gave no spent status for output ${outTxid}:${vout}` };
    }
    const address = tx.vout?.[vout]?.scriptpubkey_address;
    if (address !== ins.address) {
      ctx.mark('esplora', 'disagree', `output address ${address} vs ord ${ins.address}`);
      return { holder: null, reason: 'ord and esplora disagree on the output address' };
    }
    ctx.mark('esplora', 'agree');
  } catch (e) {
    ctx.mark('esplora', 'unreachable', (e as Error).message);
    return { holder: null, reason: `esplora unreachable: ${(e as Error).message}` };
  }
  return {
    holder: { address: ins.address, satpoint: ins.satpoint, outpoint: `${outTxid}:${vout}`, unspentPer: ['ord', 'esplora'] },
  };
}

async function call<T>(ctx: Context, name: 'ord' | 'esplora', fn: () => Promise<T>): Promise<T> {
  try {
    const v = await fn();
    ctx.mark(name, 'agree');
    return v;
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    ctx.mark(name, 'unreachable', (e as Error).message);
    throw new ResolveFailure(`${name}: ${(e as Error).message}`, 'unreachable');
  }
}

/** A decoded OCI page: from the store, or fetched, checked against its pinned hash, decoded and stored. */
export async function loadOciPage(ctx: Context, page: number): Promise<OciPage> {
  const pageId = OCI_PAGES[page];
  const key = `oci:${pageId}`;
  const cached = (await ctx.stores.immutable.get(key)) as OciPage | undefined;
  if (cached && typeof cached === 'object') return cached;
  let bytes: Uint8Array | null;
  try {
    bytes = await ctx.ord.content(pageId, ctx.signal);
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    ctx.mark('oci', 'unreachable', (e as Error).message);
    throw new ResolveFailure(`OCI page ${page} unavailable: ${(e as Error).message}`, 'unreachable');
  }
  if (!bytes) {
    ctx.mark('oci', 'unreachable', `OCI page ${page} not found`);
    throw new ResolveFailure(`OCI page ${page} not found`, 'unreachable');
  }
  const digest = toHex(sha256(bytes));
  if (digest !== OCI_PAGE_SHA256[page]) {
    ctx.mark('oci', 'disagree', `OCI page ${page} hashes to ${digest}`);
    throw new ResolveFailure(`OCI page ${page} bytes hash to ${digest}, not the pinned ${OCI_PAGE_SHA256[page]}`, 'disagree');
  }
  let decoded: OciPage;
  try {
    decoded = decodeOciPage(page, new TextDecoder().decode(bytes));
  } catch (e) {
    ctx.mark('oci', 'disagree', `OCI page ${page} did not decode`);
    throw new ResolveFailure(`OCI page ${page} did not decode: ${(e as Error).message}`, 'disagree');
  }
  await ctx.stores.immutable.set(key, decoded);
  return decoded;
}
