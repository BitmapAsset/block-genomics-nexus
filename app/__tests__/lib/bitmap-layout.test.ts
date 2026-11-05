/**
 * lib/bitmap-layout: the Bitmap standard square size, the whole-block layout,
 * and the pixel rule the server thumbnail draws with.
 */

import fs from 'fs';
import path from 'path';
import {
  bitmapThumbnailUrl,
  completeSatTotals,
  drawRects,
  estimatedSquareSize,
  layoutBlock,
  layoutFromSizes,
  logTxSize,
  txSatsToSizes,
} from '@/lib/bitmap-layout';
import { legacyVbytesSquareSize } from '@/lib/square-packing';

const FIXTURES = path.join(__dirname, '..', '..', '__fixtures__');
const TXS_612888 = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'block-612888-txs.json'), 'utf8')) as {
  out: number;
  weight: number;
}[];

describe('logTxSize (side = max(1, ⌈log10(sats)⌉ − 5))', () => {
  it.each([
    [0, 1],
    [-5, 1],
    [1, 1],
    [99_999, 1],
    [100_000, 1],
    [1_000_000, 1],
    [1_000_001, 2],
    [10_000_000, 2],
    [10_000_001, 3],
    [100_000_000, 3], // 1 BTC
    [1_250_715_964, 5], // 612,888 coinbase: 12.5 BTC + fees
    [5_000_000_000, 5], // 50 BTC coinbase
    [23_264_141_178, 6],
    [2_100_000_000_000_000, 11], // every bitcoin
  ])('%d sats → %d', (sats, size) => {
    expect(logTxSize(sats)).toBe(size);
  });

  it('never throws or returns < 1 on junk', () => {
    expect(logTxSize(Number.NaN)).toBe(1);
    expect(logTxSize(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('txSatsToSizes keeps block order', () => {
    expect(txSatsToSizes([5e9, 1e8, 0, 2e6])).toEqual([5, 3, 1, 2]);
  });
});

describe('the old vbytes rule drew a different map (why this module exists)', () => {
  it('sized the 612,888 coinbase (264 vB) 2 × 2; the canonical rule sizes it 5 × 5', () => {
    const cb = TXS_612888[0];
    expect(Math.ceil(cb.weight / 4)).toBe(264);
    expect(legacyVbytesSquareSize(Math.ceil(cb.weight / 4))).toBe(2);
    expect(logTxSize(cb.out)).toBe(5);
  });
});

describe('layoutBlock', () => {
  it('is empty for an empty block', () => {
    expect(layoutBlock([])).toEqual({ sizes: [], squares: [], gridLength: 0, width: 0, height: 0 });
  });

  it('one transaction fills a one-square grid', () => {
    expect(layoutBlock([5e9])).toEqual({
      sizes: [5],
      squares: [{ index: 0, x: 0, y: 0, size: 5 }],
      gridLength: 5,
      width: 5,
      height: 5,
    });
  });

  it('places every square without overlap, inside the frame, in tx order', () => {
    const l = layoutBlock(TXS_612888.map((t) => t.out));
    expect(l.squares.map((q) => q.index)).toEqual(TXS_612888.map((_, i) => i));
    const seen = new Set<string>();
    for (const q of l.squares) {
      expect(q.x + q.size).toBeLessThanOrEqual(l.width);
      expect(q.y + q.size).toBeLessThanOrEqual(l.height);
      for (let y = q.y; y < q.y + q.size; y++) {
        for (let x = q.x; x < q.x + q.size; x++) {
          const k = `${x},${y}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      }
    }
    expect(l.width).toBeLessThanOrEqual(l.gridLength);
  });
});

describe('completeSatTotals', () => {
  it('returns the totals when every one is known (zero is a known total)', () => {
    expect(completeSatTotals([5e9, 0, 12])).toEqual([5e9, 0, 12]);
  });
  it.each([[[]], [[1, null]], [[1, undefined]], [[Number.NaN]], [[-1]]])('is null for %j', (values) => {
    expect(completeSatTotals(values as (number | null)[])).toBeNull();
  });
});

describe('estimatedSquareSize', () => {
  it('maps a uniform draw onto sizes 1–5, mostly small', () => {
    expect(estimatedSquareSize(0)).toBe(1);
    expect(estimatedSquareSize(0.5)).toBe(2);
    expect(estimatedSquareSize(0.9)).toBe(3);
    expect(estimatedSquareSize(0.95)).toBe(4);
    expect(estimatedSquareSize(0.999)).toBe(5);
  });
});

describe('drawRects (ordinals-wallet render_bitmap, 576 px)', () => {
  it('a one-tx block fills the image edge to edge', () => {
    const [r] = drawRects(layoutFromSizes([5]), 576);
    // grid = 576 / 4.5 = 128, padding round(32) = 32 → 0..576 after centring.
    expect(r).toEqual({ index: 0, x0: 0, y0: 0, x1: 576, y1: 576 });
  });

  it('keeps a half-cell gap between neighbours and top-aligns the content', () => {
    const l = layoutFromSizes([5, 2]); // 78,319: 5 × 5 over a 2 × 2, frame 5 × 7
    const [a, b] = drawRects(l, 576);
    expect(a.y0).toBe(0);
    const grid = 576 / (7 - 0.5);
    expect(b.y0 - a.y1).toBeGreaterThanOrEqual(Math.floor(grid / 2) - 1);
    expect(b.y0 - a.y1).toBeLessThanOrEqual(Math.ceil(grid / 2) + 1);
    // Narrower than tall: centred horizontally.
    expect(a.x0).toBeGreaterThan(0);
    expect(576 - a.x1).toBeGreaterThan(0);
  });

  it('stays inside the image on a real block', () => {
    for (const r of drawRects(layoutBlock(TXS_612888.map((t) => t.out)), 576)) {
      expect(r.x0).toBeGreaterThanOrEqual(0);
      expect(r.y0).toBeGreaterThanOrEqual(0);
      expect(r.x1).toBeLessThanOrEqual(576);
      expect(r.y1).toBeLessThanOrEqual(576);
      expect(r.x1).toBeGreaterThan(r.x0);
      expect(r.y1).toBeGreaterThan(r.y0);
    }
  });
});

describe('bitmapThumbnailUrl', () => {
  it('carries the art version, so year-cached vbytes PNGs are not reused', () => {
    expect(bitmapThumbnailUrl(612888)).toBe('/api/v1/block-thumbnail/612888.png?v=3');
  });
});
