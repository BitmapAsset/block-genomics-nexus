/**
 * SIMULATION — `POST /api/v1/world/batch`: agent-session credentials, and what a
 * failed batch leaves behind.
 *
 * Two gaps this pins down.
 *
 * 1. CREDENTIAL PARITY. §4.4 requires every world write to authorize by EITHER
 *    credential path — a `bg_vfy_` session token or an action-bound BIP-322
 *    signature. The single-object routes have done both since #119; this one
 *    accepted only the signature, so an agent holding a valid session token had
 *    to fall back to N single writes (and N indexer calls) to do one batch's
 *    work. The route was the outlier, not the spec.
 *
 * 2. ALL-OR-NOTHING. The batch used to execute its sub-ops one at a time outside
 *    a transaction and report per-op `success: false` inside a `200`. A batch
 *    could half-apply, and the caller had no recovery: the nonce was already
 *    spent so it could not resend, and the response did not say which writes had
 *    landed. Now the batch is one transaction — it applies completely or not at
 *    all — which is the precondition for §7.2's retry rule meaning anything.
 *
 * These drive the REAL route through the REAL ownership gate and REAL session
 * minting. Only the seams are mocked: the database (in-memory, with rollback
 * simulated so "nothing was applied" is actually observable) and the indexer
 * (moving `chainOwner` IS the transfer).
 */

const OWNER = 'bc1powner0000000000000000000000000000000000';
const BUYER = 'bc1pbuyer00000000000000000000000000000000000';
const STRANGER = 'bc1pstranger000000000000000000000000000000000';
const BLOCK = 840000;
const OTHER_BLOCK = 700000;

let chainOwner: string = OWNER;
let indexerDown = false;

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse };
});

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();

  // The in-memory `$transaction` runs the callback and keeps whatever it wrote,
  // which would let a half-applied batch pass as atomic. Snapshot/restore makes
  // rollback observable, so "nothing was applied" is asserted, not assumed.
  client.$transaction = async (arg: unknown) => {
    if (typeof arg !== 'function') return Promise.all(arg as Promise<unknown>[]);
    const snapshot = client.__rows('blockObject').map((r: Record<string, unknown>) => ({ ...r }));
    try {
      return await (arg as (tx: unknown) => Promise<unknown>)(client);
    } catch (e) {
      const rows = client.__rows('blockObject');
      rows.length = 0;
      rows.push(...snapshot);
      throw e;
    }
  };

  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string, height: number) => {
    if (indexerDown) return { verified: false, unavailable: true, reason: 'indexer down' };
    if (wallet === chainOwner && height === BLOCK) return { verified: true, inscriptionId: 'insc_i0' };
    return { verified: false, reason: `No .bitmap inscription for block ${height} is held by this wallet` };
  },
}));

// The wallet path's signature/binding seams have their own suites; here they are
// valid so the cases below isolate credentials, ordering and atomicity.
jest.mock('@/lib/api-helpers', () => ({ verifyWalletSignature: () => true }));

const mockConsumeChallenge = jest.fn(async () => true);
jest.mock('@/lib/challenges', () => ({ consumeChallenge: () => mockConsumeChallenge() }));

jest.mock('@/lib/action-message', () => ({
  verifyActionBinding: () => ({ ok: true, nonce: 'nonce_1' }),
  hashBody: async () => 'bodyhash',
}));

const mockEmitAgentEvent = jest.fn<Promise<undefined>, unknown[]>(async () => undefined);
jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: (...a: unknown[]) => mockEmitAgentEvent(...a) }));

// The limiter has its own suite; a pass-through here so it is never the reason a
// case passes or fails.
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  WORLD_WRITE_LIMIT: 60,
  WORLD_BATCH_LIMIT: 20,
}));

import prisma from '@/lib/prisma';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { POST as BATCH } from '@/app/api/v1/world/batch/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

interface BatchOp {
  action: string;
  id?: string;
  data?: Record<string, unknown>;
}

/** A request carrying a `bg_vfy_` session token — the agent path. */
function agentReq(token: string, body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? `Bearer ${token}` : null) },
  } as never;
}

/** A request carrying an action-bound signature — the wallet path. */
function walletReq(body: Record<string, unknown>) {
  return { json: async () => body, headers: { get: () => null } } as never;
}

/** Mint a real session token scoped to `blocks`. */
async function session(wallet: string, blocks: number[]): Promise<string> {
  const { token } = await mintVerifiedSession(wallet, blocks);
  return token;
}

/** Seed an object standing on a block. */
async function placeObject(id: string, blockHeight: number, extra: Record<string, unknown> = {}) {
  await db.blockObject.create({
    data: { id, blockHeight, ownerAddress: OWNER, objectType: 'mesh', locked: false, ...extra },
  });
}

const objectCount = async () => db.blockObject.count({});
const objectIds = async () =>
  (await db.blockObject.findMany({})).map((o: { id: string }) => o.id).sort();

beforeEach(() => {
  db.__reset();
  chainOwner = OWNER;
  indexerDown = false;
  jest.clearAllMocks();
  mockConsumeChallenge.mockResolvedValue(true);
});

// Spies are installed on the shared in-memory client, so a leaked one would
// silently break every later case rather than fail its own.
afterEach(() => jest.restoreAllMocks());

// ── 1. The agent-session credential path ─────────────────────────────────
describe('agent session — a bg_vfy_ token authorizes a batch', () => {
  it('accepts a scoped, live session with no signature or nonce at all', async () => {
    const token = await session(OWNER, [BLOCK]);

    const res: any = await BATCH(
      agentReq(token, {
        blockHeight: BLOCK,
        operations: [
          { action: 'create', data: { objectType: 'cube', color: '#fff' } },
          { action: 'create', data: { objectType: 'sphere' } },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).results).toHaveLength(2);
    expect(await objectCount()).toBe(2);
    // The session token IS the one-time-challenge-derived credential. Burning a
    // nonce as well would demand a signature the agent path never sends.
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
  });

  it('attributes writes to the session wallet, never to the request body', async () => {
    // A token that could name its own actor would let any session write under
    // someone else's address.
    const token = await session(OWNER, [BLOCK]);

    await BATCH(
      agentReq(token, {
        blockHeight: BLOCK,
        ownerAddress: STRANGER,
        operations: [{ action: 'create', data: { objectType: 'cube' } }],
      }),
    );

    const [obj] = await db.blockObject.findMany({});
    expect(obj.ownerAddress).toBe(OWNER);
  });

  it('updates and deletes objects a previous owner placed, once the deed moves', async () => {
    // Ownership follows the deed: the buyer controls everything on the block,
    // including what the seller left standing.
    await placeObject('obj_seller', BLOCK);
    chainOwner = BUYER;
    const token = await session(BUYER, [BLOCK]);

    const res: any = await BATCH(
      agentReq(token, {
        blockHeight: BLOCK,
        operations: [{ action: 'update', id: 'obj_seller', data: { color: '#00ff00' } }],
      }),
    );

    expect(res.status).toBe(200);
    const [obj] = await db.blockObject.findMany({});
    expect(obj.color).toBe('#00ff00');
    // Attribution survives the sale; control does not.
    expect(obj.ownerAddress).toBe(OWNER);
  });

  it("refuses a seller's still-live session the moment the inscription moves", async () => {
    await placeObject('obj_1', BLOCK);
    const token = await session(OWNER, [BLOCK]);
    chainOwner = BUYER;

    const res: any = await BATCH(
      agentReq(token, { blockHeight: BLOCK, operations: [{ action: 'delete', id: 'obj_1' }] }),
    );

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ownership_lost');
    expect(await objectCount()).toBe(1);
  });

  it('refuses a block outside the session scope', async () => {
    const token = await session(OWNER, [OTHER_BLOCK]);

    const res: any = await BATCH(
      agentReq(token, { blockHeight: BLOCK, operations: [{ action: 'create', data: { objectType: 'cube' } }] }),
    );

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('out_of_scope');
    expect(await objectCount()).toBe(0);
  });

  it('answers 503, never a write, when the chain cannot be reached', async () => {
    const token = await session(OWNER, [BLOCK]);
    indexerDown = true;

    const res: any = await BATCH(
      agentReq(token, { blockHeight: BLOCK, operations: [{ action: 'create', data: { objectType: 'cube' } }] }),
    );

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('onchain_unavailable');
    expect(await objectCount()).toBe(0);
  });

  it('refuses an unknown session token', async () => {
    const res: any = await BATCH(
      agentReq('bg_vfy_notarealtoken', {
        blockHeight: BLOCK,
        operations: [{ action: 'create', data: { objectType: 'cube' } }],
      }),
    );

    expect(res.status).toBe(401);
    expect(await objectCount()).toBe(0);
  });
});

// ── 2. Credentials are checked before anything is looked up ──────────────
describe('an uncredentialed caller learns nothing', () => {
  it('refuses with 401 and never probes whether the target objects exist', async () => {
    // Validating sub-ops first would turn "update target X not found" into an
    // existence oracle for object ids, readable without any credential.
    await placeObject('obj_secret', BLOCK);
    const findMany = jest.spyOn(db.blockObject, 'findMany');

    const res: any = await BATCH(
      walletReq({ blockHeight: BLOCK, operations: [{ action: 'delete', id: 'obj_secret' }] }),
    );

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('unverified');
    expect(findMany).not.toHaveBeenCalled();
    findMany.mockRestore();
  });

  it('refuses a signature from a wallet that does not hold the block', async () => {
    const res: any = await BATCH(
      walletReq({
        blockHeight: BLOCK,
        ownerAddress: STRANGER,
        signature: 'sig',
        message: 'msg',
        operations: [{ action: 'create', data: { objectType: 'cube' } }],
      }),
    );

    expect(res.status).toBe(403);
    expect(await objectCount()).toBe(0);
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
  });
});

// ── 3. The nonce survives a batch that was never applied ─────────────────
describe('nonce accounting on the wallet path', () => {
  const signedBatch = (operations: BatchOp[]) =>
    BATCH(
      walletReq({
        blockHeight: BLOCK,
        ownerAddress: OWNER,
        signature: 'sig',
        message: 'msg',
        operations,
      }),
    );

  it('spends the nonce exactly once on a batch that applies', async () => {
    const res: any = await signedBatch([{ action: 'create', data: { objectType: 'cube' } }]);

    expect(res.status).toBe(200);
    expect(mockConsumeChallenge).toHaveBeenCalledTimes(1);
  });

  it('preserves the nonce when a sub-op is malformed', async () => {
    const res: any = await signedBatch([
      { action: 'create', data: { objectType: 'cube' } },
      { action: 'update', id: 'obj_missing', data: { color: '#fff' } },
    ]);

    expect(res.status).toBe(403);
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
    expect(await objectCount()).toBe(0);
  });

  it('preserves the nonce when a sub-op targets another block', async () => {
    await placeObject('obj_elsewhere', OTHER_BLOCK);

    const res: any = await signedBatch([{ action: 'delete', id: 'obj_elsewhere' }]);

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('out_of_scope');
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
    expect(await objectCount()).toBe(1);
  });

  it('preserves the nonce when a sub-op targets a locked object', async () => {
    await placeObject('obj_locked', BLOCK, { locked: true });

    const res: any = await signedBatch([{ action: 'update', id: 'obj_locked', data: { color: '#fff' } }]);

    expect(res.status).toBe(403);
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
  });

  it('writes nothing when the nonce turns out to be spent', async () => {
    mockConsumeChallenge.mockResolvedValue(false);

    const res: any = await signedBatch([{ action: 'create', data: { objectType: 'cube' } }]);

    expect(res.status).toBe(401);
    expect(await objectCount()).toBe(0);
  });
});

// ── 4. All-or-nothing ────────────────────────────────────────────────────
describe('a batch applies completely or not at all', () => {
  it('rolls back every earlier sub-op when a later one fails', async () => {
    await placeObject('obj_1', BLOCK);
    await placeObject('obj_2', BLOCK);
    const before = await objectIds();

    // The create is the LAST sub-op, so the delete and the update have already
    // been issued when it fails — the exact shape that used to leave a block
    // half-rebuilt.
    jest.spyOn(db.blockObject, 'create').mockRejectedValue(new Error('write failed'));

    const token = await session(OWNER, [BLOCK]);
    const res: any = await BATCH(
      agentReq(token, {
        blockHeight: BLOCK,
        operations: [
          { action: 'delete', id: 'obj_1' },
          { action: 'update', id: 'obj_2', data: { color: '#ff0000' } },
          { action: 'create', data: { objectType: 'cube' } },
        ],
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('batch_failed');
    expect(body.error).toMatch(/no changes were applied/i);

    // The delete and the update are both undone.
    expect(await objectIds()).toEqual(before);
    const obj2 = (await db.blockObject.findMany({})).find((o: { id: string }) => o.id === 'obj_2');
    expect(obj2.color).toBeUndefined();
  });

  it('never reports a per-op failure inside a 2xx', async () => {
    // The old shape: 200 + `results: [{ success: false }]`. A caller that trusted
    // the status code would record a half-applied batch as a success.
    const token = await session(OWNER, [BLOCK]);
    const res: any = await BATCH(
      agentReq(token, {
        blockHeight: BLOCK,
        operations: [
          { action: 'create', data: { objectType: 'cube' } },
          { action: 'create', data: { objectType: 'sphere' } },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results.every((r: { success: boolean }) => r.success === true)).toBe(true);
    expect(results.map((r: { action: string }) => r.action)).toEqual(['create', 'create']);
  });

  it('emits exactly one summary event, and only after the batch commits', async () => {
    const token = await session(OWNER, [BLOCK]);
    await BATCH(
      agentReq(token, {
        blockHeight: BLOCK,
        operations: [
          { action: 'create', data: { objectType: 'cube' } },
          { action: 'create', data: { objectType: 'sphere' } },
        ],
      }),
    );

    expect(mockEmitAgentEvent).toHaveBeenCalledTimes(1);
    const [height, type, payload] = mockEmitAgentEvent.mock.calls[0] as unknown as [number, string, any];
    expect(height).toBe(BLOCK);
    expect(type).toBe('world_updated');
    expect(payload.opCounts).toEqual({ create: 2 });
    expect(payload.actor).toBe(OWNER);
  });

  it('emits no event when the batch fails', async () => {
    jest.spyOn(db.blockObject, 'create').mockRejectedValue(new Error('write failed'));
    const token = await session(OWNER, [BLOCK]);

    const res: any = await BATCH(
      agentReq(token, { blockHeight: BLOCK, operations: [{ action: 'create', data: { objectType: 'cube' } }] }),
    );

    expect(res.status).toBe(500);
    expect(mockEmitAgentEvent).not.toHaveBeenCalled();
  });
});

// ── 5. Shape limits still hold on both paths ─────────────────────────────
describe('batch shape limits', () => {
  it('rejects more than 100 sub-ops before touching any credential', async () => {
    const operations = Array.from({ length: 101 }, () => ({
      action: 'create',
      data: { objectType: 'cube' },
    }));

    const res: any = await BATCH(walletReq({ blockHeight: BLOCK, operations }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Max 100 operations/);
  });

  it('rejects an unknown action', async () => {
    const token = await session(OWNER, [BLOCK]);
    const res: any = await BATCH(
      agentReq(token, { blockHeight: BLOCK, operations: [{ action: 'teleport', id: 'x' }] }),
    );

    expect(res.status).toBe(400);
    expect(await objectCount()).toBe(0);
  });

  it('rejects an empty batch', async () => {
    const token = await session(OWNER, [BLOCK]);
    const res: any = await BATCH(agentReq(token, { blockHeight: BLOCK, operations: [] }));

    expect(res.status).toBe(400);
  });

  it('ignores fields outside the allowlist on both create and update', async () => {
    await placeObject('obj_1', BLOCK);
    const token = await session(OWNER, [BLOCK]);

    await BATCH(
      agentReq(token, {
        blockHeight: BLOCK,
        operations: [
          // `locked` is not in this route's allowlist: a batch must not be able
          // to clear a lock, and `ownerAddress` must not be reassignable.
          { action: 'update', id: 'obj_1', data: { color: '#123456', locked: true, ownerAddress: STRANGER } },
        ],
      }),
    );

    const [obj] = await db.blockObject.findMany({});
    expect(obj.color).toBe('#123456');
    expect(obj.locked).toBe(false);
    expect(obj.ownerAddress).toBe(OWNER);
  });
});
