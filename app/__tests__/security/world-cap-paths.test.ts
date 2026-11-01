/**
 * World batch creates and re-shown objects count against the block's cap.
 *
 * `POST /api/v1/world` refuses a placement once a block shows MAX_PLACEMENTS
 * (200) objects (409 `too_many_placements`). Two other paths could still go
 * past it: a batch of up to 100 creates, and a PATCH that sets `visible: true`
 * on a hidden object. Both now count the same way:
 *
 *   - a batch is refused whole (nothing applied, nonce unspent) when it raises
 *     the block's visible count above the cap; a swap at the cap (delete one,
 *     create one) and a clean-up batch still apply;
 *   - a PATCH that re-shows a hidden object is refused at the cap; any other
 *     PATCH is not counted;
 *   - creates with `visible: false` stay uncounted, as before.
 *
 * Real routes and the real ownership gate; mocked seams: the database (in
 * memory, with rollback), the indexer, the signature, the nonce, events, the
 * limiter.
 */

const OWNER = 'bc1powner0000000000000000000000000000000000';
const BLOCK = 840000;
const OTHER_BLOCK = 700000;

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
  verifyBlockOwnedBy: async (wallet: string, height: number) =>
    wallet === 'bc1powner0000000000000000000000000000000000' && height === 840000
      ? { verified: true, inscriptionId: 'insc_i0' }
      : { verified: false, reason: 'not held' },
}));
jest.mock('@/lib/api-helpers', () => ({ verifyWalletSignature: () => true }));
const mockConsumeChallenge = jest.fn(async () => true);
jest.mock('@/lib/challenges', () => ({ consumeChallenge: () => mockConsumeChallenge() }));
jest.mock('@/lib/action-message', () => ({
  verifyActionBinding: () => ({ ok: true, nonce: 'nonce_1' }),
  hashBody: async () => 'bodyhash',
}));
jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: async () => undefined }));
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  WORLD_WRITE_LIMIT: 60,
  WORLD_BATCH_LIMIT: 20,
}));

import prisma from '@/lib/prisma';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { MAX_PLACEMENTS } from '@/lib/world/types';
import { POST as BATCH } from '@/app/api/v1/world/batch/route';
import { PATCH } from '@/app/api/v1/world/[id]/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const CAP_BODY = {
  success: false,
  error: `This block already has ${MAX_PLACEMENTS} objects; remove one first.`,
  code: 'too_many_placements',
};

function agentReq(token: string, body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? `Bearer ${token}` : null) },
  } as never;
}
function walletReq(body: Record<string, unknown>) {
  return { json: async () => body, headers: { get: () => null } } as never;
}
const at = (id: string) => ({ params: Promise.resolve({ id }) });

async function token(): Promise<string> {
  return (await mintVerifiedSession(OWNER, [BLOCK])).token;
}

/** Seed `n` visible objects on the block, plus one hidden one (`obj_hidden`). */
async function seed(n: number, block = BLOCK) {
  for (let i = 0; i < n; i++) {
    await db.blockObject.create({
      data: { id: `obj_${block}_${i}`, blockHeight: block, ownerAddress: OWNER, objectType: 'cube', locked: false, visible: true },
    });
  }
  await db.blockObject.create({
    data: { id: 'obj_hidden', blockHeight: block, ownerAddress: OWNER, objectType: 'cube', locked: false, visible: false },
  });
}
const total = async () => db.blockObject.count({ where: { blockHeight: BLOCK } });
const visible = async () => db.blockObject.count({ where: { blockHeight: BLOCK, visible: true } });

beforeEach(() => {
  db.__reset();
  jest.clearAllMocks();
  mockConsumeChallenge.mockResolvedValue(true);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('batch creates count against the cap', () => {
  it('199 visible + 2 visible creates: 409, nothing created', async () => {
    await seed(MAX_PLACEMENTS - 1);
    const before = await total();
    const res: any = await BATCH(
      agentReq(await token(), {
        blockHeight: BLOCK,
        operations: [
          { action: 'create', data: { objectType: 'cube' } },
          { action: 'create', data: { objectType: 'cube', visible: true } },
        ],
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual(CAP_BODY);
    expect(await total()).toBe(before);
  });

  it('198 visible + 2 creates: both created', async () => {
    await seed(MAX_PLACEMENTS - 2);
    const before = await total();
    const res: any = await BATCH(
      agentReq(await token(), {
        blockHeight: BLOCK,
        operations: [
          { action: 'create', data: { objectType: 'cube' } },
          { action: 'create', data: { objectType: 'cube' } },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await total()).toBe(before + 2);
  });

  it('a create with visible: false at the cap is created, as before', async () => {
    await seed(MAX_PLACEMENTS);
    const before = await total();
    const res: any = await BATCH(
      agentReq(await token(), {
        blockHeight: BLOCK,
        operations: [{ action: 'create', data: { objectType: 'cube', visible: false } }],
      }),
    );
    expect(res.status).toBe(200);
    expect(await total()).toBe(before + 1);
  });

  it('200 visible + delete one + create one: applied (a swap at the cap)', async () => {
    await seed(MAX_PLACEMENTS);
    const res: any = await BATCH(
      agentReq(await token(), {
        blockHeight: BLOCK,
        operations: [
          { action: 'delete', id: `obj_${BLOCK}_0` },
          { action: 'create', data: { objectType: 'cube', visible: true } },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(await visible()).toBe(MAX_PLACEMENTS);
  });

  it('a clean-up batch above the cap still applies', async () => {
    await seed(MAX_PLACEMENTS + 5);
    const res: any = await BATCH(
      agentReq(await token(), {
        blockHeight: BLOCK,
        operations: [
          { action: 'delete', id: `obj_${BLOCK}_0` },
          { action: 'update', id: `obj_${BLOCK}_1`, data: { visible: false } },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await visible()).toBe(MAX_PLACEMENTS + 3);
  });

  it('200 visible + a batch update re-showing a hidden object: 409', async () => {
    await seed(MAX_PLACEMENTS);
    const res: any = await BATCH(
      agentReq(await token(), {
        blockHeight: BLOCK,
        operations: [{ action: 'update', id: 'obj_hidden', data: { visible: true } }],
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual(CAP_BODY);
    expect((await db.blockObject.findUnique({ where: { id: 'obj_hidden' } })).visible).toBe(false);
  });

  it('200 visible + hide one, re-show another: applied (net 200)', async () => {
    await seed(MAX_PLACEMENTS);
    const res: any = await BATCH(
      agentReq(await token(), {
        blockHeight: BLOCK,
        operations: [
          { action: 'update', id: `obj_${BLOCK}_0`, data: { visible: false } },
          { action: 'update', id: 'obj_hidden', data: { visible: true } },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await visible()).toBe(MAX_PLACEMENTS);
  });

  it('objects on another block do not count', async () => {
    await seed(MAX_PLACEMENTS, OTHER_BLOCK);
    const res: any = await BATCH(
      agentReq(await token(), {
        blockHeight: BLOCK,
        operations: [{ action: 'create', data: { objectType: 'cube' } }],
      }),
    );
    expect(res.status).toBe(200);
  });

  it('a batch refused for the cap leaves its nonce unspent', async () => {
    await seed(MAX_PLACEMENTS);
    const res: any = await BATCH(
      walletReq({
        blockHeight: BLOCK,
        ownerAddress: OWNER,
        signature: 'sig',
        message: 'signed batch',
        operations: [{ action: 'create', data: { objectType: 'cube' } }],
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual(CAP_BODY);
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
  });
});

describe('PATCH re-showing a hidden object counts against the cap', () => {
  it('200 visible + re-show: 409, the object stays hidden', async () => {
    await seed(MAX_PLACEMENTS);
    const res: any = await PATCH(agentReq(await token(), { visible: true }), at('obj_hidden'));
    expect(res.status).toBe(409);
    expect(res.body).toEqual(CAP_BODY);
    expect((await db.blockObject.findUnique({ where: { id: 'obj_hidden' } })).visible).toBe(false);
  });

  it('199 visible + re-show: OK', async () => {
    await seed(MAX_PLACEMENTS - 1);
    const res: any = await PATCH(agentReq(await token(), { visible: true }), at('obj_hidden'));
    expect(res.status).toBe(200);
    expect(await visible()).toBe(MAX_PLACEMENTS);
  });

  it('200 visible + a colour change: OK, not counted', async () => {
    await seed(MAX_PLACEMENTS);
    const res: any = await PATCH(agentReq(await token(), { color: '#ff0000' }), at(`obj_${BLOCK}_3`));
    expect(res.status).toBe(200);
    const hidden: any = await PATCH(agentReq(await token(), { color: '#00ff00' }), at('obj_hidden'));
    expect(hidden.status).toBe(200);
  });

  it('200 visible + visible: true on an object already shown: OK', async () => {
    await seed(MAX_PLACEMENTS);
    const res: any = await PATCH(agentReq(await token(), { visible: true }), at(`obj_${BLOCK}_3`));
    expect(res.status).toBe(200);
  });
});

describe('a wallet PATCH refused for the cap or a lock keeps its one-time code', () => {
  const signed = (fields: Record<string, unknown>) =>
    walletReq({ ownerAddress: OWNER, signature: 'sig', message: 'signed edit', ...fields });
  async function seedLocked() {
    await db.blockObject.create({
      data: { id: 'obj_locked', blockHeight: BLOCK, ownerAddress: OWNER, objectType: 'cube', locked: true, visible: true },
    });
  }

  it('200 visible + re-show: 409, the nonce is not consumed', async () => {
    await seed(MAX_PLACEMENTS);
    const res: any = await PATCH(signed({ visible: true }), at('obj_hidden'));
    expect(res.status).toBe(409);
    expect(res.body).toEqual(CAP_BODY);
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
    expect((await db.blockObject.findUnique({ where: { id: 'obj_hidden' } })).visible).toBe(false);
  });

  it('an edit of a locked object: the lock refusal, the nonce is not consumed', async () => {
    await seed(3);
    await seedLocked();
    const res: any = await PATCH(signed({ color: '#ff0000' }), at('obj_locked'));
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('Object obj_locked is locked.');
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
  });

  it('199 visible + re-show: applied, the nonce consumed once', async () => {
    await seed(MAX_PLACEMENTS - 1);
    const res: any = await PATCH(signed({ visible: true }), at('obj_hidden'));
    expect(res.status).toBe(200);
    expect(await visible()).toBe(MAX_PLACEMENTS);
    expect(mockConsumeChallenge).toHaveBeenCalledTimes(1);
  });

  it('an unlock of a locked object still applies, the nonce consumed once', async () => {
    await seed(3);
    await seedLocked();
    const res: any = await PATCH(signed({ locked: false }), at('obj_locked'));
    expect(res.status).toBe(200);
    expect((await db.blockObject.findUnique({ where: { id: 'obj_locked' } })).locked).toBe(false);
    expect(mockConsumeChallenge).toHaveBeenCalledTimes(1);
  });
});
