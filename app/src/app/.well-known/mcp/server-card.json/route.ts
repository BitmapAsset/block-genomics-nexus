/**
 * Static MCP server card — https://blockgenomics.io/.well-known/mcp/server-card.json
 *
 * Lets a directory read our name, version and tool surface without opening an
 * MCP session. Smithery falls back to this when its scanner cannot reach the
 * endpoint (WAF, rate limit, transient 5xx), and the shape is the one proposed
 * in SEP-1649, so it is not Smithery-specific.
 *
 * Generated from the same catalog the endpoint serves, so it cannot drift from
 * the real tool list the way a checked-in JSON file would.
 */

import { z } from 'zod';
import { SERVER_INFO, bgTools } from '@/lib/mcp/server';
import { createCall } from '@/lib/mcp/client';

export const dynamic = 'force-static';

const CANONICAL_BASE = 'https://blockgenomics.io';

export function GET() {
  // The catalog is built around a call function it never invokes here; only the
  // declarative half (name, description, schema) is read.
  const tools = bgTools(createCall({ base: CANONICAL_BASE })).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(
      Object.keys(tool.schema).length === 0 ? z.strictObject({}) : z.object(tool.schema),
    ),
  }));

  return Response.json(
    {
      serverInfo: SERVER_INFO,
      // Read tools are open; the write tools read a bearer token off the
      // connection when called, which is not an auth requirement to connect.
      authentication: { required: false, schemes: [] },
      tools,
      resources: [],
      prompts: [],
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
