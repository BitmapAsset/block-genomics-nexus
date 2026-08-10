import {
  parseBlockParam,
  applyBlockParam,
  buildBlockShareUrl,
  MAX_BLOCK_HEIGHT,
} from '@/lib/blockDeepLink';

describe('parseBlockParam', () => {
  it('parses a plain height', () => {
    expect(parseBlockParam('840000')).toBe(840000);
    expect(parseBlockParam('0')).toBe(0);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseBlockParam(' 840000 ')).toBe(840000);
  });

  it('returns undefined for absent values', () => {
    expect(parseBlockParam(null)).toBeUndefined();
    expect(parseBlockParam(undefined)).toBeUndefined();
    expect(parseBlockParam('')).toBeUndefined();
  });

  it('rejects anything that is not a bare non-negative integer', () => {
    // parseInt would accept several of these — that is the bug this guards.
    for (const bad of ['840000junk', 'abc', '-1', '1.5', '9e9', '0x10', '+7']) {
      expect(parseBlockParam(bad)).toBeUndefined();
    }
  });

  it('rejects heights past the sanity ceiling', () => {
    expect(parseBlockParam(String(MAX_BLOCK_HEIGHT))).toBe(MAX_BLOCK_HEIGHT);
    expect(parseBlockParam(String(MAX_BLOCK_HEIGHT + 1))).toBeUndefined();
  });
});

describe('applyBlockParam', () => {
  it('adds the param to an empty search', () => {
    expect(applyBlockParam('', 840000)).toBe('?block=840000');
  });

  it('replaces an existing block param', () => {
    expect(applyBlockParam('?block=1', 2)).toBe('?block=2');
  });

  it('clears the param when nothing is selected', () => {
    expect(applyBlockParam('?block=840000', null)).toBe('');
    expect(applyBlockParam('?block=840000', undefined)).toBe('');
  });

  it('preserves unrelated params in both directions', () => {
    expect(applyBlockParam('?ref=x', 7)).toBe('?ref=x&block=7');
    expect(applyBlockParam('?ref=x&block=7', null)).toBe('?ref=x');
  });

  it('accepts a search string with or without the leading ?', () => {
    expect(applyBlockParam('block=1', 2)).toBe('?block=2');
  });

  it('round-trips through parseBlockParam', () => {
    const search = applyBlockParam('', 840000);
    const parsed = new URLSearchParams(search.slice(1)).get('block');
    expect(parseBlockParam(parsed)).toBe(840000);
  });
});

describe('buildBlockShareUrl', () => {
  it('builds the canonical /block/{height} link', () => {
    expect(buildBlockShareUrl(840000, 'https://blockgenomics.io')).toBe(
      'https://blockgenomics.io/block/840000',
    );
  });

  it('does not double up on a trailing slash', () => {
    expect(buildBlockShareUrl(1, 'https://blockgenomics.io/')).toBe(
      'https://blockgenomics.io/block/1',
    );
  });
});
