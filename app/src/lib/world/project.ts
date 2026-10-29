/**
 * Fold a block's world events into the `bg-world/1` state. Pure: the caller
 * reads the rows (ordered or not; they are sorted by ulid here) and passes them.
 *
 *   world.theme   → theme = payload.theme (unknown themes are ignored)
 *   world.place   → a placement whose id is the event ulid (malformed payloads,
 *                   and places past the live cap, are ignored)
 *   world.remove  → deletes payload.placementId from the live set (unknown ids are ignored)
 *
 * Every write was validated before it became an event, so the "ignored" cases
 * only cover rows that a future rule change or a race (two places landing
 * together at the cap) could produce. The fold never throws.
 */

import { flatParams } from '@/lib/block-event-core';
import { catalogAsset } from './catalog';
import { DEFAULT_THEME, MAX_PLACEMENTS, isWorldTheme, type Placement, type WorldTheme } from './types';

export interface WorldEventRow {
  id: string;
  block: number;
  seq: number;
  kind: string;
  payload: unknown;
  ts: Date | string;
  actorType: string;
  actorId: string | null;
  signerScheme: string;
  signerAddress: string | null;
}

export interface WorldState {
  theme: WorldTheme;
  placements: Placement[];
  head: { id: string; seq: number } | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function placementOf(r: WorldEventRow): Placement | null {
  const p = (r.payload ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(p.parcel) || (p.parcel as number) < 0) return null;
  if (!catalogAsset(p.asset)) return null;
  if (!isNum(p.x_m) || !isNum(p.y_m) || !isNum(p.rot_deg) || !isNum(p.scale)) return null;
  const params = p.params === undefined ? undefined : flatParams(p.params);
  if (params === null) return null;
  return {
    id: r.id,
    parcel: p.parcel as number,
    asset: p.asset as string,
    x_m: p.x_m,
    y_m: p.y_m,
    rot_deg: p.rot_deg,
    scale: p.scale,
    ...(params !== undefined ? { params } : {}),
    placedAt: new Date(r.ts).toISOString(),
    by: { type: r.actorType, id: r.actorId },
    signer: { scheme: r.signerScheme, address: r.signerAddress },
    proof: { url: `/api/v1/blocks/${r.block}/events/${r.id}/proof` },
  };
}

export function foldWorld(rows: readonly WorldEventRow[]): WorldState {
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let theme: WorldTheme = DEFAULT_THEME;
  const live = new Map<string, Placement>();
  let head: WorldState['head'] = null;
  for (const r of sorted) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    if (r.kind === 'world.theme') {
      if (isWorldTheme(p.theme)) theme = p.theme;
    } else if (r.kind === 'world.place') {
      const placement = live.size < MAX_PLACEMENTS ? placementOf(r) : null;
      if (placement) live.set(placement.id, placement);
    } else if (r.kind === 'world.remove') {
      if (typeof p.placementId === 'string') live.delete(p.placementId);
    } else {
      continue;
    }
    head = { id: r.id, seq: r.seq };
  }
  return { theme, placements: [...live.values()], head };
}
