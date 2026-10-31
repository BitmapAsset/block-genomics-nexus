#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { activeTools } from "./tools.js";

const server = new McpServer({ name: "block-genomics-mcp", version: "0.2.2" });

for (const tool of activeTools()) {
  // Every tool takes a strict object, so the advertised JSON Schema carries
  // additionalProperties:false and a call with an undocumented field is refused
  // rather than passed along. On zod 4 the SDK converts schemas for their input
  // side, where a plain object allows extra keys, so this has to be spelled out
  // for every tool, not just the no-arg ones.
  const inputSchema = z.strictObject(tool.schema);
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
