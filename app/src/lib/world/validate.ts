/**
 * The `bg-world/1` validator: every placement is checked here before it can
 * become an event, and nothing here rewrites a value (a field is accepted as
 * sent or refused), so what an owner signed is exactly what is stored.
 *
 * Rules (v1):
 *   - theme ∈ photoreal | voxel | brick | toon | track
 *   - parcel: integer 0..N-1 for the block's N transactions
 *   - asset: a catalog v1 id
 *   - x_m, y_m: finite metres; the rotated footprint (asset box × scale) lies
 *     inside the parcel's rectangle (lib/world-scale)
 *   - rot_deg ∈ [0, 360); scale ∈ [0.5, 2]
 *   - height (asset height × scale) ≤ HEIGHT_CAP_M (flat 300 m in v1)
 *   - params: a small flat object (`flatParams`), ≤ 1 KB
 *   - ≤ MAX_PLACEMENTS live placements per block
 */

import { flatParams, PARAMS_MAX_BYTES } from '@/lib/block-event-core';
import { HEIGHT_CAP_M, type ParcelRect } from '@/lib/world-scale';
import { catalogAsset } from './catalog';
import { MAX_PLACEMENTS, SCALE_MAX, SCALE_MIN, WORLD_THEMES, isWorldTheme, type PlacementInput, type WorldTheme } from './types';

export type WorldErrorCode =
  | 'bad_request'
  | 'unknown_theme'
  | 'unknown_asset'
  | 'parcel_out_of_range'
  | 'outside_parcel'
  | 'too_tall'
  | 'bad_scale'
  | 'bad_rotation'
  | 'bad_params'
  | 'too_many_placements';

export type Checked<T> = { ok: true; value: T } | { ok: false; code: WorldErrorCode; error: string };

const fail = (code: WorldErrorCode, error: string): { ok: false; code: WorldErrorCode; error: string } => ({ ok: false, code, error });

/** Tolerance for "inside the parcel": one millimetre, so an edge-flush footprint passes. */
const EPS_M = 0.001;

const PLACE_KEYS = new Set(['parcel', 'asset', 'x_m', 'y_m', 'rot_deg', 'scale', 'params']);

/** Refuse keys outside `allowed` (so a signed body is always rebuildable from the stored payload). */
export function onlyKeys(body: Record<string, unknown>, allowed: Iterable<string>): Checked<true> {
  const set = new Set(allowed);
  const extra = Object.keys(body).filter((k) => !set.has(k));
  return extra.length ? fail('bad_request', `Unknown field(s): ${extra.slice(0, 5).join(', ')}`) : { ok: true, value: true };
}

export function validateTheme(theme: unknown): Checked<WorldTheme> {
  return isWorldTheme(theme)
    ? { ok: true, value: theme }
    : fail('unknown_theme', `theme must be one of: ${WORLD_THEMES.join(', ')}`);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Field shapes only, no geometry. `input` is the placement half of a request body. */
export function validatePlacementShape(input: Record<string, unknown>): Checked<PlacementInput> {
  const keys = onlyKeys(input, PLACE_KEYS);
  if (!keys.ok) return keys;
  const { parcel, asset, x_m, y_m, rot_deg, scale, params } = input;
  if (!Number.isInteger(parcel) || (parcel as number) < 0) return fail('parcel_out_of_range', 'parcel must be a non-negative integer (the transaction index)');
  if (!catalogAsset(asset)) return fail('unknown_asset', 'asset must be a catalog v1 id (see docs/WORLD.md)');
  if (!isNum(x_m) || !isNum(y_m)) return fail('bad_request', 'x_m and y_m must be finite numbers (metres)');
  if (!isNum(rot_deg) || rot_deg < 0 || rot_deg >= 360) return fail('bad_rotation', 'rot_deg must be a number in [0, 360)');
  if (!isNum(scale) || scale < SCALE_MIN || scale > SCALE_MAX) return fail('bad_scale', `scale must be between ${SCALE_MIN} and ${SCALE_MAX}`);
  let p: PlacementInput['params'];
  if (params !== undefined) {
    const flat = flatParams(params);
    if (!flat) return fail('bad_params', `params must be a flat object of ≤ 16 short values, ≤ ${PARAMS_MAX_BYTES} bytes`);
    p = flat;
  }
  return {
    ok: true,
    value: {
      parcel: parcel as number,
      asset: asset as string,
      x_m,
      y_m,
      rot_deg,
      scale,
      ...(p !== undefined ? { params: p } : {}),
    },
  };
}

/** Axis-aligned extent of the asset's rotated footprint, m. */
export function footprintExtent(p: Pick<PlacementInput, 'asset' | 'rot_deg' | 'scale'>): { w: number; d: number; height: number } | null {
  const a = catalogAsset(p.asset);
  if (!a) return null;
  const t = (p.rot_deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  const w = a.w_m * p.scale;
  const d = a.d_m * p.scale;
  return { w: w * c + d * s, d: w * s + d * c, height: a.height_m * p.scale };
}

/** Geometry against the block's parcels (`rects` from `parcelRectsFrom`). */
export function validatePlacementGeometry(p: PlacementInput, rects: readonly ParcelRect[]): Checked<PlacementInput> {
  if (p.parcel >= rects.length) return fail('parcel_out_of_range', `parcel must be 0..${rects.length - 1} on this block`);
  const ext = footprintExtent(p);
  if (!ext) return fail('unknown_asset', 'asset must be a catalog v1 id');
  if (ext.height > HEIGHT_CAP_M + EPS_M) return fail('too_tall', `height ${Math.round(ext.height)} m is over the ${HEIGHT_CAP_M} m cap`);
  const r = rects[p.parcel];
  const inside =
    p.x_m - ext.w / 2 >= r.x_m - EPS_M &&
    p.x_m + ext.w / 2 <= r.x_m + r.w_m + EPS_M &&
    p.y_m - ext.d / 2 >= r.y_m - EPS_M &&
    p.y_m + ext.d / 2 <= r.y_m + r.h_m + EPS_M;
  if (!inside) {
    return fail(
      'outside_parcel',
      `footprint ${ext.w.toFixed(1)} × ${ext.d.toFixed(1)} m at (${p.x_m}, ${p.y_m}) does not fit parcel ${p.parcel} ` +
        `[x ${r.x_m.toFixed(2)}..${(r.x_m + r.w_m).toFixed(2)}, y ${r.y_m.toFixed(2)}..${(r.y_m + r.h_m).toFixed(2)}]`,
    );
  }
  return { ok: true, value: p };
}

/** Shape + geometry + the per-block cap. */
export function validatePlacement(
  input: Record<string, unknown>,
  ctx: { rects: readonly ParcelRect[]; liveCount: number },
): Checked<PlacementInput> {
  if (ctx.liveCount >= MAX_PLACEMENTS) return fail('too_many_placements', `this block already has ${MAX_PLACEMENTS} placements (v1 cap); remove one first`);
  const shape = validatePlacementShape(input);
  if (!shape.ok) return shape;
  return validatePlacementGeometry(shape.value, ctx.rects);
}
