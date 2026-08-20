/**
 * SSRF and hostile-upstream guards on the marketplace venue fetcher.
 *
 * Written from the attacker's side, like the federation suite. The threat here
 * is slightly different from federation's: the URL is ours, not an attacker's,
 * so the interesting attacks are the ones that try to *move* the request off the
 * allowlist — a redirect to the cloud metadata endpoint, a lookalike hostname, a
 * poisoned DNS answer for a host we do trust — plus the ones where a venue we
 * reached behaves badly once it has our attention.
 *
 * 169.254.169.254 recurs on purpose: it is the highest-value SSRF target on a
 * hosted deployment.
 */

const mockLookup = jest.fn();
jest.mock('dns/promises', () => ({
  __esModule: true,
  default: { lookup: (...a: unknown[]) => mockLookup(...(a as [])) },
  lookup: (...a: unknown[]) => mockLookup(...(a as [])),
}));

import { fetchVenueJson, hostIsAllowed, VENUE_MAX_BYTES } from '@/lib/marketplace/venue-fetch';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALLOWED = ['api.venue.example'] as const;
const OK_URL = 'https://api.venue.example/v2/tokens';

const realFetch = global.fetch;
let fetchMock: jest.Mock;

/** A Response-ish object with a streaming body, like undici returns. */
function jsonResponse(
  body: string,
  opts: {
    status?: number;
    contentType?: string | null;
    contentLength?: string | null;
    headers?: Record<string, string>;
  } = {},
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

function redirectTo(location: string) {
  const headers = new Map([['location', location]]);
  return {
    status: 302,
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

describe('hostIsAllowed()', () => {
  it('accepts an exact match, case-insensitively', () => {
    expect(hostIsAllowed('api.venue.example', ALLOWED)).toBe(true);
    expect(hostIsAllowed('API.Venue.Example', ALLOWED)).toBe(true);
  });

  it('accepts a trailing-dot FQDN of an allowed host', () => {
    expect(hostIsAllowed('api.venue.example.', ALLOWED)).toBe(true);
  });

  // The reason the implementation does not use suffix or prefix matching. Both
  // of these read as "contains the allowed host" to a careless check.
  it('refuses a subdomain-of-attacker lookalike', () => {
    expect(hostIsAllowed('api.venue.example.attacker.com', ALLOWED)).toBe(false);
  });

  it('refuses a prefix lookalike', () => {
    expect(hostIsAllowed('evil-api.venue.example.co', ALLOWED)).toBe(false);
  });

  it('refuses a host that merely ends with the allowed string', () => {
    expect(hostIsAllowed('notapi.venue.example', ALLOWED)).toBe(false);
  });

  it('refuses everything when the allowlist is empty', () => {
    expect(hostIsAllowed('api.venue.example', [])).toBe(false);
  });
});

describe('pre-flight guards (no request is ever made)', () => {
  const blocked: Array<[string, string]> = [
    ['http://api.venue.example/v2', 'plain http is refused'],
    ['https://169.254.169.254/latest/meta-data/', 'cloud metadata endpoint'],
    ['https://127.0.0.1/v2', 'IPv4 loopback'],
    ['https://localhost/v2', 'localhost'],
    ['https://api.other.example/v2', 'host is simply not on the list'],
    ['https://user:pass@api.venue.example/v2', 'embedded credentials'],
    ['not a url at all', 'unparseable'],
  ];

  it.each(blocked)('refuses %s (%s)', async (url) => {
    const res = await fetchVenueJson(url, ALLOWED);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when the adapter declared no hosts', async () => {
    const res = await fetchVenueJson(OK_URL, []);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('DNS guard', () => {
  it('refuses an allowlisted host that resolves into a private range', async () => {
    // Allowlisting a name is not trusting whoever answers for it.
    mockLookup.mockResolvedValue([{ address: '169.254.169.254' }]);
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when any resolved address is private, even if one is public', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34' }, { address: '10.0.0.5' }]);
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('redirect guards', () => {
  it('refuses a redirect off the allowlist', async () => {
    fetchMock.mockResolvedValueOnce(redirectTo('https://attacker.example/steal'));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/allowlisted/);
    // The redirect itself was fetched; the hop it pointed at was not.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect to the cloud metadata endpoint', async () => {
    fetchMock.mockResolvedValueOnce(redirectTo('http://169.254.169.254/latest/meta-data/'));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a scheme downgrade on an otherwise allowed host', async () => {
    fetchMock.mockResolvedValueOnce(redirectTo('http://api.venue.example/v2'));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
  });

  it('follows an in-allowlist redirect', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo('https://api.venue.example/v2/moved'))
      .mockResolvedValueOnce(jsonResponse('{"tokens":[]}'));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(true);
  });

  it('gives up on a redirect loop rather than following it forever', async () => {
    fetchMock.mockResolvedValue(redirectTo('https://api.venue.example/v2/loop'));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/too many redirects/);
    // Bounded: initial hop plus MAX_REDIRECTS, not an unbounded chase.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('refuses a redirect with no location header', async () => {
    const headers = new Map<string, string>();
    fetchMock.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: { get: (n: string) => headers.get(n) ?? null },
      body: null,
      text: async () => '',
    } as any);
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
  });
});

describe('hostile response handling', () => {
  it('refuses a non-JSON content-type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('<html>nope</html>', { contentType: 'text/html' }));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/content-type/);
  });

  it('refuses a missing content-type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('{}', { contentType: null }));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
  });

  it('accepts a +json structured suffix', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('{"a":1}', { contentType: 'application/vnd.venue+json' }));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(true);
  });

  it('refuses malformed JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('{"tokens": [ '));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not valid JSON/);
  });

  it('refuses an oversized body by declared content-length, without reading it', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse('{}', { contentLength: String(VENUE_MAX_BYTES + 1) }),
    );
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/exceeds/);
  });

  it('refuses an oversized body that lied about its content-length', async () => {
    // The header says small, the stream keeps coming — the cap must hold on the
    // stream, not on the venue's honesty.
    const huge = 'x'.repeat(VENUE_MAX_BYTES + 1024);
    fetchMock.mockResolvedValueOnce(jsonResponse(`"${huge}"`, { contentLength: '10' }));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/exceeds/);
  });

  it('reports an upstream error status rather than parsing the error page', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('{"error":"nope"}', { status: 401 }));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/HTTP 401/);
  });

  it('returns a reason, not an exception, when the connection fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('connection failed');
  });

  it('reports a timeout as a timeout', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    // Thrown from the read, past the point where a connection failure is caught.
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      body: {
        getReader: () => ({
          read: async () => {
            throw abort;
          },
          cancel: async () => {},
        }),
      },
      text: async () => '{}',
    } as any);
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(false);
  });
});

describe('happy path', () => {
  it('returns parsed JSON and passes through venue headers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('{"tokens":[{"listed":true}]}'));
    const res = await fetchVenueJson(OK_URL, ALLOWED, { authorization: 'Bearer k' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body).toEqual({ tokens: [{ listed: true }] });

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.authorization).toBe('Bearer k');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeDefined();
  });

  it('accepts a JSON array body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('[{"listed":false}]'));
    const res = await fetchVenueJson(OK_URL, ALLOWED);
    expect(res.ok).toBe(true);
    if (res.ok) expect(Array.isArray(res.body)).toBe(true);
  });
});
