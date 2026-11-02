/**
 * The guardian card is public. The guardian row also holds the owner's LLM key,
 * soul/memory files and monitor token hash, so the query asks for what the card
 * shows plus the three LLM columns (only to work out `llmConfigured`), the
 * answer carries a fixed list of keys, and a database failure reads as
 * "unavailable", not "none". No visitor count: nothing ever increments it.
 */

const mockGuardianFindFirst = jest.fn();
const mockProfileFindFirst = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    guardianAgent: { findFirst: (...a: unknown[]) => mockGuardianFindFirst(...a) },
    blockProfile: { findFirst: (...a: unknown[]) => mockProfileFindFirst(...a) },
  },
}));

import { fetchBlockGuardian } from '@/lib/blockGuardian';

/** The keys a guardian summary may carry, and nothing else. */
const ALLOWED = ['createdAt', 'lastHeartbeat', 'llmConfigured', 'name', 'selfHosted', 'status', 'totalMessages'];
const LLM_COLUMNS = ['llmApiKey', 'llmProvider', 'llmModel'];

/** A marker value built at run time, so no key-shaped literal sits in the test. */
const marker = (tag: string) => ['m', tag, String(Date.now())].join('-');

function row(over: Record<string, unknown> = {}) {
  return {
    name: 'Ribbit',
    status: 'active',
    selfHosted: false,
    lastHeartbeat: null,
    totalMessages: 3,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    llmApiKey: marker('k'),
    llmProvider: marker('p'),
    llmModel: marker('n'),
    totalVisitors: 9,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfileFindFirst.mockResolvedValue({ handle: 'pepe' });
});

describe('fetchBlockGuardian', () => {
  it('selects what the card shows plus the three LLM columns, never secrets or the visitor count', async () => {
    mockGuardianFindFirst.mockResolvedValue(row());

    await fetchBlockGuardian(720143);

    const select = mockGuardianFindFirst.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(
      ['createdAt', 'lastHeartbeat', 'llmApiKey', 'llmModel', 'llmProvider', 'name', 'selfHosted', 'status', 'totalMessages'].sort(),
    );
    for (const secret of ['soulMd', 'memoryMd', 'monitorTokenHash', 'ownerAddress', 'escalateEmail', 'totalVisitors', 'personality']) {
      expect(select).not.toHaveProperty(secret);
    }
  });

  it('returns exactly the allow-listed keys: no visitor count and no LLM column', async () => {
    const r = row();
    mockGuardianFindFirst.mockResolvedValue(r);

    const view = await fetchBlockGuardian(720143);

    expect(Object.keys(view.guardian ?? {}).sort()).toEqual(ALLOWED);
    expect(view.guardian).not.toHaveProperty('totalVisitors');
    for (const c of LLM_COLUMNS) expect(view.guardian).not.toHaveProperty(c);
    const json = JSON.stringify(view);
    for (const v of [r.llmApiKey, r.llmProvider, r.llmModel]) expect(json).not.toContain(v);
  });

  it('returns the guardian, its status and the block handle for the chat link', async () => {
    const hb = new Date('2026-10-15T12:00:00Z');
    mockGuardianFindFirst.mockResolvedValue(row({ status: 'paused', selfHosted: true, lastHeartbeat: hb }));

    await expect(fetchBlockGuardian(720143)).resolves.toEqual({
      guardian: {
        name: 'Ribbit',
        status: 'paused',
        selfHosted: true,
        lastHeartbeat: hb.toISOString(),
        totalMessages: 3,
        createdAt: '2026-09-01T00:00:00.000Z',
        llmConfigured: true,
      },
      handle: 'pepe',
      degraded: false,
    });
  });

  it('llmConfigured is true only with a provider, a model and a key', async () => {
    mockGuardianFindFirst.mockResolvedValue(row());
    expect((await fetchBlockGuardian(1)).guardian?.llmConfigured).toBe(true);

    mockGuardianFindFirst.mockResolvedValue(row({ llmApiKey: null }));
    expect((await fetchBlockGuardian(1)).guardian?.llmConfigured).toBe(false);

    mockGuardianFindFirst.mockResolvedValue(row({ llmModel: null }));
    expect((await fetchBlockGuardian(1)).guardian?.llmConfigured).toBe(false);
  });

  it('says "no guardian" only when the database answered', async () => {
    mockGuardianFindFirst.mockResolvedValue(null);
    mockProfileFindFirst.mockResolvedValue(null);
    await expect(fetchBlockGuardian(1)).resolves.toEqual({ guardian: null, handle: null, degraded: false });

    mockGuardianFindFirst.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchBlockGuardian(1)).resolves.toEqual({ guardian: null, handle: null, degraded: true });
  });
});
