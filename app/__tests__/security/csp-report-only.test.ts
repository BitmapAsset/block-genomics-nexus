/**
 * Pages send a report-only content security policy with a fresh nonce on every
 * request. The same nonce is handed to rendering through the request header the
 * installed `next` reads for its own <script> tags (app-render:
 * `content-security-policy` || `content-security-policy-report-only`) plus
 * `x-nonce` for app code. Request headers never reach the browser.
 *
 * The enforced Content-Security-Policy is untouched (next.config.ts /
 * vercel.json, pinned in next-config-headers.test.ts); what must not move in
 * the middleware is pinned in middleware-unchanged.test.ts.
 */

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { getScriptNonceFromHeader } from 'next/dist/server/app-render/get-script-nonce-from-header';
import nextConfig from '../../next.config';
import { middleware } from '@/middleware';
import { buildReportOnlyPolicy, createNonce } from '@/lib/csp';
import { getStreamEmbedUrl } from '@/lib/stream-embed';

const page = (p: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(new URL(p, 'https://blockgenomics.io'), init);

const NONCE_SOURCE = /'nonce-([A-Za-z0-9+/]+={0,2})'/;
const nonceOf = (policy: string) => NONCE_SOURCE.exec(policy)?.[1];

/** directive name → its source list */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...sources] = d.split(/\s+/);
        return [name, sources] as [string, string[]];
      }),
  );
}

async function enforcedPolicy(): Promise<string> {
  const entries = await nextConfig.headers!();
  const all = entries.find((e) => e.source === '/(.*)')!;
  return all.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
}

function withNodeEnv<T>(value: string, fn: () => T): T {
  const env = process.env as Record<string, string | undefined>;
  const before = env.NODE_ENV;
  env.NODE_ENV = value;
  try {
    return fn();
  } finally {
    env.NODE_ENV = before;
  }
}

describe('pages: report-only policy with a per-request nonce', () => {
  it.each(['/', '/docs', '/block/720143'])('%s gets Content-Security-Policy-Report-Only with a nonce', (p) => {
    const res = middleware(page(p));
    const policy = res.headers.get('content-security-policy-report-only');
    expect(policy).toBeTruthy();
    const nonce = nonceOf(policy!);
    // 16 random bytes, base64
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(Buffer.from(nonce!, 'base64')).toHaveLength(16);

    // handed to rendering: same policy, same nonce
    const overridden = (res.headers.get('x-middleware-override-headers') ?? '').split(',');
    expect(overridden).toEqual(expect.arrayContaining(['content-security-policy-report-only', 'x-nonce']));
    expect(res.headers.get('x-middleware-request-content-security-policy-report-only')).toBe(policy);
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  it('two requests get different nonces', () => {
    const a = nonceOf(middleware(page('/docs')).headers.get('content-security-policy-report-only')!);
    const b = nonceOf(middleware(page('/docs')).headers.get('content-security-policy-report-only')!);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('the installed next reads the nonce from the request header middleware hands it', () => {
    const res = middleware(page('/'));
    const handed = res.headers.get('x-middleware-request-content-security-policy-report-only')!;
    expect(getScriptNonceFromHeader(handed)).toBe(res.headers.get('x-middleware-request-x-nonce'));
  });

  it('a content-security-policy request header from the client does not reach rendering', () => {
    const res = middleware(page('/docs', { headers: { 'content-security-policy': "script-src 'nonce-AAAA'" } }));
    const overridden = (res.headers.get('x-middleware-override-headers') ?? '').split(',');
    expect(overridden).not.toContain('content-security-policy');
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBeNull();
    expect(res.headers.get('content-security-policy')).toBeNull();
  });
});

describe('the policy module', () => {
  it('creates 16-byte base64 nonces, never the same twice', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const n = createNonce();
      expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      seen.add(n);
    }
    expect(seen.size).toBe(200);
  });

  it('production: script-src is self + nonce + strict-dynamic, no unsafe-eval, no unsafe-inline', () => {
    const policy = withNodeEnv('production', () => buildReportOnlyPolicy('bm9uY2UtZml4dHVyZQ=='));
    expect(policy).not.toContain("'unsafe-eval'");
    const d = directives(policy);
    expect(d.get('script-src')).toEqual(["'self'", "'nonce-bm9uY2UtZml4dHVyZQ=='", "'strict-dynamic'"]);
    expect(d.get('script-src')).not.toContain("'unsafe-inline'");
  });

  it('development adds unsafe-eval to script-src for the dev overlay, nothing else', () => {
    const prod = withNodeEnv('production', () => buildReportOnlyPolicy('bm9uY2UtZml4dHVyZQ=='));
    const dev = withNodeEnv('development', () => buildReportOnlyPolicy('bm9uY2UtZml4dHVyZQ=='));
    expect(directives(dev).get('script-src')).toEqual([
      "'self'",
      "'nonce-bm9uY2UtZml4dHVyZQ=='",
      "'strict-dynamic'",
      "'unsafe-eval'",
    ]);
    const rest = (p: string) => [...directives(p)].filter(([k]) => k !== 'script-src');
    expect(rest(dev)).toEqual(rest(prod));
  });

  it('frame-src lists exactly the origins getStreamEmbedUrl builds', () => {
    // Every player origin the function can return, read from its source, so a
    // fourth platform there fails this test until the policy lists it too.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'stream-embed.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function getStreamEmbedUrl'));
    const fromSource = [...body.matchAll(/return `(https:\/\/[^/`?$]+)/g)].map((m) => m[1]);
    expect(fromSource.length).toBeGreaterThanOrEqual(3);

    // and the same origins at runtime
    const fromRuntime = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.twitch.tv/somechannel',
      'https://kick.com/somechannel',
    ].map((u) => new URL(getStreamEmbedUrl(u)!).origin);
    expect(new Set(fromRuntime)).toEqual(new Set(fromSource));

    const frameSrc = directives(buildReportOnlyPolicy(createNonce())).get('frame-src');
    expect([...(frameSrc ?? [])].sort()).toEqual([...new Set(fromSource)].sort());
  });

  it('connect-src equals the enforced list', async () => {
    const enforced = directives(await enforcedPolicy()).get('connect-src');
    expect(enforced?.length).toBeGreaterThan(1);
    expect(directives(buildReportOnlyPolicy(createNonce())).get('connect-src')).toEqual(enforced);
  });

  it('carries the rest of the target policy and no report endpoint', async () => {
    const enforced = directives(await enforcedPolicy());
    const d = directives(withNodeEnv('production', () => buildReportOnlyPolicy(createNonce())));
    expect([...d.keys()]).toEqual([
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'font-src',
      'connect-src',
      'frame-src',
      'object-src',
      'base-uri',
      'form-action',
      'frame-ancestors',
    ]);
    for (const same of ['default-src', 'style-src', 'img-src', 'font-src', 'frame-ancestors']) {
      expect([same, d.get(same)]).toEqual([same, enforced.get(same)]);
    }
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'self'"]);
    expect(d.get('form-action')).toEqual(["'self'"]);
    expect(d.has('report-uri')).toBe(false);
    expect(d.has('report-to')).toBe(false);
  });
});
