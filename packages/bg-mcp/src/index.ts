#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { activeTools } from "./tools.js";

const server = new McpServer({ name: "block-genomics-mcp", version: "0.1.0" });

for (const tool of activeTools()) {
  // Force additionalProperties:false on no-arg tools so callers can't smuggle
  // undocumented fields past a schema that would otherwise be entirely permissive.
  // Non-empty raw shapes get the same treatment via z-to-json-schema inside the
  // SDK, but the empty-shape case has to be spelled out as a strict z.object.
  const inputSchema =
    Object.keys(tool.schema).length === 0 ? z.object({}).strict() : tool.schema;
  server.registerTool(tool.name, { description: tool.description, inputSchema }, async (args: any) => {
    try {
      return { content: [{ type: "text" as const, text: await tool.run(args ?? {}) }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    }
  });
}

await server.connect(new StdioServerTransport());
