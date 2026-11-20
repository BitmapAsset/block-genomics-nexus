// Every block is a district of 2.1 km by 2.1 km, with one parcel per transaction of the chain.
import { chainTxCount, jsonOf } from '../lib/chain.ts';
import type { Check, Ctx, ProbeResult } from '../lib/types.ts';

const EDGE_M = 2100;
const AREA_M2 = EDGE_M * EDGE_M;

type Scale = { edge_m?: unknown; area_m2?: unknown; parcels?: unknown };

export const gDistrict: Check = {
  id: 'G-DISTRICT',
  promise: 'Every block is a district of 2.1 km by 2.1 km.',
  group: 'promise',
  needs: [],
  async probe(ctx: Ctx): Promise<ProbeResult> {
    const values: Record<string, unknown> = {};
    const fails: string[] = [];
    for (const h of ctx.heights) {
      const res = await ctx.http.get(`/api/v1/blocks/${h}/world/scale`);
      if (res.status !== 200) {
        fails.push(`The scale of block ${h} answered ${res.status}.`);
        continue;
      }
      const body = (jsonOf(res) ?? {}) as Scale;
      const chain = await chainTxCount(ctx.http, h);
      values[String(h)] = { edge_m: body.edge_m, area_m2: body.area_m2, parcels: body.parcels, chainTxCount: chain };
      if (body.edge_m !== EDGE_M) {
        fails.push(`Block ${h} says edge ${String(body.edge_m)} m; the promise is ${EDGE_M} m.`);
      }
      if (body.area_m2 !== AREA_M2) {
        fails.push(`Block ${h} says area ${String(body.area_m2)} m2; the promise is ${AREA_M2} m2.`);
      }
      if (body.parcels !== chain) {
        fails.push(`Block ${h} has ${String(body.parcels)} parcels; the chain says ${chain}.`);
      }
    }
    if (fails.length > 0) return { status: 'fail', reason: fails.join(' '), values };
    return {
      status: 'pass',
      reason: `${ctx.heights.length} blocks checked; every district is ${EDGE_M} m by ${EDGE_M} m with one parcel per transaction.`,
      values,
    };
  },
};
