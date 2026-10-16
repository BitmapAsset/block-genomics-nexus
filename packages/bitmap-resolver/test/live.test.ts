// Live suite: real ordinals.com + Esplora through the package limiter.
// Never on PR CI. Run by hand: BITMAP_LIVE_TESTS=1 npx vitest run test/live.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../src/context.js';
import { Limiter } from '../src/limiter.js';
import { resolve } from '../src/resolve.js';
import { verifyProof } from '../src/verify.js';

const live = !!process.env.BITMAP_LIVE_TESTS;
const limiter = live ? new Limiter({ ...DEFAULT_LIMITS, userAgent: 'bitmap-resolver/0.1 (Block Genomics live tests; polite, 2 rps)' }) : null;

describe.skipIf(!live)('live', () => {
  it.each([
    [208, 'bac3a61c49f9f4c7c914f6e2d3c5f57d1c5e27c4e8df16e574ff8c736728bf8di0'],
    [840000, '05f8584cf4dbe34ef677f8f316fcac9e6e4ccb0e298d53fd21edaac7787660eei0'],
    [718840, 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0'],
    [720143, '314c9f1602a18b54feecc0eca8e5724eea938b57f53df1921743dfb5b5152de5i0'],
    [738505, 'd5ba7c3282c250c0e8833483eced097660d4a9e940e770563968597e2df37605i0'],
    [745506, '6168ba458d997ec874135f6c1a5a70ae5e14844f745f7ab1b29377f2b47469d3i0'],
    [745966, '80ae7d3e42c4e57f96bbddb66794544736013fea9fed177ac104aaea378901d7i0'],
    [969788, '2db4fa238b2dd2bef8349b751325abf39e1ae7665411d833203cdd5a9b2682b9i0'],
  ])('%i resolves canonical to %s and the proof re-verifies', async (h, id) => {
    const r = await resolve(h, { freshness: 'auth', limiter: limiter!, walkCap: 1 });
    expect(r.verdict).toBe('canonical');
    expect(r.canonicalId).toBe(id);
    expect(r.holder).toMatch(/^bc1/);
    expect((await verifyProof(r.proof, { limiter: limiter! })).ok).toBe(true);
  }, 120_000);

  it('a fresh height near the tip with walkCap 1 never guesses', async () => {
    const tip = Number(await (await fetch('https://ordinals.com/r/blockheight')).text());
    const r = await resolve(tip - 1, { freshness: 'display', limiter: limiter!, walkCap: 1 });
    expect(['canonical', 'none', 'undetermined']).toContain(r.verdict);
    if (r.verdict === 'undetermined') expect(r.cursor).toBe(tip);
  }, 120_000);
});
