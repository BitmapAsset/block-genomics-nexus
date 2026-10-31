/**
 * lib/onchain/deed.ts — the one answer to "which inscription is the deed for N".
 *
 * The resolver itself is tested in packages/bitmap-resolver. These cases pin
 * what the app layers on top: verdict mapping, the request budget, the caches
 * (in process and the DeedVerdict table), and that nothing but the height goes
 * in. The resolver's `resolve()` and the database are stood in for.
 */

const mockResolve = jest.fn();
const rows = new Map<number, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
let tableMissing = false;

jest.mock('@/vendor/bitmap-resolver', () => ({
  RULE_ID: 'liveoci-test@1',
  resolve: (...a: unknown[]) => mockResolve(...(a as [])),
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    deedVerdict: {
      findUnique: async ({ where }: { where: { height: number } }) => {
        if (tableMissing) throw new Error('relation "DeedVerdict" does not exist');
        return rows.get(where.height) ?? null;
      },
      upsert: async ({ where, create, update }: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (tableMissing) throw new Error('relation "DeedVerdict" does not exist');
        rows.set(where.height, { ...(rows.get(where.height) ?? create), ...update });
      },
    },
  },
}));

import { canonicalDeedFor, prewarmDeeds, __resetDeedCacheForTest, DEED_RULE_ID } from '@/lib/onchain/deed';

const ID = 'cd'.repeat(32) + 'i0';

function result(verdict: string, extra: Record<string, unknown> = {}) {
  return {
    height: 840000,
    verdict,
    rule: 'liveoci-test@1',
    canonicalId: verdict === 'canonical' ? ID : null,
    checkedAtHeight: 960000,
    proof: { canonical: verdict === 'canonical' ? { revealHeight: 840000 } : null },
    ...(verdict === 'canonical' ? {} : { reason: `because ${verdict}` }),
    ...extra,
  };
}

beforeEach(() => {
  __resetDeedCacheForTest();
  mockResolve.mockReset();
  rows.clear();
  tableMissing = false;
});

it('canonical → the deed id, under the resolver rule id', async () => {
  mockResolve.mockResolvedValue(result('canonical'));
  expect(await canonicalDeedFor(840000)).toMatchObject({ verdict: 'canonical', inscriptionId: ID, ruleId: DEED_RULE_ID, source: 'resolver' });
});

it.each(['none', 'disputed', 'undetermined'])('%s → no id, the reason carried through', async (verdict) => {
  mockResolve.mockResolvedValue(result(verdict));
  expect(await canonicalDeedFor(840000)).toMatchObject({ verdict, inscriptionId: null, reason: `because ${verdict}` });
});

it('a canonical verdict without an id is undetermined, never a usable answer', async () => {
  mockResolve.mockResolvedValue(result('canonical', { canonicalId: null }));
  expect(await canonicalDeedFor(840000)).toMatchObject({ verdict: 'undetermined', inscriptionId: null });
});

it('a resolver that throws is undetermined', async () => {
  mockResolve.mockRejectedValue(new Error('ord down'));
  expect(await canonicalDeedFor(840000)).toMatchObject({ verdict: 'undetermined', reason: 'ord down' });
});

it('asks the resolver about the height only, with display freshness (the holder is checked separately)', async () => {
  mockResolve.mockResolvedValue(result('canonical'));
  await canonicalDeedFor(840000);
  const [height, opts] = mockResolve.mock.calls[0];
  expect(height).toBe(840000);
  expect(opts).toMatchObject({ freshness: 'display' });
  expect(opts.challengers).toBeUndefined();
});

it('caches a canonical answer in process and coalesces concurrent lookups', async () => {
  mockResolve.mockResolvedValue(result('canonical'));
  const [a, b] = await Promise.all([canonicalDeedFor(840000), canonicalDeedFor(840000)]);
  const c = await canonicalDeedFor(840000);
  expect(mockResolve).toHaveBeenCalledTimes(1);
  expect([a.inscriptionId, b.inscriptionId, c.inscriptionId]).toEqual([ID, ID, ID]);
  expect(c.source).toBe('memory');
});

it('persists a buried canonical answer and serves the next cold process from the table', async () => {
  mockResolve.mockResolvedValue(result('canonical'));
  await canonicalDeedFor(840000);
  expect(rows.get(840000)).toMatchObject({ inscriptionId: ID, ruleId: 'liveoci-test@1', revealHeight: 840000 });

  __resetDeedCacheForTest(); // a new serverless instance
  mockResolve.mockReset();
  expect(await canonicalDeedFor(840000)).toMatchObject({ verdict: 'canonical', inscriptionId: ID, source: 'db' });
  expect(mockResolve).not.toHaveBeenCalled();
});

it('does not persist a reveal within reorg depth of the tip, nor any other verdict', async () => {
  mockResolve.mockResolvedValueOnce(result('canonical', { checkedAtHeight: 840002 }));
  await canonicalDeedFor(840000);
  mockResolve.mockResolvedValueOnce(result('none', { height: 999 }));
  await canonicalDeedFor(999);
  expect(rows.size).toBe(0);
});

it('ignores a stored row from another rule id', async () => {
  rows.set(840000, { height: 840000, inscriptionId: 'ee'.repeat(32) + 'i0', ruleId: 'liveoci-old@0', resolvedAt: new Date() });
  mockResolve.mockResolvedValue(result('canonical'));
  expect(await canonicalDeedFor(840000)).toMatchObject({ inscriptionId: ID, source: 'resolver' });
});

it('runs on the in-process cache alone while the table is not migrated', async () => {
  tableMissing = true;
  mockResolve.mockResolvedValue(result('canonical'));
  expect(await canonicalDeedFor(840000)).toMatchObject({ verdict: 'canonical', inscriptionId: ID });
  expect((await canonicalDeedFor(840000)).source).toBe('memory');
});

it('answers undetermined when the budget runs out, and the late answer fills the cache', async () => {
  let finish: (v: unknown) => void = () => undefined;
  mockResolve.mockImplementation(() => new Promise((res) => { finish = res; }));
  const started = Date.now();
  expect(await canonicalDeedFor(950000, { budgetMs: 30 })).toMatchObject({ verdict: 'undetermined', inscriptionId: null });
  expect(Date.now() - started).toBeLessThan(2000);

  finish(result('canonical', { height: 950000, proof: { canonical: { revealHeight: 950000 } } }));
  await new Promise((r) => setTimeout(r, 10));
  expect(await canonicalDeedFor(950000, { budgetMs: 30 })).toMatchObject({ verdict: 'canonical', inscriptionId: ID, source: 'memory' });
  expect(mockResolve).toHaveBeenCalledTimes(1);
});

it('undetermined is not cached for long: the next request asks again', async () => {
  jest.useFakeTimers({ now: Date.parse('2026-10-30T00:00:00Z') });
  try {
    mockResolve.mockResolvedValue(result('undetermined'));
    await canonicalDeedFor(840000);
    jest.setSystemTime(Date.parse('2026-10-30T00:00:11Z'));
    await canonicalDeedFor(840000);
    expect(mockResolve).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

it('rejects a non-height without asking anyone', async () => {
  expect(await canonicalDeedFor(-1)).toMatchObject({ verdict: 'none', inscriptionId: null });
  expect(await canonicalDeedFor(1.5)).toMatchObject({ verdict: 'none' });
  expect(mockResolve).not.toHaveBeenCalled();
});

it('prewarmDeeds resolves in order and stops at its deadline', async () => {
  mockResolve.mockImplementation(async (h: number) => result('canonical', { height: h }));
  expect(await prewarmDeeds([1, 2, 3])).toEqual([
    { height: 1, verdict: 'canonical', source: 'resolver' },
    { height: 2, verdict: 'canonical', source: 'resolver' },
    { height: 3, verdict: 'canonical', source: 'resolver' },
  ]);
  expect(await prewarmDeeds([4, 5], { deadline: Date.now() - 1 })).toEqual([]);
});
