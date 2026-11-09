/**
 * The world's scale law in the browser (components/nexus/hud/scale): one block is 2,100 m and 20 world units, so a
 * unit is 105 m. The client keeps its own copy because `@/lib/world-scale` reaches the database through its imports;
 * these tests pin the copy to the library, to ParcelView's constants and to the block page's own hero chip.
 * Grouping is pinned to 'en-US'; the equality with the hero chip runs under the node's default ICU locale (en-US).
 */

jest.mock('@/lib/block-summary', () => {
  const actual = jest.requireActual('@/lib/block-summary');
  return { ...actual, getBlockSummary: jest.fn() };
});

import fs from 'fs';
import path from 'path';
import { BLOCK_EDGE_M as LIB_BLOCK_EDGE_M, scaleLineForTxCount } from '@/lib/world-scale';
import { groundText as heroGroundText, scaleChipText } from '@/app/(site)/block/[height]/hero-chips';
import {
  BLOCK_EDGE_M, METRES_PER_UNIT, UNITS_PER_BLOCK, formatDistance, formatKmh, formatMetres, kmhFromMps, metresOf,
  rulerFor, unitsPerSecondFromKmh, worldScaleChip,
} from '@/components/nexus/hud/scale';

const PV = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');

describe('the scale law, client-safe', () => {
  it('equals the library and ParcelView: 2,100 m, 20 units, 105 m per unit', () => {
    expect(BLOCK_EDGE_M).toBe(LIB_BLOCK_EDGE_M);
    expect(PV).toMatch(/const BLOCK_SIZE = 20\b/);
    expect(PV).toContain('2100 / BLOCK_SIZE');
    expect(UNITS_PER_BLOCK).toBe(20);
    expect(METRES_PER_UNIT).toBe(105);
    expect(metresOf(20)).toBe(2100);
    expect(metresOf(0.4)).toBe(42);
  });

  it('converts speeds: the tour 20 m/s is 72 km/h; 100 km/h is ParcelView\'s FLY_SPEED', () => {
    expect(kmhFromMps(20)).toBeCloseTo(72, 10);
    const fly = 27.8 / 105;
    expect(Math.abs(unitsPerSecondFromKmh(100) - fly) / fly).toBeLessThan(0.002);
  });

  it.each([
    [formatKmh(72), '72 km/h'],
    [formatKmh(71.6), '72 km/h'],
    [formatKmh(0), '0 km/h'],
    [formatMetres(100), '100 m'],
    [formatMetres(1234.4), '1,234 m'],
    [formatDistance(640), '640 m'],
    [formatDistance(999.4), '999 m'],
    [formatDistance(1000), '1.0 km'],
    [formatDistance(1234), '1.2 km'],
    [formatDistance(12_345), '12.3 km'],
  ])('formats %s', (got, want) => {
    expect(got).toBe(want);
  });

  it.each([1, 1114, 3050])('the chip for %i parcels is the block page hero chip, word for word', (n) => {
    expect(worldScaleChip(n)).toBe(scaleChipText(n));
    const count = n.toLocaleString('en-US');
    expect(worldScaleChip(n)).toContain(count);
    expect(scaleLineForTxCount(n)).toContain(`${count} parcels`);
  });

  it('without a real count the chip is the ground alone', () => {
    expect(worldScaleChip(null)).toBe(heroGroundText());
    expect(worldScaleChip(0)).toBe(heroGroundText());
    expect(worldScaleChip(Number.NaN)).toBe(heroGroundText());
    expect(worldScaleChip(1)).toMatch(/1 parcel$/);
  });

  it('the ruler picks the largest nice length whose bar is 64-160 px', () => {
    expect(rulerFor(null)).toBeNull();
    expect(rulerFor(0)).toBeNull();
    expect(rulerFor(-1)).toBeNull();
    expect(rulerFor(Number.NaN)).toBeNull();
    const cases: [number, number][] = [
      [10, 1000], [5, 500], [2, 200], [1, 100], [0.5, 50], [0.2, 20], [0.1, 10],
    ];
    for (const [mpp, metres] of cases) {
      const r = rulerFor(mpp);
      expect(r).not.toBeNull();
      expect(r!.metres).toBe(metres);
      expect(r!.px).toBeGreaterThanOrEqual(64);
      expect(r!.px).toBeLessThanOrEqual(160);
      expect(r!.label).toBe(formatDistance(metres));
    }
    expect(rulerFor(100)).toBeNull(); // 1,000 m would be 10 px: none fits
    expect(rulerFor(0.01)).toBeNull(); // 10 m would be 1,000 px: none fits
  });

  it('the estate mini-map label and the panel rows convert units to metres with metresOf', () => {
    const label = PV.split('\n').find((l) => l.includes('Parcel #{hoveredParcel.txIndex}'));
    expect(label).toBeDefined();
    expect(label).toContain('metresOf(');
    expect(label).not.toContain('width.toFixed(0)}×');
    expect(PV).toMatch(/const fmtDim = \(worldUnits: number\) => metresOf\(worldUnits\)/);
    expect(PV).toContain('Walking: 3 m/s | Running: 8 m/s');
  });
});
