/**
 * Static MCP manifest — https://blockgenomics.io/.well-known/mcp.json
 *
 * The served file, public/.well-known/mcp.json, is generated from this module by
 * `npm run mcp:manifest`; edit the copy here, never the JSON.
 * __tests__/contract/mcp-manifest-drift.test.ts fails whenever the checked-in
 * file and this builder disagree.
 *
 * The `tools` array is read from the catalog the /mcp endpoint registers, so a
 * directory reading the manifest sees exactly the tools a client gets on
 * connect.
 */

import { z } from 'zod';
import { buildToolCatalog, type Tool } from './catalog';
import { createCall } from './client';
import { bgTools } from './server';

const CANONICAL_BASE = 'https://blockgenomics.io';

export type McpToolEntry = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/**
 * One catalog tool as the static surfaces publish it — this manifest and
 * /.well-known/mcp/server-card.json share this conversion so they cannot
 * describe a tool differently. A no-arg tool is spelled as a strict empty
 * object, the same schema the endpoint registers for it.
 */
export function mcpToolEntry(tool: Tool): McpToolEntry {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(
      Object.keys(tool.schema).length === 0 ? z.strictObject({}) : z.object(tool.schema),
    ),
  };
}

export function buildMcpManifest() {
  // The catalog is built around a call function it never invokes here; only the
  // declarative half (name, description, schema) is read.
  const call = createCall({ base: CANONICAL_BASE });

  // The hand-written manifest flagged tools that need a credential, and its
  // readers may rely on those optional fields, so they stay: `requiresToken`
  // on tools that send the connection's bearer token (agent runtime and
  // ownership-gated tools), `requiresSigner` on tools whose input carries a
  // BIP-322 signature the caller produces with its own signer.
  const { agentTools, ownerTools, writeTools } = buildToolCatalog(call);
  const needsToken = new Set([...agentTools, ...ownerTools].map((tool) => tool.name));
  const needsSigner = new Set(writeTools.map((tool) => tool.name));

  const tools = bgTools(call).map((tool) => {
    const { name, description, inputSchema } = mcpToolEntry(tool);
    return {
      name,
      description,
      ...(needsSigner.has(name) && { requiresSigner: true }),
      ...(needsToken.has(name) && { requiresToken: true }),
      inputSchema,
    };
  });

  return {
    $schema: 'https://modelcontextprotocol.io/schema/manifest.json',
    name: 'block-genomics',
    version: '0.5.0',
    description:
      'Connect an AI agent to Block Genomics (Nexus Protocol). Reading is open; building is not. ' +
      'Discover the protocol and read verified blocks/parcels with no credentials, then prove ' +
      'Bitcoin-native identity — sign a challenge with the wallet holding your .bitmap inscription ' +
      '(BIP-322) — to receive a session token scoped to the blocks you own. Ownership is re-checked ' +
      'on-chain at the moment of every write. The agent supplies its own Bitcoin signer.',
    homepage: 'https://blockgenomics.io',
    openapi: 'https://blockgenomics.io/openapi.json',
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://blockgenomics.io/mcp',
        headers: [
          {
            name: 'Authorization',
            description:
              'Bearer <token>. Required by every write/build tool: use a bg_vfy_ session token from ' +
              'bg_verify_submit (ownership-gated tools), or a bg_agent_ token from agent registration ' +
              '(agent runtime tools). Read tools need nothing.',
            isRequired: false,
            isSecret: true,
          },
        ],
      },
    ],
    packages: [
      {
        registryType: 'npm',
        identifier: 'block-genomics-mcp',
        version: '0.2.2',
        transport: { type: 'stdio' },
      },
    ],
    instructions: [
      'Two ways to connect, one protocol: point any MCP client at the remote endpoint ' +
        'https://blockgenomics.io/mcp (Streamable HTTP, nothing to install), or run the npm package ' +
        '`block-genomics-mcp` over stdio. ' +
        `Both serve the same ${tools.length} \`bg_*\` tools from one shared catalog.`,
      'CONNECTING GRANTS READS, NOT WRITES. To build anything: call bg_verify_start with your wallet ' +
        'address, sign the returned message with the wallet that holds your <height>.bitmap inscription ' +
        '(BIP-322; base64 or hex both work), then call bg_verify_submit with the signature and the block ' +
        'heights you claim. Each claimed block is checked against the live chain, and you get back a ' +
        'bg_vfy_ session token scoped to the ones that verified. Send it as `Authorization: Bearer <token>`. ' +
        'Ownership is re-verified on-chain at action time, so a transferred bitmap stops working ' +
        'immediately even while the token is still valid. bg_my_blocks shows your current scope; ' +
        'bg_claim_username claims a name once verified.',
      'Agent runtime tools (bg_agent_heartbeat, bg_agent_brief, bg_agent_events) use the separate ' +
        'bg_agent_ token issued at agent registration. The `tools` array below is generated from the ' +
        'shared catalog and lists every `bg_*` tool with its input schema. The block-genomics-connect ' +
        'SDK is a separate, higher-level client that wraps the same REST API around a local signer. ' +
        'No server ever holds keys. See https://blockgenomics.io/docs and the normative spec at ' +
        'https://blockgenomics.io/protocol.',
    ].join('\n\n'),
    tools,
  };
}

/** The exact bytes of public/.well-known/mcp.json: 2-space JSON, trailing newline. */
export function renderMcpManifest(): string {
  return `${JSON.stringify(buildMcpManifest(), null, 2)}\n`;
}
