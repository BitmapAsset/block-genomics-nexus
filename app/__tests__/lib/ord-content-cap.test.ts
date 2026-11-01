/**
 * Inscription content reads stop after the first kilobyte.
 *
 * The wallet scan reads `/content/<id>` for up to 50 inscriptions to find the
 * `<n>.bitmap` and `<n>:<i>.bitmap` deeds among them. A deed body is a few
 * bytes; an inscription can be megabytes. `getInscriptionContent` now stops
 * reading at 1024 bytes: a declared `content-length` above that is not read at
 * all, a longer stream is cancelled, and an over-limit body is a non-match ('')
 * rather than an outage (null). A failed read is still an outage.
 *
 * `getInscriptionBody` (the ownership gate's read) is not capped.
 */

import {
  getInscriptionContent,
  getInscriptionBody,
  getOrdHostHealth,
  __resetOrdClientForTest,
} from '@/lib/onchain/ord';
import { scanAddressForBitmaps } from '@/lib/inscription-scan';

const CAP = 1024;
const CHUNK = 256;
const BIG = 5_000_000;

const HOLDER = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const OUTPOINT = '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:0';
const DEED = 'cd031d57i0';
const LARGE = 'ab12ab12i0';

const realFetch = global.fetch;
let pulled = 0;
let warn: jest.SpyInstance;

/** A body of `size` bytes, produced only as it is read, counting what was pulled. */
function countedBody(size: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (sent >= size) {
          controller.close();
          return;
        }
        const n = Math.min(CHUNK, size - sent);
        sent += n;
        pulled += n;
        controller.enqueue(new Uint8Array(n).fill(0x61));
      },
    },
    { highWaterMark: 0 },
  );
}

type Handler = (url: string) => Response | Promise<Response>;
function serve(handler: Handler) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => handler(String(input))) as unknown as typeof fetch;
}

beforeEach(() => {
  pulled = 0;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  __resetOrdClientForTest({ list: 'https://a.example,https://b.example', single: null, throttleMs: 0, backoffMs: 0 });
});

afterEach(() => {
  warn.mockRestore();
  global.fetch = realFetch;
});

afterAll(() => __resetOrdClientForTest());

describe('getInscriptionContent reads at most the first kilobyte', () => {
  it('a 5 MB streamed body: at most 1024 bytes + one chunk are pulled, and it is a non-match', async () => {
    serve(() => new Response(countedBody(BIG), { status: 200 }));
    const content = await getInscriptionContent(LARGE);
    expect(content).toBe('');
    expect(pulled).toBeLessThanOrEqual(CAP + CHUNK);
  });

  it('a declared content-length of 5000000: no body bytes are pulled', async () => {
    serve(() => new Response(countedBody(BIG), { status: 200, headers: { 'content-length': String(BIG) } }));
    const content = await getInscriptionContent(LARGE);
    expect(content).toBe('');
    expect(pulled).toBe(0);
  });

  it('an over-limit body is a real answer: the host stays healthy and is not failed over', async () => {
    const hosts: string[] = [];
    serve((url) => {
      hosts.push(new URL(url).host);
      return new Response(countedBody(BIG), { status: 200 });
    });
    await getInscriptionContent(LARGE);
    expect(hosts).toEqual(['a.example']);
    expect(getOrdHostHealth()[0]).toMatchObject({ ok: true, lastStatus: 200 });
  });

  it('a deed body exactly at the limit is read in full', async () => {
    const body = '718840.bitmap' + ' '.repeat(CAP - '718840.bitmap'.length);
    serve(() => new Response(body, { status: 200 }));
    expect(await getInscriptionContent(DEED)).toBe(body);
  });

  it('a small deed body is returned as it is', async () => {
    serve(() => new Response('718840.bitmap', { status: 200 }));
    expect(await getInscriptionContent(DEED)).toBe('718840.bitmap');
  });

  it('a failed read on every host is still null (an outage)', async () => {
    serve(() => new Response('blocked', { status: 403 }));
    expect(await getInscriptionContent(DEED)).toBeNull();
  });

  it('getInscriptionBody is unchanged: it still reads the whole body', async () => {
    serve(() => new Response(countedBody(4096), { status: 200 }));
    const body = await getInscriptionBody(LARGE);
    expect(body?.text.length).toBe(4096);
    expect(pulled).toBe(4096);
  });
});

describe('the wallet scan with an oversized inscription', () => {
  let contentFails = false;

  beforeEach(() => {
    contentFails = false;
    serve((url) => {
      if (url.includes('/address/') && url.endsWith('/utxo')) {
        const [txid, vout] = OUTPOINT.split(':');
        return new Response(JSON.stringify([{ txid, vout: Number(vout) }]), { status: 200 });
      }
      if (url.includes('/r/utxo/')) {
        return new Response(JSON.stringify({ inscriptions: [DEED, LARGE], runes: {}, value: 546 }), { status: 200 });
      }
      if (url.includes(`/content/${DEED}`)) return new Response('718840.bitmap', { status: 200 });
      if (url.includes(`/content/${LARGE}`)) {
        if (contentFails) return new Response('blocked', { status: 403 });
        return new Response(countedBody(BIG), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  it('answers ok: true and lists the real deed', async () => {
    const scan = await scanAddressForBitmaps(HOLDER);
    expect(scan).toEqual({
      ok: true,
      inscriptions: [{ type: 'block', height: 718840, inscriptionId: DEED, label: '718,840.bitmap' }],
    });
    expect(pulled).toBeLessThanOrEqual(CAP + CHUNK);
  });

  it('a failed content read is still content_unavailable', async () => {
    contentFails = true;
    await expect(scanAddressForBitmaps(HOLDER)).resolves.toEqual({ ok: false, reason: 'content_unavailable' });
  });
});
