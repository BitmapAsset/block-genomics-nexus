/**
 * ISOLATED SIMULATION — agent API-token auth (OPEN-1) through the REAL routes,
 * backed by in-memory Prisma + REAL BIP-322 signatures (no live chain, no DB).
 *
 * Required scenarios: valid token, missing token, wrong token, revoked, rotated,
 * null-hash legacy grace — plus token-management ownership-scoping + replay.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => {
      const h = new Map<string, string>();
      return {
        body,
        status: init?.status ?? 200,
        json: async () => body,
        headers: {
          set: (k: string, v: string) => h.set(k.toLowerCase(), v),
          get: (k: string) => h.get(k.toLowerCase()) ?? null,
        },
      };
    },
  },
}));

jest.mock('@/lib/onchain/ord', () => ({
  getInscriptionOwner: jest.fn(async () => null),
  getStatus: jest.fn(async () => ({ height: 800_000 })),
  getAddressInscriptions: jest.fn(async () => null),
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

import prisma from '@/lib/prisma';
import { issueChallenge } from '@/lib/challenges';
import { POST as registerPOST } from '@/app/api/v1/agents/register/route';
import { GET as eventsGET } from '@/app/api/v1/agents/[agentId]/events/route';
import { POST as heartbeatPOST } from '@/app/api/v1/agents/[agentId]/heartbeat/route';
import { POST as briefPOST } from '@/app/api/v1/agents/[agentId]/brief/route';
import { POST as tokenPOST, DELETE as tokenDELETE } from '@/app/api/v1/agents/[agentId]/token/route';
import { makeWallet, sign, freshNonce, challengeMessage } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const req = (body: any, opts: { url?: string; auth?: string } = {}) => {
  const url = opts.url ?? 'http://test.local/';
  const h = new Map<string, string>();
  if (opts.auth) h.set('authorization', opts.auth);
  return {
    json: async () => body,
    url,
    nextUrl: new URL(url),
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
  } as any;
};
const ctx = (agentId: string) => ({ params: Promise.resolve({ agentId }) });

async function issue(address: string, purpose: string, ttlMs?: number): Promise<string> {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address, purpose, ...(ttlMs !== undefined ? { ttlMs } : {}) });
  return challengeMessage(nonce);
}

/** Register a fresh agent for a new owner on `height`; returns owner wallet, agentId, token. */
async function registerAgent(height: number) {
  const owner = makeWallet('p2tr');
  await db.block.create({ data: { height, ownerAddress: owner.address } });
  const message = await issue(owner.address, 'agent-register');
  const signature = sign(owner.wif, owner.address, message);
  const res = await registerPOST(
    req({
      walletAddress: owner.address, endpointUrl: 'https://agent.example', blockHeight: height,
      tier: 1, permissions: ['READ_DMS', 'SEND_DMS'], signature, challenge: message,
    }),
  );
  expect(res.status).toBe(201);
  const data = (res.body as any).data;
  return { owner, agentId: data.id as string, token: data.apiKey as string, registerData: data };
}

beforeEach(() => db.__reset());

describe('SIM: agent API-token auth (OPEN-1)', () => {
  it('register issues a one-time token and never echoes the stored hash', async () => {
    const { token, registerData } = await registerAgent(1001);
    expect(typeof token).toBe('string');
    expect(token.startsWith('bg_agent_')).toBe(true);
    expect(registerData.apiKeyHash).toBeUndefined(); // hash must not leak
    expect(typeof registerData.apiKeyWarning).toBe('string');
    // The persisted row stores only the hash, not the plaintext.
    const row = await db.bitmapAgent.findUnique({ where: { id: registerData.id } });
    expect(row.apiKeyHash).toBeTruthy();
    expect(row.apiKeyHash).not.toBe(token);
  });

  it('heartbeat: valid token 200, missing 401, wrong 401', async () => {
    const { agentId, token } = await registerAgent(1002);

    const ok = await heartbeatPOST(req({}, { auth: `Bearer ${token}` }), ctx(agentId));
    expect(ok.status).toBe(200);

    const missing = await heartbeatPOST(req({}), ctx(agentId));
    expect(missing.status).toBe(401);

    const wrong = await heartbeatPOST(req({}, { auth: 'Bearer bg_agent_deadbeef' }), ctx(agentId));
    expect(wrong.status).toBe(401);
  });

  it('events GET: requires a valid token', async () => {
    const { agentId, token } = await registerAgent(1003);

    const noAuth = await eventsGET(req(null, { url: 'http://test.local/?limit=10' }), ctx(agentId));
    expect(noAuth.status).toBe(401);

    const withAuth = await eventsGET(
      req(null, { url: 'http://test.local/?limit=10', auth: `Bearer ${token}` }),
      ctx(agentId),
    );
    expect(withAuth.status).toBe(200);
    expect(Array.isArray((withAuth.body as any).data)).toBe(true);
  });

  it('brief POST: requires a valid token', async () => {
    const { agentId, token } = await registerAgent(1004);
    const briefBody = { period: 'p', summary: 's', stats: { visitors: 0, dms: 0, offers: 0, actions: 0 } };

    const noAuth = await briefPOST(req(briefBody), ctx(agentId));
    expect(noAuth.status).toBe(401);

    const ok = await briefPOST(req(briefBody, { auth: `Bearer ${token}` }), ctx(agentId));
    expect(ok.status).toBe(201);
  });

  it('rotate: old token stops working, new token works; ownership-scoped + replay-safe', async () => {
    const { owner, agentId, token: oldToken } = await registerAgent(1005);

    // A stranger cannot rotate this agent's token.
    const stranger = makeWallet('p2wpkh');
    const sMsg = await issue(stranger.address, 'agent-token');
    const sSig = sign(stranger.wif, stranger.address, sMsg);
    const denied = await tokenPOST(req({ walletAddress: stranger.address, signature: sSig, challenge: sMsg }), ctx(agentId));
    expect(denied.status).toBe(403);

    // Owner rotates.
    const oMsg = await issue(owner.address, 'agent-token');
    const oSig = sign(owner.wif, owner.address, oMsg);
    const rotated = await tokenPOST(req({ walletAddress: owner.address, signature: oSig, challenge: oMsg }), ctx(agentId));
    expect(rotated.status).toBe(200);
    const newToken = (rotated.body as any).data.apiKey as string;
    expect(newToken).not.toBe(oldToken);

    // Old token now rejected; new token accepted.
    expect((await heartbeatPOST(req({}, { auth: `Bearer ${oldToken}` }), ctx(agentId))).status).toBe(401);
    expect((await heartbeatPOST(req({}, { auth: `Bearer ${newToken}` }), ctx(agentId))).status).toBe(200);

    // Replaying the consumed rotate challenge is rejected.
    const replay = await tokenPOST(req({ walletAddress: owner.address, signature: oSig, challenge: oMsg }), ctx(agentId));
    expect(replay.status).toBe(401);
  });

  it('revoke: locks the agent (401, NOT tokenless) until a new key is rotated', async () => {
    const { owner, agentId, token } = await registerAgent(1006);

    const rMsg = await issue(owner.address, 'agent-token');
    const rSig = sign(owner.wif, owner.address, rMsg);
    const revoked = await tokenDELETE(req({ walletAddress: owner.address, signature: rSig, challenge: rMsg }), ctx(agentId));
    expect(revoked.status).toBe(200);

    // The revoked token is dead AND tokenless access is NOT re-opened.
    expect((await heartbeatPOST(req({}, { auth: `Bearer ${token}` }), ctx(agentId))).status).toBe(401);
    expect((await heartbeatPOST(req({}), ctx(agentId))).status).toBe(401); // locked, not grace

    // Owner can recover by rotating a fresh key.
    const nMsg = await issue(owner.address, 'agent-token');
    const nSig = sign(owner.wif, owner.address, nMsg);
    const rotated = await tokenPOST(req({ walletAddress: owner.address, signature: nSig, challenge: nMsg }), ctx(agentId));
    expect(rotated.status).toBe(200);
    const fresh = (rotated.body as any).data.apiKey as string;
    expect((await heartbeatPOST(req({}, { auth: `Bearer ${fresh}` }), ctx(agentId))).status).toBe(200);
  });

  it('legacy grace: an agent with no key (null hash + null createdAt) still works, with a deprecation header', async () => {
    const b = makeWallet('p2tr');
    const legacy = await db.bitmapAgent.create({
      data: {
        walletAddress: b.address, endpointUrl: 'https://legacy.example', blockHeight: 1007,
        tier: 1, permissions: JSON.stringify(['READ_DMS']), status: 'active',
      },
    });
    // Sanity: no key fields provisioned.
    expect(legacy.apiKeyHash ?? null).toBeNull();
    expect(legacy.apiKeyCreatedAt ?? null).toBeNull();

    const hb = await heartbeatPOST(req({}), ctx(legacy.id));
    expect(hb.status).toBe(200);
    expect(hb.headers.get('X-BG-Deprecation')).toContain('DEPRECATION');

    const ev = await eventsGET(req(null, { url: 'http://test.local/?limit=5' }), ctx(legacy.id));
    expect(ev.status).toBe(200);
    expect(ev.headers.get('X-BG-Deprecation')).toContain('DEPRECATION');
  });
});
