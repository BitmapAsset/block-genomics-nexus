/**
 * ISOLATED SIMULATION — the remaining Living Block event sources (spec §5.4)
 * through their real route handlers: the ownership cron (`deed.moved`), the
 * public ownership check (`deed.verified`, observed), experiences
 * (`experience.listed` / `experience.removed`, signed manifest) and the guardian
 * PATCH / DELETE status changes. Each one is also checked for §5.6 privacy.
 *
 * The ownership sync itself is stubbed: what is under test is the cron's rule
 * "emit only for a transfer that actually landed", not the indexer logic, which
 * has its own suites.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/prisma', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const { createEventStore } = require('../helpers/event-store');
  const client = createMemoryPrisma();
  const events = createEventStore();
  const memTx = client.$transaction;
  client.blockEvent = events.blockEvent;
  client.__events = events;
  client.$transaction = async (arg: any) =>
    typeof arg === 'function' ? events.$transaction((etx: any) => arg({ ...client, $executeRaw: etx.$executeRaw })) : memTx(arg);
  return { __esModule: true, default: client, prisma: client };
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
});

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: jest.fn(),
  verifyInscriptionOwnership: jest.fn(),
  scanWalletForBitmap: jest.fn(),
}));

const mockBatchVerify = jest.fn();
const mockVerifyOwnership = jest.fn();
jest.mock('@/lib/ownership-sync', () => ({
  ...jest.requireActual('@/lib/ownership-sync'),
  batchVerifyOwnership: (...a: unknown[]) => mockBatchVerify(...a),
  verifyBlockOwnership: (...a: unknown[]) => mockVerifyOwnership(...a),
}));

jest.mock('@/lib/experience-probe', () => ({
  __esModule: true,
  probeExperienceUrl: jest.fn(async () => ({ status: 'live', reachable: true, latencyMs: 80, httpStatus: 200 })),
  hostResolvesPublic: jest.fn(async () => true),
}));
jest.mock('@/lib/experience-judge', () => ({
  __esModule: true,
  judgeExperienceManifest: jest.fn(async () => ({ violated: false, ruleIndex: null, reasoning: 'clean', brainStatus: 'online' })),
}));

import prisma from '@/lib/prisma';
import { verifyBlockOwnedBy } from '@/lib/onchain/bitmap-ownership';
import { issueChallenge } from '@/lib/challenges';
import { buildActionMessage } from '@/lib/action-message';
import { computeManifestHash } from '@/lib/experience-protocol';
import { __resetBlockEventsState } from '@/lib/block-events';
import { verifyEventProof } from '@/lib/block-event-core';
import { getEventProof } from '@/lib/block-events';
import { GET as cronGet } from '@/app/api/v1/ownership/cron/route';
import { GET as ownershipVerifyGet } from '@/app/api/v1/ownership/verify/route';
import { POST as experiencePost } from '@/app/api/v1/experiences/route';
import { DELETE as experienceDelete } from '@/app/api/v1/experiences/[id]/route';
import { PATCH as guardianPatch, DELETE as guardianDelete } from '@/app/api/v1/guardian/[id]/route';
import { makeWallet, sign, freshNonce, type SimWallet } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const chain = verifyBlockOwnedBy as jest.Mock;
const BLOCK = 840000;
const rows = (): any[] => db.__events.__rows;

function req(body: any, headers: Record<string, string> = {}, url = 'http://test.local/api'): any {
  const lower = Object.fromEntries(
    Object.entries({ 'x-forwarded-for': '198.51.100.23', 'user-agent': 'PRIVATE-UA/1', ...headers }).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return { json: async () => body, url, nextUrl: new URL(url), headers: { get: (n: string) => lower[n.toLowerCase()] ?? null } };
}

function expectNothingPrivate(extra: string[] = []) {
  const stored = JSON.stringify(rows());
  for (const v of ['198.51.100.23', 'PRIVATE-UA/1', ...extra]) expect(stored).not.toContain(v);
}

let owner: SimWallet;

beforeEach(() => {
  db.__reset();
  rows().length = 0;
  __resetBlockEventsState();
  process.env.BG_EVENTS_ENABLED = 'true';
  process.env.BG_EVENT_SIGNING_KEY = '6b'.repeat(32);
  process.env.CRON_SECRET = 'test-cron-secret';
  owner = makeWallet('p2tr');
  chain.mockReset();
  chain.mockImplementation(async (w: string, h: number) => (w === owner.address && h === BLOCK ? { verified: true } : { verified: false, reason: 'not held' }));
  mockBatchVerify.mockReset();
  mockVerifyOwnership.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  delete process.env.BG_EVENTS_ENABLED;
  delete process.env.BG_EVENT_SIGNING_KEY;
  delete process.env.CRON_SECRET;
});

describe('ownership cron → deed.moved', () => {
  it('emits only for a transfer that landed, never for a deferred one or a match', async () => {
    const buyer = makeWallet('p2tr');
    await db.block.create({ data: { height: 700001, ownerAddress: owner.address, inscriptionId: 'insc-a' } });
    await db.block.create({ data: { height: 700002, ownerAddress: owner.address, inscriptionId: 'insc-b' } });
    await db.block.create({ data: { height: 700003, ownerAddress: owner.address, inscriptionId: 'insc-c' } });
    const check = (h: number, onChain: string, action: string) => ({
      blockHeight: h, dbOwnerAddress: owner.address, onChainOwnerAddress: onChain, inscriptionId: `insc-${h}`,
      match: onChain === owner.address, indeterminate: false, action,
    });
    mockBatchVerify.mockImplementation(async () => {
      // 700001: the transfer is applied. 700002: a mismatch the sync deferred.
      await db.block.update({ where: { height: 700001 }, data: { ownerAddress: buyer.address } });
      return [check(700001, buyer.address, 'update'), check(700002, buyer.address, 'update'), check(700003, owner.address, 'none')];
    });

    const res: any = await cronGet(req(null, { authorization: 'Bearer test-cron-secret' }));
    expect(res.status).toBe(200);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ block: 700001, kind: 'deed.moved', actorType: 'system', signerScheme: 'ed25519', summary: 'The deed moved to a new holder' });
    expect(rows()[0].payload).toEqual({ holder: buyer.address, inscriptionId: 'insc-a', via: 'ownership-cron' });
    expectNothingPrivate(['test-cron-secret']);
  });

  it('an unauthenticated cron call emits nothing', async () => {
    const res: any = await cronGet(req(null));
    expect(res.status).toBe(401);
    expect(mockBatchVerify).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });
});

describe('public ownership check → observed deed.verified', () => {
  const get = () => ownershipVerifyGet(req(null, {}, `http://test.local/api/v1/ownership/verify?blockHeight=${BLOCK}`)) as Promise<any>;

  it('a live match emits one system-signed deed.verified, deduped to one per holder per day', async () => {
    mockVerifyOwnership.mockResolvedValue({
      blockHeight: BLOCK, dbOwnerAddress: owner.address, onChainOwnerAddress: owner.address, inscriptionId: 'insc-840000i0',
      match: true, indeterminate: false, action: 'none',
    });
    for (let i = 0; i < 5; i++) expect((await get()).status).toBe(200);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ kind: 'deed.verified', actorType: 'system', signerScheme: 'ed25519' });
    expect(rows()[0].payload).toEqual({ holder: owner.address, inscriptionId: 'insc-840000i0', via: 'ownership-check' });
    const proof = await getEventProof(BLOCK, rows()[0].id);
    expect(proof).not.toBe('disabled');
  });

  it('50 concurrent live-match GETs on one block: at most one event; once recorded, a GET never takes the lock', async () => {
    mockVerifyOwnership.mockResolvedValue({
      blockHeight: BLOCK, dbOwnerAddress: owner.address, onChainOwnerAddress: owner.address, inscriptionId: 'insc-840000i0',
      match: true, indeterminate: false, action: 'none',
    });
    // 50 different visitors (one IP each), so the route's 30/min bucket is not what limits them.
    const visit = (i: number) =>
      ownershipVerifyGet(req(null, { 'x-forwarded-for': `203.0.113.${i}` }, `http://test.local/api/v1/ownership/verify?blockHeight=${BLOCK}`)) as Promise<any>;
    const first = await Promise.all(Array.from({ length: 50 }, (_, i) => visit(i)));
    expect(first.every((r) => r.status === 200)).toBe(true);
    expect(rows().filter((r) => r.kind === 'deed.verified')).toHaveLength(1);

    const tx = jest.spyOn(db, '$transaction');
    const locksBefore = db.__events.rawCalls.length;
    const again = await Promise.all(Array.from({ length: 50 }, (_, i) => visit(100 + i)));
    expect(again.every((r) => r.status === 200)).toBe(true);
    expect(tx).not.toHaveBeenCalled();
    expect(db.__events.rawCalls).toHaveLength(locksBefore);
    expect(rows()).toHaveLength(1);
    tx.mockRestore();
  });

  it('an outage or a mismatch emits nothing', async () => {
    mockVerifyOwnership.mockResolvedValue({ blockHeight: BLOCK, dbOwnerAddress: owner.address, onChainOwnerAddress: null, inscriptionId: 'x', match: false, indeterminate: true, action: 'none' });
    await get();
    mockVerifyOwnership.mockResolvedValue({ blockHeight: BLOCK, dbOwnerAddress: owner.address, onChainOwnerAddress: 'bc1pother', inscriptionId: 'x', match: false, indeterminate: false, action: 'update' });
    await get();
    expect(rows()).toHaveLength(0);
  });
});

describe('experiences → experience.listed / experience.removed', () => {
  const MANIFEST = { name: 'Night Market', experienceType: 'web', entryUrl: 'https://market.example.com', transport: 'https', version: '1.0.0', description: 'PRIVATE-description-not-an-event-field' };

  async function signed(action: string, method: string, pathName: string, manifestHash: string, purpose: string) {
    const nonce = freshNonce();
    await issueChallenge(nonce, { address: owner.address, purpose });
    const message = buildActionMessage({ action, method, path: pathName, blockHeight: BLOCK, bodyHash: manifestHash, nonce, expiresAt: Date.now() + 300_000 });
    return { message, signature: sign(owner.privKey, owner.address, message) };
  }

  it('a signed register lists it with the manifest signature as proof; a signed removal removes it', async () => {
    const full = { blockHeight: BLOCK, ...MANIFEST };
    const hash = await computeManifestHash(full as any);
    const reg = await signed('experience.register', 'POST', '/api/v1/experiences', hash, 'experience-register');
    const res: any = await experiencePost(req({ ...full, walletAddress: owner.address, ...reg }));
    expect(res.status).toBe(201);
    const id = res.body.data.id;
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ kind: 'experience.listed', signerScheme: 'bip322', summary: '“Night Market” listed on this block', proofMessage: reg.message });
    expect(rows()[0].payload).toEqual({ experienceId: id, experienceType: 'web', name: 'Night Market' });

    const stored = db.__rows('experience')[0];
    const rem = await signed('experience.remove', 'DELETE', `/api/v1/experiences/${id}`, stored.manifestHash, 'experience-manage');
    const del: any = await experienceDelete(req({ walletAddress: owner.address, ...rem }), { params: Promise.resolve({ id }) });
    expect(del.status).toBe(200);
    expect(rows().map((r) => r.kind)).toEqual(['experience.listed', 'experience.removed']);

    for (const r of rows()) {
      const proof = await getEventProof(BLOCK, r.id);
      expect(verifyEventProof(proof as any).checks.signature).toBe(true);
    }
    expectNothingPrivate([MANIFEST.description, MANIFEST.entryUrl]);
  });
});

describe('guardian PATCH / DELETE → guardian.status on a change only', () => {
  beforeEach(async () => {
    await db.guardianAgent.create({
      data: { id: 'gdn_9', blockHeight: BLOCK, ownerAddress: owner.address, name: 'Warden', status: 'active', selfHosted: false, memoryMd: 'PRIVATE-memory', soulMd: 'PRIVATE-soul' },
    });
  });
  const auth = () => {
    const message = 'Manage guardian gdn_9';
    return { ownerAddress: owner.address, message, signature: sign(owner.privKey, owner.address, message) };
  };

  it('pause → resting, rename → nothing, DELETE → offline; the unbound signature never appears', async () => {
    const a = auth();
    expect(((await guardianPatch(req({ ...a, status: 'paused' }), { params: Promise.resolve({ id: 'gdn_9' }) })) as any).status).toBe(200);
    expect(((await guardianPatch(req({ ...a, name: 'Warden II', soulMd: 'PRIVATE-soul-2' }), { params: Promise.resolve({ id: 'gdn_9' }) })) as any).status).toBe(200);
    const url = `http://test.local/api/v1/guardian/gdn_9?ownerAddress=${encodeURIComponent(a.ownerAddress)}&signature=${encodeURIComponent(a.signature)}&message=${encodeURIComponent(a.message)}`;
    expect(((await guardianDelete(req(null, {}, url), { params: Promise.resolve({ id: 'gdn_9' }) })) as any).status).toBe(200);

    expect(rows().map((r) => [r.kind, r.payload.from, r.payload.to, r.signerScheme])).toEqual([
      ['guardian.status', 'idle', 'resting', 'ed25519'],
      ['guardian.status', 'resting', 'offline', 'ed25519'],
    ]);
    expectNothingPrivate([a.signature, a.message, 'PRIVATE-memory', 'PRIVATE-soul']);
  });
});
