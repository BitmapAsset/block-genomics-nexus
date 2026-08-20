import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { harness, loadTools, clearBgEnv, TEST_BASE, env, PUBLIC_TOOL_NAMES } from "./helpers.js";
import type { Tool } from "../src/tools.js";

let active: ReturnType<typeof harness> | undefined;
const fetchMock = (h?: Parameters<typeof harness>[0]) => (active = harness(h));

afterEach(() => {
  active?.restore();
  active = undefined;
  clearBgEnv();
});

const byName = (tools: Tool[], name: string): Tool => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not registered`);
  return tool;
};

// ─── tool surface ────────────────────────────────────────────────────────────

describe("tool surface", () => {
  it("exposes exactly the public tools when no token and no writes are configured", async () => {
    const { activeTools } = await loadTools();
    expect(activeTools().map((t) => t.name)).toEqual([...PUBLIC_TOOL_NAMES]);
  });

  it("gives every tool a unique name, a description, and a zod shape", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: "tok", BG_ENABLE_WRITES: "1" });
    const tools = activeTools();
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.name, tool.name).toMatch(/^bg_[a-z0-9_]+$/);
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(typeof tool.run, tool.name).toBe("function");
      for (const [key, shape] of Object.entries(tool.schema)) {
        expect(shape, `${tool.name}.${key}`).toBeInstanceOf(z.ZodType);
      }
    }
  });

  it("declares the documented required/optional split for filtered list tools", async () => {
    const { activeTools } = await loadTools();
    const tools = activeTools();
    const optional = (t: Tool, k: string) => (t.schema[k] as z.ZodTypeAny).isOptional();

    const listings = byName(tools, "bg_delegation_listings");
    for (const k of ["blockHeight", "tier", "active", "limit", "offset"]) {
      expect(optional(listings, k), `listings.${k}`).toBe(true);
    }

    const experiences = byName(tools, "bg_experiences");
    for (const k of ["blockHeight", "type", "status", "limit", "offset"]) {
      expect(optional(experiences, k), `experiences.${k}`).toBe(true);
    }

    expect(optional(byName(tools, "bg_agent_briefs"), "limit")).toBe(true);
    expect(optional(byName(tools, "bg_agent_briefs"), "agentId")).toBe(false);
    expect(optional(byName(tools, "bg_search"), "q")).toBe(false);
    expect(optional(byName(tools, "bg_search"), "limit")).toBe(true);
    for (const k of ["visitorAddress", "visitorHandle", "conversationId", "signature", "signedMessage"]) {
      expect(optional(byName(tools, "bg_guardian_chat"), k), `guardian_chat.${k}`).toBe(true);
    }
  });

  it("constrains enum and length-bounded inputs", async () => {
    const { activeTools } = await loadTools();
    const tools = activeTools();

    const type = byName(tools, "bg_experiences").schema.type as z.ZodTypeAny;
    expect(type.safeParse("minecraft").success).toBe(true);
    expect(type.safeParse("gameboy").success).toBe(false);

    const status = byName(tools, "bg_experiences").schema.status as z.ZodTypeAny;
    expect(status.safeParse("live").success).toBe(true);
    expect(status.safeParse("on-fire").success).toBe(false);

    const message = byName(tools, "bg_guardian_chat").schema.message as z.ZodTypeAny;
    expect(message.safeParse("x".repeat(4000)).success).toBe(true);
    expect(message.safeParse("x".repeat(4001)).success).toBe(false);

    const height = byName(tools, "bg_block").schema.height as z.ZodTypeAny;
    expect(height.safeParse(840000).success).toBe(true);
    expect(height.safeParse(840000.5).success).toBe(false);
    expect(height.safeParse("840000").success).toBe(false);

    // bg_search.limit must match the search route: default 8, hard cap 20.
    const searchLimit = byName(tools, "bg_search").schema.limit as z.ZodTypeAny;
    expect(searchLimit.safeParse(1).success).toBe(true);
    expect(searchLimit.safeParse(20).success).toBe(true);
    expect(searchLimit.safeParse(21).success).toBe(false);
    expect(searchLimit.safeParse(0).success).toBe(false);
    expect(searchLimit.safeParse(1.5).success).toBe(false);

    // bg_challenge.purpose must cover every purpose the API actually accepts.
    const purpose = byName(tools, "bg_challenge").schema.purpose as z.ZodTypeAny;
    for (const p of [
      "auth",
      "world",
      "agent-register",
      "agent-manage",
      "agent-token",
      "parcel-customize",
      "experience-register",
      "experience-manage",
      "profile",
    ]) {
      expect(purpose.safeParse(p).success, `purpose:${p}`).toBe(true);
    }
    for (const p of ["", "unknown", "AUTH", "world-build"]) {
      expect(purpose.safeParse(p).success, `purpose:${p} rejected`).toBe(false);
    }
  });
});

// ─── request shape, one case per public tool ─────────────────────────────────

interface Case {
  tool: string;
  args: Record<string, any>;
  method?: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

const CASES: Case[] = [
  { tool: "bg_stats", args: {}, path: "/api/v1/stats" },
  { tool: "bg_search", args: { q: "840000" }, path: "/api/v1/search", query: { q: "840000" } },
  {
    tool: "bg_search",
    args: { q: "gravity", limit: 15 },
    path: "/api/v1/search",
    query: { q: "gravity", limit: "15" },
  },
  { tool: "bg_block", args: { height: 840000 }, path: "/api/v1/blocks/840000" },
  {
    tool: "bg_ownership_verify",
    args: { blockHeight: 840000 },
    path: "/api/v1/ownership/verify",
    query: { blockHeight: "840000" },
  },
  { tool: "bg_agents_by_block", args: { blockHeight: 840000 }, path: "/api/v1/agents/block/840000" },
  {
    tool: "bg_agent_briefs",
    args: { agentId: "clagent01", limit: 5 },
    path: "/api/v1/agents/clagent01/briefs",
    query: { limit: "5" },
  },
  { tool: "bg_agent_briefs", args: { agentId: "clagent01" }, path: "/api/v1/agents/clagent01/briefs" },
  { tool: "bg_badge", args: { id: "gravity" }, path: "/api/v1/badge/gravity" },
  {
    tool: "bg_delegation_listings",
    args: { blockHeight: 840000, tier: "premium", active: true, limit: 10, offset: 20 },
    path: "/api/v1/delegations/listings",
    query: { blockHeight: "840000", tier: "premium", active: "true", limit: "10", offset: "20" },
  },
  { tool: "bg_delegation_listings", args: {}, path: "/api/v1/delegations/listings" },
  {
    tool: "bg_game_elements",
    args: { blockHeight: 840000 },
    path: "/api/v1/game/elements",
    query: { blockHeight: "840000" },
  },
  {
    tool: "bg_experiences",
    args: { blockHeight: 840128, type: "minecraft", status: "live", limit: 20, offset: 0 },
    path: "/api/v1/experiences",
    query: { blockHeight: "840128", type: "minecraft", status: "live", limit: "20", offset: "0" },
  },
  { tool: "bg_experiences", args: {}, path: "/api/v1/experiences" },
  { tool: "bg_experience", args: { id: "exp_abc" }, path: "/api/v1/experiences/exp_abc" },
  {
    tool: "bg_experience_verify",
    args: { id: "exp_abc" },
    path: "/api/v1/experiences/exp_abc/verify",
  },
  {
    tool: "bg_experience_verify",
    args: { id: "exp_abc", remote: true },
    path: "/api/v1/experiences/exp_abc/verify",
    query: { remote: "1" },
  },
  { tool: "bg_profiles_by_block", args: { height: 840000 }, path: "/api/v1/profiles/by-block/840000" },
  { tool: "bg_profiles_by_wallet", args: { address: "bc1powner" }, path: "/api/v1/profiles/by-wallet/bc1powner" },
  { tool: "bg_user_by_wallet", args: { address: "bc1powner" }, path: "/api/v1/users/by-wallet/bc1powner" },
  { tool: "bg_world", args: { blockHeight: 840000 }, path: "/api/v1/world", query: { blockHeight: "840000" } },
  { tool: "bg_guardians", args: { blockHeight: 840000 }, path: "/api/v1/guardian", query: { blockHeight: "840000" } },
  {
    tool: "bg_guardian_chat",
    args: { blockHeight: 840000, message: "gm", visitorHandle: "gravity", conversationId: "c1" },
    method: "POST",
    path: "/api/v1/guardian/chat",
    body: { blockHeight: 840000, message: "gm", visitorHandle: "gravity", conversationId: "c1" },
  },
  {
    // Owner-signed guardian chat: visitorAddress + signature + signedMessage are
    // required for the API to unlock owner-only world actions.
    tool: "bg_guardian_chat",
    args: {
      blockHeight: 840000,
      message: "build a fountain at origin",
      visitorAddress: "bc1powner",
      visitorHandle: "gravity",
      signature: "SIG",
      signedMessage: "Block Genomics verification: abc123",
    },
    method: "POST",
    path: "/api/v1/guardian/chat",
    body: {
      blockHeight: 840000,
      message: "build a fountain at origin",
      visitorAddress: "bc1powner",
      visitorHandle: "gravity",
      signature: "SIG",
      signedMessage: "Block Genomics verification: abc123",
    },
  },
  {
    tool: "bg_challenge",
    args: { walletAddress: "bc1powner", purpose: "agent-register" },
    method: "POST",
    path: "/api/v1/challenge",
    body: { walletAddress: "bc1powner", purpose: "agent-register" },
  },
  {
    // Step 1 of the ownership handshake. Public on purpose — this is how a
    // caller obtains the credential every write tool then demands.
    tool: "bg_verify_start",
    args: { walletAddress: "bc1powner" },
    method: "POST",
    path: "/api/v1/session/start",
    body: { walletAddress: "bc1powner" },
  },
  {
    tool: "bg_verify_submit",
    args: {
      walletAddress: "bc1powner",
      message: "Block Genomics verification: abc123",
      signature: "SIG",
      blocks: [840000],
    },
    method: "POST",
    path: "/api/v1/session/verify",
    body: {
      walletAddress: "bc1powner",
      message: "Block Genomics verification: abc123",
      signature: "SIG",
      blocks: [840000],
    },
  },
  {
    tool: "bg_username_available",
    args: { handle: "gravity" },
    path: "/api/v1/session/username",
    query: { handle: "gravity" },
  },
];

describe("public tool requests", () => {
  it("covers every public tool", () => {
    expect(new Set(CASES.map((c) => c.tool))).toEqual(new Set(PUBLIC_TOOL_NAMES));
  });

  for (const c of CASES) {
    const label = `${c.tool}(${JSON.stringify(c.args)})`;
    it(`${label} → ${c.method ?? "GET"} ${c.path}`, async () => {
      const { activeTools } = await loadTools();
      const { calls } = fetchMock(() => ({ body: env({ ok: true }) }));

      const out = await byName(activeTools(), c.tool).run(c.args);
      expect(out).toBe(JSON.stringify(env({ ok: true })));

      expect(calls).toHaveLength(1);
      const call = calls[0];
      const url = new URL(call.url);
      expect(call.method).toBe(c.method ?? "GET");
      expect(url.origin).toBe(TEST_BASE);
      expect(url.pathname).toBe(c.path);
      expect(Object.fromEntries(url.searchParams)).toEqual(c.query ?? {});
      expect(call.body).toEqual(c.body);
      // Public tools must never leak an Authorization header.
      expect(call.headers.authorization).toBeUndefined();
    });
  }
});

// ─── path encoding ───────────────────────────────────────────────────────────

describe("path parameter encoding", () => {
  const encodingCases: Array<[tool: string, args: Record<string, any>, pathname: string]> = [
    ["bg_badge", { id: "a/b?c#d" }, "/api/v1/badge/a%2Fb%3Fc%23d"],
    ["bg_experience", { id: "exp /x" }, "/api/v1/experiences/exp%20%2Fx"],
    ["bg_agent_briefs", { agentId: "../../admin" }, "/api/v1/agents/..%2F..%2Fadmin/briefs"],
    ["bg_profiles_by_wallet", { address: "bc1p addr" }, "/api/v1/profiles/by-wallet/bc1p%20addr"],
    ["bg_user_by_wallet", { address: "bc1p&x=1" }, "/api/v1/users/by-wallet/bc1p%26x%3D1"],
  ];

  for (const [tool, args, pathname] of encodingCases) {
    it(`${tool} escapes hostile path input`, async () => {
      const { activeTools } = await loadTools();
      const { calls } = fetchMock(() => ({ body: env({}) }));
      await byName(activeTools(), tool).run(args);
      expect(new URL(calls[0].url).pathname).toBe(pathname);
    });
  }
});

// ─── error propagation ───────────────────────────────────────────────────────

describe("tool error propagation", () => {
  it("surfaces a 404 from the API as a rejected promise", async () => {
    const { activeTools } = await loadTools();
    fetchMock(() => ({ status: 404, statusText: "Not Found", body: { success: false, error: "Block not found" } }));
    await expect(byName(activeTools(), "bg_block").run({ height: 1 })).rejects.toThrow(/404 Not Found — .*Block not found/);
  });

  it("surfaces a 429 rate limit from the guardian chat tool", async () => {
    const { activeTools } = await loadTools();
    fetchMock(() => ({ status: 429, statusText: "Too Many Requests", body: { error: "slow down" } }));
    await expect(
      byName(activeTools(), "bg_guardian_chat").run({ blockHeight: 1, message: "hi" }),
    ).rejects.toThrow(/429 Too Many Requests/);
  });

  it("surfaces a 500 from the API", async () => {
    const { activeTools } = await loadTools();
    fetchMock(() => ({ status: 500, statusText: "Internal Server Error", body: "upstream exploded" }));
    await expect(byName(activeTools(), "bg_stats").run({})).rejects.toThrow(/500 Internal Server Error/);
  });

  it("passes a non-JSON success body straight through (badge SVG)", async () => {
    const { activeTools } = await loadTools();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120"><title>verified</title></svg>';
    fetchMock(() => ({ body: svg }));
    await expect(byName(activeTools(), "bg_badge").run({ id: "gravity" })).resolves.toBe(svg);
  });

  it("passes a truncated/malformed JSON body through without throwing", async () => {
    const { activeTools } = await loadTools();
    fetchMock(() => ({ body: '{"success":true,"data":' }));
    await expect(byName(activeTools(), "bg_stats").run({})).resolves.toBe('{"success":true,"data":');
  });
});
