/**
 * HTTP client backing the remote MCP endpoint's tools.
 *
 * The tools proxy the public REST API over HTTP rather than reaching for Prisma
 * directly. That costs one extra hop, and buys the thing that matters: every
 * call re-enters the same middleware the outside world hits, so the sandbox
 * read-only gate, tier metering and per-route rate limits apply to MCP traffic
 * exactly as they apply to a curl. An in-process shortcut would quietly bypass
 * all three.
 *
 * Unlike the stdio package, which snapshots a token from the environment at
 * import time, the token here arrives per request and is bound into the
 * returned closure — the server holds no credential of its own.
 */

const DEFAULT_TIMEOUT_MS = 20000;

/** Origin used whenever the request's own host is not one we recognise. */
const PRODUCTION_BASE = 'https://blockgenomics.io';

export type Query = Record<string, string | number | boolean | undefined | null>;

export type CallOptions = {
  method?: string;
  query?: Query;
  body?: unknown;
  auth?: boolean;
};

export type CallFn = (path: string, opts?: CallOptions) => Promise<string>;

/**
 * Resolve the API origin to proxy to.
 *
 * `Host` / `X-Forwarded-Host` are caller-controlled, so an unrecognised value
 * falls back to production instead of being trusted — otherwise a forged host
 * header would aim server-side fetches (carrying the caller's bearer token) at
 * an arbitrary origin. Localhost and Vercel preview hosts are echoed back so
 * dev and preview deployments talk to themselves.
 */
export function resolveApiBase(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');

  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) return `${proto}://${host}`;
  if (/^[a-z0-9-]+\.vercel\.app$/i.test(host)) return `https://${host}`;
  return PRODUCTION_BASE;
}

/**
 * Build the `call` implementation the tool catalog runs on.
 *
 * @param base  API origin, from {@link resolveApiBase}.
 * @param token Bearer token lifted off the MCP request, when the caller sent one.
 */
export function createCall({
  base,
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  base: string;
  token?: string;
  timeoutMs?: number;
}): CallFn {
  const origin = base.replace(/\/+$/, '');

  return async function call(path, opts = {}) {
    const url = new URL(origin + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = {
      accept: 'application/json, image/svg+xml;q=0.9, */*;q=0.8',
    };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.auth && !token) {
      throw new Error(
        'This tool needs an agent token. Send it as `Authorization: Bearer <agent token>` on the MCP request ' +
          '(obtain one by registering an agent on a block you own).',
      );
    }
    // Forwarded on every call, not just `auth` ones: a sandbox key (bg_sbx_)
    // identifies the caller's tier on public reads too.
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text();
    if (!res.ok) {
      // statusText is empty over HTTP/2 (the spec drops the reason phrase), so
      // compose the label rather than emitting "404  — body".
      const status = res.statusText ? `${res.status} ${res.statusText}` : `${res.status}`;
      throw new Error(`${status} — ${text.slice(0, 600)}`);
    }
    return text;
  };
}
