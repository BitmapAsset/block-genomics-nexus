import { describe, it, expect, afterEach } from "vitest";
import {
  harness,
  loadTools,
  clearBgEnv,
  TEST_BASE,
  env,
  PUBLIC_TOOL_NAMES,
  AGENT_TOOL_NAMES,
  OWNER_TOOL_NAMES,
  WRITE_TOOL_NAMES,
} from "./helpers.js";
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

const TOKEN = "bg_agent_testtoken";
const SESSION = "bg_vfy_testsession";

// ─── gating ──────────────────────────────────────────────────────────────────

describe("tool gating", () => {
  it("hides the agent runtime tools when no token is configured", async () => {
    const { activeTools } = await loadTools();
    const names = activeTools().map((t) => t.name);
    for (const name of AGENT_TOOL_NAMES) expect(names).not.toContain(name);
  });

  it("hides the ownership-gated tools when no verified session token is configured", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    const names = activeTools().map((t) => t.name);
    for (const name of OWNER_TOOL_NAMES) expect(names).not.toContain(name);
  });

  it("adds the ownership-gated tools when BG_SESSION_TOKEN is configured", async () => {
    const { activeTools } = await loadTools({ BG_SESSION_TOKEN: SESSION });
    expect(activeTools().map((t) => t.name)).toEqual([...PUBLIC_TOOL_NAMES, ...OWNER_TOOL_NAMES]);
  });

  it("hides the write tools unless BG_ENABLE_WRITES=1", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    const names = activeTools().map((t) => t.name);
    for (const name of WRITE_TOOL_NAMES) expect(names).not.toContain(name);
  });

  it("does not enable writes for truthy-but-not-1 values", async () => {
    for (const value of ["0", "true", "yes", ""]) {
      const { activeTools } = await loadTools({ BG_ENABLE_WRITES: value });
      const names = activeTools().map((t) => t.name);
      expect(names, `BG_ENABLE_WRITES=${JSON.stringify(value)}`).not.toContain("bg_auth_verify");
    }
  });

  it("adds the agent runtime tools when a token is configured", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    expect(activeTools().map((t) => t.name)).toEqual([...PUBLIC_TOOL_NAMES, ...AGENT_TOOL_NAMES]);
  });

  it("adds the write tools when BG_ENABLE_WRITES=1", async () => {
    const { activeTools } = await loadTools({ BG_ENABLE_WRITES: "1" });
    expect(activeTools().map((t) => t.name)).toEqual([...PUBLIC_TOOL_NAMES, ...WRITE_TOOL_NAMES]);
  });

  it("exposes the full 30-tool surface with every credential and writes enabled", async () => {
    const { activeTools } = await loadTools({
      BG_AGENT_TOKEN: TOKEN,
      BG_SESSION_TOKEN: SESSION,
      BG_ENABLE_WRITES: "1",
    });
    const names = activeTools().map((t) => t.name);
    expect(names).toEqual([
      ...PUBLIC_TOOL_NAMES,
      ...AGENT_TOOL_NAMES,
      ...OWNER_TOOL_NAMES,
      ...WRITE_TOOL_NAMES,
    ]);
    expect(names).toHaveLength(30);
  });

  it("unlocks the agent tools via the BG_API_KEY alias too", async () => {
    const { activeTools } = await loadTools({ BG_API_KEY: TOKEN });
    expect(activeTools().map((t) => t.name)).toContain("bg_agent_heartbeat");
  });
});

// ─── authenticated request shape ─────────────────────────────────────────────

describe("agent runtime requests", () => {
  it("bg_agent_events GETs the event stream with a Bearer token and since/limit query", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    const { calls } = fetchMock(() => ({ body: env([]) }));
    await byName(activeTools(), "bg_agent_events").run({
      agentId: "clagent01",
      since: "2026-08-01T00:00:00.000Z",
      limit: 25,
    });
    const url = new URL(calls[0].url);
    expect(calls[0].method).toBe("GET");
    expect(url.origin).toBe(TEST_BASE);
    expect(url.pathname).toBe("/api/v1/agents/clagent01/events");
    expect(url.searchParams.get("since")).toBe("2026-08-01T00:00:00.000Z");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].body).toBeUndefined();
  });

  it("bg_agent_events omits the query string when no cursor or limit is given", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    const { calls } = fetchMock(() => ({ body: env([]) }));
    await byName(activeTools(), "bg_agent_events").run({ agentId: "clagent01" });
    expect(calls[0].url).toBe(`${TEST_BASE}/api/v1/agents/clagent01/events`);
  });

  it("bg_agent_heartbeat POSTs with a Bearer token and no body", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    const { calls } = fetchMock(() => ({ body: env({ alive: true }) }));
    await byName(activeTools(), "bg_agent_heartbeat").run({ agentId: "clagent01" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${TEST_BASE}/api/v1/agents/clagent01/heartbeat`);
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].rawBody).toBeUndefined();
    expect(calls[0].headers["content-type"]).toBeUndefined();
  });

  it("bg_agent_brief POSTs the brief body with agentId stripped out of it", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    const { calls } = fetchMock(() => ({ status: 201, body: env({ id: "brief_1" }) }));
    await byName(activeTools(), "bg_agent_brief").run({
      agentId: "clagent01",
      period: "2026-08-09T00:00Z/2026-08-09T23:59Z",
      summary: "all quiet",
      stats: { visitors: 3 },
      pendingPermissions: ["SEND_DMS"],
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${TEST_BASE}/api/v1/agents/clagent01/brief`);
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].body).toEqual({
      period: "2026-08-09T00:00Z/2026-08-09T23:59Z",
      summary: "all quiet",
      stats: { visitors: 3 },
      pendingPermissions: ["SEND_DMS"],
    });
    expect("agentId" in calls[0].body).toBe(false);
  });

  it("percent-encodes a hostile agentId on every runtime route", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    const { calls } = fetchMock(() => ({ body: env({}) }));
    const tools = activeTools();
    await byName(tools, "bg_agent_events").run({ agentId: "../admin" });
    await byName(tools, "bg_agent_heartbeat").run({ agentId: "../admin" });
    await byName(tools, "bg_agent_brief").run({ agentId: "../admin", period: "p", summary: "s", stats: {} });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/api/v1/agents/..%2Fadmin/events",
      "/api/v1/agents/..%2Fadmin/heartbeat",
      "/api/v1/agents/..%2Fadmin/brief",
    ]);
  });
});

// ─── fail closed ─────────────────────────────────────────────────────────────

describe("authenticated tools fail closed", () => {
  it("never reaches the network on an authenticated route without a token", async () => {
    const { call } = await loadTools();
    const { calls } = fetchMock(() => ({ body: env({}) }));
    for (const route of [
      "/api/v1/agents/clagent01/events",
      "/api/v1/agents/clagent01/heartbeat",
      "/api/v1/agents/clagent01/brief",
    ]) {
      await expect(call(route, { auth: true })).rejects.toThrow(/No credential configured/);
    }
    expect(calls).toHaveLength(0);
  });

  it("propagates a 401 from the API without retrying unauthenticated", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: "stale_token" });
    const { calls } = fetchMock(() => ({
      status: 401,
      statusText: "Unauthorized",
      body: { success: false, error: "Missing Authorization: Bearer <agent token>" },
    }));
    await expect(byName(activeTools(), "bg_agent_heartbeat").run({ agentId: "clagent01" })).rejects.toThrow(
      /401 Unauthorized — .*Missing Authorization/,
    );
    expect(calls).toHaveLength(1);
  });

  it("propagates a 403 wrong-owner rejection", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    fetchMock(() => ({ status: 403, statusText: "Forbidden", body: { error: "token does not own this agent" } }));
    await expect(byName(activeTools(), "bg_agent_events").run({ agentId: "someone_elses" })).rejects.toThrow(
      /403 Forbidden/,
    );
  });

  it("never attaches a Bearer token to a public tool even when one is configured", async () => {
    const { activeTools } = await loadTools({ BG_AGENT_TOKEN: TOKEN });
    const { calls } = fetchMock(() => ({ body: env({}) }));
    const tools = activeTools();
    for (const name of PUBLIC_TOOL_NAMES) {
      const tool = byName(tools, name);
      const args: Record<string, any> = {};
      for (const [key, shape] of Object.entries(tool.schema)) {
        if ((shape as any).isOptional()) continue;
        args[key] = key === "message" ? "hi" : key.toLowerCase().includes("height") ? 840000 : "x";
      }
      await tool.run(args);
    }
    expect(calls).toHaveLength(PUBLIC_TOOL_NAMES.length);
    for (const call of calls) expect(call.headers.authorization).toBeUndefined();
  });
});

// ─── write tools ─────────────────────────────────────────────────────────────

describe("write tools", () => {
  it("bg_agent_register POSTs the exact envelope /api/v1/agents/register expects", async () => {
    // Source of truth: app/src/app/api/v1/agents/register/route.ts destructures
    // { walletAddress, endpointUrl, blockHeight, parcelIndex, tier, permissions,
    //   signature, challenge } and hard-fails when any required field is missing.
    const { activeTools } = await loadTools({ BG_ENABLE_WRITES: "1" });
    const { calls } = fetchMock(() => ({ status: 201, body: env({ id: "clagent01" }) }));
    const args = {
      walletAddress: "bc1powner",
      endpointUrl: "https://agent.example",
      blockHeight: 840000,
      parcelIndex: 3,
      tier: 1 as const,
      permissions: ["READ_DMS"],
      signature: "SIG",
      challenge: "CHALLENGE",
    };
    await byName(activeTools(), "bg_agent_register").run(args);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${TEST_BASE}/api/v1/agents/register`);
    expect(calls[0].body).toEqual(args);
    // The registry route mints the token via server-only auth; a caller token
    // must NOT be forwarded.
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(calls[0].headers["content-type"]).toBe("application/json");
    // Field names align with the route destructure — no legacy `ownerAddress`
    // or `name` fields leaking through.
    expect((calls[0].body as any).ownerAddress).toBeUndefined();
    expect((calls[0].body as any).name).toBeUndefined();
  });

  it("bg_agent_register omits parcelIndex when the caller does not supply one", async () => {
    // parcelIndex is optional in the API — most agents register at block scope.
    const { activeTools } = await loadTools({ BG_ENABLE_WRITES: "1" });
    const { calls } = fetchMock(() => ({ status: 201, body: env({ id: "clagent02" }) }));
    const args = {
      walletAddress: "bc1powner",
      endpointUrl: "https://agent.example",
      blockHeight: 840000,
      tier: 2 as const,
      permissions: ["READ_DMS", "WRITE_BRIEF"],
      signature: "SIG",
      challenge: "CHALLENGE",
    };
    await byName(activeTools(), "bg_agent_register").run(args);
    expect(calls[0].body).toEqual(args);
    expect(Object.keys(calls[0].body as any)).not.toContain("parcelIndex");
  });

  it("bg_agent_register schema mirrors the route's required/optional split", async () => {
    const { activeTools } = await loadTools({ BG_ENABLE_WRITES: "1" });
    const register = byName(activeTools(), "bg_agent_register");
    const required = (k: string) => (register.schema[k] as any).isOptional() === false;
    const optional = (k: string) => (register.schema[k] as any).isOptional() === true;
    for (const k of ["walletAddress", "endpointUrl", "blockHeight", "tier", "permissions", "signature", "challenge"]) {
      expect(required(k), `${k} required`).toBe(true);
    }
    expect(optional("parcelIndex"), "parcelIndex optional").toBe(true);
    // Legacy names removed.
    expect(register.schema.ownerAddress).toBeUndefined();
    expect(register.schema.name).toBeUndefined();
  });

  it("bg_agent_register tier is constrained to 1 | 2 | 3", async () => {
    const { activeTools } = await loadTools({ BG_ENABLE_WRITES: "1" });
    const tier = byName(activeTools(), "bg_agent_register").schema.tier as any;
    for (const t of [1, 2, 3]) expect(tier.safeParse(t).success, `tier ${t}`).toBe(true);
    for (const t of [0, 4, 1.5, "1", null]) expect(tier.safeParse(t).success, `tier ${JSON.stringify(t)}`).toBe(false);
  });

  it("bg_auth_verify POSTs the signed challenge", async () => {
    const { activeTools } = await loadTools({ BG_ENABLE_WRITES: "1" });
    const { calls } = fetchMock(() => ({ body: env({ verified: true }) }));
    const args = { walletAddress: "bc1powner", signature: "SIG", message: "MSG", blockHeight: 840000 };
    await byName(activeTools(), "bg_auth_verify").run(args);
    expect(calls[0].url).toBe(`${TEST_BASE}/api/v1/auth/verify`);
    expect(calls[0].body).toEqual(args);
  });

  it("requires signature and challenge material on both write tools", async () => {
    const { activeTools } = await loadTools({ BG_ENABLE_WRITES: "1" });
    const tools = activeTools();
    const required = (name: string, key: string) =>
      ((byName(tools, name).schema[key] as any).isOptional() as boolean) === false;
    expect(required("bg_agent_register", "signature")).toBe(true);
    expect(required("bg_agent_register", "challenge")).toBe(true);
    expect(required("bg_auth_verify", "signature")).toBe(true);
    expect(required("bg_auth_verify", "message")).toBe(true);
  });
});
