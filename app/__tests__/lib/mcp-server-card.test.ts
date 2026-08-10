/**
 * The server card is what a directory reads when it cannot open an MCP session,
 * so it is only useful while it still describes the endpoint we actually serve.
 */

import { GET } from '@/app/.well-known/mcp/server-card.json/route';
import { SERVER_INFO, bgTools } from '@/lib/mcp/server';
import { createCall } from '@/lib/mcp/client';

type Card = {
  serverInfo: { name: string; version: string };
  authentication: { required: boolean; schemes: string[] };
  tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
  resources: unknown[];
  prompts: unknown[];
};

async function readCard(): Promise<Card> {
  return GET().json();
}

describe('/.well-known/mcp/server-card.json', () => {
  it('reports the same identity the MCP handshake reports', async () => {
    const card = await readCard();
    expect(card.serverInfo).toEqual(SERVER_INFO);
  });

  it('lists exactly the tools the endpoint registers', async () => {
    const card = await readCard();
    const registered = bgTools(createCall({ base: 'https://blockgenomics.io' })).map((t) => t.name);

    expect(card.tools.map((t) => t.name).sort()).toEqual([...registered].sort());
  });

  it('gives every tool a description and an object input schema', async () => {
    const card = await readCard();

    for (const tool of card.tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('declares the endpoint as open, matching the anonymous tools/list', async () => {
    const card = await readCard();
    expect(card.authentication.required).toBe(false);
  });

  it('stays well under the size where directory scanners start truncating', async () => {
    const bytes = Buffer.byteLength(JSON.stringify(await readCard()));
    expect(bytes).toBeLessThan(30_000);
  });
});
