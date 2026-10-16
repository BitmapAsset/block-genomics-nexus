/**
 * The Guardian tab is public. The guardian row also holds the owner's LLM key,
 * soul/memory files and monitor token hash, so the query must ask for display
 * fields only, and a database failure must read as "unavailable", not "none".
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

beforeEach(() => {
  jest.clearAllMocks();
  mockProfileFindFirst.mockResolvedValue({ handle: 'pepe' });
});

describe('fetchBlockGuardian', () => {
  it('selects display fields only, never secrets', async () => {
    mockGuardianFindFirst.mockResolvedValue({ name: 'Ribbit', status: 'active', lastHeartbeat: null, totalMessages: 3, totalVisitors: 9 });

    await fetchBlockGuardian(720143);

    const select = mockGuardianFindFirst.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['lastHeartbeat', 'name', 'status', 'totalMessages', 'totalVisitors']);
    for (const secret of ['llmApiKey', 'soulMd', 'memoryMd', 'monitorTokenHash', 'ownerAddress', 'escalateEmail']) {
      expect(select).not.toHaveProperty(secret);
    }
  });

  it('returns the guardian, its status and the block handle for the chat link', async () => {
    const hb = new Date('2026-10-15T12:00:00Z');
    mockGuardianFindFirst.mockResolvedValue({ name: 'Ribbit', status: 'paused', lastHeartbeat: hb, totalMessages: 3, totalVisitors: 9 });

    await expect(fetchBlockGuardian(720143)).resolves.toEqual({
      guardian: { name: 'Ribbit', status: 'paused', active: false, lastHeartbeat: hb.toISOString(), totalMessages: 3, totalVisitors: 9 },
      handle: 'pepe',
      degraded: false,
    });
  });

  it('says "no guardian" only when the database answered', async () => {
    mockGuardianFindFirst.mockResolvedValue(null);
    mockProfileFindFirst.mockResolvedValue(null);
    await expect(fetchBlockGuardian(1)).resolves.toEqual({ guardian: null, handle: null, degraded: false });

    mockGuardianFindFirst.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchBlockGuardian(1)).resolves.toEqual({ guardian: null, handle: null, degraded: true });
  });
});
