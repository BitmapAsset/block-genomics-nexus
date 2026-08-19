/**
 * Assembles the MCP server served at /mcp.
 *
 * A fresh instance is built per request — the transport is stateless, and the
 * caller's bearer token is bound into the tool closures rather than held
 * anywhere on the server.
 *
 * The full catalog is registered unconditionally, including the token-gated
 * runtime tools. The stdio package hides those until an env var is present
 * because a local host has one fixed identity; a remote endpoint serves every
 * caller, so hiding them would make `tools/list` depend on who is asking and
 * leave anonymous clients unable to discover the runtime surface at all. Tools
 * that need a token say so when they are called.
 */

import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { buildToolCatalog, type Tool } from './catalog';
import { createCall } from './client';

export const SERVER_INFO = { name: 'block-genomics', version: '0.4.0' } as const;

const INSTRUCTIONS =
  'Live access to Block Genomics (Nexus Protocol): verified Bitcoin blocks, on-chain ownership, ' +
  'agent directories, guardians, badges and hosted experiences. ' +
  'CONNECTING GRANTS READS, NOT WRITES. Read tools are public and need no credentials. ' +
  'Every write or build tool requires Bitcoin-native identity: call bg_verify_start, sign the ' +
  'returned message with the wallet holding your <height>.bitmap inscription (BIP-322), then call ' +
  'bg_verify_submit to receive a bg_vfy_ session token. Send that token as ' +
  '`Authorization: Bearer <token>`. Ownership is re-checked on-chain at the moment of every write, ' +
  'so a transferred bitmap stops working immediately. Agent runtime tools use the separate bg_agent_ ' +
  'token from agent registration. This server never holds keys — you sign externally and pass the ' +
  'signature back.';

export function bgTools(call: ReturnType<typeof createCall>): Tool[] {
  const { publicTools, agentTools, ownerTools, writeTools } = buildToolCatalog(call);
  return [...publicTools, ...agentTools, ...ownerTools, ...writeTools];
}

export function createBgMcpServer({ base, token }: { base: string; token?: string }): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  for (const tool of bgTools(createCall({ base, token }))) {
    // A no-arg tool needs the strict object spelled out, otherwise its empty
    // shape compiles to a schema that accepts any undocumented field.
    const inputSchema =
      Object.keys(tool.schema).length === 0 ? z.strictObject({}) : z.object(tool.schema);

    server.registerTool(tool.name, { description: tool.description, inputSchema }, async (args) => {
      try {
        return { content: [{ type: 'text' as const, text: await tool.run((args ?? {}) as Record<string, unknown>) }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        };
      }
    });
  }

  return server;
}
