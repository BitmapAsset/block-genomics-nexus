/**
 * SSRF guards on the remote-manifest fetch.
 *
 * Federation means reading a document from a server we do not control, at a URL
 * an untrusted party chose — the textbook SSRF setup. These tests are written
 * from the attacker's side: each one is a way to aim our server at something it
 * should never reach, or to make it read something it should never read.
 *
 * The cloud metadata endpoint (169.254.169.254) appears repeatedly on purpose —
 * it is the single highest-value SSRF target on a hosted deployment.
 */

const mockLookup = jest.fn();
jest.mock('dns/promises', () => ({
  __esModule: true,
  default: { lookup: (...a: unknown[]) => mockLookup(...(a as [])) },
  lookup: (...a: unknown[]) => mockLookup(...(a as [])),
}));

import {
  fetchRemoteManifest,
  wellKnownManifestUrl,
  MANIFEST_MAX_BYTES,
} from '@/lib/experience-manifest-fetch';

/* eslint-disable @typescript-eslint/no-explicit-any */

const realFetch = global.fetch;
let fetchMock: jest.Mock;

/** A Response-ish object with a streaming body, like undici returns. */
function jsonResponse(
  body: string,
  opts: { status?: number; contentType?: string | null; contentLength?: string | null; headers?: Record<string, string> } = {},
) {
  const bytes = new TextEncoder().encode(body);
  const headers = new Map<string, string>();
  if (opts.contentType !== null) headers.set('content-type', opts.contentType ?? 'application/json');
  if (opts.contentLength != null) headers.set('content-length', opts.contentLength);
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k.toLowerCase(), v);

  let sent = false;
  return {
    status: opts.status ?? 200,
    ok: (opts.status ?? 200) < 400,
    headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? null },
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        },
        cancel: async () => {},
      }),
    },
    text: async () => body,
  } as any;
}

function redirectTo(location: string, status = 302) {
  const headers = new Map([['location', location]]);
  return {
    status,
    ok: false,
    headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? null },
    body: null,
    text: async () => '',
  } as any;
}

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as any;
  mockLookup.mockReset();
  // Default: every hostname resolves to a public address.
  mockLookup.mockResolvedValue([{ address: '93.184.216.34' }]);
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('scheme + literal-address guards (no request is ever made)', () => {
  const blocked: [string, string][] = [
    ['http://plaza.example.com/m.json', 'plain http is refused, never downgraded'],
    ['ftp://plaza.example.com/m.json', 'non-web scheme'],
    ['file:///etc/passwd', 'local file scheme'],
    ['https://user:pass@plaza.example.com/m.json', 'embedded credentials'],
    ['https://localhost/m.json', 'localhost'],
    ['https://foo.localhost/m.json', 'localhost subdomain'],
    ['https://printer.local/m.json', 'mDNS .local'],
    ['https://127.0.0.1/m.json', 'IPv4 loopback'],
    ['https://169.254.169.254/latest/meta-data/', 'cloud metadata endpoint'],
    ['https://10.0.0.5/m.json', 'RFC1918 10/8'],
    ['https://192.168.1.1/m.json', 'RFC1918 192.168/16'],
    ['https://172.16.0.1/m.json', 'RFC1918 172.16/12'],
    ['https://100.64.0.1/m.json', 'CGNAT 100.64/10'],
    ['https://0.0.0.0/m.json', 'this-network'],
    ['https://[::1]/m.json', 'IPv6 loopback'],
    ['https://[fd00::1]/m.json', 'IPv6 unique-local'],
    ['https://[fe80::1]/m.json', 'IPv6 link-local'],
    ['https://2130706433/m.json', 'decimal-encoded loopback'],
    ['https://0x7f000001/m.json', 'hex-encoded loopback'],
  ];

  it.each(blocked)('refuses %s (%s)', async (url) => {
    const res = await fetchRemoteManifest(url);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('DNS guard', () => {
  it('refuses a public hostname that resolves into a private range', async () => {
    mockLookup.mockResolvedValue([{ address: '169.254.169.254' }]);
    const res = await fetchRemoteManifest('https://evil.example.com/m.json');
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: expect.stringMatching(/private address/) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when ANY resolved address is private (split-horizon / multi-A record)', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34' }, { address: '10.0.0.1' }]);
    const res = await fetchRemoteManifest('https://mixed.example.com/m.json');
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when the name does not resolve', async () => {
    mockLookup.mockRejectedValue(new Error('NXDOMAIN'));
    const res = await fetchRemoteManifest('https://nope.example.com/m.json');
    expect(res.ok).toBe(false);
  });
});

describe('redirect guards', () => {
  it('re-validates every hop — a public URL cannot bounce into the metadata endpoint', async () => {
    fetchMock.mockResolvedValueOnce(redirectTo('https://169.254.169.254/latest/meta-data/'));
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: expect.stringMatching(/blocked hop/) });
  });

  it('refuses a redirect that downgrades to http', async () => {
    fetchMock.mockResolvedValueOnce(redirectTo('http://plaza.example.com/m.json'));
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(false);
  });

  it('refuses a redirect whose host resolves privately', async () => {
    fetchMock.mockResolvedValueOnce(redirectTo('https://inner.example.com/m.json'));
    mockLookup
      .mockResolvedValueOnce([{ address: '93.184.216.34' }])
      .mockResolvedValueOnce([{ address: '10.1.2.3' }]);
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(false);
  });

  it('stops after too many redirects', async () => {
    fetchMock.mockResolvedValue(redirectTo('https://plaza.example.com/again.json'));
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: 'too many redirects' });
  });

  it('follows a safe redirect and returns the document', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo('https://cdn.example.com/m.json'))
      .mockResolvedValueOnce(jsonResponse(JSON.stringify({ name: 'Plaza' })));
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.document).toEqual({ name: 'Plaza' });
  });
});

describe('response guards', () => {
  it('refuses a non-JSON content-type before parsing', async () => {
    fetchMock.mockResolvedValue(jsonResponse('<html>nope</html>', { contentType: 'text/html' }));
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: expect.stringMatching(/content-type/) });
  });

  it('refuses a missing content-type', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}', { contentType: null }));
    expect((await fetchRemoteManifest('https://plaza.example.com/m.json')).ok).toBe(false);
  });

  it('accepts a +json structured suffix and a charset parameter', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(JSON.stringify({ name: 'Plaza' }), { contentType: 'application/manifest+json; charset=utf-8' }),
    );
    expect((await fetchRemoteManifest('https://plaza.example.com/m.json')).ok).toBe(true);
  });

  it('refuses an oversized body declared via content-length, without reading it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse('{}', { contentLength: String(MANIFEST_MAX_BYTES + 1) }),
    );
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: expect.stringMatching(/exceeds/) });
  });

  it('refuses an oversized body that LIES about its content-length (streamed cap)', async () => {
    const huge = JSON.stringify({ pad: 'x'.repeat(MANIFEST_MAX_BYTES + 1000) });
    fetchMock.mockResolvedValue(jsonResponse(huge, { contentLength: '10' }));
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: expect.stringMatching(/exceeds/) });
  });

  it('refuses invalid JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{not json'));
    expect((await fetchRemoteManifest('https://plaza.example.com/m.json')).ok).toBe(false);
  });

  it('refuses a JSON array or scalar — a manifest must be an object', async () => {
    fetchMock.mockResolvedValue(jsonResponse('[1,2,3]'));
    expect((await fetchRemoteManifest('https://plaza.example.com/m.json')).ok).toBe(false);
    fetchMock.mockResolvedValue(jsonResponse('"hello"'));
    expect((await fetchRemoteManifest('https://plaza.example.com/m.json')).ok).toBe(false);
  });

  it('refuses a non-2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}', { status: 500 }));
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: expect.stringMatching(/HTTP 500/) });
  });

  it('never throws on a connection failure', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: 'connection failed' });
  });

  it('returns a clean manifest with its byte count', async () => {
    const doc = { manifestVersion: 1, name: 'Pixel Plaza', version: '1.0.0' };
    fetchMock.mockResolvedValue(jsonResponse(JSON.stringify(doc)));
    const res = await fetchRemoteManifest('https://plaza.example.com/m.json');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.document).toEqual(doc);
      expect(res.bytes).toBe(JSON.stringify(doc).length);
    }
  });

  it('sends a GET with an identifying user-agent and manual redirect handling', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}'));
    await fetchRemoteManifest('https://plaza.example.com/m.json');
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
    expect(init.headers['user-agent']).toMatch(/BlockGenomicsNexus/);
    expect(init.signal).toBeDefined();
  });
});

describe('wellKnownManifestUrl', () => {
  it('derives the well-known path from an https entry URL, dropping any path', () => {
    expect(wellKnownManifestUrl('https://plaza.example.com/play/here')).toBe(
      'https://plaza.example.com/.well-known/nexus-experience.json',
    );
  });

  it('reads a wss entry over https on the same authority', () => {
    expect(wellKnownManifestUrl('wss://realm.example.com:8443/socket')).toBe(
      'https://realm.example.com:8443/.well-known/nexus-experience.json',
    );
  });

  it('returns null for an unsafe entry URL', () => {
    expect(wellKnownManifestUrl('http://plaza.example.com')).toBeNull();
    expect(wellKnownManifestUrl('https://169.254.169.254')).toBeNull();
  });
});
