// The 18 audited heights, replayed offline from vectors recorded once through
// the limiter (scripts/record-vectors.mjs). Any request outside the recording
// fails the test, so these never touch the network.
import { describe, expect, it } from 'vitest';
import { resolve } from '../src/resolve.js';
import { verifyProof } from '../src/verify.js';
import { checkInBrowser } from '../src/browser.js';
import { computeBundleHash, canonicalJson } from '../src/proof.js';
import { memoryStores } from '../src/stores.js';
import { RULE_ID } from '../src/rules.js';
import { OCI_PAGE_SHA256, type OciPage } from '../src/sources/oci.js';
import { createHash } from 'node:crypto';
import type { ProofBundle } from '../src/types.js';
import { fastLimiter, readVector, replayFetch } from './helpers.js';

// Canonical ids from the independent 2026-10-14 audit (BG-DATA-AUDIT §5,
// canon-check.json), which ran the inscribed OCI module itself.
const AUDIT: Record<number, string> = {
  0: '86539aff946c437af8088955827b7e6ff48fc6192836d4071b697b5359b7a732i0',
  208: 'bac3a61c49f9f4c7c914f6e2d3c5f57d1c5e27c4e8df16e574ff8c736728bf8di0',
  95238: '214d0dd9b55162b584b664afdccb03c099426cd382fac091abbe135e108485b9i0',
  275798: 'd98e14628284e7ca993ba15dec8492f952d63b4dbc1aaeffc527b1be2b097dd2i0',
  433445: 'e16820142ec10fa1e61fbbcba6037a52fbe01704bfd7a19ab6a188f9a15b0fa1i0',
  528999: '820d0fa16b32e9e0506f06db59a31a435c45f331ef480772a57134be5beb2e58i0',
  563851: 'e7dec6deaf7bf579f8f0cf8788437674846d9b099561ba73a34e93a70b4f11b1i0',
  612888: 'daf63d78f6e4cbf8cc5d0b375978c9c707849b5ee0dac909813cef7db66da2d9i0',
  614347: '6b91079d99a80312e8cbae1effb5ac15d610d4d28d81580ee8cee18b3d18f3d9i0',
  640860: 'a1bdd3f2722668816e482c48f2f8c9cdc35c5ecaaa4e5c8f9fcf83a16a0d69c5i0',
  718222: '64798e516f347e983ff22e03c5289d8696f5dd206c365a220a8056976e1f90d8i0',
  718840: 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0',
  720143: '314c9f1602a18b54feecc0eca8e5724eea938b57f53df1921743dfb5b5152de5i0',
  738505: 'd5ba7c3282c250c0e8833483eced097660d4a9e940e770563968597e2df37605i0',
  745506: '6168ba458d997ec874135f6c1a5a70ae5e14844f745f7ab1b29377f2b47469d3i0',
  745966: '80ae7d3e42c4e57f96bbddb66794544736013fea9fed177ac104aaea378901d7i0',
  840000: '05f8584cf4dbe34ef677f8f316fcac9e6e4ccb0e298d53fd21edaac7787660eei0',
  935550: '2c3ed0f170276e4bb9897f2dececc2383bed5369ef58949cbeb07794aae9453di0',
};

const fixedNow = () => new Date('2026-10-15T00:00:00.000Z');

export function replayContext(height: number) {
  const v = readVector(`heights/${height}.json`);
  const log: string[] = [];
  const fetchImpl = replayFetch(v.http, log);
  const limiter = fastLimiter(fetchImpl);
  const stores = memoryStores();
  const page: OciPage = { page: v.oci.page, pageId: v.oci.pageId, sats: v.oci.sparse.sats, satIndexMap: v.oci.sparse.satIndexMap };
  void stores.immutable.set(`oci:${v.oci.pageId}`, page);
  return { v, log, limiter, stores };
}

describe('the 18 audited heights, offline', () => {
  for (const h of Object.keys(AUDIT).map(Number)) {
    it(`${h}.bitmap resolves canonical to the audited id, and its proof verifies`, async () => {
      const { v, limiter, stores, log } = replayContext(h);
      const r = await resolve(h, { freshness: 'auth', limiter, stores, now: fixedNow });
      expect(r.verdict).toBe('canonical');
      expect(r.rule).toBe(RULE_ID);
      expect(r.canonicalId).toBe(AUDIT[h]);
      expect(r.canonicalId).toBe(v.expected.canonicalId);
      expect(r.sat).toBe(v.expected.sat);
      expect(r.holder).toBe(v.expected.holder);
      expect(r.satpoint).toBe(v.expected.satpoint);
      expect(r.firstness).toEqual({ method: 'oci', ociPage: v.oci.pageId, satIndex: v.oci.satIndex });
      expect(r.sources.every((s) => s.verdict === 'agree')).toBe(true);
      expect(r.proof.canonical).toEqual(v.expected.canonical);
      expect(r.proof.firstness.ociModule).toBe('942b5886158d57fc70cb8fb7d9bd4d37aa95b8b145be1a351326336b087262dbi0');
      expect(r.proof.bundleHash).toBe(computeBundleHash(r.proof));
      expect(log.some((u) => u.includes('/content/'))).toBe(false); // OCI page came from the store

      const check = await verifyProof(r.proof, { limiter, stores });
      expect(check).toEqual({ ok: true, diffs: [], holderDiffs: [], notes: [] });
    });
  }

  it('accepts any MIME and records charms: 208 is text/plain;charset=utf-8, 840000 is text/plain and vindicated', async () => {
    const a = replayContext(208);
    const r208 = await resolve(208, { freshness: 'auth', limiter: a.limiter, stores: a.stores });
    expect(r208.proof.canonical?.contentType).toBe('text/plain;charset=utf-8');
    const b = replayContext(840000);
    const r840 = await resolve(840000, { freshness: 'auth', limiter: b.limiter, stores: b.stores });
    expect(r840.proof.canonical?.contentType).toBe('text/plain');
    expect(r840.proof.canonical?.charms).toContain('vindicated');
    expect(r840.verdict).toBe('canonical');
  });

  it('a reveal witness that differs between ord and Esplora makes the verdict undetermined', async () => {
    const { v, stores } = replayContext(208);
    const txid = (v.expected.canonicalId as string).slice(0, 64);
    const url = `https://blockstream.info/api/tx/${txid}`;
    const body = JSON.parse(v.http[url].body);
    body.vin[0].witness[1] = body.vin[0].witness[1].slice(0, -2) + (body.vin[0].witness[1].endsWith('00') ? '01' : '00');
    const r = await resolve(208, { freshness: 'auth', limiter: fastLimiter(replayFetch({ ...v.http, [url]: { status: 200, body: JSON.stringify(body) } })), stores });
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toMatch(/witness/);
    expect(r.sources.find((s) => s.name === 'esplora')?.verdict).toBe('disagree');
  });

  it('caches immutable facts: a second resolve skips the reveal tx and OCI lookups', async () => {
    const { limiter, stores, log } = replayContext(720143);
    await resolve(720143, { freshness: 'display', limiter, stores });
    const first = log.length;
    await resolve(720143, { freshness: 'display', limiter, stores });
    const second = log.slice(first);
    expect(second.some((u) => u.includes('/r/tx/'))).toBe(false);
    expect(second.length).toBeLessThan(first);
  });
});

describe('proof bundle', () => {
  async function bundleFor(h: number) {
    const ctx = replayContext(h);
    const r = await resolve(h, { freshness: 'auth', limiter: ctx.limiter, stores: ctx.stores, now: fixedNow });
    return { ...ctx, bundle: r.proof };
  }

  it('bundleHash covers everything but generatedAt', async () => {
    const { bundle } = await bundleFor(208);
    const later: ProofBundle = { ...bundle, generatedAt: '2030-01-01T00:00:00.000Z' };
    expect(computeBundleHash(later)).toBe(bundle.bundleHash);
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it('a tampered holder is caught (hash), and a re-sealed one is still caught (source check)', async () => {
    const { bundle, limiter, stores } = await bundleFor(208);
    const forged: ProofBundle = { ...bundle, holder: { ...bundle.holder!, address: 'bc1qforgedholder0000000000000000000000000' } };
    const r1 = await verifyProof(forged, { limiter, stores });
    expect(r1.ok).toBe(false);
    expect(r1.diffs.join('\n')).toMatch(/bundleHash/);
    const resealed = { ...forged, bundleHash: computeBundleHash(forged) };
    const r2 = await verifyProof(resealed, { limiter, stores });
    expect(r2.ok).toBe(false);
    expect(r2.holderDiffs.join('\n')).toMatch(/holder address/);
    expect((await checkInBrowser(208, resealed, { limiter, stores })).color).toBe('amber');
  });

  it('a tampered bodyHex is caught even when re-sealed', async () => {
    const { bundle, limiter, stores } = await bundleFor(208);
    const c = bundle.canonical!;
    const forged = { ...bundle, canonical: { ...c, bodyHex: Buffer.from('209.bitmap').toString('hex') } };
    const resealed = { ...forged, bundleHash: computeBundleHash(forged) };
    const r = await verifyProof(resealed, { limiter, stores });
    expect(r.ok).toBe(false);
    expect(r.diffs.join('\n')).toMatch(/bodyHex/);
    expect((await checkInBrowser(208, resealed, { limiter, stores })).color).toBe('red');
  });

  it('a swapped id is caught even when re-sealed', async () => {
    const a = await bundleFor(208);
    const b = await bundleFor(95238);
    // Claim 208 with 95238's deed: the chain's envelope says 95238.bitmap.
    const forged: ProofBundle = { ...a.bundle, canonical: { ...b.bundle.canonical! } };
    const resealed = { ...forged, bundleHash: computeBundleHash(forged) };
    const merged = replayFetch({ ...a.v.http, ...b.v.http });
    const r = await verifyProof(resealed, { limiter: fastLimiter(merged), stores: a.stores });
    expect(r.ok).toBe(false);
    expect(r.diffs.join('\n')).toMatch(/fails the rule for 208/);
  });

  it('deep mode re-derives OCI first-ness from the page, and catches a wrong satIndex', async () => {
    const { bundle, v } = await bundleFor(208);
    // The real page 0 (2.35 MB) is not stored. A minimal page-0 text that decodes
    // to the recorded sat at position 208 stands in, with its hash pinned for
    // this test only.
    const pageText = JSON.stringify([[v.oci.sat], [208]]);
    const http = { ...v.http, [`https://ordinals.com/content/${v.oci.pageId}`]: { status: 200, body: pageText } };
    const pins = OCI_PAGE_SHA256 as string[];
    const real = pins[0];
    pins[0] = createHash('sha256').update(pageText).digest('hex');
    try {
      const ok = await verifyProof(bundle, { limiter: fastLimiter(replayFetch(http)), stores: memoryStores(), deep: true });
      expect(ok).toEqual({ ok: true, diffs: [], holderDiffs: [], notes: [] });
      const wrong = { ...bundle, canonical: { ...bundle.canonical!, satIndex: 1 } };
      const resealed = { ...wrong, bundleHash: computeBundleHash(wrong) };
      const bad = await verifyProof(resealed, { limiter: fastLimiter(replayFetch(http)), stores: memoryStores(), deep: true });
      expect(bad.diffs.join('\n')).toMatch(/OCI satIndex 0, bundle 1/);
    } finally {
      pins[0] = real;
    }
    // With the real pin, the stand-in page is rejected as not the inscribed page.
    const pinned = await verifyProof(bundle, { limiter: fastLimiter(replayFetch(http)), stores: memoryStores(), deep: true });
    // deep: false skips OCI first-ness and says so.
    const cheap = await verifyProof(bundle, { limiter: fastLimiter(replayFetch(http)), stores: memoryStores(), deep: false });
    expect(cheap.ok).toBe(true);
    expect(cheap.notes).toEqual(['OCI first-ness not re-checked (deep: false)']);
    expect(pinned.diffs.join('\n')).toMatch(/OCI page 0 bytes do not match the pinned hash/);
  });

  it('a page whose bytes do not hash to the pin makes the resolve undetermined, not decoded', async () => {
    const v = readVector('heights/208.json');
    const http = { ...v.http, [`https://ordinals.com/content/${v.oci.pageId}`]: { status: 200, body: JSON.stringify([[v.oci.sat], [208]]) } };
    const r = await resolve(208, { freshness: 'auth', limiter: fastLimiter(replayFetch(http)), stores: memoryStores() });
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toMatch(/pinned/);
    expect(r.sources.find((s) => s.name === 'oci')?.verdict).toBe('disagree');
  });

  it('every recorded page hash equals its pin', () => {
    expect(OCI_PAGE_SHA256).toHaveLength(11);
    for (const h of Object.keys(AUDIT).map(Number)) {
      const v = readVector(`heights/${h}.json`);
      expect(v.oci.pageSha256).toBe(OCI_PAGE_SHA256[v.oci.page]);
    }
  });

  it('a bundle from another rule version is flagged', async () => {
    const { bundle, limiter, stores } = await bundleFor(208);
    const old = { ...bundle, rule: 'liveoci-alpha@0c18b83c+bg0' };
    const resealed = { ...old, bundleHash: computeBundleHash(old) };
    expect((await verifyProof(resealed, { limiter, stores })).diffs.join('\n')).toMatch(/rule/);
  });
});
