/**
 * Tests for src/lib/square-packing.ts
 * Covers: the legacy vbytes size rule, Mondrian packing of given square sides,
 * the drawing frame, world space conversion. The Bitmap size rule itself is
 * lib/bitmap-layout (bitmap-layout.test.ts); conformance with the canonical
 * packer is bitmap-layout-conformance.test.ts.
 */

import { legacyVbytesSquareSize, packFrame, packSizes, packSquares, packSquaresToWorldSpace } from '@/lib/square-packing';
import { MOCK_TRANSACTIONS } from '../fixtures';

/** The fixture's transactions as square sides (sizes 1, 2, 3, 5, 1). */
const ITEMS = MOCK_TRANSACTIONS.map((t) => ({ index: t.index, size: legacyVbytesSquareSize(t.vbytes) }));

describe('square-packing', () => {
  describe('legacyVbytesSquareSize() (not the Bitmap standard; no production caller)', () => {
    it('minimum vbytes returns size 1', () => {
      expect(legacyVbytesSquareSize(1)).toBe(1);
    });

    it('256 vbytes = 1x1, 1024 vbytes = 2x2', () => {
      expect(legacyVbytesSquareSize(256)).toBe(1);
      expect(legacyVbytesSquareSize(1024)).toBe(2);
    });

    it('never returns 0', () => {
      expect(legacyVbytesSquareSize(0)).toBe(1);
      expect(legacyVbytesSquareSize(-1)).toBe(1);
    });
  });

  describe('packSquares()', () => {
    it('returns empty for no items', () => {
      expect(packSquares([])).toEqual({ squares: [], gridWidth: 0, gridHeight: 0, contentWidth: 0 });
    });

    it('packs a single square into a grid its own size', () => {
      expect(packSquares([{ index: 0, size: 3 }])).toEqual({
        squares: [{ index: 0, x: 0, y: 0, size: 3 }],
        gridWidth: 3,
        gridHeight: 3,
        contentWidth: 3,
      });
    });

    it('keeps each square its given side', () => {
      const result = packSquares(ITEMS);
      expect(result.squares.map((s) => s.size)).toEqual(ITEMS.map((i) => i.size));
    });

    it('grid width is ceil(sqrt(sum of size²))', () => {
      const area = ITEMS.reduce((s, i) => s + i.size * i.size, 0);
      expect(packSquares(ITEMS).gridWidth).toBe(Math.ceil(Math.sqrt(area)));
    });

    it('preserves transaction indices and order', () => {
      expect(packSquares(ITEMS).squares.map((s) => s.index)).toEqual(ITEMS.map((t) => t.index));
    });

    it('no overlapping squares', () => {
      const result = packSquares(ITEMS);
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

    it('all squares within the content bounds', () => {
      const result = packSquares(ITEMS);
      for (const sq of result.squares) {
        expect(sq.x).toBeGreaterThanOrEqual(0);
        expect(sq.y).toBeGreaterThanOrEqual(0);
        expect(sq.x + sq.size).toBeLessThanOrEqual(result.contentWidth);
        expect(sq.y + sq.size).toBeLessThanOrEqual(result.gridHeight);
      }
      expect(result.contentWidth).toBeLessThanOrEqual(result.gridWidth);
    });

    it('is deterministic', () => {
      expect(packSquares(ITEMS)).toEqual(packSquares(ITEMS));
    });

    it('clamps junk sides to whole squares ≥ 1', () => {
      const r = packSquares([{ index: 0, size: 0 }, { index: 1, size: Number.NaN }, { index: 2, size: 2.7 }]);
      expect(r.squares.map((s) => s.size)).toEqual([1, 1, 2]);
    });

    it('packSizes numbers the squares by position', () => {
      expect(packSizes([2, 1])).toEqual(packSquares([{ index: 0, size: 2 }, { index: 1, size: 1 }]));
    });
  });

  describe('packFrame()', () => {
    it('spans the larger side and centres the shorter one', () => {
      expect(packFrame({ contentWidth: 47, gridHeight: 50 })).toEqual({ extent: 50, offsetX: 1.5, offsetY: 0 });
      expect(packFrame({ contentWidth: 10, gridHeight: 8 })).toEqual({ extent: 10, offsetX: 0, offsetY: 1 });
      expect(packFrame({ contentWidth: 0, gridHeight: 0 })).toEqual({ extent: 1, offsetX: 0.5, offsetY: 0.5 });
    });
  });

  describe('packSquaresToWorldSpace()', () => {
    it('returns world-space coordinates', () => {
      const result = packSquaresToWorldSpace(ITEMS, 100, 0.1);
      expect(result.length).toBe(ITEMS.length);
      for (const sq of result) {
        expect(sq.width).toBeGreaterThan(0);
        expect(sq.depth).toBeGreaterThan(0);
      }
    });

    it('a single square fills the block, centred on the origin', () => {
      expect(packSquaresToWorldSpace([{ index: 0, size: 5 }], 100, 0)).toEqual([
        { index: 0, x: 0, z: 0, width: 100, depth: 100 },
      ]);
    });

    it('keeps every parcel square and inside the block', () => {
      const sizes = Array.from({ length: 300 }, (_, i) => (i * 7) % 5 + 1);
      const result = packSquaresToWorldSpace(sizes.map((size, index) => ({ index, size })), 20, 0);
      for (const sq of result) {
        expect(sq.width).toBeCloseTo(sq.depth, 9);
        expect(sq.x - sq.width / 2).toBeGreaterThanOrEqual(-10 - 1e-9);
        expect(sq.x + sq.width / 2).toBeLessThanOrEqual(10 + 1e-9);
        expect(sq.z - sq.depth / 2).toBeGreaterThanOrEqual(-10 - 1e-9);
        expect(sq.z + sq.depth / 2).toBeLessThanOrEqual(10 + 1e-9);
      }
    });

    it('gap reduces square dimensions', () => {
      const noGap = packSquaresToWorldSpace(ITEMS, 100, 0);
      const withGap = packSquaresToWorldSpace(ITEMS, 100, 1);
      for (let i = 0; i < noGap.length; i++) {
        expect(withGap[i].width).toBeLessThanOrEqual(noGap[i].width);
      }
    });

    it('returns empty for no items', () => {
      expect(packSquaresToWorldSpace([], 100, 0.1)).toEqual([]);
    });

    it('minimum dimension is 0.001', () => {
      for (const sq of packSquaresToWorldSpace(ITEMS, 100, 999)) {
        expect(sq.width).toBeGreaterThanOrEqual(0.001);
        expect(sq.depth).toBeGreaterThanOrEqual(0.001);
      }
    });
  });
});
