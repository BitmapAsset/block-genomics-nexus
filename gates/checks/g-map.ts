// Every block is a map: the site's layout of a block is built from the live chain and holds one
// square per transaction, and its transaction count equals the chain's.
import { chainTxCount, jsonOf } from '../lib/chain.ts';
import type { Check, Ctx, ProbeResult } from '../lib/types.ts';

type Layout = { txCount?: unknown; squares?: unknown; source?: unknown };

export const gMap: Check = {
  id: 'G-MAP',
  promise: 'Every block is a map with one parcel per transaction.',
  group: 'promise',
  needs: [],
  notCovered: "Each square's size and position, recomputed from the block's transactions.",
  async probe(ctx: Ctx): Promise<ProbeResult> {
    const values: Record<string, unknown> = {};
    const fails: string[] = [];
    for (const h of ctx.heights) {
      const res = await ctx.http.get(`/api/v1/blocks/${h}/layout`);
      if (res.status !== 200) {
        fails.push(`The layout of block ${h} answered ${res.status}.`);
        continue;
      }
      const body = (jsonOf(res) ?? {}) as Layout;
      const txCount = body.txCount;
      const squares = Array.isArray(body.squares) ? body.squares.length : null;
      const source = body.source;
      if (source !== 'live') {
        values[String(h)] = { txCount, squares, source };
        fails.push(`The layout of block ${h} is ${typeof source === 'string' ? source : 'of no named source'}, not live.`);
        continue;
      }
      const chain = await chainTxCount(ctx.http, h);
      values[String(h)] = { txCount, squares, source, chainTxCount: chain };
      if (txCount !== chain) {
        fails.push(`The layout says ${String(txCount)} parcels; the chain says ${chain}.`);
      } else if (squares !== txCount) {
        fails.push(`The layout of block ${h} has ${String(squares)} squares for ${chain} parcels.`);
      }
    }
    if (fails.length > 0) return { status: 'fail', reason: fails.join(' '), values };
    return {
      status: 'pass',
      reason: `${ctx.heights.length} blocks checked; every layout is live with one parcel per transaction.`,
      values,
    };
  },
};
