/**
 * SIMULATED BITMAP TRANSFER — does control of a block's objects follow the deed?
 *
 * The product rule this proves: whoever holds the `.bitmap` inscription right now
 * owns everything standing on that block. A buyer must be able to edit and delete
 * objects the seller placed, and the seller must lose that power the moment the
 * inscription moves — with no cache-sync delay in between, because the seller
 * keeping write access to sold property is the expensive half of this bug.
 *
 * These drive the REAL route handlers. Only the seams are mocked — the database,
 * the signature check, the nonce store, the limiter, and the indexer — so the
 * authorization chain under test (route → block-write-auth → ownership-gate) runs
 * for real. The indexer mock is the simulated chain: moving `chainOwner` IS the
 * transfer, and nothing else in the fixture changes.
 *
 * Note what is deliberately NOT reset on transfer: the stored object still
 * carries the seller's address. That is the provenance case — attribution
 * survives the sale, control does not.
 */

// ── The simulated chain ──────────────────────────────────────────────────
const ALICE = 'bc1pseller0000000000000000000000000000000000';
const BOB = 'bc1pbuyer00000000000000000000000000000000000';
const CAROL = 'bc1pstranger000000000000000000000000000000000';
const BLOCK = 840000;
const OTHER_BLOCK = 700000;

let chainOwner: string = ALICE;
let indexerDown = false;

// ── Mocks ────────────────────────────────────────────────────────────────
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

const mockObjectFindUnique = jest.fn();
const mockObjectUpdate = jest.fn();
const mockObjectDelete = jest.fn();
const mockObjectCreate = jest.fn();
const mockBlockFindUnique = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    blockObject: {
      findUnique: (...a: unknown[]) => mockObjectFindUnique(...a),
      update: (...a: unknown[]) => mockObjectUpdate(...a),
      delete: (...a: unknown[]) => mockObjectDelete(...a),
      create: (...a: unknown[]) => mockObjectCreate(...a),
    },
    block: { findUnique: (...a: unknown[]) => mockBlockFindUnique(...a) },
  },
}));

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string, height: number) => {
    if (indexerDown) return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    if (wallet === chainOwner && height === BLOCK) return { verified: true, inscriptionId: 'insc_i0' };
    return { verified: false, reason: `No .bitmap inscription for block ${height} is held by this wallet` };
  },
}));

jest.mock('@/lib/api-helpers', () => ({ verifyWalletSignature: () => true }));

const mockConsumeChallenge = jest.fn(async (..._args: unknown[]) => true);
jest.mock('@/lib/challenges', () => ({ consumeChallenge: (...a: unknown[]) => mockConsumeChallenge(...a) }));

jest.mock('@/lib/action-message', () => ({
  verifyActionBinding: () => ({ ok: true, nonce: 'nonce_1' }),
  hashBody: async () => 'bodyhash',
}));

jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: async () => undefined }));

// The limiter has its own suite; here it must never be the reason a case passes
// or fails, so it is a pass-through.
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  WORLD_WRITE_LIMIT: 60,
  WORLD_BATCH_LIMIT: 20,
}));

import { PATCH, DELETE } from '@/app/api/v1/world/[id]/route';
import { POST as CREATE } from '@/app/api/v1/world/route';

// ── Fixture ──────────────────────────────────────────────────────────────
/** The object Alice placed while she owned the block. Never re-attributed. */
function alicesObject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'obj_alice_1',
    blockHeight: BLOCK,
    ownerAddress: ALICE,
    objectType: 'mesh',
    locked: false,
    ...overrides,
  };
}

/** A signed request body. The signature/binding/nonce seams are mocked valid. */
function signedBody(wallet: string, extra: Record<string, unknown> = {}) {
  return { ownerAddress: wallet, signature: 'sig', message: 'msg', ...extra };
}

function req(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: { get: () => null },
  } as never;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  chainOwner = ALICE;
  indexerDown = false;
  jest.clearAllMocks();
  mockConsumeChallenge.mockResolvedValue(true);
  mockObjectFindUnique.mockResolvedValue(alicesObject());
  mockObjectUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...alicesObject(),
    ...data,
  }));
  mockObjectDelete.mockResolvedValue(alicesObject());
  mockObjectCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'obj_new', ...data }));
  mockBlockFindUnique.mockResolvedValue({ inscriptionId: 'insc_i0' });
});

// ── The transfer ─────────────────────────────────────────────────────────
describe('SIM: bitmap transfer — the buyer inherits control of the block', () => {
  it('lets the NEW owner edit an object the PREVIOUS owner placed', async () => {
    chainOwner = BOB;

    const res: any = await PATCH(req(signedBody(BOB, { color: '#00ff00' })), params('obj_alice_1'));

    expect(res.status).toBe(200);
    expect(mockObjectUpdate).toHaveBeenCalledWith({ where: { id: 'obj_alice_1' }, data: { color: '#00ff00' } });
  });

  it('lets the NEW owner delete an object the PREVIOUS owner placed', async () => {
    chainOwner = BOB;

    const res: any = await DELETE(req(signedBody(BOB)), params('obj_alice_1'));

    expect(res.status).toBe(200);
    expect(mockObjectDelete).toHaveBeenCalledWith({ where: { id: 'obj_alice_1' } });
  });

  it('lets the NEW owner build on a block whose objects are all the seller\'s', async () => {
    chainOwner = BOB;

    const res: any = await CREATE(req(signedBody(BOB, { blockHeight: BLOCK, objectType: 'mesh' })));

    expect(res.status).toBe(201);
    expect(mockObjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ blockHeight: BLOCK, ownerAddress: BOB }) })
    );
  });

  it('strips the PREVIOUS owner the instant the inscription moves — no cache-sync window', async () => {
    // The DB still names Alice on the object, and a cached Block row would still
    // name her as block owner. Only the chain has moved. That must be enough.
    chainOwner = BOB;

    const res: any = await PATCH(req(signedBody(ALICE, { color: '#ff0000' })), params('obj_alice_1'));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ownership_lost');
    expect(mockObjectUpdate).not.toHaveBeenCalled();
  });

  it('refuses the PREVIOUS owner deleting what she placed, once she has sold', async () => {
    chainOwner = BOB;

    const res: any = await DELETE(req(signedBody(ALICE)), params('obj_alice_1'));

    expect(res.status).toBe(403);
    expect(mockObjectDelete).not.toHaveBeenCalled();
  });

  it('still allows the owner to edit her own object BEFORE any transfer', async () => {
    const res: any = await PATCH(req(signedBody(ALICE, { color: '#111111' })), params('obj_alice_1'));

    expect(res.status).toBe(200);
    expect(mockObjectUpdate).toHaveBeenCalled();
  });
});

describe('SIM: bitmap transfer — provenance survives, control does not', () => {
  it('never rewrites the creator address when the new owner edits', async () => {
    chainOwner = BOB;

    await PATCH(req(signedBody(BOB, { color: '#00ff00', ownerAddress: BOB })), params('obj_alice_1'));

    const [{ data }] = mockObjectUpdate.mock.calls[0] as [{ data: Record<string, unknown> }];
    // `ownerAddress` is in the body twice over — as the signing wallet and as an
    // explicit field — and must still not reach the update.
    expect(data).not.toHaveProperty('ownerAddress');
    expect(data).toEqual({ color: '#00ff00' });
  });

  it('returns the edited object still attributed to its original creator', async () => {
    chainOwner = BOB;

    const res: any = await PATCH(req(signedBody(BOB, { color: '#00ff00' })), params('obj_alice_1'));

    expect((await res.json()).object.ownerAddress).toBe(ALICE);
  });
});

describe('SIM: bitmap transfer — everyone else is still refused', () => {
  it('refuses a wallet that has never owned the block', async () => {
    const res: any = await PATCH(req(signedBody(CAROL, { color: '#abcabc' })), params('obj_alice_1'));

    expect(res.status).toBe(403);
    expect(mockObjectUpdate).not.toHaveBeenCalled();
  });

  it('refuses a stranger even after the block changes hands to someone else', async () => {
    chainOwner = BOB;

    const res: any = await DELETE(req(signedBody(CAROL)), params('obj_alice_1'));

    expect(res.status).toBe(403);
    expect(mockObjectDelete).not.toHaveBeenCalled();
  });

  it('refuses an unsigned, uncredentialed caller with instructions, not a 400', async () => {
    const res: any = await PATCH(req({ color: '#abcabc' }), params('obj_alice_1'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('unverified');
    expect(body.verify.steps.length).toBeGreaterThan(0);
  });

  it('refuses an owner of a DIFFERENT block from touching this object', async () => {
    // Bob holds OTHER_BLOCK; the object lives on BLOCK. The route derives the
    // block from the stored object, so his real ownership buys him nothing here.
    chainOwner = BOB;
    mockObjectFindUnique.mockResolvedValue(alicesObject({ blockHeight: OTHER_BLOCK }));

    const res: any = await PATCH(req(signedBody(BOB, { color: '#00ff00' })), params('obj_alice_1'));

    expect(res.status).toBe(403);
    expect(mockObjectUpdate).not.toHaveBeenCalled();
  });
});

describe('SIM: bitmap transfer — fail-closed on an unreadable chain', () => {
  it('answers 503 (retryable), never a grant, when no indexer can confirm ownership', async () => {
    chainOwner = BOB;
    indexerDown = true;

    const res: any = await PATCH(req(signedBody(BOB, { color: '#00ff00' })), params('obj_alice_1'));

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('onchain_unavailable');
    expect(mockObjectUpdate).not.toHaveBeenCalled();
  });

  it('does not burn the one-time nonce when the chain is unreadable', async () => {
    // Otherwise an indexer blip costs the user a fresh wallet signature for a
    // request that never had a chance to apply.
    chainOwner = BOB;
    indexerDown = true;

    await PATCH(req(signedBody(BOB, { color: '#00ff00' })), params('obj_alice_1'));

    expect(mockConsumeChallenge).not.toHaveBeenCalled();
  });

  it('refuses the previous owner during an outage rather than falling back to cache', async () => {
    chainOwner = BOB;
    indexerDown = true;

    const res: any = await PATCH(req(signedBody(ALICE, { color: '#ff0000' })), params('obj_alice_1'));

    expect(res.status).toBe(503);
    expect(mockObjectUpdate).not.toHaveBeenCalled();
  });
});

describe('SIM: bitmap transfer — a lock the seller left behind is not permanent', () => {
  it('refuses an ordinary edit to a locked object', async () => {
    chainOwner = BOB;
    mockObjectFindUnique.mockResolvedValue(alicesObject({ locked: true }));

    const res: any = await PATCH(req(signedBody(BOB, { color: '#00ff00' })), params('obj_alice_1'));

    expect(res.status).toBe(403);
    expect(mockObjectUpdate).not.toHaveBeenCalled();
  });

  it('lets the new owner clear a lock the previous owner set', async () => {
    chainOwner = BOB;
    mockObjectFindUnique.mockResolvedValue(alicesObject({ locked: true }));

    const res: any = await PATCH(req(signedBody(BOB, { locked: false })), params('obj_alice_1'));

    expect(res.status).toBe(200);
    expect(mockObjectUpdate).toHaveBeenCalledWith({ where: { id: 'obj_alice_1' }, data: { locked: false } });
  });

  it('does not let a stranger clear the lock', async () => {
    chainOwner = BOB;
    mockObjectFindUnique.mockResolvedValue(alicesObject({ locked: true }));

    const res: any = await PATCH(req(signedBody(CAROL, { locked: false })), params('obj_alice_1'));

    expect(res.status).toBe(403);
    expect(mockObjectUpdate).not.toHaveBeenCalled();
  });
});
