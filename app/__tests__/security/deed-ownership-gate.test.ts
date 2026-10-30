/**
 * The ownership gate asks about the block's DEED, never about "some inscription
 * that says N.bitmap".
 *
 * A block's deed is the first valid `N.bitmap` inscription from block N onward.
 * Anyone can inscribe the same text again later; that copy owns nothing. Every
 * entry point below runs the REAL gate code (bitmap-ownership, ownership-gate,
 * block-write-auth, session/verify, auth/verify, ownership-sync); only the
 * sources are stood in for: the resolver's answer (`@/lib/onchain/deed`), the
 * live holder (`owner-freshness`) and inscription bodies (`ord`). The ord mock
 * also lists the wallet's inscriptions, so a gate that scanned the wallet for
 * any matching text would find the copy and grant: that is the case this suite
 * pins.
 *
 * Fixtures (from the 2026-10-30 review's offline reproductions):
 *   CANON — the deed for 840000, held by OWNER
 *   COPY  — a later inscription held by OTHER; its body varies per case:
 *           "840000.bitmap" (later copy), "840000" (bare number),
 *           " 840000.bitmap\n" (whitespace)
 *   999999999 — a block that is not mined: the resolver says `none`
 */

const mockEmitDeedVerified = jest.fn(async () => undefined);
const mockMint = jest.fn();
const mockSession = { current: null as null | { id: string; walletAddress: string; verifiedBlocks: number[] } };

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      json: async () => body,
    }),
  },
  NextRequest: class {},
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

// The resolver's answer. `{ virtual: true }` keeps this suite runnable against a
// tree that predates the deed module, so the red run fails on behaviour.
jest.mock(
  '@/lib/onchain/deed',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('../helpers/chain-ownership-mock').canonicalDeedFromFixture(),
  { virtual: true },
);

jest.mock('@/lib/onchain/owner-freshness', () => ({
  resolveInscriptionOwner: jest.fn(),
  resolveInscriptionOwnerAddress: jest.fn(),
  invalidateInscriptionOwner: jest.fn(),
}));

jest.mock('@/lib/onchain/ord', () => ({
  getAddressInscriptions: jest.fn(),
  getInscriptionContent: jest.fn(),
  getInscriptionBody: jest.fn(),
  getStatus: async () => ({ height: 960000 }),
  getOrdHosts: () => [],
}));

jest.mock('@/lib/onchain/sat-tracker', () => ({ readInscriptionBodyFromChain: async () => null }));
jest.mock('@/lib/bip322', () => ({ verifyBip322: () => true }));
jest.mock('@/lib/challenges', () => ({ consumeChallengeFromMessage: async () => true }));
jest.mock('@/lib/activity', () => ({ logActivity: () => undefined }));
jest.mock('@/lib/rate-limit-db', () => ({
  rateLimitDurable: async () => ({ allowed: true, retryAfterSec: 0 }),
  clientIpFrom: () => '127.0.0.1',
}));
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
  AUTH_VERIFY_LIMIT: 10,
}));
jest.mock('@/lib/block-event-emitters', () => ({
  emitDeedVerified: (...a: unknown[]) => mockEmitDeedVerified(...(a as [])),
  walletProofOf: () => ({ scheme: 'bip322' }),
}));
jest.mock('@/lib/verified-sessions', () => ({
  authenticateSession: async () =>
    mockSession.current ? { ok: true, status: 200, session: mockSession.current } : { ok: false, status: 401, reason: 'no session' },
  sessionCoversBlock: (s: { verifiedBlocks: number[] }, h: number) => s.verifiedBlocks.includes(h),
  sessionTokenFromHeaders: () => 'bg_vfy_test',
  touchSession: async () => undefined,
  mintVerifiedSession: (...a: unknown[]) => mockMint(...(a as [])),
  MAX_BLOCKS_PER_SESSION: 20,
  SESSION_CHALLENGE_PURPOSE: 'session',
}));

import prisma from '@/lib/prisma';
import { getAddressInscriptions, getInscriptionBody, getInscriptionContent } from '@/lib/onchain/ord';
import { resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';
import { contentNamesBlock, verifyBlockOwnedBy, verifyInscriptionOwnership } from '@/lib/onchain/bitmap-ownership';
import { requireLiveBlockOwner, requireVerifiedBlock } from '@/lib/ownership-gate';
import { requireSignedBlockOwner } from '@/lib/block-write-auth';
import { verifyBlockOwnership } from '@/lib/ownership-sync';
import { POST as sessionVerify } from '@/app/api/v1/session/verify/route';
import { POST as authVerify } from '@/app/api/v1/auth/verify/route';
import { clearDeeds, setDeed, setDeedVerdict } from '../helpers/chain-ownership-mock';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const FUTURE = 999999999;
const CANON = 'aa'.repeat(32) + 'i0';
const COPY = 'bb'.repeat(32) + 'i0';
const OWNER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const OTHER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

const holders: Record<string, string> = {};
const bodies: Record<string, string> = {};
const wallets: Record<string, string[]> = {};
let indexerDown = false;

function world(copyBody: string, copyHeight = BLOCK) {
  holders[CANON] = OWNER;
  holders[COPY] = OTHER;
  bodies[CANON] = `${BLOCK}.bitmap`;
  bodies[COPY] = copyBody;
  wallets[OWNER] = [CANON];
  wallets[OTHER] = [COPY];
  setDeed(BLOCK, CANON);
  if (copyHeight !== BLOCK) setDeedVerdict(copyHeight, 'none');
}

const COPIES: Array<[string, string, number]> = [
  ['a later copy "840000.bitmap"', '840000.bitmap', BLOCK],
  ['a bare number "840000"', '840000', BLOCK],
  ['a whitespace-padded " 840000.bitmap\\n"', ' 840000.bitmap\n', BLOCK],
];

beforeEach(() => {
  db.__reset();
  clearDeeds();
  for (const o of [holders, bodies, wallets]) for (const k of Object.keys(o)) delete o[k];
  indexerDown = false;
  mockSession.current = null;
  mockEmitDeedVerified.mockClear();
  mockMint.mockReset().mockImplementation(async (wallet: string, blocks: number[]) => ({
    token: 'bg_vfy_minted',
    session: { tokenPrefix: 'bg_vfy_m', walletAddress: wallet, verifiedBlocks: blocks, expiresAt: new Date(Date.now() + 3600_000) },
  }));
  (resolveInscriptionOwner as jest.Mock).mockImplementation(async (id: string) =>
    indexerDown || !holders[id] ? null : { address: holders[id], satpoint: `${id.slice(0, 64)}:0:0`, source: 'ord.test' },
  );
  (getInscriptionBody as jest.Mock).mockImplementation(async (id: string) =>
    indexerDown || bodies[id] === undefined ? null : { text: bodies[id], contentEncoding: null },
  );
  (getInscriptionContent as jest.Mock).mockImplementation(async (id: string) => (indexerDown ? null : bodies[id] ?? null));
  (getAddressInscriptions as jest.Mock).mockImplementation(async (w: string) => (indexerDown ? null : wallets[w] ?? []));
  // Unisat (the tertiary holder fallback) is never reachable here.
  global.fetch = jest.fn(async () => {
    throw new Error('network prohibited');
  }) as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

function sessionReq(body: Record<string, unknown>): any {
  return { json: async () => body, headers: { get: () => null } };
}

async function sessionVerifyAs(wallet: string, blocks: number[], extra: Record<string, unknown> = {}) {
  return (await sessionVerify(sessionReq({ walletAddress: wallet, message: 'Block Genomics verification: n', signature: 'sig', blocks, ...extra }))) as any;
}

async function authVerifyAs(wallet: string, blockHeight: number, extra: Record<string, unknown> = {}) {
  return (await authVerify(sessionReq({ walletAddress: wallet, message: 'Block Genomics verification: n', signature: 'sig', blockHeight, ...extra }))) as any;
}

/** Every gate entry point, asked whether `wallet` may act on `height`. Returns the HTTP status each answers. */
async function everyEntryPoint(wallet: string, height: number, callerId?: string) {
  mockSession.current = { id: 's1', walletAddress: wallet, verifiedBlocks: [height] };
  const header = { headers: { get: () => 'Bearer bg_vfy_test' } };
  return {
    requireLiveBlockOwner: (await requireLiveBlockOwner(wallet, height, { inscriptionId: callerId ?? null })).status,
    requireVerifiedBlock: (await requireVerifiedBlock(header, height, { inscriptionId: callerId ?? null })).status,
    requireSignedBlockOwner: (await requireSignedBlockOwner(wallet, height)).status,
    sessionVerify: (await sessionVerifyAs(wallet, [height], callerId ? { inscriptionIds: { [String(height)]: callerId } } : {})).status,
    authVerify: (await authVerifyAs(wallet, height, callerId ? { inscriptionId: callerId } : {})).status,
  };
}

const ALL = (status: number) => ({
  requireLiveBlockOwner: status,
  requireVerifiedBlock: status,
  requireSignedBlockOwner: status,
  sessionVerify: status,
  authVerify: status,
});

describe('(a)(b) a wallet holding a copy is denied by every entry point', () => {
  it.each(COPIES)('%s: 403 everywhere, no deed.verified, no block record', async (_label, body, height) => {
    world(body, height);
    expect(await everyEntryPoint(OTHER, BLOCK)).toEqual(ALL(403));
    expect(mockEmitDeedVerified).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
    expect(await db.block.findUnique({ where: { height: BLOCK } })).toBeNull();
  });

  it('the denial names the deed, and verifyBlockOwnedBy never reports the copy', async () => {
    world('840000.bitmap');
    const check = await verifyBlockOwnedBy(OTHER, BLOCK);
    expect(check.verified).toBe(false);
    expect(check.unavailable).toBeFalsy();
    expect(check.inscriptionId).not.toBe(COPY);
  });

  it('a copy naming an unmined block is 403 ownership_not_proven, not a grant', async () => {
    world(`${FUTURE}.bitmap`, FUTURE);
    holders[COPY] = OTHER;
    const gate = await requireLiveBlockOwner(OTHER, FUTURE);
    expect(gate).toMatchObject({ ok: false, status: 403, code: 'ownership_not_proven' });
    expect((await sessionVerifyAs(OTHER, [FUTURE])).status).toBe(403);
    expect(mockEmitDeedVerified).not.toHaveBeenCalled();
  });
});

describe('(b) the content re-check is exact bytes (defence in depth)', () => {
  it.each([
    ['840000.bitmap', true],
    ['840000', false],
    [' 840000.bitmap\n', false],
    ['840000.bitmap\n', false],
    ['0840000.bitmap', false],
    ['840000.BITMAP', false],
  ])('contentNamesBlock(%j) = %s', (content, ok) => {
    expect(contentNamesBlock(content, BLOCK)).toBe(ok);
  });

  it.each(COPIES.slice(1))('the holder of %s is refused even when asked about that exact inscription', async (_l, body) => {
    world(body);
    holders[COPY] = OTHER;
    const check = await verifyInscriptionOwnership(OTHER, COPY, BLOCK);
    expect(check.verified).toBe(false);
  });

  it('an encoded body or a delegate is refused even with the right text', async () => {
    world('840000.bitmap');
    (getInscriptionBody as jest.Mock).mockResolvedValueOnce({ text: '840000.bitmap', contentEncoding: 'br' });
    expect((await verifyInscriptionOwnership(OTHER, COPY, BLOCK)).verified).toBe(false);
    (resolveInscriptionOwner as jest.Mock).mockResolvedValueOnce({ address: OTHER, satpoint: 'x:0:0', delegate: CANON });
    expect((await verifyInscriptionOwnership(OTHER, COPY, BLOCK)).verified).toBe(false);
  });
});

describe('(c) a caller-supplied inscription id never selects what is checked', () => {
  it('naming the copy in inscriptionIds / inscriptionId / the gate hint: 403 everywhere', async () => {
    world('840000.bitmap');
    expect(await everyEntryPoint(OTHER, BLOCK, COPY)).toEqual(ALL(403));
    expect(mockEmitDeedVerified).not.toHaveBeenCalled();
  });

  it('the real owner naming the copy is still checked against the deed, and allowed', async () => {
    world('840000.bitmap');
    expect(await everyEntryPoint(OWNER, BLOCK, COPY)).toEqual({ ...ALL(200), sessionVerify: 201 });
    const row = await db.block.findUnique({ where: { height: BLOCK } });
    expect(row).toMatchObject({ ownerAddress: OWNER, inscriptionId: CANON });
  });

  it('a block record pinned to a copy is corrected by the ownership sync, not trusted', async () => {
    world('840000.bitmap');
    await db.block.create({ data: { height: BLOCK, ownerAddress: OTHER, inscriptionId: COPY } });
    const check = await verifyBlockOwnership(BLOCK, 'auth');
    expect(check).toMatchObject({ inscriptionId: CANON, onChainOwnerAddress: OWNER, match: false, action: 'update' });
    expect((await db.block.findUnique({ where: { height: BLOCK } })).inscriptionId).toBe(CANON);
  });
});

describe('(d) the deed holder is allowed, with exactly one deed.verified naming the deed', () => {
  it('every entry point answers OK', async () => {
    world('840000.bitmap');
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual({ ...ALL(200), sessionVerify: 201 });
  });

  it('session/verify mints for the block and emits one deed.verified for the deed', async () => {
    world('840000.bitmap');
    const res = await sessionVerifyAs(OWNER, [BLOCK], { inscriptionIds: { [String(BLOCK)]: COPY } });
    expect(res.status).toBe(201);
    expect(res.body.data.verifiedBlocks).toEqual([BLOCK]);
    expect(mockEmitDeedVerified).toHaveBeenCalledTimes(1);
    expect(mockEmitDeedVerified).toHaveBeenCalledWith(expect.objectContaining({ block: BLOCK, holder: OWNER, inscriptionId: CANON, via: 'session' }));
  });

  it('auth/verify records the deed and emits one deed.verified for it', async () => {
    world('840000.bitmap');
    const res = await authVerifyAs(OWNER, BLOCK, { inscriptionId: COPY });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tier: 1, holderCheck: 'live' });
    expect(mockEmitDeedVerified).toHaveBeenCalledTimes(1);
    expect(mockEmitDeedVerified).toHaveBeenCalledWith(expect.objectContaining({ inscriptionId: CANON, via: 'auth' }));
  });
});

describe('(e) no settled deed or no live holder: 503, never a grant', () => {
  it.each(['undetermined', 'disputed'] as const)('resolver %s → 503 everywhere, nothing emitted', async (verdict) => {
    world('840000.bitmap');
    setDeedVerdict(BLOCK, verdict);
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(ALL(503));
    expect(await everyEntryPoint(OTHER, BLOCK)).toEqual(ALL(503));
    expect(mockEmitDeedVerified).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('holder and content sources unreachable → 503 everywhere, nothing emitted', async () => {
    world('840000.bitmap');
    indexerDown = true;
    expect(await everyEntryPoint(OWNER, BLOCK)).toEqual(ALL(503));
    expect(mockEmitDeedVerified).not.toHaveBeenCalled();
  });

  it('the gate code for an outage is onchain_unavailable with Retry-After', async () => {
    world('840000.bitmap');
    setDeedVerdict(BLOCK, 'undetermined');
    expect(await requireLiveBlockOwner(OWNER, BLOCK)).toMatchObject({ ok: false, status: 503, code: 'onchain_unavailable' });
  });
});
