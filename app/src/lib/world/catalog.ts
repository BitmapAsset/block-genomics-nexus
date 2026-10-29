/**
 * `bg-world/1` catalog v1: the primitives a placement may name.
 *
 * Each entry is a box budget in metres at scale 1: the footprint (`w_m` along
 * the asset's local x, `d_m` along its local y) and the height. A renderer may
 * draw anything that fits the box; the validator only ever checks the box, so
 * every theme pack (photoreal, voxel, brick, toon, track) draws the same
 * footprint on the same parcel. Ids are stable forever: a later catalog may add
 * assets, never rename or resize one already placed.
 */

export interface CatalogAsset {
  id: string;
  label: string;
  /** Footprint along the asset's local x, m, at scale 1. */
  w_m: number;
  /** Footprint along the asset's local y, m, at scale 1. */
  d_m: number;
  /** Height, m, at scale 1. */
  height_m: number;
}

export const WORLD_CATALOG_VERSION = 1;

export const WORLD_CATALOG: readonly CatalogAsset[] = [
  { id: 'tower', label: 'Tower', w_m: 30, d_m: 30, height_m: 180 },
  { id: 'hall', label: 'Hall', w_m: 60, d_m: 40, height_m: 25 },
  { id: 'house', label: 'House', w_m: 15, d_m: 12, height_m: 10 },
  { id: 'pavilion', label: 'Pavilion', w_m: 20, d_m: 20, height_m: 8 },
  { id: 'tree_cluster', label: 'Tree cluster', w_m: 20, d_m: 20, height_m: 18 },
  { id: 'plaza', label: 'Plaza', w_m: 50, d_m: 50, height_m: 1 },
  { id: 'beacon', label: 'Beacon', w_m: 6, d_m: 6, height_m: 40 },
  { id: 'track_segment', label: 'Track segment', w_m: 60, d_m: 14, height_m: 2 },
  { id: 'cube', label: 'Cube', w_m: 10, d_m: 10, height_m: 10 },
  { id: 'dome', label: 'Dome', w_m: 40, d_m: 40, height_m: 30 },
  { id: 'bridge', label: 'Bridge', w_m: 50, d_m: 12, height_m: 12 },
  { id: 'sign', label: 'Sign', w_m: 4, d_m: 1, height_m: 5 },
];

const BY_ID = new Map(WORLD_CATALOG.map((a) => [a.id, a]));

export function catalogAsset(id: unknown): CatalogAsset | null {
  return typeof id === 'string' ? (BY_ID.get(id) ?? null) : null;
}
