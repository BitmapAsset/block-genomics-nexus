/**
 * SIMULATION — E2E key registration is bound to a server nonce and to the key
 * itself (bg47 E2E-06, bg48 Q-03/Q-14 class).
 *
 * `POST /encryption` accepted a wallet signature over ANY text. One captured or
 * published (address, message, signature) triple let anyone replace that user's
 * DM public key, so the next DMs to them were encrypted to the attacker. Now the
 * signed message must be the canonical action message for this action and this
 * exact body (so this exact key), carrying a nonce issued for `encryption`, and
 * the nonce is consumed once.
 */

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

import prisma from '@/lib/prisma';
import { issueChallenge } from '@/lib/challenges';
import { buildActionMessage, hashBody } from '@/lib/action-message';
import { POST as REGISTER } from '@/app/api/v1/encryption/route';
import { makeWallet, sign, freshNonce } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const USER = makeWallet('p2tr');
const OLD_KEY = '02' + 'a'.repeat(64);
const NEW_KEY = '03' + 'b'.repeat(64);
const ATTACKER_KEY = '02' + 'c'.repeat(64);

const req = (body: Record<string, unknown>) => ({ json: async () => body }) as never;

/** What a correct client sends: a fresh `encryption` nonce, bound to this body. */
async function boundRegistration(key: string, opts: { purpose?: string; signedKey?: string } = {}) {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address: USER.address, purpose: opts.purpose ?? 'encryption' });
  const intent = { walletAddress: USER.address, encryptionPubKey: opts.signedKey ?? key };
  const message = buildActionMessage({
    action: 'encryption.register',
    method: 'POST',
    path: '/api/v1/encryption',
    blockHeight: 0,
    bodyHash: await hashBody(intent),
    nonce,
    expiresAt: Date.now() + 5 * 60_000,
  });
  return { walletAddress: USER.address, encryptionPubKey: key, message, signature: sign(USER.privKey, USER.address, message) };
}

const storedKey = async () => (await db.user.findUnique({ where: { walletAddress: USER.address } })).encryptionPubKey;

beforeEach(async () => {
  db.__reset();
  await db.user.create({ data: { walletAddress: USER.address, encryptionPubKey: OLD_KEY } });
});

describe('POST /encryption key registration', () => {
  it("a valid signature over arbitrary text no longer replaces the user's key", async () => {
    const message = 'I am signing in to some other site';
    const res: any = await REGISTER(
      req({ walletAddress: USER.address, encryptionPubKey: ATTACKER_KEY, message, signature: sign(USER.privKey, USER.address, message) })
    );

    expect(res.status).toBe(401);
    expect(await storedKey()).toBe(OLD_KEY);
  });

  it('a nonce-backed registration bound to this key stores it', async () => {
    const res: any = await REGISTER(req(await boundRegistration(NEW_KEY)));

    expect(res.status).toBe(200);
    expect(await storedKey()).toBe(NEW_KEY);
  });

  it('replaying the exact same signed registration is refused', async () => {
    const body = await boundRegistration(NEW_KEY);
    expect((await REGISTER(req(body)) as any).status).toBe(200);
    await db.user.update({ where: { walletAddress: USER.address }, data: { encryptionPubKey: OLD_KEY } });

    const replay: any = await REGISTER(req(body));

    expect(replay.status).toBe(401);
    expect(await storedKey()).toBe(OLD_KEY);
  });

  it('a signature bound to one key cannot register a different key', async () => {
    const res: any = await REGISTER(req(await boundRegistration(ATTACKER_KEY, { signedKey: NEW_KEY })));

    expect(res.status).toBe(401);
    expect(await storedKey()).toBe(OLD_KEY);
  });

  it('a nonce issued for another purpose is not a key-registration nonce', async () => {
    const res: any = await REGISTER(req(await boundRegistration(NEW_KEY, { purpose: 'world' })));

    expect(res.status).toBe(401);
    expect(await storedKey()).toBe(OLD_KEY);
  });
});
