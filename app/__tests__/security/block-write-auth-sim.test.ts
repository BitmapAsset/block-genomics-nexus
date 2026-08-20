/**
 * ISOLATED SIMULATION — the decision layer behind "who may change this object".
 *
 * `lib/block-write-auth.ts` answers two questions the world routes ask on every
 * mutation, and both are easier to get wrong than they look:
 *
 *   requireSignedBlockOwner — does this signature-proved wallet hold the block
 *       RIGHT NOW? The interesting property is what it must NOT do: read the
 *       `Block.ownerAddress` cache. Asserted here by making the cache lie.
 *   authorizeObjectWrite    — everything left once ownership is proved. It must
 *       be blind to authorship (the point of the feature) while still refusing a
 *       cross-block target (the hole that blindness could open).
 *
 * The batch route gets its own cases because it is the only one that takes object
 * ids from the request body while taking the block from a separate field — so it
 * is the only place where "I own block A" could be pointed at an object on B.
 */

const OWNER = 'bc1powner00000000000000000000000000000000000';
const STRANGER = 'bc1pstranger000000000000000000000000000000000';
const BLOCK = 840000;
const OTHER_BLOCK = 700000;

let chainOwner: string = OWNER;
let indexerDown = false;
let seenInscriptionId: string | null | undefined;

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

const mockBlockFindUnique = jest.fn();
const mockObjectFindMany = jest.fn();
const mockObjectUpdate = jest.fn();
const mockObjectDelete = jest.fn();
const mockObjectCreate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    block: { findUnique: (...a: unknown[]) => mockBlockFindUnique(...a) },
    blockObject: {
      findMany: (...a: unknown[]) => mockObjectFindMany(...a),
      update: (...a: unknown[]) => mockObjectUpdate(...a),
      delete: (...a: unknown[]) => mockObjectDelete(...a),
      create: (...a: unknown[]) => mockObjectCreate(...a),
    },
  },
}));

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string, height: number, inscriptionId?: string | null) => {
    seenInscriptionId = inscriptionId;
    if (indexerDown) return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    if (wallet === chainOwner && height === BLOCK) return { verified: true };
    return { verified: false, reason: 'not held' };
  },
}));

jest.mock('@/lib/api-helpers', () => ({ verifyWalletSignature: () => true }));
const mockConsumeChallenge = jest.fn(async () => true);
jest.mock('@/lib/challenges', () => ({ consumeChallenge: (...a: unknown[]) => mockConsumeChallenge(...a) }));
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

import { requireSignedBlockOwner, authorizeObjectWrite } from '@/lib/block-write-auth';
import { POST as BATCH } from '@/app/api/v1/world/batch/route';

beforeEach(() => {
  chainOwner = OWNER;
  indexerDown = false;
  seenInscriptionId = undefined;
  jest.clearAllMocks();
  mockConsumeChallenge.mockResolvedValue(true);
  mockBlockFindUnique.mockResolvedValue({ inscriptionId: 'insc_i0' });
  mockObjectUpdate.mockResolvedValue({});
  mockObjectDelete.mockResolvedValue({});
  mockObjectCreate.mockResolvedValue({ id: 'obj_new' });
});

// ── requireSignedBlockOwner ──────────────────────────────────────────────
describe('SIM: requireSignedBlockOwner — the chain decides, not the cache', () => {
  it('grants the wallet the chain currently names as holder', async () => {
    const res = await requireSignedBlockOwner(OWNER, BLOCK);
    expect(res.ok).toBe(true);
    expect(res.walletAddress).toBe(OWNER);
  });

  it('refuses a wallet the cache still calls the owner but the chain does not', async () => {
    // The exact stale-snapshot window this replaced: sold on-chain, cache not yet
    // synced. A cache read here would grant; the chain says no.
    chainOwner = STRANGER;
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: OWNER, inscriptionId: 'insc_i0' });

    const res = await requireSignedBlockOwner(OWNER, BLOCK);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.code).toBe('ownership_lost');
  });

  it('grants a buyer the cache has not caught up to yet', async () => {
    chainOwner = STRANGER;
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: OWNER, inscriptionId: 'insc_i0' });

    const res = await requireSignedBlockOwner(STRANGER, BLOCK);

    expect(res.ok).toBe(true);
  });

  it('passes the stored inscription id as a hint so the check skips the wallet scan', async () => {
    await requireSignedBlockOwner(OWNER, BLOCK);
    expect(seenInscriptionId).toBe('insc_i0');
  });

  it('still answers when the hint lookup fails — a DB outage costs speed, not the answer', async () => {
    mockBlockFindUnique.mockRejectedValue(new Error('db down'));

    const res = await requireSignedBlockOwner(OWNER, BLOCK);

    expect(seenInscriptionId).toBeNull();
    expect(res.ok).toBe(true);
  });

  it('returns a retryable 503 when no indexer can answer, never a grant', async () => {
    indexerDown = true;
    const res = await requireSignedBlockOwner(OWNER, BLOCK);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(res.code).toBe('onchain_unavailable');
  });

  it('rejects a nonsense block height before spending an indexer call', async () => {
    const res = await requireSignedBlockOwner(OWNER, -1);
    expect(res.status).toBe(400);
    expect(seenInscriptionId).toBeUndefined();
  });
});

// ── authorizeObjectWrite ─────────────────────────────────────────────────
describe('SIM: authorizeObjectWrite — blind to authorship, strict about scope', () => {
  const obj = (o: Record<string, unknown> = {}) => ({ id: 'obj_1', blockHeight: BLOCK, locked: false, ...o });

  it('allows a write to any object on the proved block, whoever placed it', () => {
    expect(authorizeObjectWrite(obj(), BLOCK).ok).toBe(true);
  });

  it('decides identically for objects whose only difference is who created them', () => {
    // Guards against a future "just read the owner for one edge case": if the
    // creator ever re-enters the decision, these two stop matching.
    const mine = authorizeObjectWrite({ ...obj(), ownerAddress: OWNER } as never, BLOCK);
    const theirs = authorizeObjectWrite({ ...obj(), ownerAddress: STRANGER } as never, BLOCK);

    expect(theirs).toEqual(mine);
    expect(theirs.ok).toBe(true);
  });

  it('refuses an object standing on a different block than the one proved', () => {
    const res = authorizeObjectWrite(obj({ blockHeight: OTHER_BLOCK }), BLOCK);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.code).toBe('out_of_scope');
  });

  it('refuses an ordinary edit to a locked object', () => {
    expect(authorizeObjectWrite(obj({ locked: true }), BLOCK).ok).toBe(false);
  });

  it('allows the unlock itself, so an inherited lock is never permanent', () => {
    expect(authorizeObjectWrite(obj({ locked: true }), BLOCK, { unlocking: true }).ok).toBe(true);
  });

  it('does not let an unlock intent smuggle a write onto another block', () => {
    const res = authorizeObjectWrite(obj({ blockHeight: OTHER_BLOCK, locked: true }), BLOCK, { unlocking: true });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('out_of_scope');
  });
});

// ── batch route ──────────────────────────────────────────────────────────
describe('SIM: batch route — one owned block is not a credential for another', () => {
  const batchReq = (body: Record<string, unknown>) =>
    ({ json: async () => body, headers: { get: () => null } }) as never;

  const batch = (operations: unknown[], wallet = OWNER, blockHeight = BLOCK) =>
    BATCH(batchReq({ blockHeight, ownerAddress: wallet, operations, signature: 'sig', message: 'msg' }));

  it('updates an object placed by a previous owner', async () => {
    mockObjectFindMany.mockResolvedValue([{ id: 'obj_prev', blockHeight: BLOCK, locked: false }]);

    const res: any = await batch([{ action: 'update', id: 'obj_prev', data: { color: '#00ff00' } }]);

    expect(res.status).toBe(200);
    expect(mockObjectUpdate).toHaveBeenCalledWith({ where: { id: 'obj_prev' }, data: { color: '#00ff00' } });
  });

  it('never selects the creator address when loading batch targets', async () => {
    mockObjectFindMany.mockResolvedValue([{ id: 'obj_prev', blockHeight: BLOCK, locked: false }]);

    await batch([{ action: 'delete', id: 'obj_prev' }]);

    const [{ select }] = mockObjectFindMany.mock.calls[0] as [{ select: Record<string, boolean> }];
    expect(select).not.toHaveProperty('ownerAddress');
    expect(select.blockHeight).toBe(true);
  });

  it('rejects the whole batch when a sub-op targets an object on another block', async () => {
    mockObjectFindMany.mockResolvedValue([
      { id: 'obj_mine', blockHeight: BLOCK, locked: false },
      { id: 'obj_theirs', blockHeight: OTHER_BLOCK, locked: false },
    ]);

    const res: any = await batch([
      { action: 'update', id: 'obj_mine', data: { color: '#00ff00' } },
      { action: 'delete', id: 'obj_theirs' },
    ]);

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('out_of_scope');
    // Nothing partially applied, and the nonce survives for a corrected retry.
    expect(mockObjectUpdate).not.toHaveBeenCalled();
    expect(mockObjectDelete).not.toHaveBeenCalled();
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
  });

  it('refuses a caller who does not hold the block on-chain', async () => {
    chainOwner = STRANGER;
    mockObjectFindMany.mockResolvedValue([{ id: 'obj_prev', blockHeight: BLOCK, locked: false }]);

    const res: any = await batch([{ action: 'delete', id: 'obj_prev' }]);

    expect(res.status).toBe(403);
    expect(mockObjectDelete).not.toHaveBeenCalled();
  });

  it('refuses a locked target rather than silently skipping it', async () => {
    mockObjectFindMany.mockResolvedValue([{ id: 'obj_locked', blockHeight: BLOCK, locked: true }]);

    const res: any = await batch([{ action: 'update', id: 'obj_locked', data: { color: '#00ff00' } }]);

    expect(res.status).toBe(403);
    expect(mockObjectUpdate).not.toHaveBeenCalled();
  });

  it('answers 503 and preserves the nonce when the chain is unreadable', async () => {
    indexerDown = true;
    mockObjectFindMany.mockResolvedValue([]);

    const res: any = await batch([{ action: 'create', data: { objectType: 'mesh' } }]);

    expect(res.status).toBe(503);
    expect(mockConsumeChallenge).not.toHaveBeenCalled();
    expect(mockObjectCreate).not.toHaveBeenCalled();
  });
});
