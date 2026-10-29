/**
 * ISOLATED SIMULATION — `bg-world/1` through the REAL route handlers, with REAL
 * BIP-322 signatures, an in-memory Prisma plus the in-memory `BlockEvent`
 * store, and block 612,888's recorded summary for the parcel layout.
 *
 * What it proves:
 *   - flag off: the manifest answers enabled:false, no placements, the scale
 *     filled; writes answer 503 before touching a credential;
 *   - flag on: place → one signed world.place event → the manifest lists it
 *     with a proof that verifies offline; theme change; remove-after-place;
 *   - the two credential doors are exactly POST /api/v1/world's (bg_vfy_
 *     session, or an action-bound wallet signature whose Body hash is
 *     rebuildable from the manifest entry); refusals happen before the nonce
 *     is spent; nothing private reaches the record.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/prisma', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const { createEventStore } = require('../helpers/event-store');
  const client = createMemoryPrisma();
  const events = createEventStore();
  const memTx = client.$transaction;
  client.blockEvent = events.blockEvent;
  client.__events = events;
  client.$transaction = async (arg: any) =>
    typeof arg === 'function' ? events.$transaction((etx: any) => arg({ ...client, $executeRaw: etx.$executeRaw })) : memTx(arg);
  return { __esModule: true, default: client, prisma: client };
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
});

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: jest.fn(),
  verifyInscriptionOwnership: jest.fn(),
  scanWalletForBitmap: jest.fn(),
}));

jest.mock('@/lib/block-summary', () => {
  const actual = jest.requireActual('@/lib/block-summary');
  return { ...actual, getTipHeight: jest.fn(async () => 972_600), getBlockSummary: jest.fn() };
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import prisma from '@/lib/prisma';
import { verifyBlockOwnedBy } from '@/lib/onchain/bitmap-ownership';
import { BlockNotFoundError, getBlockSummary } from '@/lib/block-summary';
import { issueChallenge } from '@/lib/challenges';
import { buildActionMessage, hashBody, parseActionMessage } from '@/lib/action-message';
import { __resetBlockEventsState } from '@/lib/block-events';
import { verifyChain, type ChainRow } from '@/lib/block-event-core';
import { worldIntent } from '@/lib/world/types';
import { emitWorldEvent } from '@/lib/block-event-emitters';
import { WORLD_EVENT_CAP } from '@/lib/world/server';
import { GET as worldGet } from '@/app/api/v1/blocks/[height]/world/route';
import { GET as scaleGet } from '@/app/api/v1/blocks/[height]/world/scale/route';
import { POST as placePost } from '@/app/api/v1/blocks/[height]/world/place/route';
import { POST as themePost } from '@/app/api/v1/blocks/[height]/world/theme/route';
import { POST as removePost } from '@/app/api/v1/blocks/[height]/world/remove/route';
import { GET as proofGet } from '@/app/api/v1/blocks/[height]/events/[id]/proof/route';
import { GET as keysGet } from '@/app/.well-known/bg-event-keys.json/route';
import { POST as sessionStart } from '@/app/api/v1/session/start/route';
import { POST as sessionVerify } from '@/app/api/v1/session/verify/route';
import { run as verifyCli } from '../../scripts/verify-event-proof';
import { makeWallet, sign, freshNonce, type SimWallet } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const chain = verifyBlockOwnedBy as jest.Mock;
const summary = getBlockSummary as jest.Mock;

const BLOCK = 612888;
const SEED = '6b'.repeat(32);
const FUTURE = () => Date.now() + 5 * 60 * 1000;
const VSIZE = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8')) as { vsize: number[] }
).vsize;

const PRIVATE = { ip: '203.0.113.91', userAgent: 'PRIVATE-UA/7.7' };
const TOWER = { parcel: 418, asset: 'tower', x_m: 230.49, y_m: 610.47, rot_deg: 0, scale: 1 };

function req(body: any, headers: Record<string, string> = {}, url = 'http://test.local/api'): any {
  const all = { 'x-forwarded-for': PRIVATE.ip, 'user-agent': PRIVATE.userAgent, ...headers };
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), v]));
  return { json: async () => body, url, nextUrl: new URL(url), headers: { get: (n: string) => lower[n.toLowerCase()] ?? null } };
}
const at = (height: number | string) => ({ params: Promise.resolve({ height: String(height) }) });
const rows = (): any[] => db.__events.__rows;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function manifest(height = BLOCK): Promise<any> {
  const res: any = await worldGet(req(null, {}, `http://test.local/api/v1/blocks/${height}/world`), at(height));
  expect(res.status).toBe(200);
  return res.body;
}

async function sessionToken(w: SimWallet): Promise<string> {
  const started: any = await sessionStart(req({ walletAddress: w.address }));
  const message = started.body.data.message;
  const verified: any = await sessionVerify(req({ walletAddress: w.address, message, signature: sign(w.privKey, w.address, message), blocks: [BLOCK] }));
  const token = verified.body.data.token as string;
  expect(token).toMatch(/^bg_vfy_/);
  rows().length = 0; // session/verify itself records deed.verified
  return token;
}

async function signedWorldBody(w: SimWallet, kind: 'place' | 'theme' | 'remove', fields: Record<string, unknown>, block = BLOCK) {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address: w.address, purpose: 'world' });
  const body: Record<string, unknown> = { ...fields, ownerAddress: w.address };
  const message = buildActionMessage({
    action: `world.${kind}`,
    method: 'POST',
    path: `/api/v1/blocks/${block}/world/${kind}`,
    blockHeight: block,
    bodyHash: await hashBody(body),
    nonce,
    expiresAt: FUTURE(),
  });
  return { body: { ...body, message, signature: sign(w.privKey, w.address, message) }, nonce };
}

const writeTmp = (name: string, data: unknown) => {
  const p = path.join(os.tmpdir(), `bg92-${process.pid}-${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data));
  return p;
};
async function offlineVerify(id: string, tag: string): Promise<number> {
  const proof: any = await proofGet(req(null), { params: Promise.resolve({ height: String(BLOCK), id }) });
  expect(proof.status).toBe(200);
  const keys = await (keysGet() as Response).json();
  return verifyCli([writeTmp(`p-${tag}`, proof.body), '--keys', writeTmp(`k-${tag}`, keys)]).code;
}

let owner: SimWallet;

beforeEach(() => {
  db.__reset();
  rows().length = 0;
  db.__events.__setMissing(false);
  __resetBlockEventsState();
  process.env.BG_EVENTS_ENABLED = 'true';
  process.env.BG_EVENT_SIGNING_KEY = SEED;
  owner = makeWallet('p2tr');
  chain.mockReset();
  chain.mockImplementation(async (wallet: string, height: number) =>
    wallet === owner.address && height === BLOCK ? { verified: true, inscriptionId: 'insc-612888i0' } : { verified: false, reason: 'not held' },
  );
  summary.mockReset();
  summary.mockImplementation(async (height: number) => {
    if (height === 999) throw new BlockNotFoundError(999);
    if (height === 777) throw new Error('mempool down');
    return { height, hash: 'h', txCount: VSIZE.length, size: 0, weight: 0, timestamp: 0, vsize: VSIZE, fee: [], value: [] };
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  delete process.env.BG_EVENTS_ENABLED;
  delete process.env.BG_EVENT_SIGNING_KEY;
});

// ── Flag off ─────────────────────────────────────────────────────────────

describe('flag off (BG_EVENTS_ENABLED unset)', () => {
  beforeEach(() => {
    delete process.env.BG_EVENTS_ENABLED;
  });

  it('the manifest answers enabled:false, no placements, the scale filled, without reading the store', async () => {
    const findMany = jest.spyOn(db.blockEvent, 'findMany');
    const m = await manifest();
    expect(m).toMatchObject({ format: 'bg-world/1', block: BLOCK, enabled: false, theme: 'photoreal', placements: [], head: null });
    expect(m.scale).toMatchObject({ edge_m: 2100, area_m2: 4_410_000, parcels: 1114, mean_lot_m2: 3959 });
    expect(m.limits).toEqual({ maxPlacements: 200, heightCapM: 300, scale: [0.5, 2], paramsMaxBytes: 1024 });
    expect(findMany).not.toHaveBeenCalled();
    findMany.mockRestore();
  });

  it('a write answers 503 before any credential or the chain is touched', async () => {
    const token = 'bg_vfy_' + 'a'.repeat(40);
    for (const [handler, body] of [
      [placePost, TOWER],
      [themePost, { theme: 'voxel' }],
      [removePost, { placementId: '01JBZ00000000000000000000A' }],
    ] as const) {
      const res: any = await handler(req(body, auth(token)), at(BLOCK));
      expect(res.status).toBe(503);
      expect(res.body.enabled).toBe(false);
    }
    expect(chain).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it('the scale route works with the flag off', async () => {
    const district: any = await scaleGet(req(null, {}, 'http://test.local/api/v1/blocks/612888/world/scale'), at(BLOCK));
    expect(district.status).toBe(200);
    expect(district.body).toMatchObject({ parcels: 1114, grid: { cols: 41, rows: 43 } });
    const parcel: any = await scaleGet(req(null, {}, 'http://test.local/api/v1/blocks/612888/world/scale?parcel=418'), at(BLOCK));
    expect(parcel.body).toEqual({ block: BLOCK, index: 418, x_m: 204.88, y_m: 586.05, w_m: 51.22, h_m: 48.84, area_m2: 2501.42 });
    const out: any = await scaleGet(req(null, {}, 'http://test.local/api/v1/blocks/612888/world/scale?parcel=1114'), at(BLOCK));
    expect(out.status).toBe(404);
    const bad: any = await scaleGet(req(null, {}, 'http://test.local/api/v1/blocks/612888/world/scale?parcel=-1'), at(BLOCK));
    expect(bad.status).toBe(400);
  });
});

describe('heights', () => {
  it('404 above the tip and for a block mempool does not know; 400 for junk', async () => {
    expect((await worldGet(req(null), at(980_000)) as any).status).toBe(404);
    expect((await worldGet(req(null), at(999)) as any).status).toBe(404);
    expect((await worldGet(req(null), at('84x')) as any).status).toBe(400);
    expect(summary).not.toHaveBeenCalledWith(980_000);
  });

  it('mempool unreachable: the manifest still answers, with scale null and no-store', async () => {
    const res: any = await worldGet(req(null), at(777));
    expect(res.status).toBe(200);
    expect(res.body.scale).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('caches the manifest like the events feed', async () => {
    const res: any = await worldGet(req(null), at(BLOCK));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=5');
  });
});

describe('table missing (migration not applied)', () => {
  it('reads answer enabled:false and writes 503', async () => {
    db.__events.__setMissing(true);
    expect((await manifest()).enabled).toBe(false);
    const token = await sessionToken(owner).catch(() => 'bg_vfy_' + 'b'.repeat(40));
    const res: any = await placePost(req(TOWER, auth(token)), at(BLOCK));
    expect(res.status).toBe(503);
  });
});

// ── Flag on: the session path (MCP) ─────────────────────────────────────

describe('flag on, bg_vfy_ session (the MCP path)', () => {
  it('place → one signed world.place event → the manifest lists it with a proof that verifies offline', async () => {
    const token = await sessionToken(owner);
    const res: any = await placePost(req({ ...TOWER, params: { color: '#f7931a' } }, auth(token)), at(BLOCK));
    expect(res.status).toBe(201);

    expect(rows()).toHaveLength(1);
    const e = rows()[0];
    expect(e).toMatchObject({
      block: BLOCK,
      kind: 'world.place',
      actorType: 'owner-session',
      actorId: owner.address,
      signerScheme: 'ed25519',
      summary: 'Placed a tower on parcel 418',
    });
    expect(e.payload).toEqual({ ...TOWER, params: { color: '#f7931a' }, via: 'session' });
    // The system-signed proof message carries the placement itself.
    expect(JSON.parse(e.proofMessage).payload).toEqual(e.payload);
    expect(res.body.placement).toMatchObject({ id: e.id, ...TOWER, proof: { url: `/api/v1/blocks/${BLOCK}/events/${e.id}/proof` } });

    const m = await manifest();
    expect(m.enabled).toBe(true);
    expect(m.placements).toHaveLength(1);
    expect(m.placements[0]).toMatchObject({ id: e.id, ...TOWER, params: { color: '#f7931a' }, by: { type: 'owner-session', id: owner.address } });
    expect(m.head).toEqual({ id: e.id, seq: e.seq });

    expect(await offlineVerify(e.id, 'sess')).toBe(0);
    const stored = JSON.stringify(rows());
    for (const v of [token, token.slice(7), PRIVATE.ip, PRIVATE.userAgent]) expect(stored).not.toContain(v);
  });

  it('theme change, then remove-after-place, all on one valid chain', async () => {
    const token = await sessionToken(owner);
    const placed: any = await placePost(req(TOWER, auth(token)), at(BLOCK));
    const house: any = await placePost(req({ ...TOWER, asset: 'house', parcel: 0, x_m: 50, y_m: 40 }, auth(token)), at(BLOCK));
    expect(house.status).toBe(201);
    expect((await themePost(req({ theme: 'voxel' }, auth(token)), at(BLOCK)) as any).status).toBe(201);
    expect((await manifest()).theme).toBe('voxel');

    const removed: any = await removePost(req({ placementId: placed.body.placement.id }, auth(token)), at(BLOCK));
    expect(removed.status).toBe(201);
    expect(removed.body.removed).toBe(placed.body.placement.id);
    const m = await manifest();
    expect(m.placements.map((p: any) => p.id)).toEqual([house.body.placement.id]);
    expect(m.theme).toBe('voxel');

    // A second remove of the same id has nothing to remove.
    expect((await removePost(req({ placementId: placed.body.placement.id }, auth(token)), at(BLOCK)) as any).status).toBe(404);

    const list: ChainRow[] = rows().map((r) => ({
      id: r.id, block: r.block, seq: r.seq, kind: r.kind,
      actor: { type: r.actorType, id: r.actorId, handle: r.actorHandle },
      signer: { scheme: r.signerScheme, address: r.signerAddress },
      summary: r.summary, payloadHash: r.payloadHash, prev: r.prev, ts: r.ts.toISOString(), hash: r.hash,
    }));
    expect(verifyChain(list)).toMatchObject({ ok: true, checked: 4 });
    expect(rows().map((r) => r.kind)).toEqual(['world.place', 'world.place', 'world.theme', 'world.remove']);
  });

  it.each([
    [{ ...TOWER, x_m: 210 }, 400, 'outside_parcel'],
    [{ ...TOWER, parcel: 641, x_m: 1869.5, y_m: 1001.1, scale: 2 }, 400, 'too_tall'],
    [{ ...TOWER, asset: 'castle' }, 400, 'unknown_asset'],
    [{ ...TOWER, parcel: 1114 }, 400, 'parcel_out_of_range'],
    [{ ...TOWER, chatText: 'hi' }, 400, 'bad_request'],
  ])('refuses %j (%s %s) and records nothing', async (body, status, code) => {
    const token = await sessionToken(owner);
    chain.mockClear();
    const res: any = await placePost(req(body, auth(token)), at(BLOCK));
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(rows()).toHaveLength(0);
    expect(chain).not.toHaveBeenCalled(); // refused before the ownership check
  });

  it('refuses an unknown theme and a non-object body', async () => {
    const token = await sessionToken(owner);
    expect((await themePost(req({ theme: 'gta' }, auth(token)), at(BLOCK)) as any).body.code).toBe('unknown_theme');
    expect((await themePost(req(['voxel'], auth(token)), at(BLOCK)) as any).status).toBe(400);
  });

  it('refuses anonymous writes with the verify-first explanation', async () => {
    const res: any = await placePost(req(TOWER), at(BLOCK));
    expect(res.status).toBe(401);
    expect(rows()).toHaveLength(0);
  });

  it('refuses a block outside the session scope, and a block that moved on-chain', async () => {
    const token = await sessionToken(owner);
    const other: any = await placePost(req(TOWER, auth(token)), at(612_889));
    expect(other.status).toBeGreaterThanOrEqual(400);
    chain.mockImplementation(async () => ({ verified: false, reason: 'transferred' }));
    const moved: any = await placePost(req(TOWER, auth(token)), at(BLOCK));
    expect(moved.status).toBeGreaterThanOrEqual(400);
    expect(rows()).toHaveLength(0);
  });

  it('caps a block at 200 live placements (409) and accepts again after a remove', async () => {
    const token = await sessionToken(owner);
    // Seed 199 through the emitter (the route's 60/min write limit would stop a
    // loop of 200 requests), then the 200th through the route.
    const ids: string[] = [];
    for (let i = 0; i < 199; i++) {
      const r = await emitWorldEvent({ block: BLOCK, kind: 'world.place', ownerAddress: owner.address, via: 'session', fields: { ...TOWER, asset: 'sign' } });
      ids.push(r!.id);
    }
    const last: any = await placePost(req({ ...TOWER, asset: 'sign' }, auth(token)), at(BLOCK));
    expect(last.status).toBe(201);
    const full: any = await placePost(req({ ...TOWER, asset: 'sign' }, auth(token)), at(BLOCK));
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('too_many_placements');
    expect((await removePost(req({ placementId: ids[0] }, auth(token)), at(BLOCK)) as any).status).toBe(201);
    expect((await placePost(req({ ...TOWER, asset: 'sign' }, auth(token)), at(BLOCK)) as any).status).toBe(201);
    expect((await manifest()).placements).toHaveLength(200);
    expect(WORLD_EVENT_CAP).toBeGreaterThan(1000);
  }, 60_000);
});

// ── Flag on: the wallet path (one signature per write) ──────────────────

describe('flag on, action-bound wallet signature', () => {
  it('records the owner signature as the proof, and the Body hash rebuilds from the manifest entry', async () => {
    const { body } = await signedWorldBody(owner, 'place', TOWER);
    const res: any = await placePost(req(body), at(BLOCK));
    expect(res.status).toBe(201);
    const e = rows()[0];
    expect(e).toMatchObject({ kind: 'world.place', actorType: 'owner', actorId: owner.address, signerScheme: 'bip322', proofMessage: body.message });

    const entry = (await manifest()).placements[0];
    const fields = { parcel: entry.parcel, asset: entry.asset, x_m: entry.x_m, y_m: entry.y_m, rot_deg: entry.rot_deg, scale: entry.scale };
    const rebuilt = await hashBody(worldIntent('world.place', entry.by.id, fields));
    expect(parseActionMessage(e.proofMessage)!.bodyHash).toBe(rebuilt);
    expect(await offlineVerify(e.id, 'wallet')).toBe(0);
  });

  it('a theme and a removal sign their own intents', async () => {
    const t = await signedWorldBody(owner, 'theme', { theme: 'track' });
    expect((await themePost(req(t.body), at(BLOCK)) as any).status).toBe(201);
    const p = await signedWorldBody(owner, 'place', TOWER);
    const placed: any = await placePost(req(p.body), at(BLOCK));
    const r = await signedWorldBody(owner, 'remove', { placementId: placed.body.placement.id });
    expect((await removePost(req(r.body), at(BLOCK)) as any).status).toBe(201);
    const m = await manifest();
    expect(m).toMatchObject({ theme: 'track', placements: [] });
  });

  it('refuses a replay, a tampered body and a path swap', async () => {
    const { body } = await signedWorldBody(owner, 'place', TOWER);
    expect((await placePost(req(body), at(BLOCK)) as any).status).toBe(201);
    expect((await placePost(req(body), at(BLOCK)) as any).status).toBe(401); // nonce spent

    const t = await signedWorldBody(owner, 'place', TOWER);
    expect((await placePost(req({ ...t.body, x_m: 231 }), at(BLOCK)) as any).status).toBe(401); // body binding

    const th = await signedWorldBody(owner, 'theme', { theme: 'voxel' });
    // A theme signature sent to the place route: refused as a field the route does not know.
    expect((await placePost(req(th.body), at(BLOCK)) as any).status).toBe(400);
    expect(rows()).toHaveLength(1);
  });

  it('refuses an invalid placement before spending the nonce', async () => {
    const { body, nonce } = await signedWorldBody(owner, 'place', { ...TOWER, x_m: 210 });
    const res: any = await placePost(req(body), at(BLOCK));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('outside_parcel');
    expect(chain).not.toHaveBeenCalled();
    const ch = await db.challenge.findFirst({ where: { challenge: nonce } });
    expect(ch).toBeTruthy();
    expect(ch.consumedAt ?? null).toBeNull();
  });

  it("refuses another wallet's signature for this block", async () => {
    const stranger = makeWallet('p2wpkh');
    const { body } = await signedWorldBody(stranger, 'place', TOWER);
    const res: any = await placePost(req(body), at(BLOCK));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(rows()).toHaveLength(0);
  });
});
