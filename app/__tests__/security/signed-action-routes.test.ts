/**
 * SIMULATION — every signed write is bound to its action and used once.
 *
 * Each route below takes the wallet's signature over the canonical
 * `Block Genomics Authorization v1` message for exactly that request (action,
 * method, path, block, body hash) and consumes the one-time nonce inside it,
 * issued by POST /api/v1/challenge for the route's purpose. For every route:
 *
 *   (a) a valid signature over an ad-hoc string            → 401
 *   (b) a published experience attestation, replayed      → 401
 *   (c) bound + fresh nonce                                → success, gate run for the signer
 *   (d) the same request again                             → 401 (nonce consumed)
 *   (e) a binding for another route, or another block      → 401
 *   (f) the body changed after signing                     → 401
 *   (g) a nonce issued for another purpose                 → 401
 *
 * Real routes + real BIP-322 signatures; mocked seams: DB (in memory), the
 * ownership gate (chainOwner IS the live deed), event emitters, notifications.
 */

let chainOwner: Record<number, string> = {};
const gateCalls: Array<{ wallet: string; height: number }> = [];

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
  requireLiveBlockOwner: async (wallet: string, height: number) => {
    gateCalls.push({ wallet, height });
    return chainOwner[height] === wallet
      ? { ok: true, status: 200, walletAddress: wallet }
      : { ok: false, status: 403, code: 'ownership_lost', reason: 'not held by this wallet' };
  },
  gateDenialResponse: (gate: { status: number; reason?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextResponse } = require('next/server');
    return NextResponse.json({ success: false, error: gate.reason }, { status: gate.status });
  },
}));

jest.mock('@/lib/block-event-emitters', () => ({
  emitGuardianRegistered: jest.fn(async () => undefined),
  emitGuardianTransition: jest.fn(async () => undefined),
}));

const agentEvents: Array<{ actor: string }> = [];
jest.mock('@/lib/agent-events', () => ({
  emitAgentEvent: jest.fn(async (_h: number, _k: string, data: { actor: string }) => {
    agentEvents.push(data);
  }),
}));
jest.mock('@/lib/escalation-notify', () => ({ notifyEscalation: jest.fn(async () => undefined) }));

import prisma from '@/lib/prisma';
import { buildActionMessage, hashBody } from '@/lib/action-message';
import { issueChallenge } from '@/lib/challenges';
import { makeWallet, sign, freshNonce, type SimWallet } from '../helpers/wallet-sim';
import { POST as GUARDIAN_POST } from '@/app/api/v1/guardian/route';
import { PATCH as GUARDIAN_PATCH, DELETE as GUARDIAN_DELETE } from '@/app/api/v1/guardian/[id]/route';
import { POST as MONITOR_POST, DELETE as MONITOR_DELETE } from '@/app/api/v1/guardian/monitor/route';
import { POST as GUARDIAN_CHAT } from '@/app/api/v1/guardian/chat/route';
import { POST as VPS_LINK } from '@/app/api/v1/vps/link/route';
import { DELETE as VPS_UNLINK } from '@/app/api/v1/vps/[linkId]/route';
import { POST as VPS_HEALTH } from '@/app/api/v1/vps/[linkId]/health/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const OWNER = makeWallet('p2wpkh');
const STRANGER = makeWallet('p2tr');

type Handler = (req: any, ctx?: any) => Promise<any>;

interface RouteCase {
  name: string;
  handler: Handler;
  ctx?: () => unknown;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  action: string;
  purpose: string;
  blockHeight: number;
  /** Field carrying the acting wallet. */
  addressField: string;
  /** Intent body for `wallet` (no signature/message). */
  body: (wallet: SimWallet) => Record<string, unknown>;
  /** A body edit the signature must not cover. */
  tamper: (body: Record<string, unknown>) => Record<string, unknown>;
  okStatus: number;
  /** The write landed. */
  landed: () => boolean;
}

const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

function seed() {
  db.__reset();
  db.__rows('guardianAgent').push({
    id: 'g1', blockHeight: BLOCK, ownerAddress: OWNER.address, name: 'Warden', status: 'active',
    soulMd: 'soul', autoResponses: null, llmApiKey: null, llmProvider: null, llmEndpoint: null,
    agentEndpoint: null, selfHosted: false, monitorTokenHash: 'seeded', totalMessages: 0, createdAt: new Date(),
  });
  db.__rows('vPSLink').push({
    id: 'l1', blockHeight: BLOCK, walletAddress: OWNER.address, serverUrl: 'https://old.example',
    connectionType: 'https', status: 'linked', lastHealthCheck: null, createdAt: new Date(),
  });
}

const guardian = () => db.__rows('guardianAgent').find((g: any) => g.id === 'g1');
const link = () => db.__rows('vPSLink').find((l: any) => l.id === 'l1');

const CASES: RouteCase[] = [
  {
    name: 'POST /api/v1/guardian', handler: GUARDIAN_POST, method: 'POST', path: '/api/v1/guardian',
    action: 'guardian.create', purpose: 'guardian', blockHeight: BLOCK, addressField: 'ownerAddress',
    body: (w) => ({ blockHeight: BLOCK, ownerAddress: w.address, name: 'Sentinel', escalateEmail: 'me@example.com' }),
    tamper: (b) => ({ ...b, escalateEmail: 'other@example.com' }),
    okStatus: 200,
    landed: () => db.__rows('guardianAgent').some((g: any) => g.name === 'Sentinel'),
  },
  {
    name: 'PATCH /api/v1/guardian/[id]', handler: GUARDIAN_PATCH, ctx: () => params({ id: 'g1' }), method: 'PATCH',
    path: '/api/v1/guardian/g1', action: 'guardian.update', purpose: 'guardian', blockHeight: BLOCK,
    addressField: 'ownerAddress',
    body: (w) => ({ ownerAddress: w.address, name: 'Renamed' }),
    tamper: (b) => ({ ...b, escalateEmail: 'other@example.com' }),
    okStatus: 200,
    landed: () => guardian().name === 'Renamed',
  },
  {
    name: 'DELETE /api/v1/guardian/[id]', handler: GUARDIAN_DELETE, ctx: () => params({ id: 'g1' }), method: 'DELETE',
    path: '/api/v1/guardian/g1', action: 'guardian.delete', purpose: 'guardian', blockHeight: BLOCK,
    addressField: 'ownerAddress',
    body: (w) => ({ ownerAddress: w.address }),
    tamper: (b) => ({ ...b, reason: 'changed' }),
    okStatus: 200,
    landed: () => guardian().status === 'stopped',
  },
  {
    name: 'POST /api/v1/guardian/monitor', handler: MONITOR_POST, method: 'POST', path: '/api/v1/guardian/monitor',
    action: 'guardian.monitor.mint', purpose: 'guardian', blockHeight: BLOCK, addressField: 'ownerAddress',
    body: (w) => ({ guardianId: 'g1', ownerAddress: w.address }),
    tamper: (b) => ({ ...b, guardianId: 'g2' }),
    okStatus: 200,
    landed: () => !!guardian().monitorTokenHash && guardian().monitorTokenHash !== 'seeded',
  },
  {
    name: 'DELETE /api/v1/guardian/monitor', handler: MONITOR_DELETE, method: 'DELETE', path: '/api/v1/guardian/monitor',
    action: 'guardian.monitor.revoke', purpose: 'guardian', blockHeight: BLOCK, addressField: 'ownerAddress',
    body: (w) => ({ guardianId: 'g1', ownerAddress: w.address }),
    tamper: (b) => ({ ...b, guardianId: 'g2' }),
    okStatus: 200,
    landed: () => guardian().monitorTokenHash === null,
  },
  {
    name: 'POST /api/v1/vps/link', handler: VPS_LINK, method: 'POST', path: '/api/v1/vps/link',
    action: 'vps.link', purpose: 'vps', blockHeight: BLOCK, addressField: 'walletAddress',
    body: (w) => ({ walletAddress: w.address, blockHeight: BLOCK, parcelIndex: 0, serverUrl: 'https://server.example', connectionType: 'https' }),
    tamper: (b) => ({ ...b, serverUrl: 'https://elsewhere.example' }),
    okStatus: 201,
    landed: () => db.__rows('vPSLink').some((l: any) => l.serverUrl === 'https://server.example'),
  },
  {
    name: 'DELETE /api/v1/vps/[linkId]', handler: VPS_UNLINK, ctx: () => params({ linkId: 'l1' }), method: 'DELETE',
    path: '/api/v1/vps/l1', action: 'vps.unlink', purpose: 'vps', blockHeight: BLOCK, addressField: 'walletAddress',
    body: (w) => ({ walletAddress: w.address }),
    tamper: (b) => ({ ...b, reason: 'changed' }),
    okStatus: 200,
    landed: () => link().status === 'unlinked',
  },
  {
    name: 'POST /api/v1/vps/[linkId]/health', handler: VPS_HEALTH, ctx: () => params({ linkId: 'l1' }), method: 'POST',
    path: '/api/v1/vps/l1/health', action: 'vps.health', purpose: 'vps', blockHeight: BLOCK, addressField: 'ownerAddress',
    body: (w) => ({ ownerAddress: w.address }),
    tamper: (b) => ({ ...b, note: 'changed' }),
    okStatus: 200,
    landed: () => link().lastHealthCheck !== null,
  },
];

function request(path: string, body: Record<string, unknown>) {
  const url = new URL('http://localhost' + path);
  return {
    json: async () => JSON.parse(JSON.stringify(body)),
    url: url.toString(),
    nextUrl: url,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as any;
}

interface SignOpts {
  wallet?: SimWallet;
  purpose?: string;
  action?: string;
  path?: string;
  method?: string;
  blockHeight?: number;
  /** Body the signature covers (defaults to the body sent). */
  signedBody?: Record<string, unknown>;
}

async function signedBody(c: RouteCase, body: Record<string, unknown>, o: SignOpts = {}) {
  const wallet = o.wallet ?? OWNER;
  const nonce = freshNonce();
  await issueChallenge(nonce, { address: wallet.address, purpose: o.purpose ?? c.purpose });
  const message = buildActionMessage({
    action: o.action ?? c.action,
    method: o.method ?? c.method,
    path: o.path ?? c.path,
    blockHeight: o.blockHeight ?? c.blockHeight,
    bodyHash: await hashBody(o.signedBody ?? body),
    nonce,
    expiresAt: Date.now() + 60_000,
  });
  return { ...body, message, signature: sign(wallet.privKey, wallet.address, message) };
}

async function call(c: RouteCase, body: Record<string, unknown>) {
  return c.handler(request(c.path, body), c.ctx?.());
}

/** The tuple an experience registration publishes on purpose. */
async function publishedAttestation(wallet: SimWallet) {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address: wallet.address, purpose: 'experience-register' });
  const message = buildActionMessage({
    action: 'experience.register', method: 'POST', path: '/api/v1/experiences', blockHeight: BLOCK,
    bodyHash: 'c3'.repeat(32), nonce, expiresAt: Date.now() + 60_000,
  });
  return { message, signature: sign(wallet.privKey, wallet.address, message) };
}

beforeEach(() => {
  seed();
  chainOwner = { [BLOCK]: OWNER.address };
  gateCalls.length = 0;
  agentEvents.length = 0;
});

describe.each(CASES)('$name', (c) => {
  it('(a) refuses a valid signature over an ad-hoc string', async () => {
    const message = `chat:${Date.now()}`;
    const res = await call(c, { ...c.body(OWNER), message, signature: sign(OWNER.privKey, OWNER.address, message) });
    expect(res.status).toBe(401);
    expect(c.landed()).toBe(false);
  });

  it('(b) refuses a published experience attestation', async () => {
    const res = await call(c, { ...c.body(OWNER), ...(await publishedAttestation(OWNER)) });
    expect(res.status).toBe(401);
    expect(c.landed()).toBe(false);
  });

  it('(c) accepts a bound signature with a fresh nonce and gates the signer', async () => {
    const res = await call(c, await signedBody(c, c.body(OWNER)));
    expect(res.status).toBe(c.okStatus);
    expect(c.landed()).toBe(true);
    // vps/[linkId] routes authorize the wallet that made the link (unchanged).
    if (!c.path.startsWith('/api/v1/vps/l1')) {
      expect(gateCalls.some((g) => g.wallet === OWNER.address && g.height === BLOCK)).toBe(true);
    }
  });

  it('(c) a bound signature from a wallet that does not hold the block is refused by the gate', async () => {
    const res = await call(c, await signedBody(c, c.body(STRANGER), { wallet: STRANGER }));
    expect(res.status).toBe(403);
    expect(c.landed()).toBe(false);
  });

  it("(c) a signature by one wallet does not act for another wallet's address", async () => {
    const body = c.body(OWNER);
    const signed = await signedBody(c, body, { wallet: STRANGER });
    const res = await call(c, signed);
    expect(res.status).toBe(401);
    expect(c.landed()).toBe(false);
  });

  it('(d) refuses the same request a second time', async () => {
    const body = await signedBody(c, c.body(OWNER));
    const first = await call(c, body);
    expect(first.status).toBe(c.okStatus);
    seed();
    const again = await call(c, body);
    expect(again.status).toBe(401);
    expect(c.landed()).toBe(false);
  });

  it('(e) refuses a binding made for another route', async () => {
    const other = CASES[(CASES.indexOf(c) + 1) % CASES.length];
    const res = await call(c, await signedBody(c, c.body(OWNER), { action: other.action, path: other.path, method: other.method }));
    expect(res.status).toBe(401);
    expect(c.landed()).toBe(false);
  });

  it('(e) refuses a binding made for another block', async () => {
    const res = await call(c, await signedBody(c, c.body(OWNER), { blockHeight: c.blockHeight + 1 }));
    expect(res.status).toBe(401);
    expect(c.landed()).toBe(false);
  });

  it('(f) refuses a body changed after signing', async () => {
    const body = c.body(OWNER);
    const res = await call(c, await signedBody(c, c.tamper(body), { signedBody: body }));
    expect(res.status).toBe(401);
    expect(c.landed()).toBe(false);
  });

  it('(g) refuses a nonce issued for another purpose', async () => {
    const res = await call(c, await signedBody(c, c.body(OWNER), { purpose: 'auth' }));
    expect(res.status).toBe(401);
    expect(c.landed()).toBe(false);
  });

  it('points an unbound request at POST /api/v1/challenge with its purpose', async () => {
    const message = 'hello';
    const res = await call(c, { ...c.body(OWNER), message, signature: sign(OWNER.privKey, OWNER.address, message) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(JSON.stringify(json)).toContain('/api/v1/challenge');
    expect(JSON.stringify(json)).toContain(`'${c.purpose}'`);
  });
});

describe('POST /api/v1/vps/link stores only a safe public https/wss server', () => {
  const c = CASES.find((x) => x.action === 'vps.link')!;
  it.each(['http://server.example', 'https://127.0.0.1', 'https://localhost', 'ftp://server.example', 'https://u:p@server.example'])(
    'refuses %s',
    async (serverUrl) => {
      const res = await call(c, await signedBody(c, { ...c.body(OWNER), serverUrl }));
      expect(res.status).toBe(400);
      expect(db.__rows('vPSLink')).toHaveLength(1);
    },
  );

  it('accepts wss', async () => {
    const res = await call(c, await signedBody(c, { ...c.body(OWNER), serverUrl: 'wss://server.example/socket', connectionType: 'websocket' }));
    expect(res.status).toBe(201);
  });
});

describe('POST /api/v1/guardian/chat owner path', () => {
  const chatCase: RouteCase = {
    name: 'POST /api/v1/guardian/chat', handler: GUARDIAN_CHAT, method: 'POST', path: '/api/v1/guardian/chat',
    action: 'guardian.chat', purpose: 'guardian', blockHeight: BLOCK, addressField: 'visitorAddress',
    body: () => ({}), tamper: (b) => b, okStatus: 200, landed: () => false,
  };

  /** The intent the owner signs: block, guardian, conversation and the text. */
  const intent = (text: string, conversationId: string | null = 'conv-1', guardianId = 'g1') => ({
    blockHeight: BLOCK, guardianId, conversationId, text, visitorAddress: OWNER.address,
  });

  async function ownerRequest(text: string, o: SignOpts & { sendText?: string; sendConversation?: string; sendGuardian?: string } = {}) {
    const wallet = o.wallet ?? OWNER;
    const nonce = freshNonce();
    await issueChallenge(nonce, { address: wallet.address, purpose: o.purpose ?? 'guardian' });
    const signedMessage = buildActionMessage({
      action: o.action ?? 'guardian.chat', method: 'POST', path: '/api/v1/guardian/chat',
      blockHeight: o.blockHeight ?? BLOCK, bodyHash: await hashBody(intent(text)), nonce, expiresAt: Date.now() + 60_000,
    });
    return {
      blockHeight: BLOCK,
      guardianId: o.sendGuardian ?? 'g1',
      conversationId: o.sendConversation ?? 'conv-1',
      message: o.sendText ?? text,
      visitorAddress: OWNER.address,
      signedMessage,
      signature: sign(wallet.privKey, wallet.address, signedMessage),
    };
  }

  const actor = () => agentEvents[agentEvents.length - 1]?.actor;

  it('an unsigned visitor still chats, as anonymous', async () => {
    const res = await call(chatCase, { blockHeight: BLOCK, message: 'hi', visitorAddress: OWNER.address });
    expect(res.status).toBe(200);
    expect(actor()).toBe('anonymous');
  });

  it('a signature over an ad-hoc string does not make the visitor the owner', async () => {
    const signedMessage = `chat:${Date.now()}`;
    await call(chatCase, {
      blockHeight: BLOCK, message: 'hi', visitorAddress: OWNER.address, signedMessage,
      signature: sign(OWNER.privKey, OWNER.address, signedMessage),
    });
    expect(actor()).toBe('anonymous');
  });

  it('a published experience attestation does not make the visitor the owner', async () => {
    const { message: signedMessage, signature } = await publishedAttestation(OWNER);
    await call(chatCase, { blockHeight: BLOCK, message: 'hi', visitorAddress: OWNER.address, signedMessage, signature });
    expect(actor()).toBe('anonymous');
  });

  it('a bound owner signature is recognised once', async () => {
    const body = await ownerRequest('build a tower');
    await call(chatCase, body);
    expect(actor()).toBe(OWNER.address);
    await call(chatCase, body);
    expect(actor()).toBe('anonymous');
  });

  it('the signature covers the text, the conversation, the guardian and the block', async () => {
    await call(chatCase, await ownerRequest('build a tower', { sendText: 'delete everything' }));
    expect(actor()).toBe('anonymous');
    await call(chatCase, await ownerRequest('build a tower', { sendConversation: 'conv-2' }));
    expect(actor()).toBe('anonymous');
    await call(chatCase, await ownerRequest('build a tower', { sendGuardian: 'g9' }));
    expect(actor()).toBe('anonymous');
    await call(chatCase, await ownerRequest('build a tower', { blockHeight: BLOCK + 1 }));
    expect(actor()).toBe('anonymous');
    await call(chatCase, await ownerRequest('build a tower', { purpose: 'auth' }));
    expect(actor()).toBe('anonymous');
    await call(chatCase, await ownerRequest('build a tower', { action: 'guardian.update' }));
    expect(actor()).toBe('anonymous');
  });
});
