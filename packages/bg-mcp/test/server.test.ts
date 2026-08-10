import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { AddressInfo } from "node:net";
import { Ajv } from "ajv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PUBLIC_TOOL_NAMES, AGENT_TOOL_NAMES, WRITE_TOOL_NAMES } from "./helpers.js";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = resolve(PKG_ROOT, "dist/index.js");

// ─── fixture API ─────────────────────────────────────────────────────────────

interface ApiHit {
  method: string;
  url: string;
  authorization?: string;
  body: string;
}

let http: Server;
let baseUrl: string;
let hits: ApiHit[] = [];
let respond: (hit: ApiHit) => { status: number; contentType?: string; body: string } = () => ({
  status: 200,
  body: JSON.stringify({ success: true, data: {} }),
});

const readBody = (req: IncomingMessage) =>
  new Promise<string>((res) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => res(buf));
  });

// ─── server instances ────────────────────────────────────────────────────────

const clients: Client[] = [];

async function startMcp(extraEnv: Record<string, string> = {}): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY],
    cwd: PKG_ROOT,
    env: { PATH: process.env.PATH ?? "", BG_API_BASE: baseUrl, ...extraEnv },
  });
  const client = new Client({ name: "bg-mcp-test-client", version: "0.0.0" });
  await client.connect(transport);
  clients.push(client);
  return client;
}

let publicClient: Client;

beforeAll(async () => {
  if (!existsSync(ENTRY)) {
    throw new Error(`${ENTRY} is missing — run \`npm run build\` (npm test does this for you).`);
  }

  http = createServer(async (req, res) => {
    const hit: ApiHit = {
      method: req.method ?? "GET",
      url: req.url ?? "",
      authorization: req.headers.authorization,
      body: await readBody(req),
    };
    hits.push(hit);
    const { status, contentType, body } = respond(hit);
    res.writeHead(status, { "content-type": contentType ?? "application/json" });
    res.end(body);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

  publicClient = await startMcp();
}, 30_000);

afterAll(async () => {
  for (const c of clients) await c.close().catch(() => {});
  await new Promise<void>((r) => http.close(() => r()));
});

beforeEach(() => {
  hits = [];
  respond = () => ({ status: 200, body: JSON.stringify({ success: true, data: {} }) });
});

// ─── registration ────────────────────────────────────────────────────────────

describe("server boot and tool registration", () => {
  it("boots over stdio and advertises exactly the public tools", async () => {
    const { tools } = await publicClient.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...PUBLIC_TOOL_NAMES].sort());
  });

  it("gives every registered tool a non-empty description", async () => {
    const { tools } = await publicClient.listTools();
    for (const tool of tools) expect(tool.description?.length ?? 0, tool.name).toBeGreaterThan(20);
  });

  it("emits a compilable draft-07 JSON Schema for every tool", async () => {
    const { tools } = await publicClient.listTools();
    const ajv = new Ajv({ strict: false });
    for (const tool of tools) {
      const schema = tool.inputSchema as Record<string, any>;
      expect(schema.$schema, tool.name).toBe("http://json-schema.org/draft-07/schema#");
      expect(schema.type, tool.name).toBe("object");
      // Every tool — including the no-arg ones like bg_stats — must lock down
      // additionalProperties. Otherwise a caller could smuggle undocumented
      // fields past a permissive empty schema.
      expect(schema.additionalProperties, tool.name).toBe(false);
      expect(() => ajv.compile(schema), tool.name).not.toThrow();
    }
  });

  it("enforces required arguments and types through the emitted schema", async () => {
    const { tools } = await publicClient.listTools();
    const ajv = new Ajv({ strict: false });
    const validate = (name: string) => ajv.compile(tools.find((t) => t.name === name)!.inputSchema as any);

    const block = validate("bg_block");
    expect(block({ height: 840000 })).toBe(true);
    expect(block({})).toBe(false);
    expect(block({ height: "840000" })).toBe(false);
    expect(block({ height: 840000, rogue: 1 })).toBe(false);

    const experiences = validate("bg_experiences");
    expect(experiences({})).toBe(true);
    expect(experiences({ type: "minecraft", status: "live" })).toBe(true);
    expect(experiences({ type: "gameboy" })).toBe(false);

    const chat = validate("bg_guardian_chat");
    expect(chat({ blockHeight: 1, message: "gm" })).toBe(true);
    expect(chat({ blockHeight: 1 })).toBe(false);
    expect(chat({ blockHeight: 1, message: "x".repeat(4001) })).toBe(false);
  });

  it("hides the agent and write tools from a token-less, write-disabled server", async () => {
    const { tools } = await publicClient.listTools();
    const names = tools.map((t) => t.name);
    for (const n of [...AGENT_TOOL_NAMES, ...WRITE_TOOL_NAMES]) expect(names).not.toContain(n);
  });
});

// ─── round trips ─────────────────────────────────────────────────────────────

const textOf = (result: any) => (result.content?.[0]?.text ?? "") as string;

describe("tool call round trips", () => {
  it("bg_stats reaches the API and returns its payload verbatim", async () => {
    const payload = JSON.stringify({ success: true, data: { agents: 12, genomes: 34, blocks: 56 } });
    respond = () => ({ status: 200, body: payload });
    const result = await publicClient.callTool({ name: "bg_stats", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(payload);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ method: "GET", url: "/api/v1/stats" });
    expect(hits[0].authorization).toBeUndefined();
  });

  it("bg_search forwards the query string", async () => {
    await publicClient.callTool({ name: "bg_search", arguments: { q: "bc1powner" } });
    expect(hits[0].url).toBe("/api/v1/search?q=bc1powner");
  });

  it("bg_badge returns raw SVG markup", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>verified</title></svg>';
    respond = () => ({ status: 200, contentType: "image/svg+xml", body: svg });
    const result = await publicClient.callTool({ name: "bg_badge", arguments: { id: "gravity" } });
    expect(textOf(result)).toBe(svg);
    expect(hits[0].url).toBe("/api/v1/badge/gravity");
  });

  it("bg_guardian_chat POSTs a JSON body", async () => {
    await publicClient.callTool({ name: "bg_guardian_chat", arguments: { blockHeight: 840000, message: "gm" } });
    expect(hits[0].method).toBe("POST");
    expect(hits[0].url).toBe("/api/v1/guardian/chat");
    expect(JSON.parse(hits[0].body)).toEqual({ blockHeight: 840000, message: "gm" });
  });
});

// ─── error surfaces ──────────────────────────────────────────────────────────

describe("error surfaces", () => {
  it("returns isError with the status line when the API 404s", async () => {
    respond = () => ({ status: 404, body: JSON.stringify({ success: false, error: "Block not found" }) });
    const result = await publicClient.callTool({ name: "bg_block", arguments: { height: 1 } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("404");
    expect(textOf(result)).toContain("Block not found");
  });

  it("returns isError when the API 500s", async () => {
    respond = () => ({ status: 500, body: "upstream exploded" });
    const result = await publicClient.callTool({ name: "bg_stats", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("500");
  });

  it("does not crash the server on a malformed API body", async () => {
    respond = () => ({ status: 200, body: '{"success":true,"data":' });
    const result = await publicClient.callTool({ name: "bg_stats", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe('{"success":true,"data":');
    // the server is still alive afterwards
    const { tools } = await publicClient.listTools();
    expect(tools.length).toBe(PUBLIC_TOOL_NAMES.length);
  });

  it("refuses a call to a tool that is not registered", async () => {
    const result = await publicClient.callTool({ name: "bg_agent_heartbeat", arguments: { agentId: "x" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("bg_agent_heartbeat not found");
    expect(hits).toHaveLength(0);
  });

  it("refuses arguments that violate the tool schema before any API call", async () => {
    const result = await publicClient.callTool({ name: "bg_block", arguments: { height: "not-a-number" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Input validation error");
    expect(hits).toHaveLength(0);
  });

  it("refuses a call that omits a required argument", async () => {
    const result = await publicClient.callTool({ name: "bg_search", arguments: {} });
    expect(result.isError).toBe(true);
    expect(hits).toHaveLength(0);
  });
});

// ─── authenticated instance ──────────────────────────────────────────────────

describe("server launched with an agent token", () => {
  let authed: Client;

  beforeAll(async () => {
    authed = await startMcp({ BG_AGENT_TOKEN: "bg_agent_e2e" });
  }, 30_000);

  it("advertises the agent runtime tools too", async () => {
    const names = (await authed.listTools()).tools.map((t) => t.name);
    for (const n of AGENT_TOOL_NAMES) expect(names).toContain(n);
    expect(names).toHaveLength(PUBLIC_TOOL_NAMES.length + AGENT_TOOL_NAMES.length);
  });

  it("sends the Bearer token on bg_agent_heartbeat", async () => {
    respond = () => ({ status: 200, body: JSON.stringify({ success: true, data: { alive: true } }) });
    const result = await authed.callTool({ name: "bg_agent_heartbeat", arguments: { agentId: "clagent01" } });
    expect(result.isError).toBeFalsy();
    expect(hits[0]).toMatchObject({ method: "POST", url: "/api/v1/agents/clagent01/heartbeat" });
    expect(hits[0].authorization).toBe("Bearer bg_agent_e2e");
  });

  it("still sends no Authorization header on public tools", async () => {
    await authed.callTool({ name: "bg_stats", arguments: {} });
    expect(hits[0].authorization).toBeUndefined();
  });
});

// ─── write-enabled instance ──────────────────────────────────────────────────

describe("server launched with writes enabled", () => {
  it("advertises the BIP-322 write tools", async () => {
    const writes = await startMcp({ BG_ENABLE_WRITES: "1" });
    const names = (await writes.listTools()).tools.map((t) => t.name);
    for (const n of WRITE_TOOL_NAMES) expect(names).toContain(n);
    expect(names).toHaveLength(PUBLIC_TOOL_NAMES.length + WRITE_TOOL_NAMES.length);
  }, 30_000);
});
