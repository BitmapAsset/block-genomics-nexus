// Live resolve against ordinals.com + Esplora, through the package's limiter.
//   node scripts/resolve-live.mjs 840000 969788
// Env: WALK_CAP (default 3), FULL=1 prints the whole result incl. the proof bundle.
import { DEFAULT_LIMITS, Limiter, resolve, verifyProof } from '../dist/index.js';

const limiter = new Limiter({ ...DEFAULT_LIMITS, userAgent: 'bitmap-resolver/0.1 (Block Genomics; polite, 2 rps)' });
const heights = process.argv.slice(2).map(Number);
if (heights.length === 0 || heights.some((h) => !Number.isSafeInteger(h))) {
  console.error('usage: node scripts/resolve-live.mjs <height> [height...]');
  process.exit(2);
}

for (const height of heights) {
  const t0 = Date.now();
  const r = await resolve(height, { freshness: 'auth', walkCap: Number(process.env.WALK_CAP ?? 3), limiter });
  const ms = Date.now() - t0;
  const check = r.verdict === 'canonical' ? await verifyProof(r.proof, { limiter }) : null;
  const out = process.env.FULL
    ? { ms, ...r, verifyProof: check }
    : {
        height,
        ms,
        verdict: r.verdict,
        rule: r.rule,
        canonicalId: r.canonicalId,
        candidateId: r.candidateId,
        sat: r.sat,
        holder: r.holder,
        satpoint: r.satpoint,
        firstness: r.firstness,
        ignored: r.ignored,
        sources: r.sources.map((s) => `${s.name}:${s.verdict}${s.detail ? ` (${s.detail})` : ''}`),
        checkedAtHeight: r.checkedAtHeight,
        reason: r.reason,
        bundleHash: r.proof.bundleHash,
        walked: r.proof.firstness.walked,
        verifyProof: check,
      };
  console.log(JSON.stringify(out, null, 1));
}
console.log(JSON.stringify({ requests: limiter.stats() }));
