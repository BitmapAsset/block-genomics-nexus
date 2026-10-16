/**
 * SIMULATION — direct messages are readable only by their two parties (bg47 E2E-01).
 *
 * `GET /chat/history?mode=dm&wallet=A&dmWith=B` answered anyone, and its filter
 * was `senderAddress in [A, B]`: every DM either wallet ever sent, to anyone.
 * `GET /chat/<h>?channel=dm` was the same data through a second door. Wallet
 * addresses are public, so the query string identifies nobody; only a verified
 * session does.
 *
 * A DM row stores its sender and the block it was sent to; the recipient is that
 * block's owner. The cases below seed a small world and check who sees what.
 */

const VISITOR = 'bc1pvisitor0000000000000000000000000000000000';
const OWNER = 'bc1powner000000000000000000000000000000000000';
const THIRD = 'bc1pthird000000000000000000000000000000000000';
const OWNER_BLOCK = 840000;
const VISITOR_BLOCK = 720143;
const THIRD_BLOCK = 700000;

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

// The limiter has its own suite; a pass-through here so it is never the reason a case passes.
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  PUBLIC_READ_LIMIT: 120,
}));

import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { mintVerifiedSession } from '@/lib/verified-sessions';
import { GET as HISTORY } from '@/app/api/v1/chat/history/route';
import { GET as BLOCK_CHAT } from '@/app/api/v1/chat/[blockHeight]/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

function getReq(url: string, token?: string) {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) },
  } as never;
}

const historyUrl = (wallet: string, dmWith: string) =>
  `http://test.local/api/v1/chat/history?mode=dm&wallet=${wallet}&dmWith=${dmWith}`;

async function history(wallet: string, dmWith: string, token?: string) {
  const res: any = await HISTORY(getReq(historyUrl(wallet, dmWith), token));
  return { status: res.status, body: await res.json(), headers: res.headers as Map<string, string> };
}

async function blockDms(height: number, token?: string) {
  const res: any = await BLOCK_CHAT(getReq(`http://test.local/api/v1/chat/${height}?channel=dm`, token), {
    params: Promise.resolve({ blockHeight: String(height) }),
  } as never);
  return { status: res.status, body: await res.json(), headers: res.headers as Map<string, string> };
}

const texts = (body: any): string[] =>
  (Array.isArray(body.data) ? body.data : body.data.messages).map((m: any) => m.text).sort();

let t = 0;
async function dm(sender: string, blockHeight: number, text: string, channel = 'dm') {
  await db.chatMessage.create({
    data: { blockHeight, senderAddress: sender, text, channel, type: 'text', createdAt: new Date(1_700_000_000_000 + ++t), reactions: [] },
  });
}

async function token(wallet: string, blocks: number[]): Promise<string> {
  return (await mintVerifiedSession(wallet, blocks)).token;
}

beforeEach(async () => {
  db.__reset();
  t = 0;
  await db.block.create({ data: { height: OWNER_BLOCK, ownerAddress: OWNER } });
  await db.block.create({ data: { height: VISITOR_BLOCK, ownerAddress: VISITOR } });
  await db.block.create({ data: { height: THIRD_BLOCK, ownerAddress: THIRD } });

  await dm(VISITOR, OWNER_BLOCK, 'visitor -> owner');
  await dm(OWNER, VISITOR_BLOCK, 'owner -> visitor');
  await dm(VISITOR, THIRD_BLOCK, 'visitor -> third');
  await dm(THIRD, OWNER_BLOCK, 'third -> owner');
  await dm(OWNER, THIRD_BLOCK, 'owner -> third');
  await dm(OWNER, OWNER_BLOCK, 'owner note on own block');
  await dm(VISITOR, OWNER_BLOCK, 'public block chat', 'block');
});

describe('GET /chat/history?mode=dm', () => {
  it('refuses a caller with no session (401) and returns no messages', async () => {
    const res = await history(VISITOR, OWNER);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeUndefined();
  });

  it("refuses a third wallet's session (403)", async () => {
    const res = await history(VISITOR, OWNER, await token(THIRD, [THIRD_BLOCK]));
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
  });

  it('a party sees only rows between the two wallets, never their other DMs', async () => {
    const res = await history(VISITOR, OWNER, await token(VISITOR, [VISITOR_BLOCK]));
    expect(res.status).toBe(200);
    expect(texts(res.body)).toEqual(['owner -> visitor', 'visitor -> owner']);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('the block owner reads the visitor side once the session proved that block', async () => {
    const res = await history(OWNER, VISITOR, await token(OWNER, [OWNER_BLOCK]));
    expect(res.status).toBe(200);
    expect(texts(res.body)).toEqual(['owner -> visitor', 'visitor -> owner']);
  });

  it('a recorded owner whose session never proved the block sees only what they sent', async () => {
    // Block.ownerAddress alone (stale or poisoned cache) must not open an inbox.
    const res = await history(OWNER, VISITOR, await token(OWNER, []));
    expect(res.status).toBe(200);
    expect(texts(res.body)).toEqual(['owner -> visitor']);
  });
});

describe('GET /chat/<h>?channel=dm (the second door)', () => {
  it('refuses a caller with no session (401)', async () => {
    const res = await blockDms(OWNER_BLOCK);
    expect(res.status).toBe(401);
    expect(res.body.data).toBeUndefined();
  });

  it('a visitor sees only the DMs they sent to that block', async () => {
    const res = await blockDms(OWNER_BLOCK, await token(VISITOR, []));
    expect(res.status).toBe(200);
    expect(texts(res.body)).toEqual(['visitor -> owner']);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it("the owner, proven for the block, reads the block's whole DM inbox", async () => {
    const res = await blockDms(OWNER_BLOCK, await token(OWNER, [OWNER_BLOCK]));
    expect(res.status).toBe(200);
    expect(texts(res.body)).toEqual(['owner note on own block', 'third -> owner', 'visitor -> owner']);
  });

  it('the recorded owner without a session covering the block sees only their own rows', async () => {
    const res = await blockDms(OWNER_BLOCK, await token(OWNER, []));
    expect(texts(res.body)).toEqual(['owner note on own block']);
  });

  it('public block chat still needs no session', async () => {
    const res: any = await BLOCK_CHAT(getReq(`http://test.local/api/v1/chat/${OWNER_BLOCK}?channel=block`), {
      params: Promise.resolve({ blockHeight: String(OWNER_BLOCK) }),
    } as never);
    expect(res.status).toBe(200);
    expect(texts(await res.json())).toEqual(['public block chat']);
  });
});

describe('RLS: the anon key cannot read DM rows', () => {
  /** The ChatMessage "Allow public read" policy as the migrations leave it (last definition wins). */
  function finalPublicReadPolicy(): string {
    const dir = path.join(__dirname, '..', '..', 'prisma', 'migrations');
    const statements = fs
      .readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, 'migration.sql')))
      .sort()
      .flatMap((d) => fs.readFileSync(path.join(dir, d, 'migration.sql'), 'utf8').split('\n'))
      .filter((l) => /^CREATE POLICY "Allow public read" ON "public"\."ChatMessage"/.test(l));
    return statements[statements.length - 1];
  }

  it('keeps block/global chat public for Realtime but excludes channel = dm', () => {
    const policy = finalPublicReadPolicy();
    expect(policy).toContain('TO anon,authenticated');
    expect(policy).toContain(`USING ("channel" <> 'dm')`);
  });
});
