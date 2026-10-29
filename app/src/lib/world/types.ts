/**
 * `bg-world/1`: one block's world as data. Pure types and constants, no I/O.
 *
 * The manifest is a projection of the block's `world.theme`, `world.place` and
 * `world.remove` events (the `bg-event/1` spine), never a separate store: the
 * signed, hash-chained event log is the record, and this is a view of it.
 */

import type { DistrictScale } from '@/lib/world-scale';

export const WORLD_FORMAT = 'bg-world/1';

export const WORLD_THEMES = ['photoreal', 'voxel', 'brick', 'toon', 'track'] as const;
export type WorldTheme = (typeof WORLD_THEMES)[number];
export const DEFAULT_THEME: WorldTheme = 'photoreal';

export const WORLD_EVENT_KINDS = ['world.theme', 'world.place', 'world.remove'] as const;
export type WorldEventKind = (typeof WORLD_EVENT_KINDS)[number];

/** Live placements per block (v1). */
export const MAX_PLACEMENTS = 200;
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2;

export function isWorldTheme(v: unknown): v is WorldTheme {
  return typeof v === 'string' && (WORLD_THEMES as readonly string[]).includes(v);
}

/** What a caller sends to place one thing. Coordinates are district metres (lib/world-scale). */
export interface PlacementInput {
  /** Parcel = transaction index, 0..N-1. */
  parcel: number;
  /** Catalog id (lib/world/catalog). */
  asset: string;
  /** Centre of the footprint, metres from the district corner of tx 0, east. */
  x_m: number;
  /** Centre of the footprint, metres from the district corner of tx 0, south. */
  y_m: number;
  /** Rotation about the vertical axis, degrees, [0, 360). */
  rot_deg: number;
  /** Uniform scale, 0.5 to 2. */
  scale: number;
  /** Small flat JSON, ≤ 1 KB (see `flatParams`). */
  params?: Record<string, string | number | boolean>;
}

export interface Placement extends PlacementInput {
  /** The ulid of the `world.place` event that created it. */
  id: string;
  placedAt: string;
  by: { type: string; id: string | null };
  signer: { scheme: string; address: string | null };
  proof: { url: string };
}

export interface WorldManifest {
  format: typeof WORLD_FORMAT;
  block: number;
  /** False while the event spine is off (flag or migration); placements are then empty. */
  enabled: boolean;
  theme: WorldTheme;
  /** The district's metres; null only when the block summary could not be read. */
  scale: DistrictScale | null;
  placements: Placement[];
  /** The newest world event folded in (`{id, seq}`), or null when there is none. */
  head: { id: string; seq: number } | null;
  limits: { maxPlacements: number; heightCapM: number; scale: [number, number]; paramsMaxBytes: number };
}

/**
 * The body a wallet signs for a world write, minus the auth envelope
 * (`signature`, `message`): `hashBody(worldIntent(...))` is the `Body:` line of
 * the action message. A verifier rebuilds it from a manifest entry (or the
 * theme) plus the event's `actor.id`, so the stored payload is checkable.
 */
export function worldIntent(
  kind: WorldEventKind,
  ownerAddress: string,
  fields: Partial<PlacementInput> & { theme?: string; placementId?: string },
): Record<string, unknown> {
  if (kind === 'world.theme') return { ownerAddress, theme: fields.theme };
  if (kind === 'world.remove') return { ownerAddress, placementId: fields.placementId };
  const intent: Record<string, unknown> = {
    ownerAddress,
    parcel: fields.parcel,
    asset: fields.asset,
    x_m: fields.x_m,
    y_m: fields.y_m,
    rot_deg: fields.rot_deg,
    scale: fields.scale,
  };
  if (fields.params !== undefined) intent.params = fields.params;
  return intent;
}

/** The action label each write signs (`Action:` line). */
export const WORLD_ACTIONS: Record<WorldEventKind, { action: string; segment: string }> = {
  'world.theme': { action: 'world.theme', segment: 'theme' },
  'world.place': { action: 'world.place', segment: 'place' },
  'world.remove': { action: 'world.remove', segment: 'remove' },
};

export function worldWritePath(block: number, kind: WorldEventKind): string {
  return `/api/v1/blocks/${block}/world/${WORLD_ACTIONS[kind].segment}`;
}
