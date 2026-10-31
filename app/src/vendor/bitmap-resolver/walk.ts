// The tail walk for heights at and above 942,000, where no OCI page exists:
// scan blocks from n upward, first valid claim wins (LiveOCI rule 1).
//
// One scan of block B lists every bitmap-looking body in it, so it serves every
// n <= B ("shared walk"). Scans are keyed by block hash, never by height, and a
// height is mapped to its hash only after ord and Esplora agree on it, so a
// reorg can never serve a stale scan.

import { toHex } from './bytes';
import type { Context } from './context';
import { agreedBlockHash, decodeText, ResolveFailure } from './facts';
import { parseBlock } from './parse/block';
import { parseEnvelopes } from './parse/envelope';
import { checkClaim, claimedNumber, type Caveat, type IgnoreReason } from './rules';
import { OCI_LIMIT } from './sources/oci';
import type { IgnoredClaim } from './types';

export interface ScanCandidate {
  number: number;
  /** Inscription id; null for an envelope without OP_ENDIF (never an inscription). */
  id: string | null;
  locator: string;
  txIndex: number;
  txid: string;
  vin: number;
  offset: number;
  envelopeIndex: number | null;
  bodyHex: string | null;
  complete: boolean;
  contentType: string | null;
  contentEncodingHex: string | null;
  delegateHex: string | null;
  unrecognizedEvenField: boolean;
}

export interface BlockScan {
  height: number;
  hash: string;
  merkleRoot: string;
  txCount: number;
  byteSource: 'rblock' | 'mempool-raw';
  candidates: ScanCandidate[];
}

/** Every envelope in a block whose body names a height in [942000, height]. */
export function scanBlockBytes(bytes: Uint8Array, height: number, expectedHash: string, byteSource: BlockScan['byteSource']): BlockScan {
  const block = parseBlock(bytes);
  if (block.hash !== expectedHash) throw new Error(`block bytes hash to ${block.hash}, expected ${expectedHash}`);
  if (!block.merkleOk) throw new Error(`merkle root mismatch in block ${height}`);
  if (!block.witnessOk) throw new Error(`witness commitment mismatch in block ${height}`);
  const candidates: ScanCandidate[] = [];
  for (const tx of block.txs) {
    for (const env of parseEnvelopes(tx)) {
      const number = claimedNumber(env.body);
      if (number === null || number < OCI_LIMIT || number > height) continue;
      candidates.push({
        number,
        id: env.id,
        locator: `envelope:${tx.txid}:${env.input}:${env.offset}`,
        txIndex: tx.index,
        txid: tx.txid,
        vin: env.input,
        offset: env.offset,
        envelopeIndex: env.index,
        bodyHex: env.body ? toHex(env.body) : null,
        complete: env.complete,
        contentType: decodeText(env.contentType),
        contentEncodingHex: env.contentEncoding ? toHex(env.contentEncoding) : null,
        delegateHex: env.delegate ? toHex(env.delegate) : null,
        unrecognizedEvenField: env.unrecognizedEvenField,
      });
    }
  }
  return { height, hash: block.hash, merkleRoot: block.computedMerkleRoot, txCount: block.txs.length, byteSource, candidates };
}

/** Scan of block `height`, from the store or fetched, parsed and verified. */
export async function blockScan(ctx: Context, height: number, tip: number): Promise<BlockScan> {
  const hash = await agreedBlockHash(ctx, height, tip);
  const key = `scan:${hash}`;
  const cached = (await ctx.stores.immutable.get(key)) as BlockScan | undefined;
  if (cached && typeof cached === 'object') return cached;

  let scan: BlockScan | null = null;
  let firstError = '';
  try {
    const bytes = await ctx.ord.block(height, ctx.signal);
    if (!bytes) throw new Error(`ord has no block ${height}`);
    scan = scanBlockBytes(bytes, height, hash, 'rblock');
    ctx.mark('rblock', 'agree');
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    firstError = (e as Error).message;
    ctx.mark('rblock', /hash|merkle|witness|parse|unexpected|trailing/i.test(firstError) ? 'disagree' : 'unreachable', firstError);
  }
  if (!scan) {
    // Second byte source: Esplora raw by the agreed hash.
    try {
      const bytes = await ctx.esplora.blockRaw(hash, ctx.signal);
      if (!bytes) throw new Error(`esplora has no block ${hash}`);
      scan = scanBlockBytes(bytes, height, hash, 'mempool-raw');
      ctx.mark('mempool-raw', 'agree');
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      ctx.mark('mempool-raw', 'unreachable', (e as Error).message);
      throw new ResolveFailure(`block ${height} unavailable: ${firstError}; ${(e as Error).message}`, 'unreachable');
    }
  }
  await ctx.stores.immutable.set(key, scan);
  return scan;
}

export interface WalkOutcome {
  found: { candidate: ScanCandidate; block: number; caveats: Caveat[] } | null;
  ignored: IgnoredClaim[];
  walked: { height: number; hash: string }[];
  /** 'tip' when the walk reached the tip, 'cap' when it stopped early. */
  stoppedAt: 'found' | 'tip' | 'cap';
  walkedTo: number;
}

const toFacts = (c: ScanCandidate, block: number) => ({
  body: c.bodyHex === null ? null : hexBytes(c.bodyHex),
  complete: c.complete,
  contentEncoding: c.contentEncodingHex === null ? null : hexBytes(c.contentEncodingHex),
  delegate: c.delegateHex === null ? null : hexBytes(c.delegateHex),
  unrecognizedEvenField: c.unrecognizedEvenField,
  revealHeight: block,
});

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Walk from block n up to `cap` blocks (and never past the tip). */
export async function walk(ctx: Context, n: number, tip: number, cap: number): Promise<WalkOutcome> {
  const ignored: IgnoredClaim[] = [];
  const walked: { height: number; hash: string }[] = [];
  const last = Math.min(tip, n + Math.max(1, cap) - 1);
  for (let b = n; b <= last; b++) {
    const scan = await blockScan(ctx, b, tip);
    walked.push({ height: b, hash: scan.hash });
    let found: WalkOutcome['found'] = null;
    for (const c of scan.candidates) {
      if (c.number !== n) continue;
      const check = checkClaim(toFacts(c, b), n, tip);
      const id = c.id ?? c.locator;
      if (found) {
        ignored.push({ id, reason: check.ok ? 'not_first' : (check.reason as IgnoreReason), revealHeight: b });
      } else if (check.ok) {
        found = { candidate: c, block: b, caveats: check.caveats };
      } else {
        ignored.push({ id, reason: check.reason, revealHeight: b });
      }
    }
    if (found) return { found, ignored, walked, stoppedAt: 'found', walkedTo: b };
  }
  return { found: null, ignored, walked, stoppedAt: last >= tip ? 'tip' : 'cap', walkedTo: last };
}
