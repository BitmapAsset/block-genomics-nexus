import { describe, expect, it } from 'vitest';
import { decodeOciPage, OCI_PAGES, ociPageFor, ociPosition, ociSat, ociSatIndex, SAT_INDICES, type OciPage } from '../src/sources/oci.js';
import { readVector } from './helpers.js';

const HEIGHTS = [0, 208, 95238, 275798, 433445, 528999, 563851, 612888, 614347, 640860, 718222, 718840, 720143,
  738505, 745506, 745966, 840000, 935550];

describe('OCI page layout (getBitmapSat port)', () => {
  it.each([
    [0, 0, 0],
    [99999, 0, 99999],
    [100000, 1, 0],
    [799999, 7, 99999],
    [800000, 8, 0],
    [839999, 8, 39999],
    [840000, 9, 0],
    [906999, 9, 66999],
    [907000, 10, 0],
    [941999, 10, 34999],
  ])('height %i -> page %i position %i', (n, page, pos) => {
    expect(ociPageFor(n)).toBe(page);
    expect(ociPosition(n)).toBe(pos);
  });

  it('refuses heights the OCI does not cover', () => {
    expect(() => ociPageFor(942000)).toThrow();
    expect(() => ociPageFor(-1)).toThrow();
  });

  it('carries the 11 pinned pages and the satIndex table verbatim', () => {
    expect(OCI_PAGES).toHaveLength(11);
    expect(OCI_PAGES[9]).toBe('b907b51a239e3a37f29f8222fb274f828c6ebf7b93ce501a55b7171daaa75758i0');
    expect(SAT_INDICES[92871]).toBe(1);
    expect(SAT_INDICES[834051]).toBe(17);
    expect(Object.keys(SAT_INDICES)).toHaveLength(46);
    expect(ociSatIndex(92871)).toBe(1);
    expect(ociSatIndex(92872)).toBe(0);
  });
});

describe('decodeOciPage (fillPage port)', () => {
  it('normal pages: [deltas, order], cumulative sats placed by order', () => {
    const page = decodeOciPage(0, JSON.stringify([[100, 5, 7], [2, 0, 1]]));
    expect(page.sats[2]).toBe(100);
    expect(page.sats[0]).toBe(105);
    expect(page.sats[1]).toBe(112);
    expect(page.sats[3]).toBe(0); // unfilled
    expect(ociSat(page, 3)).toBeNull();
    expect(ociSat(page, 1)).toBe(112);
  });

  it('applies the literal "\\n  " repair and the double-space repair', () => {
    const withEscapes = '[[1,\\n  2],[0,\\n  1]]';
    expect(decodeOciPage(1, withEscapes).sats[1]).toBe(3);
    const withSpaces = '[[1,  2],[1,  0]]'; // parses either way; the module tries both
    expect(decodeOciPage(4, withSpaces).sats[0]).toBe(3);
  });

  it('pages 2 and 3: bracketless, with the module\'s slice(0, 99999) / slice(100000, 199999) quirk', () => {
    const deltas = new Array(100000).fill(0);
    const order = new Array(100000).fill(0).map((_, i) => i);
    deltas[0] = 1000;
    deltas[1] = 1;
    deltas[99999] = 5; // dropped by slice(0, 99999)
    const text = [...deltas, ...order].join(',');
    const page = decodeOciPage(2, text);
    expect(page.sats[0]).toBe(1000);
    expect(page.sats[1]).toBe(1001);
    expect(page.sats[99998]).toBe(1001);
    // order[99999] is outside slice(100000, 199999), so position 99999 stays unfilled:
    expect(page.sats[99999]).toBe(0);
    expect(ociSat(page, 299999)).toBeNull();
  });

  it('pages 9 and 10: {deltaEncodedSats, satIndexMap}', () => {
    const page = decodeOciPage(10, JSON.stringify({ deltaEncodedSats: ['500', 1, '2'], satIndexMap: { 907002: 3 } }));
    expect(page.sats[0]).toBe(500);
    expect(page.sats[2]).toBe(503);
    expect(ociSat(page, 907002)).toBe(503);
    expect(ociSatIndex(907002, page)).toBe(3);
    expect(ociSatIndex(907001, page)).toBe(0);
    expect(() => ociSatIndex(907001)).toThrow(); // needs its page
  });

  it('refuses a page for the wrong height', () => {
    const page = decodeOciPage(0, JSON.stringify([[1], [0]]));
    expect(() => ociSat(page, 100000)).toThrow();
  });
});

describe('recorded vectors: what the real pages decoded to', () => {
  // The real pages are ~1-2.4 MB each and are not stored; record-vectors.mjs
  // decoded them with this module and stored the hash of the bytes it decoded
  // and the result. ord's own sat for each canonical id must equal it.
  it.each(HEIGHTS)('height %i', (h) => {
    const v = readVector(`heights/${h}.json`);
    expect(v.oci.page).toBe(ociPageFor(h));
    expect(v.oci.pageId).toBe(OCI_PAGES[v.oci.page]);
    expect(v.oci.pageSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(v.oci.position).toBe(ociPosition(h));
    const sparse: OciPage = { page: v.oci.page, pageId: v.oci.pageId, sats: v.oci.sparse.sats, satIndexMap: v.oci.sparse.satIndexMap };
    expect(ociSat(sparse, h)).toBe(v.oci.sat);
    expect(String(v.oci.sat)).toBe(v.expected.sat);
    const insUrl = `https://ordinals.com/r/inscription/${v.expected.canonicalId}`;
    expect(JSON.parse(v.http[insUrl].body).sat).toBe(v.oci.sat);
  });
});
