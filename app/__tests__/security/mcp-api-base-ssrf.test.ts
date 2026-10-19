/**
 * The remote MCP endpoint never lets the caller pick the server its tools fetch.
 *
 * `resolveApiBase()` used to read `X-Forwarded-Host` and `X-Forwarded-Proto`
 * from every request and paste the proto in unchecked. With
 * `X-Forwarded-Host: localhost` and `X-Forwarded-Proto: http://attacker.example/steal#`
 * the tools fetched `http://attacker.example/steal` and returned the body to the
 * caller: a full-read SSRF to any host and path (metadata endpoints included).
 *
 * The same header fed `/\/+$/`, which is quadratic on a long run of slashes
 * that is not at the end: 16,000 slashes cost ~1.4 s of event loop per request.
 */

import { createCall, resolveApiBase } from '@/lib/mcp/client';

const PROD = 'https://blockgenomics.io';

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe('resolveApiBase', () => {
  const saved = process.env.MCP_TRUST_FORWARDED_HEADERS;
  afterEach(() => {
    if (saved === undefined) delete process.env.MCP_TRUST_FORWARDED_HEADERS;
    else process.env.MCP_TRUST_FORWARDED_HEADERS = saved;
  });

  const attacks: [string, Record<string, string>][] = [
    ['proto smuggles a URL', { 'x-forwarded-host': 'localhost', 'x-forwarded-proto': 'http://attacker.example/steal#' }],
    ['proto points at cloud metadata', { 'x-forwarded-host': 'localhost', 'x-forwarded-proto': 'http://169.254.169.254/latest/meta-data#' }],
    ['proto is not a web scheme', { 'x-forwarded-host': 'localhost', 'x-forwarded-proto': 'file' }],
    ['forged host', { 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' }],
    ['host with a path', { 'x-forwarded-host': 'localhost/../attacker.example', 'x-forwarded-proto': 'http' }],
    ['lookalike preview host', { 'x-forwarded-host': 'evil.vercel.app.attacker.example', 'x-forwarded-proto': 'https' }],
  ];

  describe.each([
    ['forwarded headers untrusted (default)', undefined],
    ['forwarded headers trusted', '1'],
  ])('%s', (_label, trust) => {
    beforeEach(() => {
      if (trust === undefined) delete process.env.MCP_TRUST_FORWARDED_HEADERS;
      else process.env.MCP_TRUST_FORWARDED_HEADERS = trust;
    });

    it.each(attacks)('%s falls back to production', (_name, headers) => {
      expect(resolveApiBase(req('https://blockgenomics.io/mcp', headers))).toBe(PROD);
    });

    it('a production request stays on production', () => {
      expect(resolveApiBase(req('https://blockgenomics.io/mcp'))).toBe(PROD);
    });

    it('local dev talks to itself', () => {
      expect(resolveApiBase(req('http://localhost:3112/mcp'))).toBe('http://localhost:3112');
      expect(resolveApiBase(req('http://127.0.0.1:3000/mcp'))).toBe('http://127.0.0.1:3000');
    });

    it('a Vercel preview talks to itself over https', () => {
      expect(resolveApiBase(req('https://bg-git-feature-x.vercel.app/mcp'))).toBe('https://bg-git-feature-x.vercel.app');
    });
  });

  it('ignores forwarded headers unless MCP_TRUST_FORWARDED_HEADERS=1', () => {
    delete process.env.MCP_TRUST_FORWARDED_HEADERS;
    const r = req('https://blockgenomics.io/mcp', { 'x-forwarded-host': 'localhost:3000', 'x-forwarded-proto': 'http' });
    expect(resolveApiBase(r)).toBe(PROD);

    process.env.MCP_TRUST_FORWARDED_HEADERS = 'true'; // only the exact value '1' opts in
    expect(resolveApiBase(r)).toBe(PROD);

    process.env.MCP_TRUST_FORWARDED_HEADERS = '1';
    expect(resolveApiBase(r)).toBe('http://localhost:3000');
  });

  it('reads the first hop of a forwarded list', () => {
    process.env.MCP_TRUST_FORWARDED_HEADERS = '1';
    const r = req('https://blockgenomics.io/mcp', { 'x-forwarded-host': 'localhost:3000, attacker.example', 'x-forwarded-proto': 'https, http' });
    expect(resolveApiBase(r)).toBe('https://localhost:3000');
  });
});

describe('createCall', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('a smuggled proto never reaches fetch: the tool asks production', async () => {
    process.env.MCP_TRUST_FORWARDED_HEADERS = '1';
    const seen: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const base = resolveApiBase(
      req('https://blockgenomics.io/mcp', { 'x-forwarded-host': 'localhost', 'x-forwarded-proto': 'http://attacker.example/steal#' }),
    );
    await createCall({ base })('/api/v1/stats');
    delete process.env.MCP_TRUST_FORWARDED_HEADERS;

    expect(seen).toEqual(['https://blockgenomics.io/api/v1/stats']);
  });

  it('trims trailing slashes in linear time', async () => {
    const seen: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await createCall({ base: 'http://localhost:3000///' })('/api/v1/stats');
    expect(seen).toEqual(['http://localhost:3000/api/v1/stats']);

    // 50,000 slashes not at the end: the old regex needed several seconds here.
    const hostile = 'http://localhost' + '/'.repeat(50_000) + 'x';
    const started = performance.now();
    createCall({ base: hostile });
    expect(performance.now() - started).toBeLessThan(100);
  });
});
