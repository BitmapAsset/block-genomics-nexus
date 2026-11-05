/**
 * Conformance: our layout is the canonical Bitmap layout, slot for slot.
 *
 * The oracle is ordpool-parser's TypeScript port of bitlodo's MondrianLayout
 * (vendored unchanged in lib/vendor/ordpool, MIT), which ports bitfeed's
 * TxMondrianPoolScene and claims pixel parity with bitlodo, the renderer the
 * Bitmap community checks images against. Every expected placement below comes
 * from running that oracle, never from numbers typed by hand.
 *
 * Block 612,888 is Gary's reference (2026-11-04): bitmap.land and Magic Eden
 * both draw its 12.5 BTC coinbase as a 5 × 5 square in the top-left corner;
 * our vbytes-sized layout drew it (264 vB) as a 2 × 2.
 */

import fs from 'fs';
import path from 'path';
import { MondrianLayout } from '@/lib/vendor/ordpool/mondrian-layout';
import { packSizes } from '@/lib/square-packing';
import { layoutBlock, txSatsToSizes } from '@/lib/bitmap-layout';
import { summaryToRealBlock, type BlockSummaryPayload } from '@/lib/blockchainApi';

const FIXTURES = path.join(__dirname, '..', '..', '__fixtures__');
const readJson = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as T;

const SUMMARY = readJson<BlockSummaryPayload>('block-612888-summary.json');
/** Paged esplora walk of 612,888 (research/layout-2026-11-04): per tx, the sum of every vout. */
const TXS_612888 = readJson<{ out: number }[]>('block-612888-txs.json');
const TXS_78319 = readJson<{ out: number }[]>('block-78319-txs.json');
const TXS_127332 = readJson<{ out: number }[]>('block-127332-txs.json');

/** The oracle's answer: slots in placement order as [x, y, size], plus its frame. */
function oracle(sizes: number[]) {
  const l = new MondrianLayout(sizes);
  return {
    length: l.length,
    width: l.width,
    height: l.height,
    slots: l.slots.map((s) => [s.position.x, s.position.y, s.size]),
  };
}

/** Ours, in the same shape. */
function ours(sizes: number[]) {
  const r = packSizes(sizes);
  return {
    length: r.gridWidth,
    width: r.contentWidth,
    height: r.gridHeight,
    slots: r.squares.map((q) => [q.x, q.y, q.size]),
  };
}

/** Deterministic PRNG (LCG), so a failure names a reproducible case. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('packer conformance with the vendored ordpool/bitlodo MondrianLayout', () => {
  it('matches the oracle on 300 seeded random blocks (1–3,000 txs, sizes 1–9)', () => {
    const rnd = lcg(612888);
    const diverged: number[] = [];
    for (let c = 0; c < 300; c++) {
      const n = 1 + Math.floor(rnd() * 3000);
      // Skewed towards small squares like real blocks, with every size 1..9 reachable.
      const sizes = Array.from({ length: n }, () => 1 + Math.floor(rnd() * rnd() * 9));
      const a = ours(sizes);
      const b = oracle(sizes);
      if (JSON.stringify(a) !== JSON.stringify(b)) diverged.push(c);
    }
    expect(diverged).toEqual([]);
  });

  it('matches the oracle on uniform and adversarial shapes', () => {
    const cases: number[][] = [
      [1],
      [9],
      [5, 2],
      Array(22).fill(5),
      Array(500).fill(1),
      [9, 1, 9, 1, 9, 1, 8, 2, 7, 3, 6, 4, 5],
      Array.from({ length: 400 }, (_, i) => (i % 9) + 1),
      Array.from({ length: 400 }, (_, i) => 9 - (i % 9)),
    ];
    for (const sizes of cases) expect(ours(sizes)).toEqual(oracle(sizes));
  });

  it.each([
    ['612,888', TXS_612888],
    ['78,319', TXS_78319],
    ['127,332', TXS_127332],
  ])('matches the oracle on block %s from its real output totals', (_name, txs) => {
    const sizes = txSatsToSizes(txs.map((t) => t.out));
    expect(ours(sizes)).toEqual(oracle(sizes));
  });
});

describe('block 612,888, the canonical picture', () => {
  const sizes = txSatsToSizes(TXS_612888.map((t) => t.out));
  const want = oracle(sizes);
  const layout = layoutBlock(TXS_612888.map((t) => t.out));

  it('mempool summary `value` is the same input as the paged vout sums (all 1,114 txs)', () => {
    expect(SUMMARY.value).toHaveLength(TXS_612888.length);
    expect(SUMMARY.value).toEqual(TXS_612888.map((t) => t.out));
  });

  it('has the oracle grid length, frame and first 12 placements', () => {
    expect(layout.gridLength).toBe(want.length);
    expect(layout.width).toBe(want.width);
    expect(layout.height).toBe(want.height);
    expect(layout.squares.slice(0, 12).map((q) => [q.x, q.y, q.size])).toEqual(want.slots.slice(0, 12));
  });

  it('draws the coinbase (12.5 BTC + fees) as a 5 × 5 square in the top-left corner', () => {
    expect(TXS_612888[0].out).toBeGreaterThan(12.5e8);
    expect(layout.sizes[0]).toBe(5);
    expect(layout.squares[0]).toEqual({ index: 0, x: 0, y: 0, size: 5 });
  });

  it('has the oracle square-size histogram', () => {
    const hist = (xs: number[]) => xs.reduce<Record<number, number>>((h, s) => ({ ...h, [s]: (h[s] ?? 0) + 1 }), {});
    expect(hist(layout.sizes)).toEqual(hist(want.slots.map((s) => s[2])));
  });

  it('is what the block viewer lays out from the summary payload', () => {
    const block = summaryToRealBlock(SUMMARY);
    const fromViewer = layoutBlock(block.txs.map((t) => t.outSats as number));
    expect(fromViewer.squares.map((q) => [q.x, q.y, q.size])).toEqual(want.slots);
  });
});

describe("ordinals-wallet's reference blocks", () => {
  it('78,319 (Pristine Punk, 2 txs): a 5 × 5 coinbase over a 2 × 2', () => {
    const l = layoutBlock(TXS_78319.map((t) => t.out));
    expect(l.squares.map((q) => [q.x, q.y, q.size])).toEqual(oracle(l.sizes).slots);
    expect(l.sizes).toEqual([5, 2]);
  });

  it('127,332 (Grid Punk, 22 txs): 22 equal 5 × 5 squares, four to a row', () => {
    const l = layoutBlock(TXS_127332.map((t) => t.out));
    expect(l.squares.map((q) => [q.x, q.y, q.size])).toEqual(oracle(l.sizes).slots);
    expect(new Set(l.sizes)).toEqual(new Set([5]));
    expect(l.width).toBe(oracle(l.sizes).width);
  });
});
