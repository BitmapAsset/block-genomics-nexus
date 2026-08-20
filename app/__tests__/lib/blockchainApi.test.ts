/**
 * Tests for src/lib/blockchainApi.ts
 * Covers: cache, estimated TX generation, fetch routing
 */

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Need to reset modules to clear the internal cache between tests
let blockchainApi: typeof import('@/lib/blockchainApi');

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe('blockchainApi', () => {
  beforeEach(async () => {
    blockchainApi = await import('@/lib/blockchainApi');
  });

  describe('txToSquareSize (via fetchRealBlock)', () => {
    // txToSquareSize is not exported from blockchainApi, but we test the behavior
    // through fetchRealBlock which uses it internally
  });

  describe('fetchRealBlock()', () => {
    it('returns cached block on second call', async () => {
      // First call: mock mempool API
      mockFetch
        .mockResolvedValueOnce({ ok: true, text: async () => 'abc123' }) // block hash
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'abc123',
            timestamp: 1713571200,
            tx_count: 2,
            size: 5000,
            weight: 20000,
          }),
        }) // block info
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { weight: 1000, fee: 0 },
            { weight: 2000, fee: 5000 },
          ],
        }); // txs

      const result1 = await blockchainApi.fetchRealBlock(840000);
      expect(result1).not.toBeNull();
      expect(result1!.height).toBe(840000);

      // Second call should use cache (no new fetch calls)
      const fetchCountAfterFirst = mockFetch.mock.calls.length;
      const result2 = await blockchainApi.fetchRealBlock(840000);
      expect(mockFetch.mock.calls.length).toBe(fetchCountAfterFirst);
      expect(result2).toEqual(result1);
    });

    it('falls back to blockchain.info when mempool fails', async () => {
      // Mempool fails
      mockFetch
        .mockResolvedValueOnce({ ok: false }) // block hash fails
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            blocks: [{
              hash: 'fallback123',
              time: 1713571200,
              n_tx: 1,
              size: 1000,
              weight: 4000,
              tx: [{ size: 250, fee: 0 }],
            }],
          }),
        }); // blockchain.info

      const result = await blockchainApi.fetchRealBlock(840001);
      expect(result).not.toBeNull();
      expect(result!.hash).toBe('fallback123');
    });

    it('returns null when both APIs fail', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const result = await blockchainApi.fetchRealBlock(999999);
      expect(result).toBeNull();
    });

    it('marks block as estimated when more txs exist than fetched', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, text: async () => 'hash1' })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'hash1',
            timestamp: 1713571200,
            tx_count: 3000, // many more than 25
            size: 1500000,
            weight: 4000000,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () =>
            Array.from({ length: 25 }, (_, i) => ({
              weight: 1000 + i * 100,
              fee: i * 1000,
            })),
        });

      const result = await blockchainApi.fetchRealBlock(840002);
      expect(result).not.toBeNull();
      expect(result!.estimated).toBe(true);
      expect(result!.txs.length).toBe(3000);
    });
  });

  describe('isBlockCached / getCachedBlock', () => {
    it('returns false/null for uncached block', () => {
      expect(blockchainApi.isBlockCached(123456)).toBe(false);
      expect(blockchainApi.getCachedBlock(123456)).toBeNull();
    });
  });

  describe('estimated TX generation', () => {
    it('generates deterministic estimated txs for same block', async () => {
      const setupMock = () => {
        mockFetch
          .mockResolvedValueOnce({ ok: true, text: async () => 'det-hash' })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              id: 'det-hash',
              timestamp: 1713571200,
              tx_count: 100,
              size: 500000,
              weight: 2000000,
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () =>
              Array.from({ length: 25 }, (_, i) => ({
                weight: 800,
                fee: 1000,
              })),
          });
      };

      setupMock();
      const result1 = await blockchainApi.fetchRealBlock(840003);

      // Reset modules to clear cache, re-import
      jest.resetModules();
      blockchainApi = await import('@/lib/blockchainApi');

      setupMock();
      const result2 = await blockchainApi.fetchRealBlock(840003);

      // Estimated txs should be identical (deterministic PRNG)
      expect(result1!.txs.length).toBe(result2!.txs.length);
      for (let i = 25; i < result1!.txs.length; i++) {
        expect(result1!.txs[i].weight).toBe(result2!.txs[i].weight);
        expect(result1!.txs[i].size).toBe(result2!.txs[i].size);
      }
    });
  });
});
