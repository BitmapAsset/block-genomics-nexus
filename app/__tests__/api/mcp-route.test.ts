/**
 * Tests for src/app/mcp/route.ts — the remote Streamable HTTP MCP endpoint.
 *
 * Covers the handshake a real client performs (initialize → tools/list →
 * tools/call), that the full 35-tool catalog is advertised anonymously, that a
 * tool call is proxied to the REST API, and that token-gated tools fail with a
 * usable message instead of leaking or hanging.
 *
 * Only the outbound `fetch` is mocked; the MCP wire format is exercised for
 * real through the SDK transport.
 */

import { POST, GET, OPTIONS } from '@/app/mcp/route';

const ENDPOINT = 'https://blockgenomics.io/mcp';
const PROTOCOL_VERSION = '2025-06-18';

type JsonRpc = { jsonrpc: '2.0'; id?: number | string; method: string; params?: unknown };

let fetchMock: jest.Mock;
let clientCounter = 0;

beforeEach(() => {
  fetchMock = jest.fn(async () => new Response(JSON.stringify({ success: true, data: { blocks: 1 } }), { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
  clientCounter += 1;
});

function post(body: JsonRpc, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        // A distinct IP per test keeps the in-memory rate limiter from bleeding
        // across cases.
        'x-forwarded-for': `203.0.113.${clientCounter}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** Streamable HTTP may answer with a JSON body or a one-event SSE stream. */
async function readResult(response: Response): Promise<any> {
  const text = await response.text();
  if (text.includes('data:')) {
    const line = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('data:'));
    return JSON.parse(line!.slice(5).trim());
  }
  return JSON.parse(text);
}

const initialize = (): JsonRpc => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
});

describe('POST /mcp — handshake', () => {
  it('answers initialize with server info and tool capability', async () => {
    const res = await post(initialize());
    expect(res.status).toBe(200);

    const body = await readResult(res);
    expect(body.error).toBeUndefined();
    expect(body.result.serverInfo.name).toBe('block-genomics');
    expect(body.result.capabilities.tools).toBeDefined();
    expect(typeof body.result.protocolVersion).toBe('string');
  });

  it('never lets a response be cached and stays CORS-open for remote clients', async () => {
    const res = await post(initialize());
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('POST /mcp — tools/list', () => {
  it('advertises the full 35-tool catalog to an anonymous caller', async () => {
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const body = await readResult(res);

    const names: string[] = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toHaveLength(35);
    expect(new Set(names).size).toBe(35);
    expect(names).toEqual(expect.arrayContaining(['bg_stats', 'bg_block', 'bg_agent_heartbeat', 'bg_auth_verify']));
    // The ownership-gated surface is DISCOVERABLE anonymously — a remote endpoint
    // serves every caller, so tools/list must not depend on who is asking — but
    // each of these refuses to run without a verified session token.
    expect(names).toEqual(
      expect.arrayContaining([
        'bg_verify_start',
        'bg_verify_submit',
        'bg_my_blocks',
        'bg_claim_username',
        'bg_world_create',
      ]),
    );
  });

  it('gives every tool a description and an object input schema', async () => {
    const res = await post({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const body = await readResult(res);

    for (const tool of body.result.tools) {
      expect(tool.name).toMatch(/^bg_[a-z0-9_]+$/);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('POST /mcp — tools/call', () => {
  it('proxies a public tool to the REST API and returns its body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { verifiedAgents: 7 } }), { status: 200 }),
    );

    const res = await post({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'bg_stats', arguments: {} },
    });
    const body = await readResult(res);

    expect(body.result.isError).toBeFalsy();
    expect(body.result.content[0].text).toContain('verifiedAgents');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://blockgenomics.io/api/v1/stats');
    expect((init as RequestInit).headers).not.toHaveProperty('authorization');
  });

  it('passes tool arguments through as query parameters', async () => {
    await post({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'bg_search', arguments: { q: '840000', limit: 3 } },
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://blockgenomics.io/api/v1/search?q=840000&limit=3');
  });

  it('forwards the caller bearer token to the API', async () => {
    await post(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'bg_agent_heartbeat', arguments: { agentId: 'agent-1' } },
      },
      { authorization: 'Bearer bg_agent_test_token' },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://blockgenomics.io/api/v1/agents/agent-1/heartbeat');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as { headers: Record<string, string> }).headers.authorization).toBe('Bearer bg_agent_test_token');
  });

  it('tells an anonymous caller how to authenticate instead of calling the API', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'bg_agent_heartbeat', arguments: { agentId: 'agent-1' } },
    });
    const body = await readResult(res);

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Authorization: Bearer');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an API failure as a tool error rather than a transport error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('block not found', { status: 404, statusText: 'Not Found' }));

    const res = await post({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'bg_block', arguments: { height: 1 } },
    });
    const body = await readResult(res);

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('404');
  });

  it('rejects an unknown tool', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'bg_not_a_tool', arguments: {} },
    });
    const body = await readResult(res);

    expect(body.error ?? body.result.isError).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /mcp — 2026-07-28 era', () => {
  // The newer revision drops the initialize handshake for a per-request envelope
  // plus an Mcp-Method header. Both eras must reach the same catalog.
  it('serves the same catalog to an envelope-era client', async () => {
    const res = await post(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1.0.0' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
      { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' },
    );

    const body = await readResult(res);
    expect(body.error).toBeUndefined();
    expect(body.result.tools).toHaveLength(35);
  });
});

describe('/mcp — transport surface', () => {
  it('answers the CORS preflight without a body', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  it('refuses a GET stream — serving is stateless', async () => {
    const res = await GET(
      new Request(ENDPOINT, { method: 'GET', headers: { 'x-forwarded-for': '203.0.113.250' } }),
    );
    expect(res.status).toBe(405);
  });

  it('sends a browser GET to the docs instead of a bare 405', async () => {
    const res = await GET(
      new Request(ENDPOINT, {
        method: 'GET',
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'x-forwarded-for': '203.0.113.251',
        },
      }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('/docs');
  });

  it('rate limits a flood from one client', async () => {
    const flood = async () =>
      POST(
        new Request(ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            'x-forwarded-for': '198.51.100.42',
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        }),
      );

    let limited: Response | undefined;
    for (let i = 0; i < 130 && !limited; i++) {
      const res = await flood();
      if (res.status === 429) limited = res;
    }

    expect(limited?.status).toBe(429);
    expect(limited?.headers.get('retry-after')).toBe('60');
  });
});
