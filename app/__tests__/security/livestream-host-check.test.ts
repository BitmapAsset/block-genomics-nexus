/**
 * SIMULATION — a stream link must really be YouTube, Twitch or Kick (CodeQL #16-#21).
 *
 * The livestream routes recognised platforms with `hostname.includes(...)`, so
 * `https://youtube.com.attacker.example/watch?v=…` passed as YouTube: an owner
 * of any cheap block could publish it as the block's stream, and the routes
 * then served it to every visitor as `streamUrl` (the "watch on YouTube" link),
 * with a YouTube `embedUrl` beside it lending it credibility.
 *
 * Signature and live-ownership checks are stubbed to pass: the case under test
 * is a real owner submitting a lookalike host.
 */

const OWNER = 'bc1pblockowner000000000000000000000000000000000';
const LOOKALIKE = 'https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ';

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number }) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse, NextRequest: class {} };
});

const mockUpdate = jest.fn(async () => ({}));
const mockFindMany = jest.fn();
jest.mock('@/lib/prisma', () => {
  const client = {
    block: {
      update: (...a: unknown[]) => mockUpdate(...(a as [])),
      findMany: (...a: unknown[]) => mockFindMany(...(a as [])),
      findUnique: async () => null,
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: async () => ({ response: null, headers: {} }),
}));

jest.mock('@/lib/api-helpers', () => ({
  verifyWalletSignature: () => true,
  verifyUnboundWalletSignature: () => true,
}));

jest.mock('@/lib/ownership-gate', () => ({
  requireLiveBlockOwner: async () => ({ ok: true }),
}));

import { POST } from '@/app/api/v1/livestream/route';
import { GET as ACTIVE } from '@/app/api/v1/livestream/active/route';

beforeEach(() => {
  mockUpdate.mockClear();
  mockFindMany.mockReset();
});

function start(streamUrl: string) {
  return POST({
    json: async () => ({ blockHeight: 208, streamUrl, walletAddress: OWNER, signature: 'sig', message: 'msg' }),
  } as never) as unknown as Promise<{ status: number; json(): Promise<any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

it('refuses to publish a lookalike host as a YouTube stream', async () => {
  const res = await start(LOOKALIKE);
  expect(res.status).toBe(400);
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('still publishes a real YouTube stream', async () => {
  const res = await start('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  expect(res.status).toBe(200);
  expect((await res.json()).embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1');
  expect(mockUpdate).toHaveBeenCalledTimes(1);
});

it('gives a stored lookalike stream no YouTube embed', async () => {
  mockFindMany.mockResolvedValue([
    { height: 208, streamUrl: LOOKALIKE, streamType: 'broadcast', streamStartedAt: null, streamOwner: OWNER, label: null, owner: null },
  ]);
  const res = (await ACTIVE(new Request('http://localhost/api/v1/livestream/active'))) as unknown as {
    json(): Promise<{ streams: Array<{ embedUrl: string }> }>;
  };
  expect((await res.json()).streams[0].embedUrl).toBe('');
});
