/**
 * SIMULATION — guardian chat world actions are scoped to the guardian's block
 * and authorized by the LIVE chain, not the stored guardian owner (bg48 Q-02).
 *
 *   CROSS-BLOCK HIDE — `remove_object` updated by id alone, so an owner whose
 *                      guardian emitted `{"tool":"remove_object","id":<id on B>}`
 *                      hid an object on someone else's block B.
 *   SELLER RETENTION — world actions ran when the signed visitor equalled
 *                      `guardian.ownerAddress`. After a sale (release not yet
 *                      run) that still names the seller, so the seller kept
 *                      building on the buyer's land, on both the JSON path and
 *                      the two-pass build path.
 *
 * Real route, real BIP-322 signatures; mocked seams: DB (in-memory), the LLM,
 * key decryption, notifications, and the indexer (`chainOwner` IS the deed).
 */

const BLOCK_A = 840000;
const BLOCK_B = 700000;

let chainOwner: Record<number, string> = {};
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
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/key-encryption', () => ({ decryptApiKey: () => 'sk-test' }));
jest.mock('@/lib/llm-proxy', () => ({ callLLM: jest.fn(), checkGuardianRateLimit: async () => true }));
jest.mock('@/lib/escalation-notify', () => ({ notifyEscalation: async () => undefined }));
jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: async () => undefined }));

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: async (wallet: string, height: number) => {
    if (indexerDown) return { verified: false, unavailable: true, reason: 'indexer down' };
    if (chainOwner[height] === wallet) return { verified: true, inscriptionId: `insc_${height}` };
    return { verified: false, reason: 'not held by this wallet' };
  },
}));

// The bound signature (action, path, block, body, one-time nonce) has its own
// suite, signed-action-routes. Here every signed request is authorized, so a
// decision can only come from what this suite is about.
jest.mock('@/lib/signed-action', () => ({ verifySignedAction: async () => ({ ok: true }) }));

import prisma from '@/lib/prisma';
import { callLLM } from '@/lib/llm-proxy';
import { POST as CHAT } from '@/app/api/v1/guardian/chat/route';
import { makeWallet, sign } from '../helpers/wallet-sim';
import { MAX_PLACEMENTS } from '@/lib/world/types';

/** The per-call item cap a legacy `place_group` honours (see guardian/chat executeWorldActions). */
const PLACE_GROUP_ITEM_CAP = 25;

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const llm = callLLM as jest.Mock;

const SELLER = makeWallet('p2tr');
const BUYER = makeWallet('p2tr');

const jsonAction = (action: Record<string, unknown>) => 'On it!\n```json\n' + JSON.stringify(action) + '\n```';

/** A signed guardian chat as the visitor's wallet sends it. */
function chatReq(wallet: { privKey: string; address: string }, message: string) {
  const signedMessage = `guardian-chat:${Date.now()}`;
  return {
    json: async () => ({
      blockHeight: String(BLOCK_A),
      guardianId: 'grd_a',
      message,
      visitorAddress: wallet.address,
      signature: sign(wallet.privKey, wallet.address, signedMessage),
      signedMessage,
    }),
  } as never;
}

let objOnA: string;
let objOnB: string;

beforeEach(async () => {
  db.__reset();
  llm.mockReset();
  indexerDown = false;
  chainOwner = { [BLOCK_A]: SELLER.address, [BLOCK_B]: 'bc1pneighbour00000000000000000000000000000000' };

  await db.block.create({ data: { height: BLOCK_A, ownerAddress: SELLER.address, inscriptionId: `insc_${BLOCK_A}` } });
  // The seller's guardian, still active and still naming the seller — the
  // post-sale state while the release has not run.
  await db.guardianAgent.create({
    data: {
      id: 'grd_a', blockHeight: BLOCK_A, status: 'active', ownerAddress: SELLER.address, name: 'Warden',
      soulMd: 'guard', llmApiKey: 'iv:tag:ct', llmProvider: 'openai', llmModel: 'gpt-x', autoResponses: null,
    },
  });
  objOnA = (await db.blockObject.create({ data: { blockHeight: BLOCK_A, ownerAddress: SELLER.address, visible: true } })).id;
  objOnB = (await db.blockObject.create({ data: { blockHeight: BLOCK_B, ownerAddress: 'bc1pneighbour', visible: true } })).id;
});

const visible = async (id: string) => (await db.blockObject.findUnique({ where: { id } })).visible;
const objectCount = () => db.__rows('blockObject').length;

describe('remove_object is scoped to the guardian block', () => {
  it("cannot hide an object on another block, even for the block's live owner", async () => {
    llm.mockResolvedValue(jsonAction({ tool: 'remove_object', id: objOnB }));
    const res: any = await CHAT(chatReq(SELLER, 'tidy up'));

    expect(res.status).toBe(200);
    expect(await visible(objOnB)).toBe(true);
    expect((await res.json()).response).toContain('❌');
  });

  it("still hides an object on the guardian's own block for the live owner", async () => {
    llm.mockResolvedValue(jsonAction({ tool: 'remove_object', id: objOnA }));
    await CHAT(chatReq(SELLER, 'remove that'));

    expect(await visible(objOnA)).toBe(false);
  });
});

describe('world actions follow the live deed, not guardian.ownerAddress', () => {
  it('a seller whose guardian still names them cannot place objects after the sale', async () => {
    chainOwner[BLOCK_A] = BUYER.address; // the sale lands on-chain; the release has not run
    llm.mockResolvedValue(jsonAction({ tool: 'place_object', geometry: 'box', name: 'tower' }));
    const before = objectCount();

    await CHAT(chatReq(SELLER, 'place a tower'));

    expect(objectCount()).toBe(before);
  });

  it("the seller's two-pass build never runs (no second LLM call, no objects)", async () => {
    chainOwner[BLOCK_A] = BUYER.address;
    llm.mockResolvedValue('Sure, I can do that.');
    const before = objectCount();

    await CHAT(chatReq(SELLER, 'build a castle with a tower'));

    expect(llm).toHaveBeenCalledTimes(1);
    expect(objectCount()).toBe(before);
  });

  it('the live holder can build through the block guardian, and the object is attributed to them', async () => {
    chainOwner[BLOCK_A] = BUYER.address;
    llm.mockResolvedValue(jsonAction({ tool: 'place_object', geometry: 'box', name: 'tower' }));

    await CHAT(chatReq(BUYER, 'place a tower'));

    const placed = db.__rows('blockObject').filter((o: any) => o.name === 'tower');
    expect(placed).toHaveLength(1);
    expect(placed[0].blockHeight).toBe(BLOCK_A);
    expect(placed[0].ownerAddress).toBe(BUYER.address);
  });

  it('an indexer outage makes no world change and says so', async () => {
    indexerDown = true;
    llm.mockResolvedValue(jsonAction({ tool: 'place_object', geometry: 'box', name: 'tower' }));
    const before = objectCount();

    const res: any = await CHAT(chatReq(SELLER, 'place a tower'));

    expect(objectCount()).toBe(before);
    expect((await res.json()).response).toContain('could not be confirmed');
  });
});

describe("legacy world actions count against the block's cap", () => {
  const onA = () => db.__rows('blockObject').filter((o: any) => o.blockHeight === BLOCK_A && o.visible).length;
  const fill = async (n: number) => {
    for (let i = 0; i < n; i++) {
      await db.blockObject.create({ data: { blockHeight: BLOCK_A, ownerAddress: SELLER.address, visible: true } });
    }
  };
  const group = (n: number) => ({
    tool: 'place_group',
    items: Array.from({ length: n }, (_, i) => ({ prefabType: 'tree_oak', posX: i })),
  });

  it('place_group with 300 items on an empty block places at most the per-call cap, and says so', async () => {
    db.__rows('blockObject').splice(0); // an empty block
    llm.mockResolvedValue(jsonAction(group(300)));

    const res: any = await CHAT(chatReq(SELLER, 'plant a forest'));

    expect(onA()).toBe(PLACE_GROUP_ITEM_CAP);
    expect((await res.json()).response).toContain(`placed ${PLACE_GROUP_ITEM_CAP} of 300`);
  });

  it('at cap - 2 a group places 2', async () => {
    await fill(MAX_PLACEMENTS - 2 - onA());
    llm.mockResolvedValue(jsonAction(group(10)));

    const res: any = await CHAT(chatReq(SELLER, 'plant trees'));

    expect(onA()).toBe(MAX_PLACEMENTS);
    expect((await res.json()).response).toContain('placed 2 of 10');
  });

  it('at the cap place_object creates nothing and answers plainly', async () => {
    await fill(MAX_PLACEMENTS - onA());
    llm.mockResolvedValue(jsonAction({ tool: 'place_object', geometry: 'box', name: 'tower' }));

    const res: any = await CHAT(chatReq(SELLER, 'place a tower'));

    expect(onA()).toBe(MAX_PLACEMENTS);
    expect((await res.json()).response).toContain('placed 0 of 1');
  });
});
