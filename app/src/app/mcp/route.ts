/**
 * Remote MCP endpoint — https://blockgenomics.io/mcp
 *
 * Streamable HTTP, stateless: any MCP-capable client (Claude, Cursor, ChatGPT,
 * anything speaking the 2026-07-28 or 2025-era wire format) connects by URL with
 * nothing to install. The same tool catalog is published to npm as
 * `block-genomics-mcp` for stdio hosts; both read one shared source of truth
 * (src/lib/mcp/catalog.ts).
 *
 * Anonymous callers get the full catalog. Token-gated tools read
 * `Authorization: Bearer <agent token>` off the connection; nothing is stored.
 */

import { createMcpHandler } from '@modelcontextprotocol/server';
import { enforceRateLimit, rateLimitIdentity } from '@/lib/api-rate-limit';
import { rateLimit } from '@/lib/rate-limit';
import { bearerFrom } from '@/lib/sandbox-tier';
import { createBgMcpServer } from '@/lib/mcp/server';
import { resolveApiBase } from '@/lib/mcp/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Per-caller ceiling. Generous for agent polling, tight enough to blunt a flood.
 *
 * Enforced in two layers, cheapest first:
 *
 *   LOCAL   — the in-memory limiter. One warm lambda only, but it costs nothing
 *             and needs no database, so a flood hitting a single instance is
 *             refused without ever touching Postgres. It also keeps working when
 *             the database does not.
 *   GLOBAL  — the durable Postgres limiter. This is the honest fleet-wide
 *             ceiling; the previous in-memory-only limiter multiplied the real
 *             limit by however many instances were warm and reset on cold start.
 *
 * Neither is sufficient alone: local is not a global quota, and global fails
 * open on a limiter outage. Together they bound both cases. Keyed on the
 * caller's credential when they present one, falling back to IP.
 */
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

const handler = createMcpHandler(
  (ctx) => {
    const request = ctx.requestInfo;
    return createBgMcpServer({
      base: request ? resolveApiBase(request) : 'https://blockgenomics.io',
      token: bearerFrom(request?.headers.get('authorization')) ?? undefined,
    });
  },
  { legacy: 'stateless' },
);

/**
 * `next.config.ts` blankets `/(.*)` with a long-lived Cache-Control, so every
 * response has to opt out explicitly — a cached MCP reply would serve one
 * client's tool output to the next.
 */
function decorate(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** JSON-RPC shaped refusal — MCP clients parse this, not our REST envelope. */
function rateLimited(headers: Record<string, string>): Response {
  return decorate(
    Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32000, message: `Rate limit exceeded: ${RATE_LIMIT} requests per minute.` },
        id: null,
      },
      { status: 429, headers },
    ),
  );
}

async function serve(request: Request): Promise<Response> {
  // Layer 1 — local, free, no I/O. Refuses a single-instance flood before it
  // can turn into database writes.
  if (!rateLimit(`mcp:${rateLimitIdentity(request)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return rateLimited({ 'Retry-After': '60' });
  }

  // Layer 2 — durable, cross-instance. The real ceiling.
  const rl = await enforceRateLimit(request, {
    bucket: 'mcp',
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  });
  if (rl.response) return rateLimited(Object.fromEntries(rl.response.headers));

  const response = decorate(await handler.fetch(request));
  for (const [k, v] of Object.entries(rl.headers)) response.headers.set(k, v);
  return response;
}

export async function POST(request: Request): Promise<Response> {
  return serve(request);
}

/** Stateless serving has no stream to attach to; the SDK answers 405. */
export async function GET(request: Request): Promise<Response> {
  return serve(request);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } });
}
