// verifyProof: re-check a bg-bitmap-proof/1 bundle against public sources.
//
// The bundle hash catches edits; the source checks catch a re-sealed forgery:
//   - the reveal tx is re-fetched and re-parsed (its non-witness bytes must
//     hash to the txid), and the body and tags must still pass the rule;
//   - ord must still report the same reveal height, sat and number;
//   - first-ness is re-checked. For "oci" bundles (deep, the default) the OCI
//     page must still name this sat and satIndex and /r/sat/at this id. For
//     "walk" bundles the walked blocks must run without a gap from the height
//     to the claim (or to checkedAtHeight for `none`), and are re-scanned
//     (all of them up to `rescanLimit`, else the first and the last, said in
//     `notes`) with header, merkle and witness-commitment checks;
//   - a moved holder is reported separately: a change of fact, not a forgery.
//
// Only ord is used, so this runs in a browser against ordinals.com. It checks
// the bundle against ord's view; resolve() is what makes ord and Esplora agree.

import { Context, type ClientOptions } from './context';
import { fromHex, toHex } from './bytes';
import { loadOciPage, parseInscriptionId } from './facts';
import { parseTx } from './parse/block';
import { parseEnvelopes } from './parse/envelope';
import { computeBundleHash, PROOF_FORMAT } from './proof';
import { checkClaim, RULE_ID } from './rules';
import { OCI_LIMIT, OCI_PAGES, ociPageFor, ociSat, ociSatIndex } from './sources/oci';
import type { ProofBundle } from './types';
import { scanBlockBytes } from './walk';

export interface VerifyOptions extends Omit<ClientOptions, 'origins'> {
  /** ord origin (default https://ordinals.com). Only ord is used, so this also runs in a browser. */
  origin?: string;
  /**
   * Re-derive OCI first-ness: decode the OCI page (from the store, else fetched,
   * 1-2.4 MB, checked against its pinned hash) and check that it still names
   * this sat and satIndex, and that ord's /r/sat/<sat>/at/<satIndex> is this id.
   * Default true. `false` skips first-ness for OCI bundles (cheap mode).
   */
  deep?: boolean;
  /** Walked blocks re-scanned in full up to this many; beyond it, the first and the last. Default 3. */
  rescanLimit?: number;
}

export interface VerifyResult {
  ok: boolean;
  diffs: string[];
  /** Diffs that only say the holder moved since the bundle was made. */
  holderDiffs: string[];
  /** What was not re-checked (e.g. walked blocks skipped beyond rescanLimit). */
  notes: string[];
}

export async function verifyProof(bundle: ProofBundle, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const diffs: string[] = [];
  const holderDiffs: string[] = [];
  const notes: string[] = [];
  const ctx = new Context({ ...opts, origins: { ord: opts.origin } });
  const deep = opts.deep ?? true;

  if (bundle.format !== PROOF_FORMAT) diffs.push(`format: ${bundle.format}`);
  if (bundle.rule !== RULE_ID) diffs.push(`rule: bundle made under ${bundle.rule}, this verifier runs ${RULE_ID}`);
  if (computeBundleHash(bundle) !== bundle.bundleHash) diffs.push('bundleHash: the bundle was edited after it was sealed');

  try {
    const walked = bundle.firstness?.walked ?? [];
    for (const w of walked) {
      const hash = await ctx.ord.blockHash(w.height, ctx.signal);
      if (hash !== w.hash) diffs.push(`walked block ${w.height}: chain hash ${hash}, bundle ${w.hash}`);
    }

    const c = bundle.canonical;
    if (bundle.verdict === 'canonical' && !c) diffs.push('canonical verdict without canonical facts');
    // The resolver attaches canonical and holder facts to a canonical verdict
    // only. Any other verdict carrying them is a forgery: checkWalk reads the
    // facts' presence, so a `none` that kept them would verify green.
    if (bundle.verdict !== 'canonical' && (c || bundle.holder)) {
      diffs.push(`a ${bundle.verdict} verdict carrying canonical or holder facts (the resolver attaches them to canonical only)`);
    }

    // Shapes the resolver never produces are forgeries or bugs, not proofs.
    // The method follows from the height, so a bundle cannot opt out of the
    // first-ness checks by naming another (or no) method.
    const method = bundle.firstness?.method;
    const expectedMethod = bundle.height < OCI_LIMIT ? 'oci' : 'walk';
    if (method !== expectedMethod) {
      diffs.push(`firstness.method ${JSON.stringify(method ?? null)} for ${bundle.height}: the resolver uses ${expectedMethod} there`);
    }
    if (!['canonical', 'none', 'disputed', 'undetermined'].includes(bundle.verdict)) {
      diffs.push(`unknown verdict ${JSON.stringify(bundle.verdict)}`);
    }
    if (method === 'oci' && bundle.verdict === 'none') diffs.push('a none verdict from the OCI path (the OCI is not authoritative about absence)');
    if (bundle.verdict === 'disputed' || bundle.verdict === 'undetermined') {
      notes.push(`a ${bundle.verdict} bundle is checked for its hash and walked block hashes only`);
    }

    const rescanLimit = opts.rescanLimit ?? 3;
    if (method === 'walk' && (bundle.verdict === 'canonical' || bundle.verdict === 'none')) {
      await checkWalk(ctx, bundle, rescanLimit, diffs, notes);
    }
    if (method === 'walk' && bundle.verdict === 'none') {
      await checkNoneStillHolds(ctx, bundle, rescanLimit, diffs, notes);
    }

    if (c) {
      const { txid, index } = parseInscriptionId(c.id);
      if (txid !== c.revealTxid) diffs.push(`id ${c.id} is not in reveal tx ${c.revealTxid}`);
      if (index !== c.envelopeIndex) diffs.push(`id index ${index}, bundle envelopeIndex ${c.envelopeIndex}`);

      const raw = await ctx.ord.tx(txid, ctx.signal);
      if (!raw) {
        diffs.push(`ord has no transaction ${txid}`);
      } else {
        const tx = parseTx(raw);
        if (tx.txid !== txid) diffs.push(`ord's bytes for ${txid} hash to ${tx.txid}`);
        const env = parseEnvelopes(tx).find((e) => e.index === index);
        if (!env) {
          diffs.push(`no envelope ${index} in ${txid}`);
        } else {
          const bodyHex = env.body ? toHex(env.body) : null;
          if (bodyHex !== c.bodyHex) diffs.push(`bodyHex: chain ${bodyHex}, bundle ${c.bodyHex}`);
          if (env.input !== c.vin) diffs.push(`vin: chain ${env.input}, bundle ${c.vin}`);
          const check = checkClaim(
            {
              body: env.body,
              complete: env.complete,
              contentEncoding: env.contentEncoding,
              delegate: env.delegate,
              unrecognizedEvenField: env.unrecognizedEvenField,
              revealHeight: c.revealHeight,
            },
            bundle.height,
          );
          if (!check.ok) diffs.push(`the chain's envelope fails the rule for ${bundle.height} (${check.reason})`);
          // A caveat makes the rule ambiguous; resolve() answers undetermined there, never canonical.
          else if (bundle.verdict === 'canonical' && check.caveats.length > 0) {
            diffs.push(`the chain's envelope is ambiguous under the rule for ${bundle.height} (${check.caveats.join(', ')}): not canonical`);
          }
          if (c.bodyHex !== null && toHex(fromHex(c.bodyHex)) !== c.bodyHex) diffs.push('bodyHex is not lowercase hex');
        }
      }

      if (bundle.firstness?.method === 'oci') {
        if (deep) {
          const page = ociPageFor(bundle.height);
          const pageId = OCI_PAGES[page];
          if (bundle.firstness.ociPage !== pageId) diffs.push(`ociPage: bundle ${bundle.firstness.ociPage}, height ${bundle.height} is on ${pageId}`);
          let decoded = null;
          try {
            decoded = await loadOciPage(ctx, page);
          } catch (e) {
            if (ctx.signal?.aborted) throw e;
            const message = (e as Error).message;
            diffs.push(/pinned/.test(message) ? `OCI page ${page} bytes do not match the pinned hash` : message);
          }
          if (decoded) {
            const sat = ociSat(decoded, bundle.height);
            const satIndex = ociSatIndex(bundle.height, decoded);
            if (String(sat) !== c.sat) diffs.push(`OCI sat ${sat}, bundle ${c.sat}`);
            if (satIndex !== c.satIndex) diffs.push(`OCI satIndex ${satIndex}, bundle ${c.satIndex}`);
            if (sat !== null) {
              const at = await ctx.ord.satAt(sat, satIndex, ctx.signal);
              if (at !== c.id) diffs.push(`ord /r/sat/${sat}/at/${satIndex} is ${at}, bundle ${c.id}`);
            }
          }
        } else {
          notes.push('OCI first-ness not re-checked (deep: false)');
        }
      }

      const ins = await ctx.ord.inscription(c.id, ctx.signal);
      if (!ins) {
        diffs.push(`ord does not know ${c.id}`);
      } else {
        if (ins.height !== c.revealHeight) diffs.push(`revealHeight: ord ${ins.height}, bundle ${c.revealHeight}`);
        if (c.sat !== null && String(ins.sat) !== c.sat) diffs.push(`sat: ord ${ins.sat}, bundle ${c.sat}`);
        if (ins.number !== c.number) diffs.push(`number: ord ${ins.number}, bundle ${c.number}`);
        if (bundle.verdict === 'canonical' && ins.charms.includes('unbound')) {
          diffs.push(`ord calls ${c.id} unbound: the rule is ambiguous for it, not canonical`);
        }
        if (bundle.holder) {
          if (ins.satpoint !== bundle.holder.satpoint) holderDiffs.push(`holder satpoint: now ${ins.satpoint}, bundle ${bundle.holder.satpoint}`);
          if (ins.address !== bundle.holder.address) holderDiffs.push(`holder address: now ${ins.address}, bundle ${bundle.holder.address}`);
        }
      }
    }
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    diffs.push(`could not re-check: ${(e as Error).message}`);
  }

  const all = [...diffs, ...holderDiffs];
  return { ok: all.length === 0, diffs: all, holderDiffs, notes };
}

/**
 * A `none` is "no valid claim up to checkedAtHeight". Blocks mined since then
 * can hold the deed: scan up to `rescanLimit` of them (from n at the earliest)
 * and report a valid claim as a diff; say in `notes` how many were not scanned.
 */
async function checkNoneStillHolds(ctx: Context, bundle: ProofBundle, rescanLimit: number, diffs: string[], notes: string[]): Promise<void> {
  const n = bundle.height;
  const tip = await ctx.ord.blockHeight(ctx.signal);
  if (tip <= bundle.checkedAtHeight) return;
  const from = Math.max(n, bundle.checkedAtHeight + 1);
  if (from > tip) return;
  const to = Math.min(tip, from + Math.max(1, rescanLimit) - 1);
  for (let b = from; b <= to; b++) {
    const hash = await ctx.ord.blockHash(b, ctx.signal);
    const bytes = await ctx.ord.block(b, ctx.signal);
    if (!hash || !bytes) {
      diffs.push(`block ${b} (mined after checkedAtHeight) is not available from ord`);
      return;
    }
    let scan;
    try {
      scan = scanBlockBytes(bytes, b, hash, 'rblock');
    } catch (e) {
      diffs.push(`block ${b}: ${(e as Error).message}`);
      return;
    }
    for (const cand of scan.candidates) {
      if (cand.number !== n) continue;
      const check = checkClaim(
        {
          body: cand.bodyHex === null ? null : fromHex(cand.bodyHex),
          complete: cand.complete,
          contentEncoding: cand.contentEncodingHex === null ? null : fromHex(cand.contentEncodingHex),
          delegate: cand.delegateHex === null ? null : fromHex(cand.delegateHex),
          unrecognizedEvenField: cand.unrecognizedEvenField,
          revealHeight: b,
        },
        n,
      );
      if (check.ok) {
        diffs.push(`valid claim ${cand.id ?? cand.locator} in block ${b}, mined after checkedAtHeight ${bundle.checkedAtHeight}: this none is out of date`);
        return;
      }
    }
  }
  if (to < tip) notes.push(`${tip - to} block(s) mined after checkedAtHeight ${bundle.checkedAtHeight} not re-scanned; re-resolve for a current answer`);
}

/** Walk bundles: contiguous coverage, then a re-scan of walked blocks. */
async function checkWalk(ctx: Context, bundle: ProofBundle, rescanLimit: number, diffs: string[], notes: string[]): Promise<void> {
  const n = bundle.height;
  const walked = bundle.firstness.walked;
  const c = bundle.canonical;

  if (walked.length === 0) {
    if (bundle.verdict === 'canonical') {
      diffs.push('walk bundle with no walked blocks');
      return;
    }
    // `none` without blocks: only valid for a block that was not mined yet.
    if (n <= bundle.checkedAtHeight) diffs.push(`none without walked blocks, but block ${n} existed at checkedAtHeight ${bundle.checkedAtHeight}`);
    return;
  }

  const last = c ? c.revealHeight : bundle.checkedAtHeight;
  const expected = last - n + 1;
  const contiguous = walked.length === expected && walked.every((w, i) => w.height === n + i);
  if (!contiguous) {
    diffs.push(`walked blocks must run ${n}-${last} without a gap (bundle lists ${walked.map((w) => w.height).join(',') || 'none'})`);
    return;
  }

  const picks = walked.length <= rescanLimit ? walked : [walked[0], walked[walked.length - 1]];
  if (picks.length < walked.length) notes.push(`re-scanned ${picks.length} of ${walked.length} walked blocks (first and last)`);
  let claimBlockChecked = false;
  let claimFound = false;
  for (const w of picks) {
    const bytes = await ctx.ord.block(w.height, ctx.signal);
    if (!bytes) {
      diffs.push(`ord has no block ${w.height}`);
      continue;
    }
    let scan;
    try {
      scan = scanBlockBytes(bytes, w.height, w.hash, 'rblock');
    } catch (e) {
      diffs.push(`walked block ${w.height}: ${(e as Error).message}`);
      continue;
    }
    if (c && w.height === c.revealHeight) claimBlockChecked = true;
    for (const cand of scan.candidates) {
      if (cand.number !== n) continue;
      const check = checkClaim(
        {
          body: cand.bodyHex === null ? null : fromHex(cand.bodyHex),
          complete: cand.complete,
          contentEncoding: cand.contentEncodingHex === null ? null : fromHex(cand.contentEncodingHex),
          delegate: cand.delegateHex === null ? null : fromHex(cand.delegateHex),
          unrecognizedEvenField: cand.unrecognizedEvenField,
          revealHeight: w.height,
        },
        n,
      );
      if (!check.ok) continue;
      const id = cand.id ?? cand.locator;
      if (!c) diffs.push(`valid claim ${id} in walked block ${w.height}, but the bundle says none`);
      else if (w.height < c.revealHeight) diffs.push(`valid claim ${id} in walked block ${w.height}, before the bundle's claim in ${c.revealHeight}`);
      else if (id !== c.id) diffs.push(`the first valid claim in block ${w.height} is ${id}, not ${c.id}`);
      else claimFound = true;
      break; // first valid claim of this block decided it
    }
  }
  if (c && claimBlockChecked && !claimFound && !diffs.some((d) => d.includes(`block ${c.revealHeight} is`))) {
    diffs.push(`no valid claim for ${n} in block ${c.revealHeight}, where the bundle puts ${c.id}`);
  }
}
