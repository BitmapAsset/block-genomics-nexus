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
import { rateLimit } from '@/lib/rate-limit';
import { bearerFrom } from '@/lib/sandbox-tier';
import { createBgMcpServer } from '@/lib/mcp/server';
import { resolveApiBase } from '@/lib/mcp/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Per-IP ceiling. Generous for agent polling, tight enough to blunt a flood. */
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

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

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

async function serve(request: Request): Promise<Response> {
  if (!rateLimit(`mcp:${clientKey(request)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return decorate(
      Response.json(
        {
          jsonrpc: '2.0',
          error: { code: -32000, message: `Rate limit exceeded: ${RATE_LIMIT} requests per minute.` },
          id: null,
        },
        { status: 429, headers: { 'Retry-After': '60' } },
      ),
    );
  }
  return decorate(await handler.fetch(request));
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
