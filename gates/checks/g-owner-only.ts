// Only the owner of a block can build on it. The check reads the gate block's world, sends three
// build requests that carry no valid credential (the site must refuse each), and reads the world
// again: nothing may have changed.
import { jsonOf } from '../lib/chain.ts';
import type { Answer } from '../lib/http.ts';
import { NotRunError } from '../lib/types.ts';
import type { Check, Ctx, ProbeResult } from '../lib/types.ts';

const OWNER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'; // the example address printed in BIP-173, not a wallet of this project
const MESSAGE = 'bg-promise-check: this is not a signed message';
const SIGNATURE = 'AA==';

async function count(ctx: Ctx, path: string, key: 'objects' | 'placements'): Promise<number> {
  const res = await ctx.http.get(path);
  const list = res.status === 200 ? (jsonOf(res) as Record<string, unknown> | null)?.[key] : undefined;
  if (!Array.isArray(list)) {
    throw new NotRunError(`the read of ${path} answered ${res.status} without a ${key} list`);
  }
  return list.length;
}

function isRefused(a: Answer | null): boolean {
  return a !== null && (a.status === 401 || a.status === 403);
}

function isAccepted(a: Answer | null): boolean {
  return a !== null && a.status >= 200 && a.status < 300;
}

function isOff(a: Answer | null): boolean {
  if (a === null || a.status !== 503) return false;
  const body = jsonOf(a) as Record<string, unknown> | null;
  return body !== null && typeof body === 'object' && body.enabled === false;
}

export const gOwnerOnly: Check = {
  id: 'G-OWNER-ONLY',
  promise: 'Only the owner of a block can build on it.',
  group: 'promise',
  needs: ['gateBlock'],
  notCovered: 'A validly signed request from a wallet that does not own the block.',
  async probe(ctx: Ctx): Promise<ProbeResult> {
    const gb = ctx.gateBlock;
    if (gb === null) throw new NotRunError('set BG_GATES_GATE_BLOCK');

    const n0 = await count(ctx, `/api/v1/world?blockHeight=${gb}`, 'objects');
    const p0 = await count(ctx, `/api/v1/blocks/${gb}/world`, 'placements');

    // Each answer is judged as it arrives: after an accepted build, no further build is sent.
    const a = await ctx.http.refusalProbe('/api/v1/world', { blockHeight: gb, objectType: 'box' });
    const b = isAccepted(a)
      ? null
      : await ctx.http.refusalProbe('/api/v1/world', {
          blockHeight: gb,
          objectType: 'box',
          ownerAddress: OWNER,
          message: MESSAGE,
          signature: SIGNATURE,
        });
    const c =
      isAccepted(a) || isAccepted(b) ? null : await ctx.http.refusalProbe(`/api/v1/blocks/${gb}/world/place`, {});

    // The second reads use their own addresses, so neither a cache here nor the site's edge
    // cache can answer with the first read.
    const n1 = await count(ctx, `/api/v1/world?blockHeight=${gb}&after=1`, 'objects');
    const p1 = await count(ctx, `/api/v1/blocks/${gb}/world?after=1`, 'placements');

    const place = isRefused(c) ? 'refused' : isOff(c) ? 'off' : null;
    const values = {
      a: a.status,
      b: b === null ? null : b.status,
      c: c === null ? null : c.status,
      place,
      objects: [n0, n1],
      placements: [p0, p1],
      covers: ['no credential', 'made-up signature'],
    };

    const sent: [string, Answer | null][] = [
      ['A', a],
      ['B', b],
      ['C', c],
    ];
    for (const [name, ans] of sent) {
      if (ans !== null && isAccepted(ans)) {
        return {
          status: 'fail',
          reason: `The site accepted a build without a signature (request ${name}, status ${ans.status}).`,
          values,
        };
      }
    }
    if (n1 !== n0) return { status: 'fail', reason: `objects changed: ${n0} before, ${n1} after`, values };
    if (p1 !== p0) return { status: 'fail', reason: `placements changed: ${p0} before, ${p1} after`, values };

    const unread: [string, boolean][] = [
      ['A', isRefused(a)],
      ['B', isRefused(b)],
      ['C', place !== null],
    ];
    for (const [name, ok] of unread) {
      if (!ok) {
        const status = sent.find(([n]) => n === name)?.[1]?.status;
        return {
          status: 'not_run',
          reason: `request ${name} answered ${status} before a credential was checked; the check needs a new request`,
          values,
        };
      }
    }
    return {
      status: 'pass',
      reason: 'Builds without a signature and with a made-up signature were refused; nothing changed.',
      values,
    };
  },
};
