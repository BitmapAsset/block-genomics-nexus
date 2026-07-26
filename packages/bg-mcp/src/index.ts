#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { activeTools } from "./tools.js";

const server = new McpServer({ name: "block-genomics-mcp", version: "0.1.0" });

for (const tool of activeTools()) {
  server.registerTool(tool.name, { description: tool.description, inputSchema: tool.schema }, async (args: any) => {
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
