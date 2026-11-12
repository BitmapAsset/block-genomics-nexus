/*
 * The world's scale law for the browser: one block is 2,100 m on a side and 20 world units in the scene, so one unit
 * is 105 m. `@/lib/world-scale` holds the same numbers but reaches the database through its imports, so the client
 * keeps this copy; a test pins it to `BLOCK_EDGE_M`. Pure: no React, no three.
 */

export const BLOCK_EDGE_M = 2100;
export const UNITS_PER_BLOCK = 20;
export const METRES_PER_UNIT = BLOCK_EDGE_M / UNITS_PER_BLOCK;

const NB = ' ';

export function metresOf(units: number): number {
  return Math.round(units * METRES_PER_UNIT);
}

export function kmhFromMps(mps: number): number {
  return mps * 3.6;
}

export function unitsPerSecondFromKmh(kmh: number): number {
  return kmh / 3.6 / METRES_PER_UNIT;
}

const whole = (n: number) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US');

/** "72 km/h" */
export function formatKmh(n: number): string {
  return `${whole(n)} km/h`;
}

/** "100 m" */
export function formatMetres(n: number): string {
  return `${whole(n)} m`;
}

/** "640 m" below 1,000 m, "1.2 km" from 1,000 m. */
export function formatDistance(m: number): string {
  const v = Number.isFinite(m) ? m : 0;
  if (Math.round(v) < 1000) return formatMetres(v);
  return `${(v / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** "2.1 km × 2.1 km", as the block page's hero chip. */
export function groundText(): string {
  const km = `${(BLOCK_EDGE_M / 1000).toFixed(1)}${NB}km`;
  return `${km} × ${km}`;
}

/** The block page's scale chip: "2.1 km × 2.1 km · 3,050 parcels", or the ground alone without a real count. */
export function worldScaleChip(parcels: number | null): string {
  if (parcels === null || !Number.isFinite(parcels) || parcels <= 0) return groundText();
  return `${groundText()} · ${parcels.toLocaleString('en-US')}${NB}${parcels === 1 ? 'parcel' : 'parcels'}`;
}

const RULER_LENGTHS_M = [1000, 500, 200, 100, 50, 20, 10];
const RULER_MIN_PX = 64;
const RULER_MAX_PX = 160;

export interface Ruler {
  metres: number;
  px: number;
  label: string;
}

/** The largest nice length whose bar is 64-160 px wide at this ground scale; null when none fits. */
export function rulerFor(metresPerPx: number | null): Ruler | null {
  if (metresPerPx === null || !Number.isFinite(metresPerPx) || metresPerPx <= 0) return null;
  for (const metres of RULER_LENGTHS_M) {
    const px = Math.round(metres / metresPerPx);
    if (px >= RULER_MIN_PX && px <= RULER_MAX_PX) return { metres, px, label: formatDistance(metres) };
  }
  return null;
}
