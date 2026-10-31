/**
 * Guardian reads answer what a visitor may see; the owner's settings answer
 * only the owner.
 *
 * A guardian row holds the owner's contact channels, prompts, memory, config,
 * LLM endpoint and monitor pairing. The public reads (`GET /guardian` by block
 * or by owner, `GET /guardian/[id]`) return an explicit allow-list of fields.
 * The owner view (everything the settings panel edits, the API key masked,
 * never the monitor token hash) needs one of:
 *   - a monitor token for that guardian (`Authorization: Bearer`), or
 *   - a bound, single-use signed read (`guardian.config.read`, purpose
 *     `guardian`, this guardian's path and block) from the wallet that holds
 *     the block now.
 *
 * Every column of `GuardianAgent` is classified below, read from the schema,
 * so a new column fails this suite until someone decides who may read it.
 *
 * Real routes + real BIP-322 signatures; mocked seams: DB (in memory), the
 * ownership gate (chainOwner IS the live deed), event emitters, key masking.
 */

import fs from 'fs';
import path from 'path';

let chainOwner: Record<number, string> = {};

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

jest.mock('@/lib/key-encryption', () => ({
  encryptApiKey: (k: string) => `enc(${k})`,
  maskApiKey: (k: string | null) => (k ? '••••' : null),
}));

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

jest.mock('@/lib/block-event-emitters', () => ({
  emitGuardianRegistered: jest.fn(async () => undefined),
  emitGuardianTransition: jest.fn(async () => undefined),
}));
jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null, headers: {} }) }));

import prisma from '@/lib/prisma';
import { buildActionMessage, hashBody } from '@/lib/action-message';
import { issueChallenge } from '@/lib/challenges';
import { generateMonitorToken } from '@/lib/monitor-tokens';
import { makeWallet, sign, freshNonce, type SimWallet } from '../helpers/wallet-sim';
import * as listRoute from '@/app/api/v1/guardian/route';
import * as detailRoute from '@/app/api/v1/guardian/[id]/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const OTHER_BLOCK = 840001;
const OWNER = makeWallet('p2tr');
const STRANGER = makeWallet('p2tr');
const CLEAR_KEY = 'sk-owner-clear-key-0001';
const TOKEN_HASH = 'f'.repeat(64);

/** Every GuardianAgent column, read from the schema. */
function schemaFields(): string[] {
  const schema = fs.readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
  const start = schema.indexOf('model GuardianAgent {');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = schema.indexOf('\n}', start);
  return schema
    .slice(start, end)
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('@@') && !l.startsWith('//'))
    .map((l) => l.split(/\s+/)[0]);
}

/** Visible to anyone. */
const PUBLIC = [
  'id', 'blockHeight', 'name', 'personality', 'status', 'protocolVersion', 'selfHosted',
  'endpointVerified', 'lastHeartbeat', 'totalMessages', 'createdAt',
  'llmProvider', // agent hub capability badge ("OpenAI LLM")
];
/** Derived booleans the public answer carries instead of a private column. */
const PUBLIC_DERIVED = ['llmConfigured'];
/** The owner view only. */
const OWNER_ONLY = [
  'ownerAddress', 'soulMd', 'agentMd', 'skillsMd', 'memoryMd', 'llmModel', 'llmEndpoint', 'agentEndpoint',
  'autoResponses', 'escalateTelegram', 'escalateEmail', 'autoApproveDelegationUnder', 'updatedAt', 'configJson',
  'monitorTokenCreatedAt', 'monitorPairedAt', 'monitorPairedWallet', 'monitorWebhookUrl', 'graceDeadline',
  'llmApiKey', // masked, never the stored value
];
/** Never in any answer. `totalVisitors` is never incremented, so no route serves it. */
const NEVER = ['monitorTokenHash', 'totalVisitors'];

function fullRow(id: string, height: number, owner: string) {
  return {
    id, blockHeight: height, ownerAddress: owner, name: 'Keeper', soulMd: 'soul-private', agentMd: 'agent-private',
    skillsMd: 'skills-private', memoryMd: 'memory-private', personality: 'calm', llmProvider: 'openai',
    llmModel: 'gpt-x', llmApiKey: `enc(${CLEAR_KEY})`, llmEndpoint: 'https://llm.example.com/v1',
    selfHosted: false, agentEndpoint: 'https://agent.example.com', endpointVerified: false,
    lastHeartbeat: new Date(), autoResponses: '[{"trigger":"hi","response":"hello"}]',
    escalateTelegram: '123456789', escalateEmail: 'owner@example.com', autoApproveDelegationUnder: 1000,
    status: 'active', totalVisitors: 3, totalMessages: 9, createdAt: new Date(), updatedAt: new Date(),
    configJson: '{"private":true}', protocolVersion: '1.0.0', monitorTokenCreatedAt: new Date(),
    monitorTokenHash: TOKEN_HASH, monitorPairedAt: new Date(), monitorPairedWallet: owner,
    monitorWebhookUrl: 'https://hooks.example.com/bg', graceDeadline: new Date(),
  };
}

function getReq(url: string, headers: Record<string, string> = {}) {
  const u = new URL('http://localhost' + url);
  return { url: u.toString(), nextUrl: u, headers: new Headers(headers), json: async () => ({}) } as any;
}
function postReq(url: string, body: Record<string, unknown>) {
  const u = new URL('http://localhost' + url);
  return { url: u.toString(), nextUrl: u, headers: new Headers({ 'content-type': 'application/json' }), json: async () => JSON.parse(JSON.stringify(body)) } as any;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** A bound signed read of guardian `id` on `height` by `wallet`. */
async function signedRead(id: string, height: number, wallet: SimWallet, o: { action?: string; purpose?: string } = {}) {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address: wallet.address, purpose: o.purpose ?? 'guardian' });
  const intent = { ownerAddress: wallet.address };
  const message = buildActionMessage({
    action: o.action ?? 'guardian.config.read', method: 'POST', path: `/api/v1/guardian/${id}`,
    blockHeight: height, bodyHash: await hashBody(intent), nonce, expiresAt: Date.now() + 60_000,
  });
  return { ...intent, message, signature: sign(wallet.privKey, wallet.address, message) };
}

beforeEach(async () => {
  db.__reset();
  chainOwner = { [BLOCK]: OWNER.address, [OTHER_BLOCK]: STRANGER.address };
  await db.guardianAgent.create({ data: fullRow('grd_a', BLOCK, OWNER.address) });
  await db.guardianAgent.create({ data: fullRow('grd_b', OTHER_BLOCK, STRANGER.address) });
});

function expectPublicOnly(g: Record<string, unknown>) {
  const allowed = new Set([...PUBLIC, ...PUBLIC_DERIVED]);
  const extra = Object.keys(g).filter((k) => !allowed.has(k));
  expect(extra).toEqual([]);
  const text = JSON.stringify(g);
  for (const secret of ['owner@example.com', '123456789', 'memory-private', 'soul-private', 'hooks.example.com', TOKEN_HASH]) {
    expect(text).not.toContain(secret);
  }
}

describe('every GuardianAgent column is classified', () => {
  it('public, owner-only or never: no column left undecided, none in two lists', () => {
    const fields = schemaFields();
    const classified = [...PUBLIC, ...OWNER_ONLY, ...NEVER];
    expect(new Set(classified).size).toBe(classified.length);
    expect(fields.filter((f) => !classified.includes(f))).toEqual([]);
    expect(classified.filter((f) => !fields.includes(f))).toEqual([]);
  });
});

describe('anonymous guardian reads carry public fields only', () => {
  it('GET /guardian?blockHeight=', async () => {
    const res: any = await listRoute.GET(getReq(`/api/v1/guardian?blockHeight=${BLOCK}`));
    expect(res.status).toBe(200);
    expect(res.body.guardians).toHaveLength(1);
    expectPublicOnly(res.body.guardians[0]);
    expect(res.body.guardians[0]).toMatchObject({ id: 'grd_a', name: 'Keeper', status: 'active', llmConfigured: true });
  });

  it('GET /guardian?ownerAddress=', async () => {
    const res: any = await listRoute.GET(getReq(`/api/v1/guardian?ownerAddress=${OWNER.address}`));
    expect(res.status).toBe(200);
    expect(res.body.guardians).toHaveLength(1);
    expectPublicOnly(res.body.guardians[0]);
  });

  it('GET /guardian/[id]', async () => {
    const res: any = await detailRoute.GET(getReq('/api/v1/guardian/grd_a'), ctx('grd_a'));
    expect(res.status).toBe(200);
    expectPublicOnly(res.body.guardian);
  });

  it('llmConfigured is false when the guardian has no key, provider or model', async () => {
    await db.guardianAgent.update({ where: { id: 'grd_a' }, data: { llmApiKey: null } });
    const res: any = await detailRoute.GET(getReq('/api/v1/guardian/grd_a'), ctx('grd_a'));
    expect(res.body.guardian.llmConfigured).toBe(false);
  });
});

describe('owner view: a monitor token for this guardian', () => {
  it('its own token opens the owner view; no clear key, no token hash', async () => {
    const token = await generateMonitorToken('grd_a', OWNER.address);
    const res: any = await detailRoute.GET(getReq('/api/v1/guardian/grd_a', { authorization: `Bearer ${token}` }), ctx('grd_a'));
    expect(res.status).toBe(200);
    const g = res.body.guardian;
    expect(g.escalateEmail).toBe('owner@example.com');
    expect(g.soulMd).toBe('soul-private');
    expect(g.monitorTokenActive).toBe(true);
    expect('monitorTokenHash' in g).toBe(false);
    expect(JSON.stringify(g)).not.toContain(CLEAR_KEY);
    expect(JSON.stringify(g)).not.toContain(TOKEN_HASH);
  });

  it('a valid token for another guardian is 401', async () => {
    const otherToken = await generateMonitorToken('grd_b', STRANGER.address);
    const res: any = await detailRoute.GET(getReq('/api/v1/guardian/grd_a', { authorization: `Bearer ${otherToken}` }), ctx('grd_a'));
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('owner@example.com');
  });

  it('a made-up token is 401', async () => {
    const res: any = await detailRoute.GET(getReq('/api/v1/guardian/grd_a', { authorization: 'Bearer nope' }), ctx('grd_a'));
    expect(res.status).toBe(401);
  });
});

describe('owner view: a bound signed read by the wallet that holds the block', () => {
  const read = (body: Record<string, unknown>, id = 'grd_a') =>
    (detailRoute as any).POST(postReq(`/api/v1/guardian/${id}`, body), ctx(id));

  it('no signature: no private field', async () => {
    const res: any = await read({ ownerAddress: OWNER.address });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('owner@example.com');
  });

  it('the owner gets the owner view, the key masked, no token hash', async () => {
    const res: any = await read(await signedRead('grd_a', BLOCK, OWNER));
    expect(res.status).toBe(200);
    const g = res.body.guardian;
    expect(g.escalateEmail).toBe('owner@example.com');
    expect(g.memoryMd).toBe('memory-private');
    expect(g.llmApiKey).not.toBe(`enc(${CLEAR_KEY})`);
    expect(JSON.stringify(g)).not.toContain(CLEAR_KEY);
    expect('monitorTokenHash' in g).toBe(false);
    expect(g.monitorTokenActive).toBe(true);
  });

  it('the same signed read replayed is 401', async () => {
    const body = await signedRead('grd_a', BLOCK, OWNER);
    expect((await read(body)).status).toBe(200);
    const again: any = await read(body);
    expect(again.status).toBe(401);
    expect(JSON.stringify(again.body)).not.toContain('owner@example.com');
  });

  it("another wallet's bound signature is refused by the ownership gate", async () => {
    const res: any = await read(await signedRead('grd_a', BLOCK, STRANGER));
    expect([401, 403]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('owner@example.com');
  });

  it('a read signed for another guardian, block, action or purpose is 401', async () => {
    expect((await read(await signedRead('grd_b', BLOCK, OWNER))).status).toBe(401);
    expect((await read(await signedRead('grd_a', OTHER_BLOCK, OWNER))).status).toBe(401);
    expect((await read(await signedRead('grd_a', BLOCK, OWNER, { action: 'guardian.update' }))).status).toBe(401);
    expect((await read(await signedRead('grd_a', BLOCK, OWNER, { purpose: 'auth' }))).status).toBe(401);
  });

  it('after a sale the seller no longer reads the settings', async () => {
    chainOwner[BLOCK] = STRANGER.address;
    const res: any = await read(await signedRead('grd_a', BLOCK, OWNER));
    expect(res.status).toBe(403);
  });
});
