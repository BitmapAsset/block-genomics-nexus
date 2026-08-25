/**
 * SIMULATION — an upstream outage is not an empty wallet.
 *
 * `/api/v1/inscriptions/scan` answered `{ success: true, inscriptions: [],
 * count: 0 }` whenever no indexer could list a wallet's inscriptions. That is
 * byte-identical to the answer for a wallet that genuinely holds nothing, so
 * every caller — including the UI that decides whether to show someone their
 * own blocks — read "the index is down" as "you own nothing".
 *
 * It was not a rare path. The primary provider was ord's `/address/<addr>`,
 * which the public ordinals.com instance answers with 406 "JSON API disabled",
 * and the fallback was a keyless Unisat call that answers 403. Both were dead
 * in production, so the endpoint returned a confident zero for EVERY wallet.
 * The address below really does hold five `.bitmap` inscriptions.
 *
 * These drive the REAL route over the REAL ord and Esplora clients. Only the
 * network is mocked, because the network is the thing whose failure is being
 * mistranslated.
 */

const HOLDER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';

/** Outpoints the holder controls: five carrying a .bitmap, one plain postage. */
const INSCRIBED: Record<string, string> = {
  '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:0': 'd5ba7c32i0',
  '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:1': '314c9f16i0',
  '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:2': '80ae7d3ei0',
  '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:3': 'cd031d57i0',
  '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:4': '6168ba45i0',
};
const BARE_OUTPOINT = 'a568bf17d669a044154f01c3f5ae1019c3c1205643b58b5ee7da0f8c1db2f4ba:0';

const CONTENT: Record<string, string> = {
  d5ba7c32i0: '738505.bitmap',
  '314c9f16i0': '720143.bitmap',
  '80ae7d3ei0': '745966.bitmap',
  cd031d57i0: '718840.bitmap',
  '6168ba45i0': '745506.bitmap',
};

/** Which upstream is broken for the case under test. */
let esploraDown = false;
let ordUtxoDown: 'none' | 'all' | 'one' = 'none';
let contentDown = false;
let heldOutpoints: string[] = [...Object.keys(INSCRIBED), BARE_OUTPOINT];

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse };
});

// Rate limiting has its own suite; never the reason a case here passes or fails.
jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null }),
  EXPERIENCE_WRITE_LIMIT: 10,
}));

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => String(body) } as unknown as Response;
}
function dead(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => '',
  } as unknown as Response;
}

beforeEach(() => {
  esploraDown = false;
  ordUtxoDown = 'none';
  contentDown = false;
  heldOutpoints = [...Object.keys(INSCRIBED), BARE_OUTPOINT];

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    // Esplora: the address's current UTXO set.
    if (url.includes('/address/') && url.endsWith('/utxo')) {
      if (esploraDown) return dead(502);
      return ok(
        heldOutpoints.map((op) => {
          const [txid, vout] = op.split(':');
          return { txid, vout: Number(vout) };
        })
      );
    }

    // ord: inscriptions sitting on one outpoint.
    if (url.includes('/r/utxo/')) {
      const outpoint = url.split('/r/utxo/')[1];
      if (ordUtxoDown === 'all') return dead(503);
      if (ordUtxoDown === 'one' && outpoint === heldOutpoints[0]) return dead(503);
      const id = INSCRIBED[outpoint];
      return ok({ inscriptions: id ? [id] : [], runes: {}, value: 546 });
    }

    // ord: inscription content, where .bitmap identity is proven.
    if (url.includes('/content/')) {
      if (contentDown) return dead(504);
      const id = url.split('/content/')[1];
      return ok(CONTENT[id] ?? 'not-a-bitmap');
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
});

function req(address: string) {
  return { nextUrl: { searchParams: new URLSearchParams({ address }) } } as never;
}

describe('/api/v1/inscriptions/scan tells the truth about outages', () => {
  it('THE BUG: no provider can list the wallet, and the wallet looks empty', async () => {
    esploraDown = true;
    ordUtxoDown = 'all';

    const { GET } = await import('@/app/api/v1/inscriptions/scan/route');
    const res = await GET(req(HOLDER));
    const body = (await res.json()) as { success: boolean; code?: string; data?: { count: number } };

    // Before the fix this was `{ success: true, data: { count: 0 } }` — a
    // confident zero for a wallet holding five bitmaps.
    expect(body.success).toBe(false);
    expect(res.status).toBe(503);
    expect(body.code).toBe('onchain_unavailable');
    expect(body.data?.count).toBeUndefined();
  });

  it('a 503 invites a retry instead of being cached as truth', async () => {
    esploraDown = true;

    const { GET } = await import('@/app/api/v1/inscriptions/scan/route');
    const res = await GET(req(HOLDER));

    expect(res.headers.get('Retry-After')).toBe('15');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('a wallet that really holds nothing still gets a real, cheap negative', async () => {
    heldOutpoints = [];

    const { GET } = await import('@/app/api/v1/inscriptions/scan/route');
    const res = await GET(req(HOLDER));
    const body = (await res.json()) as { success: boolean; data: { count: number } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.count).toBe(0);
  });

  it('the holder gets all five bitmaps, and the bare postage output is not one', async () => {
    const { GET } = await import('@/app/api/v1/inscriptions/scan/route');
    const res = await GET(req(HOLDER));
    const body = (await res.json()) as {
      success: boolean;
      data: { count: number; inscriptions: { height: number; type: string }[] };
    };

    expect(body.success).toBe(true);
    expect(body.data.count).toBe(5);
    expect(body.data.inscriptions.map((i) => i.height).sort()).toEqual([
      718840, 720143, 738505, 745506, 745966,
    ]);
    expect(body.data.inscriptions.every((i) => i.type === 'block')).toBe(true);
  });

  it('one unreadable outpoint fails the scan rather than understating it', async () => {
    ordUtxoDown = 'one';

    const { GET } = await import('@/app/api/v1/inscriptions/scan/route');
    const res = await GET(req(HOLDER));
    const body = (await res.json()) as { success: boolean; code?: string };

    // Returning the other four would be the same lie, just quieter.
    expect(res.status).toBe(503);
    expect(body.code).toBe('onchain_unavailable');
  });

  it('unreadable content fails the scan rather than dropping inscriptions', async () => {
    contentDown = true;

    const { GET } = await import('@/app/api/v1/inscriptions/scan/route');
    const res = await GET(req(HOLDER));
    const body = (await res.json()) as { success: boolean; code?: string };

    expect(res.status).toBe(503);
    expect(body.code).toBe('onchain_unavailable');
  });
});
