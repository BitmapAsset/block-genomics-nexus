/**
 * SIMULATED BITMAP TRANSFER — do the OBJECT-level routes follow the deed?
 *
 * `block-transfer-edit-rights` proves this for world objects. The same rule has
 * to hold for everything else standing on a block — guardians, quests, game
 * elements — and it did not: those routes authorized on the object row's stored
 * `ownerAddress`, which is the seller's address and stays the seller's address
 * forever. Attribution was being read as permission.
 *
 * Two consequences, both proven below. A buyer could not administer a guardian
 * on land they had just bought, and a seller kept that power over land they had
 * sold. The second half survives even a completed reconciliation, because
 * `processOwnershipTransfer` wipes a released guardian's CONTENTS but leaves
 * `ownerAddress` naming the seller — so the stale-permission read outlives the
 * sync it was assumed to be racing.
 *
 * These drive the REAL route handlers. Only the seams are mocked — database,
 * signature check, nonce store, limiter, indexer — so the authorization chain
 * runs for real. The indexer mock IS the simulated chain: moving `chainOwner` is
 * the sale, and NOTHING else in the fixture changes. Every stored row keeps
 * naming ALICE throughout, which is the point: the cache and the chain disagree,
 * and only the chain may decide.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

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

const mockGuardianFindUnique = jest.fn();
const mockGuardianUpdate = jest.fn();
const mockGuardianUpsert = jest.fn();
const mockQuestFindUnique = jest.fn();
const mockQuestUpdate = jest.fn();
const mockQuestDelete = jest.fn();
const mockElementFindUnique = jest.fn();
const mockElementUpdate = jest.fn();
const mockElementDelete = jest.fn();
const mockElementCreate = jest.fn();
const mockBlockFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    guardianAgent: {
      findUnique: (...a: unknown[]) => mockGuardianFindUnique(...a),
      update: (...a: unknown[]) => mockGuardianUpdate(...a),
      upsert: (...a: unknown[]) => mockGuardianUpsert(...a),
    },
    gameQuest: {
      findUnique: (...a: unknown[]) => mockQuestFindUnique(...a),
      update: (...a: unknown[]) => mockQuestUpdate(...a),
      delete: (...a: unknown[]) => mockQuestDelete(...a),
    },
    gameElement: {
      findUnique: (...a: unknown[]) => mockElementFindUnique(...a),
      update: (...a: unknown[]) => mockElementUpdate(...a),
      delete: (...a: unknown[]) => mockElementDelete(...a),
      create: (...a: unknown[]) => mockElementCreate(...a),
    },
    block: { findUnique: (...a: unknown[]) => mockBlockFindUnique(...a) },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
  },
}));

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string, height: number) => {
    if (indexerDown) return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    if (wallet === chainOwner && height === BLOCK) return { verified: true, inscriptionId: 'insc_i0' };
    return { verified: false, reason: `No .bitmap inscription for block ${height} is held by this wallet` };
  },
}));

// Signature verification has its own suite. Here every signature is valid, so a
// denial can only ever come from the ownership decision under test.
jest.mock('@/lib/api-helpers', () => ({
  verifyWalletSignature: () => true,
  sanitizeString: (s: string) => s,
  success: (data: unknown, status = 200, headers?: Record<string, string>) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('next/server').NextResponse.json({ success: true, data }, { status, headers }),
  error: (message: string, status = 400) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('next/server').NextResponse.json({ success: false, error: message }, { status }),
}));

// Nonce freshness has its own suite (guardian-heartbeat-replay). Here every
// nonce is fresh, so a denial can only ever come from the ownership decision.
const mockConsumeChallenge = jest.fn(async () => true);
jest.mock('@/lib/challenges', () => ({
  consumeChallenge: () => mockConsumeChallenge(),
  consumeChallengeFromMessage: () => mockConsumeChallenge(),
}));

jest.mock('@/lib/action-message', () => ({
  verifyActionBinding: () => ({ ok: true, nonce: 'nonce_1' }),
  hashBody: async () => 'bodyhash',
}));

jest.mock('@/lib/key-encryption', () => ({
  encryptApiKey: (k: string) => `enc:${k}`,
  maskApiKey: () => '****',
}));

const mockGenerateMonitorToken = jest.fn(async () => 'mon_token_1');
const mockRevokeMonitorToken = jest.fn(async () => undefined);
jest.mock('@/lib/monitor-tokens', () => ({
  generateMonitorToken: (...a: unknown[]) => mockGenerateMonitorToken(...(a as [])),
  revokeMonitorToken: (...a: unknown[]) => mockRevokeMonitorToken(...(a as [])),
}));

// The limiter has its own suite; here it must never be the reason a case passes
// or fails, so it is a pass-through.
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
}));

import { POST as GUARDIAN_CREATE } from '@/app/api/v1/guardian/route';
import { PATCH as GUARDIAN_PATCH, DELETE as GUARDIAN_DELETE } from '@/app/api/v1/guardian/[id]/route';
import { POST as MONITOR_PAIR, DELETE as MONITOR_REVOKE } from '@/app/api/v1/guardian/monitor/route';
import { POST as HEARTBEAT } from '@/app/api/v1/guardian/heartbeat/route';
import { PATCH as QUEST_PATCH, DELETE as QUEST_DELETE } from '@/app/api/v1/game/quests/[id]/route';
import { PATCH as ELEMENT_PATCH, DELETE as ELEMENT_DELETE } from '@/app/api/v1/game/elements/[id]/route';
import { POST as ELEMENT_CREATE } from '@/app/api/v1/game/elements/route';

// ── Fixtures ─────────────────────────────────────────────────────────────
/** Objects Alice placed while she owned the block. Never re-attributed. */
const alicesGuardian = (o: Record<string, unknown> = {}) => ({
  id: 'grd_1', blockHeight: BLOCK, ownerAddress: ALICE, name: 'Sentinel',
  selfHosted: true, soulMd: 'soul', status: 'active', ...o,
});
const alicesQuest = (o: Record<string, unknown> = {}) => ({
  id: 'qst_1', blockHeight: BLOCK, ownerAddress: ALICE, name: 'Find the key', ...o,
});
const alicesElement = (o: Record<string, unknown> = {}) => ({
  id: 'elm_1', blockHeight: BLOCK, ownerAddress: ALICE, gameType: 'coin', ...o,
});

const signed = (wallet: string, extra: Record<string, unknown> = {}) =>
  ({ ownerAddress: wallet, signature: 'sig', message: 'msg', ...extra });

function req(body: Record<string, unknown>, url = 'https://bg.test/api') {
  return { json: async () => body, headers: { get: () => null }, url, nextUrl: new URL(url) } as never;
}

/** guardian/[id] DELETE takes its credential from the query string. */
function deleteReq(wallet: string) {
  const u = `https://bg.test/api/v1/guardian/grd_1?ownerAddress=${wallet}&signature=sig&message=msg`;
  return { json: async () => ({}), headers: { get: () => null }, url: u, nextUrl: new URL(u) } as never;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  chainOwner = ALICE;
  indexerDown = false;
  jest.clearAllMocks();
  mockConsumeChallenge.mockResolvedValue(true);
  mockGenerateMonitorToken.mockResolvedValue('mon_token_1');
  mockGuardianFindUnique.mockResolvedValue(alicesGuardian());
  mockGuardianUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...alicesGuardian(), ...data }));
  mockGuardianUpsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'grd_new', ...create }));
  mockQuestFindUnique.mockResolvedValue(alicesQuest());
  mockQuestUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...alicesQuest(), ...data }));
  mockQuestDelete.mockResolvedValue(alicesQuest());
  mockElementFindUnique.mockResolvedValue(alicesElement());
  mockElementUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...alicesElement(), ...data }));
  mockElementDelete.mockResolvedValue(alicesElement());
  mockElementCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'elm_new', ...data }));
  // The cache still names ALICE everywhere. Only the chain moves.
  mockBlockFindUnique.mockResolvedValue({ height: BLOCK, ownerAddress: ALICE, inscriptionId: 'insc_i0' });
  mockUserFindUnique.mockResolvedValue({ walletAddress: BOB, tier: 1 });
});

// ── The buyer must be able to administer what they bought ─────────────────
describe('SIM: the buyer inherits control of the objects on their block', () => {
  it('lets the NEW owner reconfigure a guardian the PREVIOUS owner installed', async () => {
    chainOwner = BOB;

    const res: any = await GUARDIAN_PATCH(req(signed(BOB, { name: 'Bob Sentinel' })), params('grd_1'));

    expect(res.status).toBe(200);
    expect(mockGuardianUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'grd_1' }, data: expect.objectContaining({ name: 'Bob Sentinel' }) })
    );
  });

  it('lets the NEW owner deactivate the PREVIOUS owner\'s guardian', async () => {
    chainOwner = BOB;

    const res: any = await GUARDIAN_DELETE(deleteReq(BOB), params('grd_1'));

    expect(res.status).toBe(200);
    expect(mockGuardianUpdate).toHaveBeenCalledWith({ where: { id: 'grd_1' }, data: { status: 'stopped' } });
  });

  it('lets the NEW owner pair a monitor to the guardian on their block', async () => {
    chainOwner = BOB;

    const res: any = await MONITOR_PAIR(req(signed(BOB, { guardianId: 'grd_1' })));

    expect(res.status).toBe(200);
    expect(mockGenerateMonitorToken).toHaveBeenCalled();
  });

  it('lets the NEW owner revoke a monitor token the seller minted', async () => {
    chainOwner = BOB;

    const res: any = await MONITOR_REVOKE(req(signed(BOB, { guardianId: 'grd_1' })));

    expect(res.status).toBe(200);
    expect(mockRevokeMonitorToken).toHaveBeenCalledWith('grd_1');
  });

  it('lets the NEW owner edit a quest the PREVIOUS owner wrote', async () => {
    chainOwner = BOB;

    const res: any = await QUEST_PATCH(req(signed(BOB, { name: 'Bob quest' })), params('qst_1'));

    expect(res.status).toBe(200);
    expect(mockQuestUpdate).toHaveBeenCalled();
  });

  it('lets the NEW owner delete a game element the PREVIOUS owner placed', async () => {
    chainOwner = BOB;

    const res: any = await ELEMENT_DELETE(req(signed(BOB)), params('elm_1'));

    expect(res.status).toBe(200);
    expect(mockElementDelete).toHaveBeenCalledWith({ where: { id: 'elm_1' } });
  });

  it('lets the NEW owner place a game element while the cache still names the seller', async () => {
    // This is the sale→sync window: `Block.ownerAddress` is still ALICE.
    chainOwner = BOB;

    const res: any = await ELEMENT_CREATE(req(signed(BOB, { blockHeight: BLOCK, gameType: 'coin' })));

    expect(res.status).toBe(201);
    expect(mockElementCreate).toHaveBeenCalled();
  });
});

// ── The seller must lose it the instant the inscription moves ─────────────
describe('SIM: the seller loses control the instant the inscription moves', () => {
  it('refuses the SELLER reconfiguring a guardian on land she sold', async () => {
    chainOwner = BOB;

    const res: any = await GUARDIAN_PATCH(req(signed(ALICE, { name: 'still mine' })), params('grd_1'));

    expect(res.status).toBe(403);
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
  });

  it('refuses the SELLER re-arming a RELEASED guardian shell after reconciliation', async () => {
    // `processOwnershipTransfer` wipes the guardian's contents but leaves
    // `ownerAddress` naming the seller, so a stored-owner check would hand her
    // back a blank agent on the buyer's land — with a fresh soul and LLM key.
    chainOwner = BOB;
    mockGuardianFindUnique.mockResolvedValue(alicesGuardian({ status: 'released', soulMd: '' }));

    const res: any = await GUARDIAN_PATCH(
      req(signed(ALICE, { soulMd: 'resurrected', llmApiKey: 'sk-secret', status: 'active' })),
      params('grd_1')
    );

    expect(res.status).toBe(403);
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
  });

  it('refuses the SELLER deactivating the guardian after the sale', async () => {
    chainOwner = BOB;

    const res: any = await GUARDIAN_DELETE(deleteReq(ALICE), params('grd_1'));

    expect(res.status).toBe(403);
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
  });

  it('refuses the SELLER minting a monitor token on land she sold', async () => {
    // A monitor token is a live read channel onto the block's guardian traffic.
    chainOwner = BOB;

    const res: any = await MONITOR_PAIR(req(signed(ALICE, { guardianId: 'grd_1' })));

    expect(res.status).toBe(403);
    expect(mockGenerateMonitorToken).not.toHaveBeenCalled();
  });

  it('refuses the SELLER keeping a sold block\'s guardian marked live', async () => {
    // Heartbeat writes `endpointVerified: true` and points visitors at the
    // seller's own server. That is a live capability, not a status ping.
    chainOwner = BOB;

    const res: any = await HEARTBEAT(req(signed(ALICE, { guardianId: 'grd_1' })));

    expect(res.status).toBe(403);
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
  });

  it('refuses the SELLER editing a quest after the sale', async () => {
    chainOwner = BOB;

    const res: any = await QUEST_PATCH(req(signed(ALICE, { name: 'still mine' })), params('qst_1'));

    expect(res.status).toBe(403);
    expect(mockQuestUpdate).not.toHaveBeenCalled();
  });

  it('refuses the SELLER deleting a quest after the sale', async () => {
    chainOwner = BOB;

    const res: any = await QUEST_DELETE(req(signed(ALICE)), params('qst_1'));

    expect(res.status).toBe(403);
    expect(mockQuestDelete).not.toHaveBeenCalled();
  });

  it('refuses the SELLER editing a game element after the sale', async () => {
    chainOwner = BOB;

    const res: any = await ELEMENT_PATCH(req(signed(ALICE, { color: '#ff0000' })), params('elm_1'));

    expect(res.status).toBe(403);
    expect(mockElementUpdate).not.toHaveBeenCalled();
  });

  it('refuses the SELLER placing a NEW element on the cache\'s strength alone', async () => {
    // `Block.ownerAddress` still names ALICE. That must buy her nothing.
    chainOwner = BOB;
    mockUserFindUnique.mockResolvedValue({ walletAddress: ALICE, tier: 1 });

    const res: any = await ELEMENT_CREATE(req(signed(ALICE, { blockHeight: BLOCK, gameType: 'coin' })));

    expect(res.status).toBe(403);
    expect(mockElementCreate).not.toHaveBeenCalled();
  });
});

// ── Strangers, and blocks you do not hold ────────────────────────────────
describe('SIM: everyone else is still refused', () => {
  it('refuses a stranger installing a guardian on a block they do not own', async () => {
    // The create path asked for a signature and nothing else, so any wallet
    // could stand an agent up on any block and be recorded as its owner.
    const res: any = await GUARDIAN_CREATE(req(signed(CAROL, { blockHeight: BLOCK, name: 'Squatter' })));

    expect(res.status).toBe(403);
    expect(mockGuardianUpsert).not.toHaveBeenCalled();
  });

  it('lets the live block owner install a guardian', async () => {
    const res: any = await GUARDIAN_CREATE(req(signed(ALICE, { blockHeight: BLOCK, name: 'Sentinel' })));

    expect(res.status).toBe(200);
    expect(mockGuardianUpsert).toHaveBeenCalled();
  });

  it('refuses a stranger editing a quest', async () => {
    const res: any = await QUEST_PATCH(req(signed(CAROL, { name: 'mine now' })), params('qst_1'));

    expect(res.status).toBe(403);
    expect(mockQuestUpdate).not.toHaveBeenCalled();
  });

  it('refuses the owner of a DIFFERENT block from touching this guardian', async () => {
    // Bob holds OTHER_BLOCK; the guardian lives on BLOCK. The route derives the
    // height from the stored object, so his real ownership buys him nothing.
    chainOwner = BOB;
    mockGuardianFindUnique.mockResolvedValue(alicesGuardian({ blockHeight: OTHER_BLOCK }));

    const res: any = await GUARDIAN_PATCH(req(signed(BOB, { name: 'reach' })), params('grd_1'));

    expect(res.status).toBe(403);
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
  });

  it('refuses a game element write aimed at a block the caller does not hold', async () => {
    chainOwner = BOB;
    mockElementFindUnique.mockResolvedValue(alicesElement({ blockHeight: OTHER_BLOCK }));

    const res: any = await ELEMENT_PATCH(req(signed(BOB, { color: '#00ff00' })), params('elm_1'));

    expect(res.status).toBe(403);
    expect(mockElementUpdate).not.toHaveBeenCalled();
  });
});

// ── Fail-closed on an unreadable chain ───────────────────────────────────
describe('SIM: an unreadable chain is a retry, never a grant', () => {
  it('answers 503 rather than falling back to the stored owner (guardian)', async () => {
    chainOwner = BOB;
    indexerDown = true;

    const res: any = await GUARDIAN_PATCH(req(signed(ALICE, { name: 'outage' })), params('grd_1'));

    expect(res.status).toBe(503);
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
  });

  it('answers 503 rather than falling back to the stored owner (quest)', async () => {
    indexerDown = true;

    const res: any = await QUEST_PATCH(req(signed(ALICE, { name: 'outage' })), params('qst_1'));

    expect(res.status).toBe(503);
    expect(mockQuestUpdate).not.toHaveBeenCalled();
  });

  it('does not burn the one-time nonce when the chain is unreadable', async () => {
    // Otherwise an indexer blip costs the user a fresh wallet signature for a
    // request that never had a chance to apply.
    chainOwner = BOB;
    indexerDown = true;

    await ELEMENT_PATCH(req(signed(BOB, { color: '#00ff00' })), params('elm_1'));

    expect(mockConsumeChallenge).not.toHaveBeenCalled();
  });

  it('does not burn the nonce on element CREATE when the chain is unreadable', async () => {
    chainOwner = BOB;
    indexerDown = true;

    await ELEMENT_CREATE(req(signed(BOB, { blockHeight: BLOCK, gameType: 'coin' })));

    expect(mockConsumeChallenge).not.toHaveBeenCalled();
    expect(mockElementCreate).not.toHaveBeenCalled();
  });
});
