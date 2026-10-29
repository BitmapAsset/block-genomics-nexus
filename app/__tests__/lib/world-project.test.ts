/**
 * The `bg-world/1` projection (lib/world/project): the manifest is a fold of
 * the block's world.* events in ulid order.
 */

import { foldWorld, type WorldEventRow } from '@/lib/world/project';
import { MAX_PLACEMENTS } from '@/lib/world/types';

let n = 0;
/** Ulids sort by time; a fixed prefix plus a counter keeps them ordered. */
const id = (i: number) => `01JBZ0000000000000000${String(i).padStart(5, '0')}`;

function row(kind: string, payload: Record<string, unknown>, i = ++n): WorldEventRow {
  return {
    id: id(i),
    block: 612888,
    seq: i,
    kind,
    payload,
    ts: new Date(1_761_638_400_000 + i * 1000),
    actorType: 'owner-session',
    actorId: 'bc1powner',
    signerScheme: 'ed25519',
    signerAddress: 'bg-sys-0123456789abcdef',
  };
}

const place = (over: Record<string, unknown> = {}) =>
  row('world.place', { parcel: 418, asset: 'tower', x_m: 230.49, y_m: 610.47, rot_deg: 0, scale: 1, via: 'session', ...over });

beforeEach(() => {
  n = 0;
});

describe('foldWorld', () => {
  it('is the default photoreal world with nothing on it when there are no events', () => {
    expect(foldWorld([])).toEqual({ theme: 'photoreal', placements: [], head: null });
  });

  it('turns a world.place into a placement whose id is the event ulid, with its proof link', () => {
    const r = place({ params: { color: '#f7931a' } });
    const w = foldWorld([r]);
    expect(w.placements).toEqual([
      {
        id: r.id,
        parcel: 418,
        asset: 'tower',
        x_m: 230.49,
        y_m: 610.47,
        rot_deg: 0,
        scale: 1,
        params: { color: '#f7931a' },
        placedAt: new Date(r.ts).toISOString(),
        by: { type: 'owner-session', id: 'bc1powner' },
        signer: { scheme: 'ed25519', address: 'bg-sys-0123456789abcdef' },
        proof: { url: `/api/v1/blocks/612888/events/${r.id}/proof` },
      },
    ]);
    expect(w.head).toEqual({ id: r.id, seq: r.seq });
  });

  it('removes a placement after it was placed, and keeps the others', () => {
    const a = place();
    const b = place({ parcel: 2, asset: 'house' });
    const rm = row('world.remove', { placementId: a.id, via: 'session' });
    const w = foldWorld([a, b, rm]);
    expect(w.placements.map((p) => p.id)).toEqual([b.id]);
    expect(w.head).toEqual({ id: rm.id, seq: rm.seq });
  });

  it('ignores a remove that comes before its place (ulid order, not array order)', () => {
    const a = place();
    const rmEarly: WorldEventRow = { ...row('world.remove', { placementId: a.id }), id: id(0), seq: 0 };
    expect(foldWorld([a, rmEarly]).placements.map((p) => p.id)).toEqual([a.id]);
  });

  it('applies the newest theme and ignores unknown ones', () => {
    const t1 = row('world.theme', { theme: 'voxel' });
    const t2 = row('world.theme', { theme: 'toon' });
    const bad = row('world.theme', { theme: 'gta' });
    expect(foldWorld([t1]).theme).toBe('voxel');
    expect(foldWorld([t2, t1]).theme).toBe('toon');
    expect(foldWorld([t1, t2, bad]).theme).toBe('toon');
  });

  it('sorts by ulid whatever order the rows arrive in', () => {
    const rows = [place(), place({ parcel: 3 }), row('world.theme', { theme: 'brick' }), place({ parcel: 4 })];
    expect(foldWorld([...rows].reverse())).toEqual(foldWorld(rows));
  });

  it('skips malformed rows and other kinds, never throws', () => {
    const rows = [
      place({ asset: 'castle' }),
      place({ x_m: 'west' }),
      place({ parcel: -3 }),
      place({ params: { nested: { a: 1 } } }),
      row('world.place', {}),
      row('build.placed', { objectId: 'x' }),
      row('world.remove', { placementId: 42 }),
      { ...place(), payload: null } as WorldEventRow,
    ];
    const w = foldWorld(rows);
    expect(w.placements).toEqual([]);
    // build.placed is not a world event: head is the newest world.* row.
    expect(w.head?.id).toBe(rows[rows.length - 1].id);
  });

  it(`never lists more than ${MAX_PLACEMENTS} live placements, and frees room on a remove`, () => {
    const rows: WorldEventRow[] = [];
    for (let i = 0; i < MAX_PLACEMENTS + 5; i++) rows.push(place({ parcel: i }));
    let w = foldWorld(rows);
    expect(w.placements).toHaveLength(MAX_PLACEMENTS);
    expect(w.placements[MAX_PLACEMENTS - 1].parcel).toBe(MAX_PLACEMENTS - 1);

    const rm = row('world.remove', { placementId: rows[0].id });
    const after = place({ parcel: 999 });
    w = foldWorld([...rows, rm, after]);
    expect(w.placements).toHaveLength(MAX_PLACEMENTS);
    expect(w.placements.some((p) => p.parcel === 999)).toBe(true);
  });
});
