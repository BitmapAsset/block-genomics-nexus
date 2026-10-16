// resolve(height): which inscription is the deed for `height.bitmap`, who holds
// it, and a proof bundle. A verdict is never a guess:
//
//   canonical     the candidate passes the rule on its own bytes, and reveal
//                 height and block hash agree across ord and Esplora. Below
//                 942,000 first-ness is OCI-asserted (method "oci"); from 942,000
//                 it is proven by the walk (method "walk").
//   none          from 942,000 only: the walk reached the tip with no valid
//                 claim ("no valid claim up to block X", never "unclaimed").
//   disputed      a valid claim earlier than the candidate was presented (a
//                 challenger). Never auto-granted: a human decides.
//   undetermined  a source is unreachable, sources disagree, the OCI has no
//                 entry, the OCI candidate fails the rule, the rule is
//                 ambiguous for the first claim, or the walk hit its cap.

import { Context, type ClientOptions } from './context.js';
import { fromHex } from './bytes.js';
import { agreedBlockHash, liveHolder, loadOciPage, ResolveFailure, revealFacts, tipHeight, type Holder, type RevealFacts } from './facts.js';
import { sealBundle, PROOF_FORMAT } from './proof.js';
import { checkClaim, RULE_ID, type Caveat } from './rules.js';
import { OCI_LIMIT, OCI_MODULE_ID, ociPageFor, ociSat, ociSatIndex } from './sources/oci.js';
import type { CanonicalFacts, ChallengerResult, IgnoredClaim, ProofBundle, ResolveResult, Verdict } from './types.js';
import { walk, type ScanCandidate } from './walk.js';

export interface ResolveOptions extends ClientOptions {
  /** 'auth' always asks for a live holder; 'display' may use a 60 s cache. */
  freshness: 'auth' | 'display';
  /** Blocks walked inline above 942,000 before answering `undetermined` with a cursor. Default 3. */
  walkCap?: number;
  /** Inscription ids presented as claims for this height (e.g. by a wallet during verify). */
  challengers?: string[];
  /** Answer `undetermined` after this long; the work continues and fills the stores. */
  deadlineMs?: number;
}

interface Core {
  verdict: Verdict;
  reason?: string;
  candidate: RevealFacts | null;
  satIndex: number | null;
  firstness: ResolveResult['firstness'];
  walked: { height: number; hash: string }[];
  ignored: IgnoredClaim[];
  caveats: Caveat[];
  cursor?: number;
  tip: number | null;
}

export async function resolve(height: number, opts: ResolveOptions): Promise<ResolveResult> {
  if (!Number.isSafeInteger(height) || height < 0) throw new Error('height must be a non-negative integer');
  if (opts.freshness !== 'auth' && opts.freshness !== 'display') throw new Error("freshness must be 'auth' or 'display'");
  const ctx = new Context(opts);
  const work = resolveWith(ctx, height, opts);
  if (!opts.deadlineMs) return work;
  work.catch(() => undefined); // keeps running to warm the stores; never an unhandled rejection
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<ResolveResult>((res) => {
    timer = setTimeout(() => {
      const core: Core = {
        verdict: 'undetermined',
        reason: `no answer within ${opts.deadlineMs} ms; the check continues in the background`,
        candidate: null,
        satIndex: null,
        firstness: { method: height < OCI_LIMIT ? 'oci' : 'walk' },
        walked: [],
        ignored: [],
        caveats: [],
        tip: null,
      };
      res(finish(ctx, height, core, null, [], null));
    }, opts.deadlineMs);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

async function resolveWith(ctx: Context, height: number, opts: ResolveOptions): Promise<ResolveResult> {
  let core: Core;
  try {
    core = height < OCI_LIMIT ? await ociCore(ctx, height) : await walkCore(ctx, height, opts.walkCap ?? 3);
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    core = {
      verdict: 'undetermined',
      reason: (e as Error).message,
      candidate: null,
      satIndex: null,
      firstness: { method: height < OCI_LIMIT ? 'oci' : 'walk' },
      walked: [],
      ignored: [],
      caveats: [],
      tip: null,
    };
  }

  const challengers = await judgeChallengers(ctx, height, core, opts.challengers ?? []);

  let holder: Holder | null = null;
  let holderReason: string | undefined;
  if (core.verdict === 'canonical' && core.candidate) {
    const h = await liveHolder(ctx, core.candidate.id, opts.freshness);
    holder = h.holder;
    holderReason = h.reason;
  }
  return finish(ctx, height, core, holder, challengers, holderReason ?? null);
}

async function ociCore(ctx: Context, n: number): Promise<Core> {
  const tip = await tipHeight(ctx);
  const page = await loadOciPage(ctx, ociPageFor(n));
  const sat = ociSat(page, n);
  const satIndex = ociSatIndex(n, page);
  const firstness: ResolveResult['firstness'] = { method: 'oci', ociPage: page.pageId, satIndex };
  const base = { satIndex, firstness, walked: [], ignored: [], caveats: [] as Caveat[], tip };
  if (sat === null) {
    ctx.mark('oci', 'agree');
    // The OCI is not authoritative about absence.
    return { ...base, verdict: 'undetermined', reason: `the OCI has no entry for ${n}.bitmap`, candidate: null };
  }
  // sat + satIndex -> id never changes once the inscription exists, so it is cached.
  const idKey = `ociid:${sat}:${satIndex}`;
  let id = ((await ctx.stores.immutable.get(idKey)) as string | undefined) ?? null;
  if (!id) {
    try {
      id = await ctx.ord.satAt(sat, satIndex, ctx.signal);
      ctx.mark('ord', 'agree');
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      ctx.mark('ord', 'unreachable', (e as Error).message);
      throw new ResolveFailure(`ord /r/sat: ${(e as Error).message}`, 'unreachable');
    }
  }
  if (!id) {
    ctx.mark('oci', 'disagree', `no inscription at sat ${sat} index ${satIndex}`);
    return { ...base, verdict: 'undetermined', reason: `ord has no inscription at the OCI's sat ${sat} index ${satIndex}`, candidate: null };
  }
  const facts = await revealFacts(ctx, id, tip);
  if (facts.revealHeight <= tip - 5) await ctx.stores.immutable.set(idKey, id);
  if (facts.sat !== sat) {
    ctx.mark('oci', 'disagree', `OCI sat ${sat}, ord sat ${facts.sat}`);
    return { ...base, verdict: 'undetermined', reason: `OCI sat ${sat} differs from ord's sat ${facts.sat} for ${id}`, candidate: facts };
  }
  ctx.mark('oci', 'agree');
  const check = checkClaim(claimFacts(facts), n, tip);
  if (!check.ok) {
    return { ...base, verdict: 'undetermined', reason: `the OCI candidate ${id} fails the rule (${check.reason})`, candidate: facts };
  }
  const caveats = withUnbound(check.caveats, facts);
  if (caveats.length > 0) {
    return { ...base, caveats, verdict: 'undetermined', reason: `the rule is ambiguous for ${id} (${caveats.join(', ')})`, candidate: facts };
  }
  return { ...base, verdict: 'canonical', candidate: facts };
}

async function walkCore(ctx: Context, n: number, cap: number): Promise<Core> {
  const tip = await tipHeight(ctx);
  if (n > tip) {
    return {
      verdict: 'none',
      reason: `block ${n} is not mined yet (tip ${tip}); no claim can be valid before it`,
      candidate: null,
      satIndex: null,
      firstness: { method: 'walk', walkedFrom: n, walkedTo: tip },
      walked: [],
      ignored: [],
      caveats: [],
      tip,
    };
  }
  const out = await walk(ctx, n, tip, cap);
  const firstness: ResolveResult['firstness'] = { method: 'walk', walkedFrom: n, walkedTo: out.walkedTo };
  const base = { satIndex: null, firstness, walked: out.walked, ignored: out.ignored, tip };
  if (!out.found) {
    if (out.stoppedAt === 'tip') {
      return { ...base, verdict: 'none', reason: `no valid claim up to block ${out.walkedTo}`, candidate: null, caveats: [] };
    }
    return {
      ...base,
      verdict: 'undetermined',
      reason: `walked blocks ${n}-${out.walkedTo} without a valid claim; the walk stopped at its cap`,
      candidate: null,
      caveats: [],
      cursor: out.walkedTo + 1,
    };
  }
  const facts = await walkFacts(ctx, out.found.candidate, out.found.block, tip);
  const caveats = withUnbound(out.found.caveats, facts);
  if (caveats.length > 0) {
    return {
      ...base,
      verdict: 'undetermined',
      reason: `the rule is ambiguous for ${facts.id} (${caveats.join(', ')})`,
      candidate: facts,
      caveats,
    };
  }
  return { ...base, verdict: 'canonical', candidate: facts, caveats: [] };
}

/** Facts for a walked claim: envelope from our own parse, the rest from ord. */
async function walkFacts(ctx: Context, c: ScanCandidate, block: number, tip: number): Promise<RevealFacts> {
  const id = c.id as string;
  let ins;
  try {
    ins = await ctx.ord.inscription(id, ctx.signal);
    ctx.mark('ord', 'agree');
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    ctx.mark('ord', 'unreachable', (e as Error).message);
    throw new ResolveFailure(`ord /r/inscription: ${(e as Error).message}`, 'unreachable');
  }
  if (!ins || ins.height !== block) {
    ctx.mark('ord', 'disagree', `ord height ${ins?.height} for ${id}, walk found it in ${block}`);
    throw new ResolveFailure(`ord ${ins ? `puts ${id} at height ${ins.height}` : `does not know ${id}`}; the walk found it in block ${block}`, 'disagree');
  }
  const hash = await agreedBlockHash(ctx, block, tip);
  return {
    id,
    revealTxid: c.txid,
    vin: c.vin,
    envelopeIndex: c.envelopeIndex as number,
    bodyHex: c.bodyHex,
    complete: c.complete,
    contentType: c.contentType,
    contentEncodingHex: c.contentEncodingHex,
    delegateHex: c.delegateHex,
    unrecognizedEvenField: c.unrecognizedEvenField,
    revealHeight: block,
    revealBlockHash: hash,
    number: ins.number,
    charms: ins.charms,
    sat: ins.sat,
  };
}

/**
 * ord also leaves an inscription unbound when its input carried no value; the
 * envelope cannot show that, ord's charm (or a missing sat) does.
 */
function withUnbound(caveats: Caveat[], f: RevealFacts): Caveat[] {
  const unbound = f.charms.includes('unbound') || f.sat === null;
  return unbound && !caveats.includes('unbound') ? [...caveats, 'unbound'] : caveats;
}

function claimFacts(f: RevealFacts) {
  return {
    body: f.bodyHex === null ? null : fromHex(f.bodyHex),
    complete: f.complete,
    contentEncoding: f.contentEncodingHex === null ? null : fromHex(f.contentEncodingHex),
    delegate: f.delegateHex === null ? null : fromHex(f.delegateHex),
    unrecognizedEvenField: f.unrecognizedEvenField,
    revealHeight: f.revealHeight,
  };
}

/** Bitcoin order of two reveals: height, then position in the block. */
async function isEarlier(ctx: Context, a: RevealFacts, b: RevealFacts): Promise<boolean> {
  if (a.revealHeight !== b.revealHeight) return a.revealHeight < b.revealHeight;
  if (a.revealTxid === b.revealTxid) return a.envelopeIndex < b.envelopeIndex;
  const txids = await ctx.esplora.blockTxids(a.revealBlockHash, ctx.signal);
  if (!txids) throw new ResolveFailure('esplora has no txid list for the block', 'unreachable');
  const ia = txids.indexOf(a.revealTxid);
  const ib = txids.indexOf(b.revealTxid);
  if (ia < 0 || ib < 0) throw new ResolveFailure('reveal tx missing from its block txid list', 'disagree');
  return ia < ib;
}

async function judgeChallengers(ctx: Context, n: number, core: Core, ids: string[]): Promise<ChallengerResult[]> {
  const out: ChallengerResult[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id) || id === core.candidate?.id) continue;
    seen.add(id);
    try {
      const tip = core.tip ?? (await tipHeight(ctx));
      const facts = await revealFacts(ctx, id, tip);
      const check = checkClaim(claimFacts(facts), n, tip);
      if (!check.ok) {
        out.push({ id, outcome: check.reason, revealHeight: facts.revealHeight });
        core.ignored.push({ id, reason: check.reason, revealHeight: facts.revealHeight });
        continue;
      }
      const cand = core.candidate;
      if (cand) {
        if (await isEarlier(ctx, facts, cand)) {
          out.push({ id, outcome: 'valid_earlier', revealHeight: facts.revealHeight });
          core.verdict = 'disputed';
          core.reason = `${id} is a valid claim revealed before the candidate ${cand.id}`;
        } else if (core.verdict === 'canonical') {
          out.push({ id, outcome: 'valid_later', revealHeight: facts.revealHeight });
          core.ignored.push({ id, reason: 'not_first', revealHeight: facts.revealHeight });
        } else {
          // Later than a candidate that is not established (fails the rule,
          // carries a caveat, or is disputed): its first-ness is unknown.
          out.push({ id, outcome: 'valid_no_candidate', revealHeight: facts.revealHeight });
        }
        continue;
      }
      out.push({ id, outcome: 'valid_no_candidate', revealHeight: facts.revealHeight });
      const walkedTo = core.firstness.walkedTo;
      if (core.firstness.method === 'walk' && core.verdict !== 'disputed' && walkedTo !== undefined) {
        if (facts.revealHeight <= walkedTo) {
          // Inside blocks the walk scanned without finding a valid claim: the
          // scan and the presented facts disagree. A human decides.
          core.verdict = 'disputed';
          core.reason = `${id} is a valid claim in block ${facts.revealHeight}, which the walk scanned without finding it`;
        } else if (core.verdict === 'none') {
          // Revealed after the walked range (a block that landed since the
          // tip was read): it may be the deed. Walk on, never dispute.
          core.verdict = 'undetermined';
          core.reason = `${id} is a valid claim revealed in block ${facts.revealHeight}, after the walked range (to ${walkedTo})`;
          core.cursor = walkedTo + 1;
        }
      }
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      out.push({ id, outcome: 'unavailable' });
      if (core.verdict === 'canonical' || core.verdict === 'none') {
        core.verdict = 'undetermined';
        core.reason = `could not check the presented claim ${id}: ${(e as Error).message}`;
      }
    }
  }
  return out;
}

function finish(
  ctx: Context,
  height: number,
  core: Core,
  holder: Holder | null,
  challengers: ChallengerResult[],
  holderReason: string | null,
): ResolveResult {
  const c = core.candidate;
  const canonical: CanonicalFacts | null =
    core.verdict === 'canonical' && c && c.bodyHex !== null
      ? {
          id: c.id,
          revealTxid: c.revealTxid,
          vin: c.vin,
          envelopeIndex: c.envelopeIndex,
          revealHeight: c.revealHeight,
          bodyHex: c.bodyHex,
          contentType: c.contentType,
          contentEncoding: null,
          delegate: null,
          number: c.number,
          charms: c.charms,
          sat: c.sat === null ? null : String(c.sat),
          satIndex: core.satIndex,
        }
      : null;
  const sources = ctx.sources();
  const checkedAtHeight = core.tip ?? -1;
  const proof: ProofBundle = sealBundle({
    format: PROOF_FORMAT,
    rule: RULE_ID,
    height,
    verdict: core.verdict,
    canonical,
    firstness: {
      method: core.firstness.method,
      ...(core.firstness.method === 'oci' ? { ociModule: OCI_MODULE_ID, ...(core.firstness.ociPage ? { ociPage: core.firstness.ociPage } : {}) } : {}),
      walked: core.walked,
    },
    holder: canonical && holder ? { satpoint: holder.satpoint, outpoint: holder.outpoint, address: holder.address, unspentPer: holder.unspentPer } : null,
    ignored: core.ignored,
    sources,
    checkedAtHeight,
    generatedAt: ctx.now().toISOString(),
  });
  const reason = core.verdict !== 'canonical' ? core.reason : holder ? undefined : `holder unavailable: ${holderReason ?? 'unknown'}`;
  return {
    height,
    verdict: core.verdict,
    rule: RULE_ID,
    canonicalId: canonical ? canonical.id : null,
    candidateId: c ? c.id : null,
    sat: canonical ? canonical.sat : null,
    satpoint: canonical && holder ? holder.satpoint : null,
    holder: canonical && holder ? holder.address : null,
    firstness: core.firstness,
    ignored: core.ignored,
    challengers,
    sources,
    checkedAtHeight,
    ...(reason ? { reason } : {}),
    ...(core.caveats.length ? { caveats: core.caveats } : {}),
    ...(core.cursor !== undefined ? { cursor: core.cursor } : {}),
    proof,
  };
}
