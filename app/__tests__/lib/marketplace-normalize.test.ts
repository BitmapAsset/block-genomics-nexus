/**
 * Normalizers for untrusted venue payloads.
 *
 * Every case here is something a compromised or merely sloppy venue could put
 * on the wire. The bar is not "parses" — it is that nothing absurd reaches a
 * page, and that one bad field costs that field rather than the whole panel.
 */

import {
  sanitizeSats,
  sanitizeTimestamp,
  sanitizeVenueUrl,
  asRecord,
} from '@/lib/marketplace/normalize';
import { MAX_PLAUSIBLE_SATS } from '@/lib/marketplace/types';

describe('sanitizeSats()', () => {
  it('accepts a plain positive integer', () => {
    expect(sanitizeSats(5_000_000)).toBe(5_000_000);
  });

  it('accepts a numeric string, because venues quote big integers inconsistently', () => {
    expect(sanitizeSats('5000000')).toBe(5_000_000);
  });

  it('rounds sub-sat float noise from a venue decimal pipeline', () => {
    expect(sanitizeSats(1000.4)).toBe(1000);
    expect(sanitizeSats(1000.6)).toBe(1001);
  });

  describe('absurd values are dropped, not displayed', () => {
    // A price at or above the total supply is upstream corruption. Rendering
    // "21,000,000 BTC" is worse than rendering nothing.
    it.each([
      ['at the supply cap', MAX_PLAUSIBLE_SATS],
      ['above the supply cap', MAX_PLAUSIBLE_SATS + 1],
      ['absurdly above it', 1e30],
      ['Number.MAX_VALUE', Number.MAX_VALUE],
      ['negative', -1],
      ['hugely negative', -5_000_000],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
    ])('%s', (_label, value) => {
      expect(sanitizeSats(value)).toBeNull();
    });

    // Zero is the subtle one. It parses, it is finite, it is not negative — and
    // a block "listed for 0 sats" is either a venue sentinel for "no price" or
    // a bug. Either way it must not render as a free bitmap.
    it('zero', () => {
      expect(sanitizeSats(0)).toBeNull();
    });

    it('zero as a string', () => {
      expect(sanitizeSats('0')).toBeNull();
    });
  });

  describe('non-numeric input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['whitespace', '   '],
      ['a word', 'free'],
      ['an object', { sats: 1 }],
      ['an array', [1]],
      ['a boolean', true],
    ])('%s', (_label, value) => {
      expect(sanitizeSats(value)).toBeNull();
    });
  });
});

describe('sanitizeTimestamp()', () => {
  it('accepts an ISO string', () => {
    expect(sanitizeTimestamp('2026-01-15T00:00:00.000Z')).toBe('2026-01-15T00:00:00.000Z');
  });

  it('accepts seconds since epoch', () => {
    expect(sanitizeTimestamp(1_700_000_000)).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('accepts milliseconds since epoch', () => {
    expect(sanitizeTimestamp(1_700_000_000_000)).toBe(new Date(1_700_000_000_000).toISOString());
  });

  describe('sentinels and nonsense are dropped', () => {
    it.each([
      ['epoch zero, the classic uninitialised field', 0],
      ['pre-Bitcoin', '1995-01-01T00:00:00Z'],
      ['far future', '5000-01-01T00:00:00Z'],
      ['unparseable', 'last tuesday'],
      ['null', null],
      ['empty string', ''],
      ['NaN', NaN],
      ['an object', {}],
    ])('%s', (_label, value) => {
      expect(sanitizeTimestamp(value)).toBeNull();
    });
  });
});

describe('sanitizeVenueUrl()', () => {
  const LINKS = ['venue.example'] as const;

  it('accepts an https URL on an allowlisted link host', () => {
    expect(sanitizeVenueUrl('https://venue.example/item/abc', LINKS)).toBe(
      'https://venue.example/item/abc',
    );
  });

  // This is the phishing control. A venue-supplied href is an attacker-supplied
  // href, and an unchecked one turns the block page into a laundering surface
  // for a wallet-drainer link.
  describe('hostile links are dropped', () => {
    it.each([
      ['a lookalike domain', 'https://venue.example.attacker.com/connect-wallet'],
      ['an unrelated domain', 'https://drainer.example/connect'],
      ['plain http', 'http://venue.example/item/abc'],
      ['javascript:', 'javascript:alert(1)'],
      ['data:', 'data:text/html,<script>alert(1)</script>'],
      ['file:', 'file:///etc/passwd'],
      ['embedded credentials', 'https://user:pass@venue.example/item'],
      ['not a URL', 'venue.example/item'],
      ['empty', ''],
      ['null', null],
      ['a number', 42],
    ])('%s', (_label, value) => {
      expect(sanitizeVenueUrl(value, LINKS)).toBeNull();
    });
  });

  it('drops everything when the link allowlist is empty', () => {
    expect(sanitizeVenueUrl('https://venue.example/item', [])).toBeNull();
  });
});

describe('asRecord()', () => {
  it('accepts a plain object', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it.each([
    ['an array', [1, 2]],
    ['null', null],
    ['a string', 'x'],
    ['a number', 1],
  ])('rejects %s', (_label, value) => {
    expect(asRecord(value)).toBeNull();
  });
});
