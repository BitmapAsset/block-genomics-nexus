/**
 * ISOLATED SIMULATION — the /api/v1/experiences routes end-to-end.
 *
 * Hits the REAL route handlers with REAL BIP-322 signatures + an in-memory
 * Prisma, so the ownership gate (BIP-322 + single-use challenge + live on-chain
 * re-verify) is exercised for real. The SSRF probe and the Brain judge are
 * mocked at their module boundary so this file focuses on routing, validation,
 * ownership, and the brain-reject / probe-rate-limit paths.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
      headers: { set: () => {}, get: () => null },
    }),
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

const mockProbe = jest.fn(async () => ({ status: 'live', reachable: true, latencyMs: 120, httpStatus: 200 }));
jest.mock('@/lib/experience-probe', () => ({
  __esModule: true,
  probeExperienceUrl: (...a: unknown[]) => mockProbe(...(a as [])),
}));

const mockJudge = jest.fn(
  async (): Promise<{ violated: boolean; ruleIndex: number | null; reasoning: string; brainStatus: string }> => ({
    violated: false,
    ruleIndex: null,
    reasoning: 'clean',
    brainStatus: 'online',
  }),
);
jest.mock('@/lib/experience-judge', () => ({
  __esModule: true,
  judgeExperienceManifest: (...a: unknown[]) => mockJudge(...(a as [])),
}));

import prisma from '@/lib/prisma';
import * as ord from '@/lib/onchain/ord';
import { issueChallenge } from '@/lib/challenges';
import { POST as registerPOST, GET as listGET } from '@/app/api/v1/experiences/route';
import { GET as getById, PATCH as patchById, DELETE as deleteById } from '@/app/api/v1/experiences/[id]/route';
import { POST as probePOST } from '@/app/api/v1/experiences/[id]/probe/route';
import { makeWallet, sign, freshNonce, challengeMessage } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const getOwner = ord.getInscriptionOwner as jest.Mock;
const onChain = (address: string) => ({ address, satpoint: `${address}:0` });

const req = (body: any, url = 'http://test.local/') => ({ json: async () => body, url, nextUrl: new URL(url) } as any);
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

async function issue(address: string, purpose: string): Promise<string> {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address, purpose });
  return challengeMessage(nonce);
}

async function registerAs(wallet: { wif: string; address: string }, blockHeight: number, overrides: any = {}) {
  const message = await issue(wallet.address, 'experience-register');
  const signature = sign(wallet.wif, wallet.address, message);
  return registerPOST(
    req({
      walletAddress: wallet.address,
      blockHeight,
      name: 'Pixel Plaza',
      experienceType: 'web',
      entryUrl: 'https://plaza.example.com',
      transport: 'https',
      version: '1.0.0',
      signature,
      challenge: message,
      ...overrides,
    }),
  );
}

async function signedBody(wallet: { wif: string; address: string }, purpose: string, extra: any) {
  const message = await issue(wallet.address, purpose);
  const signature = sign(wallet.wif, wallet.address, message);
  return { walletAddress: wallet.address, signature, challenge: message, ...extra };
}

beforeEach(() => {
  db.__reset();
  getOwner.mockReset();
  getOwner.mockResolvedValue(null);
  mockProbe.mockClear();
  mockProbe.mockResolvedValue({ status: 'live', reachable: true, latencyMs: 120, httpStatus: 200 });
  mockJudge.mockClear();
  mockJudge.mockResolvedValue({ violated: false, ruleIndex: null, reasoning: 'clean', brainStatus: 'online' });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('POST /api/v1/experiences (register)', () => {
  it('registers for the verified on-chain owner → 201, probed, soulJudged', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 3001, ownerAddress: owner.address, inscriptionId: 'insc-3001' } });
    getOwner.mockResolvedValue(onChain(owner.address));

    const res: any = await registerAs(owner, 3001);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('live'); // set by the (mocked) register probe
    expect(res.body.data.soulJudged).toBe(true);
    expect(mockProbe).toHaveBeenCalledTimes(1);
    expect(await db.experience.count({ where: { blockHeight: 3001 } })).toBe(1);
  });

  it('FAILS CLOSED: a former owner (on-chain mismatch) cannot register → 403', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 3002, ownerAddress: seller.address, inscriptionId: 'insc-3002' } });
    await db.user.create({ data: { walletAddress: seller.address, verified: true, tier: 1, anchorBlock: 3002, ownedBlocks: [] } });
    getOwner.mockResolvedValue(onChain(buyer.address)); // live truth: buyer owns it

    const res: any = await registerAs(seller, 3002);
    expect(res.status).toBe(403);
    expect(await db.experience.count({ where: { blockHeight: 3002 } })).toBe(0);
  });

  it('rejects a missing-signature body → 400 (no challenge consumed)', async () => {
    const owner = makeWallet('p2tr');
    const res: any = await registerPOST(req({ walletAddress: owner.address, blockHeight: 3003, name: 'X', experienceType: 'web', entryUrl: 'https://x.example.com', transport: 'https', version: '1' }));
    expect(res.status).toBe(400);
  });

  it('rejects a manifest with a non-TLS / SSRF entryUrl → 400', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 3004, ownerAddress: owner.address, inscriptionId: 'insc-3004' } });
    getOwner.mockResolvedValue(onChain(owner.address));
    const res: any = await registerAs(owner, 3004, { entryUrl: 'http://169.254.169.254/latest' });
    expect(res.status).toBe(400);
    expect(await db.experience.count({ where: { blockHeight: 3004 } })).toBe(0);
  });

  it('Brain violation → 422 + ContentFlag, experience NOT created', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 3005, ownerAddress: owner.address, inscriptionId: 'insc-3005' } });
    getOwner.mockResolvedValue(onChain(owner.address));
    mockJudge.mockResolvedValue({ violated: true, ruleIndex: 3, reasoning: 'fraud/scam detected', brainStatus: 'online' });

    const res: any = await registerAs(owner, 3005, { name: 'Bitcoin Doubler' });
    expect(res.status).toBe(422);
    expect(res.body.ruleIndex).toBe(3);
    expect(await db.experience.count({ where: { blockHeight: 3005 } })).toBe(0);
    expect(await db.contentFlag.count({ where: { contentType: 'experience', isBrainFlag: true } })).toBe(1);
  });
});

describe('GET /api/v1/experiences (discovery)', () => {
  it('filters by blockHeight, type, and status; paginates', async () => {
    await db.experience.create({ data: { walletAddress: 'w', blockHeight: 10, experienceType: 'web', status: 'live', name: 'A', entryUrl: 'https://a', transport: 'https', version: '1', capabilities: [] } });
    await db.experience.create({ data: { walletAddress: 'w', blockHeight: 10, experienceType: 'minecraft', status: 'unreachable', name: 'B', entryUrl: 'https://b', transport: 'custom', version: '1', capabilities: [] } });
    await db.experience.create({ data: { walletAddress: 'w', blockHeight: 20, experienceType: 'web', status: 'live', name: 'C', entryUrl: 'https://c', transport: 'https', version: '1', capabilities: [] } });

    const all: any = await listGET(req({}, 'http://test.local/api/v1/experiences?blockHeight=10'));
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBe(2);

    const web: any = await listGET(req({}, 'http://test.local/api/v1/experiences?blockHeight=10&type=web&status=live'));
    expect(web.body.data.experiences.length).toBe(1);
    expect(web.body.data.experiences[0].name).toBe('A');

    const paged: any = await listGET(req({}, 'http://test.local/api/v1/experiences?limit=1&offset=1'));
    expect(paged.body.data.experiences.length).toBe(1);
    expect(paged.body.data.total).toBe(3);
  });

  it('rejects an invalid type filter → 400', async () => {
    const res: any = await listGET(req({}, 'http://test.local/api/v1/experiences?type=roblox'));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/experiences/[id]', () => {
  it('200 for an existing experience, 404 otherwise', async () => {
    const exp = await db.experience.create({ data: { walletAddress: 'w', blockHeight: 5, experienceType: 'web', status: 'live', name: 'Solo', entryUrl: 'https://s', transport: 'https', version: '1', capabilities: [], lastProbedAt: new Date() } });
    const ok: any = await getById(req({}), withId(exp.id));
    expect(ok.status).toBe(200);
    expect(ok.body.data.name).toBe('Solo');

    const missing: any = await getById(req({}), withId('nope'));
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/v1/experiences/[id]', () => {
  it('owner updates the manifest → 200, re-probed', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 4001, ownerAddress: owner.address, inscriptionId: 'insc-4001' } });
    getOwner.mockResolvedValue(onChain(owner.address));
    const exp = await db.experience.create({ data: { walletAddress: owner.address, blockHeight: 4001, experienceType: 'web', status: 'live', name: 'Old', entryUrl: 'https://old.example.com', transport: 'https', version: '1', capabilities: [] } });

    const body = await signedBody(owner, 'experience-manage', { name: 'New Name' });
    const res: any = await patchById(req(body), withId(exp.id));
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
    expect(mockProbe).toHaveBeenCalled();
  });

  it('a non-owner wallet cannot PATCH → 403', async () => {
    const owner = makeWallet('p2tr');
    const stranger = makeWallet('p2wpkh');
    const exp = await db.experience.create({ data: { walletAddress: owner.address, blockHeight: 4002, experienceType: 'web', status: 'live', name: 'Mine', entryUrl: 'https://m.example.com', transport: 'https', version: '1', capabilities: [] } });

    const body = await signedBody(stranger, 'experience-manage', { name: 'Hijack' });
    const res: any = await patchById(req(body), withId(exp.id));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/experiences/[id]', () => {
  it('owner deletes → 200 removed, row gone', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 4003, ownerAddress: owner.address, inscriptionId: 'insc-4003' } });
    getOwner.mockResolvedValue(onChain(owner.address));
    const exp = await db.experience.create({ data: { walletAddress: owner.address, blockHeight: 4003, experienceType: 'web', status: 'live', name: 'Doomed', entryUrl: 'https://d.example.com', transport: 'https', version: '1', capabilities: [] } });

    const body = await signedBody(owner, 'experience-manage', {});
    const res: any = await deleteById(req(body), withId(exp.id));
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
    expect(await db.experience.count({ where: { id: exp.id } })).toBe(0);
  });
});

describe('POST /api/v1/experiences/[id]/probe', () => {
  it('probes a stale experience → 200 with probe result', async () => {
    const exp = await db.experience.create({ data: { walletAddress: 'w', blockHeight: 6, experienceType: 'web', status: 'pending', name: 'P', entryUrl: 'https://p.example.com', transport: 'https', version: '1', capabilities: [], lastProbedAt: null } });
    const res: any = await probePOST(req({}), withId(exp.id));
    expect(res.status).toBe(200);
    expect(res.body.data.probe.status).toBe('live');
    expect(mockProbe).toHaveBeenCalledTimes(1);
  });

  it('rate-limits a second probe within 1 minute → 429', async () => {
    const exp = await db.experience.create({ data: { walletAddress: 'w', blockHeight: 7, experienceType: 'web', status: 'live', name: 'Q', entryUrl: 'https://q.example.com', transport: 'https', version: '1', capabilities: [], lastProbedAt: new Date() } });
    const res: any = await probePOST(req({}), withId(exp.id));
    expect(res.status).toBe(429);
    expect(mockProbe).not.toHaveBeenCalled();
  });
});
