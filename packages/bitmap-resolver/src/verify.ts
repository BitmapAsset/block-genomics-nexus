// verifyProof: re-check a bg-bitmap-proof/1 bundle against public sources.
//
// The bundle hash catches edits; the source checks catch a re-sealed forgery:
// the reveal tx is re-fetched and re-parsed (its bytes must hash to the txid),
// the body and tags must still pass the rule, ord must still report the same
// reveal height, sat and number, walked block hashes must still be the chain's,
// and the holder must still be where the bundle says (a moved holder is
// reported as such, since that is a change of fact, not a forgery).

import { Context, type ClientOptions } from './context.js';
import { fromHex, toHex } from './bytes.js';
import { parseInscriptionId } from './facts.js';
import { parseTx } from './parse/block.js';
import { parseEnvelopes } from './parse/envelope.js';
import { computeBundleHash, PROOF_FORMAT } from './proof.js';
import { checkClaim, RULE_ID } from './rules.js';
import { decodeOciPage, OCI_PAGES, ociPageFor, ociSat, ociSatIndex } from './sources/oci.js';
import type { ProofBundle } from './types.js';

export interface VerifyOptions extends Omit<ClientOptions, 'origins'> {
  /** ord origin (default https://ordinals.com). Only ord is used, so this also runs in a browser. */
  origin?: string;
  /**
   * Also re-derive OCI first-ness: fetch and decode the OCI page (1-2.4 MB) and
   * check that it still names this sat and satIndex, and that ord's
   * /r/sat/<sat>/at/<satIndex> is this id. Off by default because of the size.
   */
  deep?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  diffs: string[];
  /** Diffs that only say the holder moved since the bundle was made. */
  holderDiffs: string[];
}

export async function verifyProof(bundle: ProofBundle, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const diffs: string[] = [];
  const holderDiffs: string[] = [];
  const ctx = new Context({ ...opts, origins: { ord: opts.origin } });

  if (bundle.format !== PROOF_FORMAT) diffs.push(`format: ${bundle.format}`);
  if (bundle.rule !== RULE_ID) diffs.push(`rule: bundle made under ${bundle.rule}, this verifier runs ${RULE_ID}`);
  if (computeBundleHash(bundle) !== bundle.bundleHash) diffs.push('bundleHash: the bundle was edited after it was sealed');

  try {
    for (const w of bundle.firstness?.walked ?? []) {
      const hash = await ctx.ord.blockHash(w.height, ctx.signal);
      if (hash !== w.hash) diffs.push(`walked block ${w.height}: chain hash ${hash}, bundle ${w.hash}`);
    }

    const c = bundle.canonical;
    if (bundle.verdict === 'canonical' && !c) diffs.push('canonical verdict without canonical facts');
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
          if (c.bodyHex !== null && toHex(fromHex(c.bodyHex)) !== c.bodyHex) diffs.push('bodyHex is not lowercase hex');
        }
      }

      if (opts.deep && bundle.firstness?.method === 'oci') {
        const page = ociPageFor(bundle.height);
        const pageId = OCI_PAGES[page];
        if (bundle.firstness.ociPage !== pageId) diffs.push(`ociPage: bundle ${bundle.firstness.ociPage}, height ${bundle.height} is on ${pageId}`);
        const bytes = await ctx.ord.content(pageId, ctx.signal);
        if (!bytes) {
          diffs.push(`OCI page ${page} not found`);
        } else {
          const decoded = decodeOciPage(page, new TextDecoder().decode(bytes));
          const sat = ociSat(decoded, bundle.height);
          const satIndex = ociSatIndex(bundle.height, decoded);
          if (String(sat) !== c.sat) diffs.push(`OCI sat ${sat}, bundle ${c.sat}`);
          if (satIndex !== c.satIndex) diffs.push(`OCI satIndex ${satIndex}, bundle ${c.satIndex}`);
          if (sat !== null) {
            const at = await ctx.ord.satAt(sat, satIndex, ctx.signal);
            if (at !== c.id) diffs.push(`ord /r/sat/${sat}/at/${satIndex} is ${at}, bundle ${c.id}`);
          }
        }
      }

      const ins = await ctx.ord.inscription(c.id, ctx.signal);
      if (!ins) {
        diffs.push(`ord does not know ${c.id}`);
      } else {
        if (ins.height !== c.revealHeight) diffs.push(`revealHeight: ord ${ins.height}, bundle ${c.revealHeight}`);
        if (c.sat !== null && String(ins.sat) !== c.sat) diffs.push(`sat: ord ${ins.sat}, bundle ${c.sat}`);
        if (ins.number !== c.number) diffs.push(`number: ord ${ins.number}, bundle ${c.number}`);
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
  return { ok: all.length === 0, diffs: all, holderDiffs };
}
