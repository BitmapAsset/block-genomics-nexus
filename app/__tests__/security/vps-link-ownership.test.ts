/**
 * SIMULATION — `POST /api/v1/vps/link` attaches a server to a block only for
 * the block's live holder (bg58).
 *
 * The route verified the wallet signature and then inserted a VPSLink row for
 * whatever `blockHeight` the caller named. `GET /api/v1/vps/block/[h]` lists
 * those rows publicly as the block's servers, so any wallet could publish its
 * URL against someone else's block, as many times as it liked.
 *
 * Real route + real BIP-322 signatures; mocked seams: DB, the ownership gate
 * (chainOwner IS the live deed).
 */

let chainOwner: Record<number, string> = {};

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

// The bound signature (action, path, block, body, one-time nonce) has its own
// suite, signed-action-routes. Here every signed request is authorized, so a
// decision can only come from what this suite is about.
jest.mock('@/lib/signed-action', () => ({ verifySignedAction: async () => ({ ok: true }) }));

import prisma from '@/lib/prisma';
import { POST } from '@/app/api/v1/vps/link/route';
import { makeWallet, sign } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const OWNER = makeWallet('p2wpkh');
const STRANGER = makeWallet('p2wpkh');

function linkReq(wallet: ReturnType<typeof makeWallet>, body: Record<string, unknown> = {}) {
  const challenge = `vps-link:${BLOCK}:0:${Date.now()}`;
  return {
    json: async () => ({
      walletAddress: wallet.address,
      blockHeight: BLOCK,
      parcelIndex: 0,
      serverUrl: 'https://server.example',
      message: challenge,
      signature: sign(wallet.privKey, wallet.address, challenge),
      ...body,
    }),
  } as any;
}

beforeEach(() => {
  db.__reset();
  chainOwner = { [BLOCK]: OWNER.address };
});

describe('POST /api/v1/vps/link', () => {
  it("refuses a wallet that does not hold the block, and writes nothing", async () => {
    const res: any = await POST(linkReq(STRANGER));
    expect(res.status).toBe(403);
    expect(db.__rows('vPSLink')).toHaveLength(0);
  });

  it('links a server for the live holder', async () => {
    const res: any = await POST(linkReq(OWNER));
    expect(res.status).toBe(201);
    expect(db.__rows('vPSLink')).toEqual([expect.objectContaining({ blockHeight: BLOCK, walletAddress: OWNER.address })]);
  });

  it('rejects a block height that is not a non-negative integer', async () => {
    for (const blockHeight of [-1, 1.5, 'abc']) {
      const res: any = await POST(linkReq(OWNER, { blockHeight }));
      expect(res.status).toBe(400);
    }
    expect(db.__rows('vPSLink')).toHaveLength(0);
  });
});
