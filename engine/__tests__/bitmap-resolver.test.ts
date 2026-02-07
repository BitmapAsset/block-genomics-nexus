/**
 * Bitmap Resolver — Tests
 *
 * Tests the content validation logic (no network calls).
 */

import { describe, it, expect } from 'vitest';
import { _testHelpers } from '../bitmap-resolver';

const { parseBitmapContent, BITMAP_PATTERN } = _testHelpers;

describe('Bitmap Resolver', () => {
  describe('BITMAP_PATTERN', () => {
    it('matches valid bitmap content', () => {
      expect(BITMAP_PATTERN.test('0.bitmap')).toBe(true);
      expect(BITMAP_PATTERN.test('840000.bitmap')).toBe(true);
      expect(BITMAP_PATTERN.test('123456789.bitmap')).toBe(true);
    });

    it('rejects invalid content', () => {
      expect(BITMAP_PATTERN.test('')).toBe(false);
      expect(BITMAP_PATTERN.test('bitmap')).toBe(false);
      expect(BITMAP_PATTERN.test('.bitmap')).toBe(false);
      expect(BITMAP_PATTERN.test('abc.bitmap')).toBe(false);
      expect(BITMAP_PATTERN.test('840000.bitmaps')).toBe(false);
      expect(BITMAP_PATTERN.test('840000.txt')).toBe(false);
      expect(BITMAP_PATTERN.test('840000bitmap')).toBe(false);
      expect(BITMAP_PATTERN.test('-1.bitmap')).toBe(false);
    });
  });

  describe('parseBitmapContent', () => {
    it('extracts block height from valid content', () => {
      expect(parseBitmapContent('840000.bitmap')).toBe(840000);
      expect(parseBitmapContent('0.bitmap')).toBe(0);
      expect(parseBitmapContent('210000.bitmap')).toBe(210000);
    });

    it('trims whitespace', () => {
      expect(parseBitmapContent('  840000.bitmap  ')).toBe(840000);
      expect(parseBitmapContent('\n840000.bitmap\n')).toBe(840000);
    });

    it('returns null for invalid content', () => {
      expect(parseBitmapContent('')).toBeNull();
      expect(parseBitmapContent('not-a-bitmap')).toBeNull();
      expect(parseBitmapContent('abc.bitmap')).toBeNull();
    });
  });
});
