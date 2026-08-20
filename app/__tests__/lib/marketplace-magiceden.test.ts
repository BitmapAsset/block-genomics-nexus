/**
 * Magic Eden adapter.
 *
 * Standing caveat, repeated from the adapter's own header: the live API was
 * probed on 2026-08-20 and returns 401 without a key, so the response *shape*
 * asserted here is the documented one, not an observed one. These tests are
 * therefore about resilience rather than fidelity — they pin down that a
 * surprising payload degrades instead of throwing, which is the property that
 * actually matters if the real shape turns out to differ.
 */

const mockLookup = jest.fn();
jest.mock('dns/promises', () => ({
  __esModule: true,
  default: { lookup: (...a: unknown[]) => mockLookup(...(a as [])) },
  lookup: (...a: unknown[]) => mockLookup(...(a as [])),
}));

import {
  magicEdenAdapter,
  parseTokenPayload,
  MAGICEDEN_API_HOST,
  MAGICEDEN_LINK_HOST,
} from '@/lib/marketplace/venues/magiceden';

/* eslint-disable @typescript-eslint/no-explicit-any */

const INSCRIPTION = 'deadbeefi0';
const QUERY = { height: 840_000, inscriptionId: INSCRIPTION };

const realFetch = global.fetch;
let fetchMock: jest.Mock;

function jsonResponse(body: unknown, opts: { status?: number } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status: opts.status ?? 200,
    ok: (opts.status ?? 200) < 400,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    body: null,
    text: async () => text,
  } as any;
}

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as any;
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: '93.184.216.34' }]);
  delete process.env.BG_MAGICEDEN_API_KEY;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('configuration gating', () => {
  it('is unconfigured with no API key', () => {
    expect(magicEdenAdapter.isConfigured()).toBe(false);
  });

  it('is unconfigured when the key is blank whitespace', () => {
    process.env.BG_MAGICEDEN_API_KEY = '   ';
    expect(magicEdenAdapter.isConfigured()).toBe(false);
  });

  it('is configured once a key is present', () => {
    process.env.BG_MAGICEDEN_API_KEY = 'k';
    expect(magicEdenAdapter.isConfigured()).toBe(true);
  });

  it('refuses to call upstream without a key', async () => {
    const res = await magicEdenAdapter.fetchBlockMarket(QUERY);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to call upstream without an inscription id', async () => {
    process.env.BG_MAGICEDEN_API_KEY = 'k';
    const res = await magicEdenAdapter.fetchBlockMarket({ height: 1, inscriptionId: null });
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('declared hosts', () => {
  it('separates the API host from the link host', () => {
    expect(magicEdenAdapter.apiHosts).toEqual([MAGICEDEN_API_HOST]);
    expect(magicEdenAdapter.linkHosts).toEqual([MAGICEDEN_LINK_HOST]);
    expect(MAGICEDEN_API_HOST).not.toBe(MAGICEDEN_LINK_HOST);
  });

  // Verified live 2026-08-20: the .dev host returns 503 "no healthy upstream"
  // on every ordinals path, the .us host returns 401. Pinning this stops a
  // well-meaning revert to the address every older integration still uses.
  it('points at the live .us API host, not the dead .dev one', () => {
    expect(MAGICEDEN_API_HOST).toBe('api-mainnet.magiceden.us');
    expect(MAGICEDEN_API_HOST).not.toContain('magiceden.dev');
  });
});

describe('parseTokenPayload()', () => {
  it('reads a listed token', () => {
    const listing = parseTokenPayload({ tokens: [{ listed: true, listedPrice: 5_000_000 }] }, INSCRIPTION);
    expect(listing?.listed).toBe(true);
    expect(listing?.priceSats).toBe(5_000_000);
    expect(listing?.venue).toBe('magiceden');
  });

  it('reads an unlisted token', () => {
    const listing = parseTokenPayload({ tokens: [{ listed: false, listedPrice: 5_000_000 }] }, INSCRIPTION);
    expect(listing?.listed).toBe(false);
    // No asking price on something that is not for sale, whatever the payload says.
    expect(listing?.priceSats).toBeNull();
  });

  it('accepts a bare array payload', () => {
    const listing = parseTokenPayload([{ listed: true, listedPrice: 10 }], INSCRIPTION);
    expect(listing?.priceSats).toBe(10);
  });

  it('builds the link from our own constant, never from the payload', () => {
    // A venue-supplied URL is an attacker-supplied URL. There is no reason to
    // accept one when the canonical form is derivable.
    const listing = parseTokenPayload(
      { tokens: [{ listed: true, listedPrice: 1, url: 'https://drainer.example/connect' }] },
      INSCRIPTION,
    );
    expect(listing?.url).toContain(MAGICEDEN_LINK_HOST);
    expect(listing?.url).not.toContain('drainer');
  });

  it('drops an absurd price but keeps the listing', () => {
    const listing = parseTokenPayload({ tokens: [{ listed: true, listedPrice: -5 }] }, INSCRIPTION);
    expect(listing?.listed).toBe(true);
    expect(listing?.priceSats).toBeNull();
  });

  it('returns null for a payload that is not a token response at all', () => {
    expect(parseTokenPayload({ error: 'nope' }, INSCRIPTION)).toBeNull();
    expect(parseTokenPayload('a string', INSCRIPTION)).toBeNull();
    expect(parseTokenPayload(null, INSCRIPTION)).toBeNull();
  });
});

describe('fetchBlockMarket()', () => {
  beforeEach(() => {
    process.env.BG_MAGICEDEN_API_KEY = 'test-key';
  });

  it('sends the key as a bearer token to the allowlisted host', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tokens: [{ listed: false }] }));
    await magicEdenAdapter.fetchBlockMarket(QUERY);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(MAGICEDEN_API_HOST);
    expect(String(url)).toContain(encodeURIComponent(INSCRIPTION));
    expect(init.headers.authorization).toBe('Bearer test-key');
  });

  it('never puts the key in the URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tokens: [{ listed: false }] }));
    await magicEdenAdapter.fetchBlockMarket(QUERY);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('test-key');
  });

  // A bitmap Magic Eden has never indexed is not for sale there. Reporting that
  // as an upstream failure would surface "marketplace unavailable" on a block
  // whose real answer is a confident "not listed".
  it('treats an empty token list as not listed, not as an error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tokens: [] }));
    const res = await magicEdenAdapter.fetchBlockMarket(QUERY);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.listing.listed).toBe(false);
  });

  it('reports a malformed payload as an error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: 'shape' }));
    const res = await magicEdenAdapter.fetchBlockMarket(QUERY);
    expect(res.ok).toBe(false);
  });

  it('propagates an upstream failure as a reason, not an exception', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, { status: 401 }));
    const res = await magicEdenAdapter.fetchBlockMarket(QUERY);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/HTTP 401/);
  });

  it('does not chase a last sale for an unlisted block', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tokens: [{ listed: false }] }));
    await magicEdenAdapter.fetchBlockMarket(QUERY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enriches a listed block with its last sale', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ tokens: [{ listed: true, listedPrice: 900 }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          activities: [{ price: 750, createdAt: '2026-05-01T00:00:00.000Z' }],
        }),
      );

    const res = await magicEdenAdapter.fetchBlockMarket(QUERY);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.listing.priceSats).toBe(900);
      expect(res.listing.lastSaleSats).toBe(750);
      expect(res.listing.lastSaleAt).toBe('2026-05-01T00:00:00.000Z');
    }
  });

  it('keeps a good listing when the last-sale call fails', async () => {
    // Enrichment is a decoration; a 500 on the second call must not destroy a
    // perfectly good answer from the first.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ tokens: [{ listed: true, listedPrice: 900 }] }))
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, { status: 500 }));

    const res = await magicEdenAdapter.fetchBlockMarket(QUERY);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.listing.priceSats).toBe(900);
      expect(res.listing.lastSaleSats).toBeNull();
    }
  });

  it('drops an absurd last-sale price without dropping the listing', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ tokens: [{ listed: true, listedPrice: 900 }] }))
      .mockResolvedValueOnce(jsonResponse({ activities: [{ price: 1e30, createdAt: 0 }] }));

    const res = await magicEdenAdapter.fetchBlockMarket(QUERY);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.listing.lastSaleSats).toBeNull();
      expect(res.listing.lastSaleAt).toBeNull();
    }
  });

  it('never throws when the connection dies', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(magicEdenAdapter.fetchBlockMarket(QUERY)).resolves.toMatchObject({ ok: false });
  });
});
