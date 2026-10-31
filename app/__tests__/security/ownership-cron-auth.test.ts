/**
 * `GET /api/v1/ownership/cron` — who may trigger a reconciliation run.
 *
 * vercel.json schedules this route every 15 minutes, and Vercel cron
 * authenticates with `Authorization: Bearer <CRON_SECRET>`. The route only knew
 * OWNERSHIP_SYNC_SECRET, so with CRON_SECRET configured every scheduled run was
 * refused. It now takes either secret — CRON_SECRET by header only,
 * OWNERSHIP_SYNC_SECRET also by the legacy `?secret=` param — compares them in
 * constant time, and still fails closed when neither is configured.
 *
 * The database and the ownership sync are mocked: these cases are about the
 * gate, so every refusal has to land before either is touched.
 */

const mockFindMany = jest.fn();
const mockBatchVerifyOwnership = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
  NextRequest: class {},
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { block: { findMany: (...a: unknown[]) => mockFindMany(...(a as [])) } },
}));

jest.mock('@/lib/ownership-sync', () => ({
  batchVerifyOwnership: (...a: unknown[]) => mockBatchVerifyOwnership(...(a as [])),
}));

// The deed seam: the fixture row's inscriptionId is the chain's deed unless a case says otherwise.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/lib/onchain/deed', () => require('../helpers/chain-ownership-mock').canonicalDeedFromFixture());

import { GET } from '@/app/api/v1/ownership/cron/route';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CRON = 'cron-0f3a9c27e4b14d6d8a51c2e7b9f04d33';
const SYNC = 'sync-7d2e41b0a9c84f15b6e3d0a2c4f81e97';

const ORIGINAL = { cron: process.env.CRON_SECRET, sync: process.env.OWNERSHIP_SYNC_SECRET };

function setEnv(name: 'CRON_SECRET' | 'OWNERSHIP_SYNC_SECRET', value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function secrets({ cron, sync }: { cron?: string; sync?: string }) {
  setEnv('CRON_SECRET', cron);
  setEnv('OWNERSHIP_SYNC_SECRET', sync);
}

function cronReq({ authorization, secret }: { authorization?: string; secret?: string } = {}) {
  const nextUrl = new URL('http://test.local/api/v1/ownership/cron');
  if (secret !== undefined) nextUrl.searchParams.set('secret', secret);
  return {
    nextUrl,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? authorization ?? null : null) },
  } as never;
}

async function run(req = cronReq()): Promise<{ status: number; body: any }> {
  const res: any = await GET(req);
  return { status: res.status, body: await res.json() };
}

function expectRefusedBeforeWork() {
  expect(mockFindMany).not.toHaveBeenCalled();
  expect(mockBatchVerifyOwnership).not.toHaveBeenCalled();
}

function expectRan(res: { status: number; body: any }) {
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    success: true,
    data: {
      checked: 2,
      transfers: 1,
      // Deed pre-resolution report; its content is covered by the deed suites.
      deeds: expect.any(Array),
      results: [
        { blockHeight: 840000, match: true, action: 'none' },
        { blockHeight: 840001, match: false, action: 'update' },
      ],
    },
  });
  expect(mockBatchVerifyOwnership).toHaveBeenCalledWith([840000, 840001]);
}

beforeEach(() => {
  mockFindMany.mockReset().mockResolvedValue([{ height: 840000 }, { height: 840001 }]);
  mockBatchVerifyOwnership.mockReset().mockResolvedValue([
    { blockHeight: 840000, match: true, action: 'none' },
    { blockHeight: 840001, match: false, action: 'update' },
  ]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  secrets(ORIGINAL);
});

describe('accepted credentials', () => {
  it('accepts Vercel cron — Bearer CRON_SECRET — with only CRON_SECRET set', async () => {
    secrets({ cron: CRON });
    expectRan(await run(cronReq({ authorization: `Bearer ${CRON}` })));
  });

  it('accepts the OWNERSHIP_SYNC_SECRET alias as a Bearer header with only it set', async () => {
    secrets({ sync: SYNC });
    expectRan(await run(cronReq({ authorization: `Bearer ${SYNC}` })));
  });

  it('keeps the legacy ?secret= trigger working for OWNERSHIP_SYNC_SECRET', async () => {
    secrets({ sync: SYNC });
    expectRan(await run(cronReq({ secret: SYNC })));
  });

  it('accepts either secret when both are set', async () => {
    secrets({ cron: CRON, sync: SYNC });
    expectRan(await run(cronReq({ authorization: `Bearer ${CRON}` })));

    mockBatchVerifyOwnership.mockClear();
    expectRan(await run(cronReq({ authorization: `Bearer ${SYNC}` })));

    mockBatchVerifyOwnership.mockClear();
    expectRan(await run(cronReq({ secret: SYNC })));
  });
});

describe('refused credentials — 401 before any work', () => {
  it.each([
    ['only CRON_SECRET set', { cron: CRON }],
    ['both set', { cron: CRON, sync: SYNC }],
  ])('refuses CRON_SECRET in ?secret= — it is header-only (%s)', async (_label, env) => {
    secrets(env);
    const res = await run(cronReq({ secret: CRON }));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
    expectRefusedBeforeWork();
  });

  it('refuses a wrong secret', async () => {
    secrets({ cron: CRON, sync: SYNC });
    expect((await run(cronReq({ authorization: 'Bearer not-the-secret' }))).status).toBe(401);
    expect((await run(cronReq({ secret: 'not-the-secret' }))).status).toBe(401);
    expectRefusedBeforeWork();
  });

  it('refuses a request with no credential at all', async () => {
    secrets({ cron: CRON, sync: SYNC });
    const res = await run(cronReq());
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
    expectRefusedBeforeWork();
  });

  it('refuses a prefix (or extension) of the real secret', async () => {
    secrets({ cron: CRON, sync: SYNC });
    for (const req of [
      cronReq({ authorization: `Bearer ${CRON.slice(0, -1)}` }),
      cronReq({ authorization: `Bearer ${SYNC.slice(0, 8)}` }),
      cronReq({ secret: SYNC.slice(0, -1) }),
      cronReq({ authorization: `Bearer ${CRON}x` }),
    ]) {
      expect((await run(req)).status).toBe(401);
    }
    expectRefusedBeforeWork();
  });

  it('refuses a secret that is not presented under the Bearer scheme', async () => {
    secrets({ cron: CRON, sync: SYNC });
    expect((await run(cronReq({ authorization: CRON }))).status).toBe(401);
    expect((await run(cronReq({ authorization: `Basic ${SYNC}` }))).status).toBe(401);
    expectRefusedBeforeWork();
  });

  it('does not accept a secret that is configured for neither name', async () => {
    secrets({ sync: SYNC });
    expect((await run(cronReq({ authorization: `Bearer ${CRON}` }))).status).toBe(401);
    expectRefusedBeforeWork();
  });
});

describe('fail closed when no secret is configured', () => {
  it.each([
    ['unset', {}],
    ['empty strings', { cron: '', sync: '' }],
  ])('answers 503 with neither secret configured (%s), touching nothing', async (_label, env) => {
    secrets(env);
    for (const req of [
      cronReq(),
      cronReq({ authorization: 'Bearer ' }),
      cronReq({ authorization: `Bearer ${CRON}` }),
      cronReq({ secret: '' }),
    ]) {
      const res = await run(req);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ success: false, error: 'Cron endpoint disabled: secret not configured' });
    }
    expectRefusedBeforeWork();
  });
});
