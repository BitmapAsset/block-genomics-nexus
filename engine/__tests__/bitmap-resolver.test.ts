/**
 * Bitmap Resolver — Tests
 *
 * Tests the content validation logic (no network calls).
 */

import { describe, it, expect } from 'vitest';
import { _testHelpers } from '../bitmap-resolver';

const { parseBitmapContent, BITMAP_PATTERN } = _testHelpers;

describe('Bitmap Resolver', () => {
  describe('BITMAP_PATTERN', () => {
    it('matches valid bitmap content', () => {
      expect(BITMAP_PATTERN.test('0.bitmap')).toBe(true);
      expect(BITMAP_PATTERN.test('840000.bitmap')).toBe(true);
      expect(BITMAP_PATTERN.test('123456789.bitmap')).toBe(true);
    });

    it('rejects invalid content', () => {
      expect(BITMAP_PATTERN.test('')).toBe(false);
      expect(BITMAP_PATTERN.test('bitmap')).toBe(false);
      expect(BITMAP_PATTERN.test('.bitmap')).toBe(false);
      expect(BITMAP_PATTERN.test('abc.bitmap')).toBe(false);
      expect(BITMAP_PATTERN.test('840000.bitmaps')).toBe(false);
      expect(BITMAP_PATTERN.test('840000.txt')).toBe(false);
      expect(BITMAP_PATTERN.test('840000bitmap')).toBe(false);
      expect(BITMAP_PATTERN.test('-1.bitmap')).toBe(false);
    });
  });

  describe('parseBitmapContent', () => {
    it('extracts block height from valid content', () => {
      expect(parseBitmapContent('840000.bitmap')).toBe(840000);
      expect(parseBitmapContent('0.bitmap')).toBe(0);
      expect(parseBitmapContent('210000.bitmap')).toBe(210000);
    });

    it('trims whitespace', () => {
      expect(parseBitmapContent('  840000.bitmap  ')).toBe(840000);
      expect(parseBitmapContent('\n840000.bitmap\n')).toBe(840000);
    });

    it('returns null for invalid content', () => {
      expect(parseBitmapContent('')).toBeNull();
      expect(parseBitmapContent('not-a-bitmap')).toBeNull();
      expect(parseBitmapContent('abc.bitmap')).toBeNull();
    });
  });
});

// ────────────────────────────────────────────
// Network sources (issue #211: no Hiro, no ord.io)
// ────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vi, beforeEach } from 'vitest';
import { Limiter } from '../../packages/bitmap-resolver/src/index.js';
import { resolveBitmap, verifyBitmapOwnership } from '../bitmap-resolver';

const resolveMock = vi.hoisted(() => vi.fn());
vi.mock('../../packages/bitmap-resolver/src/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../packages/bitmap-resolver/src/index.js')>()),
  resolve: resolveMock,
}));

const ADDR = 'bc1pexampleaddress';
const TX = 'a'.repeat(64);
const DEED = `${'b'.repeat(64)}i0`;
const COPY = `${'c'.repeat(64)}i0`;
const IMAGE = `${'d'.repeat(64)}i0`;
const ALLOWED_HOSTS = new Set(['mempool.space', 'blockstream.info', 'ordinals.com']);

function stubFetch(routes: Record<string, { status?: number; body: string }>) {
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    urls.push(url);
    const hit = routes[url];
    return new Response(hit?.body ?? 'not found', { status: hit ? (hit.status ?? 200) : 404 });
  }) as typeof fetch;
  // No rate limits or retries in tests.
  const limiter = new Limiter({ fetch: fetchImpl, defaultPolicy: { rps: 1e6, burst: 1e6 }, maxRetries: 0 });
  return { urls, limiter };
}

function inscription(id: string, number: number, contentType: string) {
  return JSON.stringify({ id, number, height: 840100, sat: null, satpoint: `${TX}:0:0`, address: ADDR, content_type: contentType });
}

describe('Bitmap Resolver sources', () => {
  beforeEach(() => resolveMock.mockReset());

  const routes = {
    [`https://mempool.space/api/address/${ADDR}/utxo`]: { body: JSON.stringify([{ txid: TX, vout: 0, value: 546 }]) },
    [`https://ordinals.com/r/utxo/${TX}:0`]: { body: JSON.stringify({ inscriptions: [DEED, COPY, IMAGE] }) },
    [`https://ordinals.com/r/inscription/${DEED}`]: { body: inscription(DEED, 1, 'text/plain;charset=utf-8') },
    [`https://ordinals.com/r/inscription/${COPY}`]: { body: inscription(COPY, 2, 'text/plain;charset=utf-8') },
    [`https://ordinals.com/r/inscription/${IMAGE}`]: { body: inscription(IMAGE, 3, 'image/png') },
    [`https://ordinals.com/content/${DEED}`]: { body: '840000.bitmap' },
    [`https://ordinals.com/content/${COPY}`]: { body: '840000.bitmap' },
  };

  it('returns only the first-is-valid deed and lists the copy as excluded', async () => {
    resolveMock.mockResolvedValue({ verdict: 'canonical', canonicalId: DEED });
    const { urls, limiter } = stubFetch(routes);

    const result = await resolveBitmap(ADDR, { limiter });

    expect(result.source).toBe('ord');
    expect(result.bitmaps.map((b) => b.inscriptionId)).toEqual([DEED]);
    expect(result.bitmaps[0]).toMatchObject({ content: '840000.bitmap', blockHeight: 840000, owner: ADDR, revealHeight: 840100 });
    expect(result.excluded).toEqual([expect.objectContaining({ inscriptionId: COPY, blockHeight: 840000, verdict: 'canonical' })]);
    expect(resolveMock).toHaveBeenCalledWith(840000, expect.objectContaining({ freshness: 'display' }));
    // The image is never fetched as content.
    expect(urls).not.toContain(`https://ordinals.com/content/${IMAGE}`);
    for (const url of urls) {
      expect(url).not.toMatch(/hiro\.so|ord\.io/);
      expect(ALLOWED_HOSTS.has(new URL(url).host)).toBe(true);
    }
  });

  it('falls back to blockstream.info, and fails closed when no Esplora answers', async () => {
    const { urls, limiter } = stubFetch({});
    await expect(resolveBitmap(ADDR, { limiter })).rejects.toThrow(/no Esplora answered/);
    expect(urls).toEqual([
      `https://mempool.space/api/address/${ADDR}/utxo`,
      `https://blockstream.info/api/address/${ADDR}/utxo`,
    ]);
  });

  it('fails closed when ord recursion is down', async () => {
    const { limiter } = stubFetch({ [`https://mempool.space/api/address/${ADDR}/utxo`]: routes[`https://mempool.space/api/address/${ADDR}/utxo`] });
    await expect(resolveBitmap(ADDR, { limiter })).rejects.toThrow(/HTTP 404/);
  });

  it('verifies ownership through ord + Esplora only, and is not owner when they do not answer', async () => {
    const { urls, limiter } = stubFetch({});
    const v = await verifyBitmapOwnership(DEED, ADDR, { limiter });
    expect(v).toMatchObject({ isOwner: false, holder: null, source: 'ord+esplora' });
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).not.toMatch(/hiro\.so|ord\.io/);
      expect(ALLOWED_HOSTS.has(new URL(url).host)).toBe(true);
    }
  });

  it('no shipped verifier names a retired indexer host', () => {
    for (const rel of ['../bitmap-resolver.ts', '../../verify/app.js', '../../verify-ui/index.html']) {
      const text = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      expect(text, rel).not.toMatch(/api\.hiro\.so|api\.ord\.io/);
    }
  });
});
