/**
 * DM key registration completes from the site, and a DM is never sent as
 * plain text without the sender saying so.
 *
 *   - `registerEncryptionKey` (used by the wallet context and `useE2ECrypto`)
 *     sends the bound `encryption.register` message (purpose `encryption`, body
 *     `{ walletAddress, encryptionPubKey }`) with the wallet's signature, and the
 *     real `/api/v1/encryption` route accepts it. A refusal comes back as an
 *     error the caller shows, not a silent success.
 *   - `prepareDmPayload` returns ciphertext when the recipient has a key, and
 *     for a recipient without one (or a sender whose key is not ready) asks for
 *     an explicit confirm before it hands back plain text.
 *
 * Real route + real BIP-322 signatures + real challenge store; mocked seams:
 * DB (in memory), the browser's `fetch` (routed to the real route handlers).
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
import { parseActionMessage } from '@/lib/action-message';
import { POST as REGISTER } from '@/app/api/v1/encryption/route';
import { registerEncryptionKey } from '@/lib/e2e-register';
import { prepareDmPayload } from '@/lib/dm-payload';
import { makeWallet, sign, freshNonce } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const USER = makeWallet('p2tr');
const KEY = '02' + 'd'.repeat(64);

const realFetch = global.fetch;
const sentBodies: Array<{ url: string; body: any }> = [];

beforeEach(async () => {
  db.__reset();
  sentBodies.length = 0;
  await db.user.create({ data: { walletAddress: USER.address, handle: 'dmuser', encryptionPubKey: null } });
  global.fetch = jest.fn(async (url: any, init?: any) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentBodies.push({ url: String(url), body });
    if (String(url) === '/api/v1/challenge') {
      const nonce = freshNonce();
      await issueChallenge(nonce, { address: body.walletAddress, purpose: body.purpose });
      return new Response(JSON.stringify({ success: true, data: { nonce } }), { status: 200 });
    }
    if (String(url) === '/api/v1/encryption') {
      const res: any = await REGISTER({ json: async () => body } as never);
      return new Response(JSON.stringify(res.body), { status: res.status });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
});

const signMessage = async (m: string) => sign(USER.privKey, USER.address, m);
const storedKey = async () => (await db.user.findUnique({ where: { walletAddress: USER.address } })).encryptionPubKey;

describe('registerEncryptionKey', () => {
  it('sends the bound encryption.register message and the route stores the key', async () => {
    const out = await registerEncryptionKey({ walletAddress: USER.address, encryptionPubKey: KEY, signMessage });
    expect(out).toEqual({ ok: true });
    expect(await storedKey()).toBe(KEY);

    const challenge = sentBodies.find((s) => s.url === '/api/v1/challenge')!;
    expect(challenge.body).toEqual({ walletAddress: USER.address, purpose: 'encryption' });
    const reg = sentBodies.find((s) => s.url === '/api/v1/encryption')!;
    expect(reg.body.walletAddress).toBe(USER.address);
    expect(reg.body.encryptionPubKey).toBe(KEY);
    expect(typeof reg.body.signature).toBe('string');
    const binding = parseActionMessage(reg.body.message)!;
    expect(binding).toMatchObject({ action: 'encryption.register', method: 'POST', path: '/api/v1/encryption', blockHeight: 0 });
  });

  it('a refusal is returned as an error, not swallowed', async () => {
    const other = makeWallet('p2tr');
    // The wallet signs as someone else: the route answers 401.
    const out = await registerEncryptionKey({
      walletAddress: USER.address, encryptionPubKey: KEY,
      signMessage: async (m: string) => sign(other.privKey, other.address, m),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.error).toBeTruthy();
    }
    expect(await storedKey()).toBeNull();
  });

  it('a declined wallet prompt is returned as an error', async () => {
    const out = await registerEncryptionKey({
      walletAddress: USER.address, encryptionPubKey: KEY,
      signMessage: async () => { throw new Error('User rejected'); },
    });
    expect(out.ok).toBe(false);
    expect(await storedKey()).toBeNull();
  });
});

describe('prepareDmPayload', () => {
  const cipher = { v: 1, ct: 'abc' };
  const withKey = async () => cipher as any;
  const noKey = async () => null;

  it('a recipient with a key: ciphertext, type encrypted', async () => {
    const p = await prepareDmPayload({ text: 'hi', ready: true, recipient: 'bob', encrypt: withKey });
    expect(p).toEqual({ ok: true, encrypted: true, text: JSON.stringify(cipher), type: 'encrypted' });
  });

  it('a recipient without a key: no plain text without the confirm flag', async () => {
    const p = await prepareDmPayload({ text: 'secret words', ready: true, recipient: 'bob', encrypt: noKey });
    expect(p.ok).toBe(false);
    expect(JSON.stringify(p)).not.toContain('secret words');
  });

  it('the sender key not ready, or no recipient: no plain text without the confirm flag', async () => {
    expect((await prepareDmPayload({ text: 'x', ready: false, recipient: 'bob', encrypt: withKey })).ok).toBe(false);
    expect((await prepareDmPayload({ text: 'x', ready: true, recipient: null, encrypt: withKey })).ok).toBe(false);
  });

  it('with the explicit confirm flag: plain text, marked unencrypted', async () => {
    const p = await prepareDmPayload({ text: 'http://x', ready: true, recipient: 'bob', encrypt: noKey, allowPlaintext: true });
    expect(p).toEqual({ ok: true, encrypted: false, text: 'http://x', type: 'link' });
  });
});
