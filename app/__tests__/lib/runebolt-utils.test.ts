/**
 * Tests for src/lib/runebolt-utils.ts
 * Covers: formatSats, truncateAddress, cn utility
 */

import { formatSats, truncateAddress, cn } from '@/lib/runebolt-utils';

describe('runebolt-utils', () => {
  describe('formatSats()', () => {
    it('formats small sats', () => {
      expect(formatSats(100)).toBe('100 sats');
    });

    it('formats sats with locale separators (1000+)', () => {
      const result = formatSats(5000);
      expect(result).toContain('sats');
      expect(result).toContain('5');
    });

    it('formats BTC for 1+ BTC', () => {
      expect(formatSats(100000000)).toBe('1.00000000 BTC');
    });

    it('formats fractional BTC', () => {
      expect(formatSats(150000000)).toBe('1.50000000 BTC');
    });

    it('formats 0 sats', () => {
      expect(formatSats(0)).toBe('0 sats');
    });

    it('BTC boundary is at 100M sats', () => {
      expect(formatSats(99999999)).toContain('sats');
      expect(formatSats(100000000)).toContain('BTC');
    });
  });

  describe('truncateAddress()', () => {
    it('truncates long address', () => {
      const addr = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
      expect(truncateAddress(addr)).toBe('bc1qw5...f3t4');
    });

    it('returns empty for empty input', () => {
      expect(truncateAddress('')).toBe('');
    });

    it('returns short address unchanged', () => {
      expect(truncateAddress('abcde', 3, 3)).toBe('abcde');
    });

    it('custom start/end lengths', () => {
      const addr = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
      expect(truncateAddress(addr, 10, 6)).toBe('bc1qw508d6...v8f3t4');
    });

    it('handles address shorter than start+end', () => {
      expect(truncateAddress('abc', 6, 4)).toBe('abc');
    });
  });

  describe('cn()', () => {
    it('merges class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles conditional classes', () => {
      const result = cn('base', true && 'active', false && 'hidden');
      expect(result).toContain('base');
      expect(result).toContain('active');
      expect(result).not.toContain('hidden');
    });

    it('resolves Tailwind conflicts', () => {
      // twMerge should resolve conflicting Tailwind classes
      const result = cn('p-4', 'p-8');
      expect(result).toBe('p-8');
    });
  });
});
