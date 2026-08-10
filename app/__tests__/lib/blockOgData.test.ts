/**
 * Tests for src/lib/blockOgData.ts
 *
 * The share card renders inside a crawler's request, so the contract that
 * matters is: never throw, and never report numbers we did not actually get.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { fetchBlockOgSummary } from '@/lib/blockOgData';
import { generateGenome } from '@/lib/genome-utils';

const HASH = '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5';

function mockBlockOk() {
  mockFetch
    .mockResolvedValueOnce({ ok: true, text: async () => `${HASH}\n` })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ timestamp: 1713571767, tx_count: 3050, size: 1633527 }),
    });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchBlockOgSummary()', () => {
  it('returns the block header stats', async () => {
    mockBlockOk();

    const summary = await fetchBlockOgSummary(840000);

    expect(summary).toEqual({
      height: 840000,
      hash: HASH,
      timestamp: 1713571767,
      txCount: 3050,
      size: 1633527,
      genome: generateGenome(HASH).sequence,
    });
  });

  it('derives the genome deterministically from the block hash', async () => {
    mockBlockOk();
    const first = await fetchBlockOgSummary(840000);
    mockBlockOk();
    const second = await fetchBlockOgSummary(840000);

    expect(first!.genome).toBe(second!.genome);
    expect(first!.genome).toHaveLength(64);
  });

  it('does not fetch the block body when the height lookup 404s', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    expect(await fetchBlockOgSummary(99_999_999)).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when the height endpoint returns a non-hash body', async () => {
    // mempool.space answers unmined heights with a plain-text error, which would
    // otherwise be spliced straight into the genome derivation.
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => 'Block not found' });

    expect(await fetchBlockOgSummary(9_000_000)).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when the block lookup fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => HASH })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    expect(await fetchBlockOgSummary(840000)).toBeNull();
  });

  it('swallows network errors so the card still renders', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'));

    await expect(fetchBlockOgSummary(840000)).resolves.toBeNull();
  });
});
