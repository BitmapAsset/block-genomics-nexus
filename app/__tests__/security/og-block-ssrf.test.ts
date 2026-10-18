/**
 * SIMULATION — the OG share card never requests a host the caller chose (CodeQL #3).
 *
 * `GET /og/block/[height]` fetched its art from
 * `${new URL(request.url).origin}/api/v1/block-thumbnail/{h}.png`, so the
 * server's outbound request went to whatever origin the request arrived for.
 * Behind a proxy that passes Host through (or with Next's trustHostHeader) that
 * is the caller's choice: a blind SSRF from the server, and attacker-chosen
 * bytes inside our branded card.
 *
 * The request below arrives for `attacker.example`. Only mempool.space (the
 * block data source) may be contacted; with it unreachable the card still
 * renders, with estimated art and the short cache.
 */

const mockImageResponse = jest.fn();
jest.mock('next/og', () => ({
  ImageResponse: class {
    public headers: Record<string, string>;
    constructor(_element: unknown, options: { headers?: Record<string, string> }) {
      mockImageResponse(options);
      this.headers = options.headers ?? {};
    }
  },
}));

jest.mock('@/lib/blockOgData', () => ({
  fetchBlockOgSummary: async () => null,
}));

jest.mock('@/lib/blockPageData', () => ({
  fetchBlockCardFacts: async () => ({ objectCount: 0, owner: null, verified: false }),
  shortenAddress: (a: string) => a,
}));

jest.mock('@/lib/prisma', () => {
  const client = {
    blockThumbnail: {
      findUnique: async () => null,
      create: async () => ({}),
      update: async () => ({}),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

// node-canvas is not what is under test; any PNG-ish bytes will do.
jest.mock('@/lib/bitmap-renderer', () => ({
  renderBitmapThumbnail: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
}));

import { GET } from '@/app/og/block/[height]/route';

const requested: string[] = [];
const realFetch = global.fetch;

beforeAll(() => {
  global.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    // Every host answers with a PNG, so only the host choice is under test.
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png', 'x-thumbnail-source': 'cache' }),
      arrayBuffer: async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer,
      text: async () => 'not-a-block-hash',
      json: async () => ({}),
    } as unknown as Response;
  }) as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

it('a request for attacker.example never makes the server fetch attacker.example', async () => {
  const res = (await GET(new Request('http://attacker.example/og/block/840000'), {
    params: Promise.resolve({ height: '840000' }),
  })) as unknown as { headers: Record<string, string> };

  expect(requested.filter((u) => new URL(u).hostname === 'attacker.example')).toEqual([]);
  expect(requested.every((u) => new URL(u).hostname === 'mempool.space')).toBe(true);
  // The card still renders; without real art it keeps the one-minute cache.
  expect(res.headers['Cache-Control']).toBe('public, max-age=60');
});
