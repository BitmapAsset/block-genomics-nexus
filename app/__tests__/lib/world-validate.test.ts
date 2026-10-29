/**
 * `bg-world/1` validator + catalog (lib/world): what a placement may be, checked
 * against block 612,888's real parcels.
 */

import fs from 'fs';
import path from 'path';
import { parcelRectsFrom } from '@/lib/world-scale';
import { flatParams, PARAMS_MAX_BYTES, summaryFor, BLOCK_EVENT_KINDS } from '@/lib/block-event-core';
import { publicPayload } from '@/lib/block-events';
import { WORLD_CATALOG, catalogAsset } from '@/lib/world/catalog';
import { MAX_PLACEMENTS, WORLD_THEMES, worldIntent, worldWritePath } from '@/lib/world/types';
import { footprintExtent, validatePlacement, validatePlacementShape, validateTheme } from '@/lib/world/validate';

jest.mock('@/lib/brain', () => ({ getBrainState: () => null, getContentScanner: () => ({}), buildSoulDocument: () => ({}) }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

const VSIZE = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8')) as { vsize: number[] }
).vsize;
const rects = parcelRectsFrom(VSIZE);

// Parcel 418: x 204.88..256.10, y 586.05..634.88 (one 51.22 × 48.84 m cell). Centre:
const C418 = { x_m: 230.49, y_m: 610.47 };
// Parcel 641: 7 × 7 cells, 358.54 × 341.86 m from (1690.24, 830.23).
const C641 = { x_m: 1869.5, y_m: 1001.1 };

const ok = (over: Record<string, unknown> = {}) => ({ parcel: 418, asset: 'tower', ...C418, rot_deg: 0, scale: 1, ...over });
const check = (input: Record<string, unknown>, liveCount = 0) => validatePlacement(input, { rects, liveCount });

describe('catalog v1', () => {
  it('has at most 12 primitives, each with a footprint and a height', () => {
    expect(WORLD_CATALOG.length).toBeLessThanOrEqual(12);
    expect(WORLD_CATALOG.map((a) => a.id)).toEqual([
      'tower', 'hall', 'house', 'pavilion', 'tree_cluster', 'plaza', 'beacon', 'track_segment', 'cube', 'dome', 'bridge', 'sign',
    ]);
    for (const a of WORLD_CATALOG) {
      expect(a.w_m).toBeGreaterThan(0);
      expect(a.d_m).toBeGreaterThan(0);
      expect(a.height_m).toBeGreaterThan(0);
    }
    expect(catalogAsset('castle')).toBeNull();
    expect(catalogAsset(7)).toBeNull();
  });

  it('matches the asset enum the MCP tool advertises', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'mcp', 'catalog.ts'), 'utf8');
    const block = src.slice(src.indexOf('name: "bg_world_place"'), src.indexOf('name: "bg_world_set_theme"'));
    for (const a of WORLD_CATALOG) expect(block).toContain(`"${a.id}"`);
    for (const t of WORLD_THEMES) expect(src).toContain(`"${t}"`);
  });
});

describe('validatePlacement', () => {
  it('accepts a tower centred on parcel 418', () => {
    const r = check(ok());
    expect(r).toEqual({ ok: true, value: ok() });
  });

  it('accepts params and keeps them exactly', () => {
    const r = check(ok({ asset: 'house', params: { color: '#f7931a', floors: 3, lit: true } }));
    expect(r.ok && r.value.params).toEqual({ color: '#f7931a', floors: 3, lit: true });
  });

  it.each([
    [{ parcel: 1114 }, 'parcel_out_of_range'],
    [{ parcel: -1 }, 'parcel_out_of_range'],
    [{ parcel: 2.5 }, 'parcel_out_of_range'],
    [{ asset: 'castle' }, 'unknown_asset'],
    [{ x_m: 210 }, 'outside_parcel'],
    [{ y_m: 620 }, 'outside_parcel'],
    [{ x_m: 1869.5, y_m: 1001.1 }, 'outside_parcel'],
    [{ asset: 'hall' }, 'outside_parcel'],
    [{ scale: 2 }, 'too_tall'],
    [{ scale: 0.4 }, 'bad_scale'],
    [{ scale: 2.1 }, 'bad_scale'],
    [{ rot_deg: 360 }, 'bad_rotation'],
    [{ rot_deg: -1 }, 'bad_rotation'],
    [{ x_m: 'west' }, 'bad_request'],
    [{ x_m: Number.NaN }, 'bad_request'],
    [{ params: { note: 'x'.repeat(65) } }, 'bad_params'],
    [{ params: { Bad: 1 } }, 'bad_params'],
    [{ params: { nested: { a: 1 } } }, 'bad_params'],
    [{ params: { html: '<script>' } }, 'bad_params'],
    [{ params: ['a'] }, 'bad_params'],
    [{ owner: 'bc1p…' }, 'bad_request'],
  ])('refuses %j with %s', (over, code) => {
    const r = check(ok(over));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });

  it('refuses a footprint that only fits unrotated (house 15 × 12 turned 45° on a 51 × 48 m lot still fits; a bridge does not)', () => {
    expect(check(ok({ asset: 'house', rot_deg: 45 })).ok).toBe(true);
    const bridge = check(ok({ asset: 'bridge', rot_deg: 0 }));
    expect(bridge.ok).toBe(true); // 50 × 12 fits 51.22 wide
    const turned = check(ok({ asset: 'bridge', rot_deg: 90 }));
    expect(turned.ok).toBe(false); // 12 × 50 does not fit 48.84 deep
    if (!turned.ok) expect(turned.code).toBe('outside_parcel');
  });

  it('enforces the 300 m height cap (tower at scale 2 = 360 m) on a parcel big enough to hold it', () => {
    expect(check({ ...ok(), parcel: 641, ...C641, scale: 1.6 }).ok).toBe(true); // 288 m
    const tall = check({ ...ok(), parcel: 641, ...C641, scale: 2 });
    expect(tall.ok).toBe(false);
    if (!tall.ok) expect(tall.code).toBe('too_tall');
  });

  it('caps a block at 200 live placements', () => {
    expect(MAX_PLACEMENTS).toBe(200);
    expect(check(ok(), 199).ok).toBe(true);
    const full = check(ok(), 200);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.code).toBe('too_many_placements');
  });

  it('measures a rotated footprint as its axis-aligned extent', () => {
    const e = footprintExtent({ asset: 'track_segment', rot_deg: 90, scale: 1 })!;
    expect(e.w).toBeCloseTo(14, 6);
    expect(e.d).toBeCloseTo(60, 6);
    expect(e.height).toBe(2);
  });

  it('shape check needs no layout', () => {
    expect(validatePlacementShape(ok()).ok).toBe(true);
  });
});

describe('themes', () => {
  it.each(WORLD_THEMES)('accepts %s', (t) => expect(validateTheme(t)).toEqual({ ok: true, value: t }));
  it.each(['gta', '', 'PHOTOREAL', null])('refuses %j', (t) => expect(validateTheme(t).ok).toBe(false));
});

describe('flatParams', () => {
  it('stays under 1 KB', () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 16; i++) big[`k${i}`] = 'y'.repeat(64);
    expect(flatParams(big)).toBeNull(); // 16 × ~72 B > 1 KB
    expect(PARAMS_MAX_BYTES).toBe(1024);
    expect(flatParams({ a: 1, b: 'two', c: false })).toEqual({ a: 1, b: 'two', c: false });
    expect(flatParams(null)).toBeNull();
  });

  it('round-trips through the event payload allowlist unchanged', () => {
    const placement = { ...ok({ params: { color: '#f7931a', floors: 3 } }) };
    const stored = publicPayload({ ...placement, via: 'session', chatText: 'never' });
    expect(stored).toEqual({ ...placement, via: 'session' });
  });
});

describe('event kinds and intents', () => {
  it('registers the three world kinds with server-side summaries', () => {
    expect(BLOCK_EVENT_KINDS).toEqual(expect.arrayContaining(['world.theme', 'world.place', 'world.remove']));
    expect(summaryFor('world.theme', { theme: 'voxel' })).toBe('World theme set to voxel');
    expect(summaryFor('world.place', { asset: 'tree_cluster', parcel: 418 })).toBe('Placed a tree cluster on parcel 418');
    expect(summaryFor('world.remove')).toBe('Removed a placement from the world');
  });

  it('builds the signed intent from exactly the stored fields', () => {
    expect(worldIntent('world.theme', 'bc1pa', { theme: 'toon' })).toEqual({ ownerAddress: 'bc1pa', theme: 'toon' });
    expect(worldIntent('world.remove', 'bc1pa', { placementId: 'X' })).toEqual({ ownerAddress: 'bc1pa', placementId: 'X' });
    expect(worldIntent('world.place', 'bc1pa', ok())).toEqual({ ownerAddress: 'bc1pa', ...ok() });
    expect(worldWritePath(612888, 'world.place')).toBe('/api/v1/blocks/612888/world/place');
  });
});
