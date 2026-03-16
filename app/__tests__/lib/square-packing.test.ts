/**
 * Tests for src/lib/square-packing.ts
 * Covers: txToSquareSize, Mondrian packing, world space conversion
 */

import { txToSquareSize, packSquares, packSquaresToWorldSpace } from '@/lib/square-packing';
import { MOCK_TRANSACTIONS } from '../fixtures';

describe('square-packing', () => {
  describe('txToSquareSize()', () => {
    it('minimum vbytes returns size 1', () => {
      expect(txToSquareSize(1)).toBe(1);
    });

    it('256 vbytes = 1x1 square', () => {
      expect(txToSquareSize(256)).toBe(1);
    });

    it('1024 vbytes = 2x2 square', () => {
      expect(txToSquareSize(1024)).toBe(2);
    });

    it('scales with sqrt', () => {
      const s1 = txToSquareSize(256);
      const s4 = txToSquareSize(256 * 4);
      expect(s4).toBe(s1 * 2);
    });

    it('custom scale factor', () => {
      const size = txToSquareSize(100, 100);
      expect(size).toBe(1);
    });

    it('large transaction produces larger square', () => {
      const small = txToSquareSize(250);
      const large = txToSquareSize(50000);
      expect(large).toBeGreaterThan(small);
    });

    it('never returns 0', () => {
      expect(txToSquareSize(0)).toBe(1);
      expect(txToSquareSize(-1)).toBe(1);
    });
  });

  describe('packSquares()', () => {
    it('returns empty for no items', () => {
      const result = packSquares([]);
      expect(result.squares).toEqual([]);
      expect(result.gridWidth).toBe(0);
      expect(result.gridHeight).toBe(0);
    });

    it('packs a single transaction', () => {
      const result = packSquares([{ index: 0, vbytes: 256 }]);
      expect(result.squares).toHaveLength(1);
      expect(result.squares[0].index).toBe(0);
      expect(result.gridWidth).toBeGreaterThan(0);
    });

    it('packs multiple transactions', () => {
      const result = packSquares(MOCK_TRANSACTIONS);
      expect(result.squares).toHaveLength(MOCK_TRANSACTIONS.length);
      expect(result.gridWidth).toBeGreaterThan(0);
      expect(result.gridHeight).toBeGreaterThan(0);
    });

    it('preserves transaction indices', () => {
      const result = packSquares(MOCK_TRANSACTIONS);
      const indices = result.squares.map(s => s.index).sort((a, b) => a - b);
      expect(indices).toEqual(MOCK_TRANSACTIONS.map(t => t.index));
    });

    it('no overlapping squares', () => {
      const result = packSquares(MOCK_TRANSACTIONS);
      for (let i = 0; i < result.squares.length; i++) {
        for (let j = i + 1; j < result.squares.length; j++) {
          const a = result.squares[i];
          const b = result.squares[j];
          const overlapX = a.x < b.x + b.size && a.x + a.size > b.x;
          const overlapY = a.y < b.y + b.size && a.y + a.size > b.y;
          expect(overlapX && overlapY).toBe(false);
        }
      }
    });

    it('all squares within grid bounds', () => {
      const result = packSquares(MOCK_TRANSACTIONS);
      for (const sq of result.squares) {
        expect(sq.x).toBeGreaterThanOrEqual(0);
        expect(sq.y).toBeGreaterThanOrEqual(0);
        expect(sq.x + sq.size).toBeLessThanOrEqual(result.gridWidth);
        expect(sq.y + sq.size).toBeLessThanOrEqual(result.gridHeight);
      }
    });

    it('is deterministic', () => {
      const r1 = packSquares(MOCK_TRANSACTIONS);
      const r2 = packSquares(MOCK_TRANSACTIONS);
      expect(r1).toEqual(r2);
    });

    it('handles many small transactions', () => {
      const items = Array.from({ length: 100 }, (_, i) => ({ index: i, vbytes: 200 }));
      const result = packSquares(items);
      expect(result.squares).toHaveLength(100);
    });

    it('handles single huge transaction', () => {
      const result = packSquares([{ index: 0, vbytes: 1000000 }]);
      expect(result.squares).toHaveLength(1);
      expect(result.squares[0].size).toBeGreaterThan(10);
    });
  });

  describe('packSquaresToWorldSpace()', () => {
    it('returns world-space coordinates', () => {
      const result = packSquaresToWorldSpace(MOCK_TRANSACTIONS, 100, 0.1);
      expect(result.length).toBe(MOCK_TRANSACTIONS.length);
      for (const sq of result) {
        expect(sq).toHaveProperty('x');
        expect(sq).toHaveProperty('z');
        expect(sq).toHaveProperty('width');
        expect(sq).toHaveProperty('depth');
        expect(sq.width).toBeGreaterThan(0);
        expect(sq.depth).toBeGreaterThan(0);
      }
    });

    it('centers on origin', () => {
      const result = packSquaresToWorldSpace(
        [{ index: 0, vbytes: 256 }],
        100,
        0,
      );
      // For a single 1x1 square in a 1-wide grid, center should be at (0, 0)
      expect(Math.abs(result[0].x)).toBeLessThanOrEqual(50);
      expect(Math.abs(result[0].z)).toBeLessThanOrEqual(50);
    });

    it('gap reduces square dimensions', () => {
      const noGap = packSquaresToWorldSpace(MOCK_TRANSACTIONS, 100, 0);
      const withGap = packSquaresToWorldSpace(MOCK_TRANSACTIONS, 100, 1);
      // With gap, width/depth should be smaller
      for (let i = 0; i < noGap.length; i++) {
        expect(withGap[i].width).toBeLessThanOrEqual(noGap[i].width);
      }
    });

    it('returns empty for no items', () => {
      const result = packSquaresToWorldSpace([], 100, 0.1);
      expect(result).toEqual([]);
    });

    it('minimum dimension is 0.001', () => {
      const result = packSquaresToWorldSpace(MOCK_TRANSACTIONS, 100, 999);
      for (const sq of result) {
        expect(sq.width).toBeGreaterThanOrEqual(0.001);
        expect(sq.depth).toBeGreaterThanOrEqual(0.001);
      }
    });
  });
});
