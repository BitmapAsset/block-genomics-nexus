/**
 * SIMULATION — `POST /api/v1/game/quests` creates a quest only for the block's
 * live holder (bg58; open since the 10-15 Astra QC).
 *
 * PATCH and DELETE on a quest already ask the block's deed. Creation only asked
 * whether the signer was tier 1 or 2 anywhere, so the holder of any block could
 * stand quests up on someone else's block.
 */

let chainOwner: Record<number, string> = {};
const created: unknown[] = [];

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number }) {
      return new NextResponse(body, init);
    }
  }
  return { NextResponse };
});

jest.mock('@/lib/prisma', () => {
  const client = {
    user: { findUnique: async () => ({ tier: 1 }) },
    gameQuest: {
      create: async ({ data }: { data: unknown }) => {
        created.push(data);
        return data;
      },
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/ownership-gate', () => ({
  requireLiveBlockOwner: async (wallet: string, height: number) =>
    chainOwner[height] === wallet
      ? { ok: true, status: 200, walletAddress: wallet }
      : { ok: false, status: 403, code: 'ownership_lost', reason: 'not held by this wallet' },
  gateDenialResponse: (gate: { status: number; reason?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextResponse } = require('next/server');
    return NextResponse.json({ success: false, error: gate.reason }, { status: gate.status });
  },
}));

import { POST } from '@/app/api/v1/game/quests/route';
import { makeWallet, sign } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */

const VICTIM_BLOCK = 840000;
const OWN_BLOCK = 700000;
const OWNER = makeWallet('p2tr');
const OTHER = makeWallet('p2tr');

function questReq(wallet: ReturnType<typeof makeWallet>, blockHeight: number) {
  const message = `quest-create:${blockHeight}:${Date.now()}`;
  return {
    json: async () => ({
      blockHeight,
      ownerAddress: wallet.address,
      name: 'Find the key',
      steps: [{ do: 'walk' }],
      message,
      signature: sign(wallet.privKey, wallet.address, message),
    }),
  } as any;
}

beforeEach(() => {
  created.length = 0;
  chainOwner = { [VICTIM_BLOCK]: OWNER.address, [OWN_BLOCK]: OTHER.address };
});

it("refuses a tier-1 wallet creating a quest on a block it does not hold", async () => {
  const res: any = await POST(questReq(OTHER, VICTIM_BLOCK));
  expect(res.status).toBe(403);
  expect(created).toHaveLength(0);
});

it('lets the live holder create a quest on their block', async () => {
  const res: any = await POST(questReq(OWNER, VICTIM_BLOCK));
  expect(res.status).toBe(201);
  expect(created).toEqual([expect.objectContaining({ blockHeight: VICTIM_BLOCK, ownerAddress: OWNER.address })]);
});
