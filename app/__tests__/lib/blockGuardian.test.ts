/**
 * The guardian card is public. The guardian row also holds the owner's LLM key,
 * soul/memory files and monitor token hash, so the query asks for what the card
 * shows plus the three LLM columns (only to work out `llmConfigured`), the
 * answer carries a fixed list of keys, and a database failure reads as
 * "unavailable", not "none". No visitor count: nothing ever increments it.
 *
 * bg98a: the card shows the newest active guardian (the one the chat route can
 * answer for), else the newest of any status, and "Last chat" comes from the
 * newest conversation's `updatedAt` alone: the messages are never read.
 */

const mockGuardianFindFirst = jest.fn();
const mockProfileFindFirst = jest.fn();
const mockConversationFindFirst = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    guardianAgent: { findFirst: (...a: unknown[]) => mockGuardianFindFirst(...a) },
    blockProfile: { findFirst: (...a: unknown[]) => mockProfileFindFirst(...a) },
    guardianConversation: { findFirst: (...a: unknown[]) => mockConversationFindFirst(...a) },
  },
}));

import { BLOCK_GUARDIAN_KEYS, fetchBlockGuardian } from '@/lib/blockGuardian';

/** The keys a guardian summary may carry, and nothing else. */
const ALLOWED = ['createdAt', 'lastChatAt', 'lastHeartbeat', 'llmConfigured', 'name', 'selfHosted', 'status', 'totalMessages'];
const LLM_COLUMNS = ['llmApiKey', 'llmProvider', 'llmModel'];

/** A marker value built at run time, so no key-shaped literal sits in the test. */
const marker = (tag: string) => ['m', tag, String(Date.now())].join('-');

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'g-internal-1',
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
  mockGuardianFindFirst.mockReset();
  mockConversationFindFirst.mockReset().mockResolvedValue(null);
  mockProfileFindFirst.mockResolvedValue({ handle: 'pepe' });
});

describe('fetchBlockGuardian', () => {
  it('selects what the card shows plus the three LLM columns and the internal id, never secrets or the visitor count', async () => {
    mockGuardianFindFirst.mockResolvedValue(row());

    await fetchBlockGuardian(720143);

    const select = mockGuardianFindFirst.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(
      ['createdAt', 'id', 'lastHeartbeat', 'llmApiKey', 'llmModel', 'llmProvider', 'name', 'selfHosted', 'status', 'totalMessages'].sort(),
    );
    for (const secret of ['soulMd', 'memoryMd', 'monitorTokenHash', 'ownerAddress', 'escalateEmail', 'totalVisitors', 'personality']) {
      expect(select).not.toHaveProperty(secret);
    }
  });

  it('returns exactly the allow-listed keys (with lastChatAt): no id, no visitor count and no LLM column', async () => {
    const r = row();
    mockGuardianFindFirst.mockResolvedValue(r);

    const view = await fetchBlockGuardian(720143);

    expect(Object.keys(view.guardian ?? {}).sort()).toEqual(ALLOWED);
    expect([...BLOCK_GUARDIAN_KEYS].sort()).toEqual(ALLOWED);
    expect(view.guardian).not.toHaveProperty('id');
    expect(view.guardian).not.toHaveProperty('totalVisitors');
    for (const c of LLM_COLUMNS) expect(view.guardian).not.toHaveProperty(c);
    const json = JSON.stringify(view);
    for (const v of [r.id, r.llmApiKey, r.llmProvider, r.llmModel]) expect(json).not.toContain(v);
  });

  it('reads the newest active guardian first', async () => {
    mockGuardianFindFirst.mockResolvedValue(row());
    await fetchBlockGuardian(720143);
    expect(mockGuardianFindFirst).toHaveBeenCalledTimes(1);
    const q = mockGuardianFindFirst.mock.calls[0][0];
    expect(q.where).toEqual({ blockHeight: 720143, status: 'active' });
    expect(q.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('with no active guardian: the newest of any status', async () => {
    mockGuardianFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(row({ status: 'paused' }));
    const view = await fetchBlockGuardian(720143);
    expect(mockGuardianFindFirst).toHaveBeenCalledTimes(2);
    const q = mockGuardianFindFirst.mock.calls[1][0];
    expect(q.where).toEqual({ blockHeight: 720143 });
    expect(q.orderBy).toEqual({ createdAt: 'desc' });
    expect(view.guardian?.status).toBe('paused');
  });

  it('lastChatAt is the newest conversation’s updatedAt, read with that one column', async () => {
    mockGuardianFindFirst.mockResolvedValue(row());
    mockConversationFindFirst.mockResolvedValue({ updatedAt: new Date('2026-11-05T09:30:00Z') });
    const view = await fetchBlockGuardian(720143);
    expect(view.guardian?.lastChatAt).toBe('2026-11-05T09:30:00.000Z');
    const q = mockConversationFindFirst.mock.calls[0][0];
    expect(q).toEqual({ where: { guardianId: 'g-internal-1' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
  });

  it('a failing conversation read leaves lastChatAt null and the card intact', async () => {
    mockGuardianFindFirst.mockResolvedValue(row());
    mockConversationFindFirst.mockRejectedValue(new Error('ECONNRESET'));
    const view = await fetchBlockGuardian(720143);
    expect(view.degraded).toBe(false);
    expect(view.guardian?.name).toBe('Ribbit');
    expect(view.guardian?.lastChatAt).toBeNull();
  });

  it('returns the guardian, its status and the block handle', async () => {
    const hb = new Date('2026-10-15T12:00:00Z');
    mockGuardianFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(row({ status: 'paused', selfHosted: true, lastHeartbeat: hb }));

    await expect(fetchBlockGuardian(720143)).resolves.toEqual({
      guardian: {
        name: 'Ribbit',
        status: 'paused',
        selfHosted: true,
        lastHeartbeat: hb.toISOString(),
        totalMessages: 3,
        createdAt: '2026-09-01T00:00:00.000Z',
        llmConfigured: true,
        lastChatAt: null,
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
    expect(mockConversationFindFirst).not.toHaveBeenCalled();

    mockGuardianFindFirst.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchBlockGuardian(1)).resolves.toEqual({ guardian: null, handle: null, degraded: true });
  });
});
