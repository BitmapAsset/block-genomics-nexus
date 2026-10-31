/**
 * scripts/ownership-dry-run.ts reads and reports; it never writes. Every write
 * path it could reach is made to throw here: the database (any Prisma call),
 * canonicalDeedFor (persists verdicts), verifyBlockOwnership (stamps the row),
 * processOwnershipTransfer / batchVerifyOwnership, and any non-GET request.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('@/lib/prisma', () => {
  const boom = (): never => {
    throw new Error('dry run touched the database');
  };
  const client: any = new Proxy({}, { get: () => new Proxy(boom, { get: () => boom }) });
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/ownership-sync', () => {
  const actual = jest.requireActual('@/lib/ownership-sync');
  const boom = () => {
    throw new Error('dry run reached a write path');
  };
  return {
    holderMayTriggerTransfer: actual.holderMayTriggerTransfer,
    verifyBlockOwnership: jest.fn(boom),
    batchVerifyOwnership: jest.fn(boom),
    verifyAndSyncBlock: jest.fn(boom),
    processOwnershipTransfer: jest.fn(boom),
  };
});

jest.mock('@/lib/onchain/deed', () => ({
  deedResolverOptions: () => ({ freshness: 'display', walkCap: 6, origins: { ord: 'https://ordinals.com', esplora: ['https://mempool.space/api'] } }),
  canonicalDeedFor: jest.fn(() => {
    throw new Error('dry run asked the persisting deed door');
  }),
}));

jest.mock('@/vendor/bitmap-resolver', () => ({ resolve: jest.fn() }));

jest.mock('@/lib/onchain/owner-freshness', () => ({ resolveInscriptionOwner: jest.fn() }));

import { dryRunHeight, RELEASED_ON_TRANSFER } from '../../scripts/ownership-dry-run';
import { resolve } from '@/vendor/bitmap-resolver';
import { resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';
import { processOwnershipTransfer, verifyBlockOwnership } from '@/lib/ownership-sync';
import { canonicalDeedFor } from '@/lib/onchain/deed';

const SEED = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const VECTOR_840000 = '05f8584cf4dbe34ef677f8f316fcac9e6e4ccb0e298d53fd21edaac7787660eei0';
const VECTOR_HOLDER = 'bc1pacgy5x69zafs30l7c8ym3hfhgme003jwzjkkuwqyqsxrf7j6v2gsk3xknu';

let methods: string[] = [];

beforeEach(() => {
  methods = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    methods.push(init?.method ?? 'GET');
    if (url.includes('/api/v1/ownership/')) {
      return new Response(JSON.stringify({ success: true, data: { dbOwner: SEED, inscriptionId: null } }), { status: 200 });
    }
    if (url.startsWith('https://open-api.unisat.io/')) {
      return new Response(JSON.stringify({ data: { address: VECTOR_HOLDER } }), { status: 200 });
    }
    return new Response('nope', { status: 404 });
  }) as unknown as typeof fetch;
  (resolve as jest.Mock).mockReset().mockResolvedValue({ verdict: 'undetermined', canonicalId: null, reason: 'ord tip unavailable: HTTP 403' });
  (resolveInscriptionOwner as jest.Mock).mockReset().mockResolvedValue({ address: VECTOR_HOLDER, satpoint: 'x:0:0', source: 'esplora:mempool.space' });
});

it('840000 with ord 403: deed from the recorded vector, holder from the sat tracker, first ord pass would transfer', async () => {
  const row = await dryRunHeight(840000, 'https://example.test');
  expect(row.storedOwner).toBe(SEED);
  expect(row.deed).toMatchObject({ verdict: 'undetermined', id: VECTOR_840000 });
  expect(row.deed.source).toMatch(/recorded vector/);
  expect(row.holder).toMatchObject({ address: VECTOR_HOLDER, tag: 'Esplora sat tracker' });
  expect(row.decisionNow).toBe('none');
  expect(row.firstOrdPass).toBe('transfer');
  expect(row.wouldRelease).toEqual(RELEASED_ON_TRANSFER);
  expect(methods.every((m) => m === 'GET')).toBe(true);
  expect(processOwnershipTransfer).not.toHaveBeenCalled();
  expect(verifyBlockOwnership).not.toHaveBeenCalled();
  expect(canonicalDeedFor).not.toHaveBeenCalled();
});

it('live canonical deed + sat tracker mismatch: update-deferred, never a transfer call', async () => {
  (resolve as jest.Mock).mockResolvedValue({ verdict: 'canonical', canonicalId: VECTOR_840000 });
  const row = await dryRunHeight(840000, 'https://example.test');
  expect(row.decisionNow).toBe('update-deferred');
  expect(processOwnershipTransfer).not.toHaveBeenCalled();
});

it('holder only from Unisat is reported, and is not a cron source', async () => {
  (resolveInscriptionOwner as jest.Mock).mockResolvedValue(null);
  const row = await dryRunHeight(840000, 'https://example.test');
  expect(row.holder.tag).toMatch(/Unisat/);
  expect(row.decisionNow).toBe('none');
});

it('a block without a stored owner is never a transfer', async () => {
  (resolve as jest.Mock).mockResolvedValue({ verdict: 'canonical', canonicalId: VECTOR_840000 });
  (resolveInscriptionOwner as jest.Mock).mockResolvedValue({ address: VECTOR_HOLDER, satpoint: 'x:0:0', source: 'ordinals.com' });
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ success: true, data: { dbOwner: null, inscriptionId: null } }), { status: 200 })) as unknown as typeof fetch;
  const row = await dryRunHeight(973000, 'https://example.test');
  expect(row.decisionNow).toBe('none');
  expect(row.wouldRelease).toEqual([]);
});

it('a request with a method other than GET is refused', async () => {
  await dryRunHeight(612888, 'https://example.test');
  await expect(fetch('https://example.test/x', { method: 'POST' })).rejects.toThrow(/refusing POST/);
});
