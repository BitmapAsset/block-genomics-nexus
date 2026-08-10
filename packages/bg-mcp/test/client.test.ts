import { describe, it, expect, afterEach } from "vitest";
import { harness, loadTools, loadRaw, clearBgEnv, TEST_BASE, env } from "./helpers.js";

let active: ReturnType<typeof harness> | undefined;
const fetchMock = (h?: Parameters<typeof harness>[0]) => (active = harness(h));

afterEach(() => {
  active?.restore();
  active = undefined;
  clearBgEnv();
});

describe("base URL resolution", () => {
  it("defaults to production when BG_API_BASE is unset", async () => {
    const { call } = await loadRaw();
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/stats");
    expect(calls[0].url).toBe("https://blockgenomics.io/api/v1/stats");
  });

  it("honors BG_API_BASE and strips trailing slashes", async () => {
    const { call } = await loadTools({ BG_API_BASE: "https://staging.example.test///" });
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/stats");
    expect(calls[0].url).toBe("https://staging.example.test/api/v1/stats");
  });
});

describe("query string building", () => {
  it("serializes numbers and booleans", async () => {
    const { call } = await loadTools();
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/x", { query: { n: 42, flag: false, s: "hi" } });
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("n")).toBe("42");
    expect(url.searchParams.get("flag")).toBe("false");
    expect(url.searchParams.get("s")).toBe("hi");
  });

  it("drops undefined, null and empty-string params", async () => {
    const { call } = await loadTools();
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/x", { query: { a: undefined, b: null, c: "", d: 0 } });
    expect(calls[0].url).toBe(`${TEST_BASE}/api/v1/x?d=0`);
  });

  it("emits no query string at all when every param is absent", async () => {
    const { call } = await loadTools();
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/x", { query: { a: undefined } });
    expect(calls[0].url).toBe(`${TEST_BASE}/api/v1/x`);
  });
});

describe("headers", () => {
  it("always sends an accept header and no content-type on GET", async () => {
    const { call } = await loadTools();
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/stats");
    expect(calls[0].headers.accept).toContain("application/json");
    expect(calls[0].headers.accept).toContain("image/svg+xml");
    expect(calls[0].headers["content-type"]).toBeUndefined();
    expect(calls[0].headers.authorization).toBeUndefined();
  });

  it("sets content-type only when a body is supplied", async () => {
    const { call } = await loadTools();
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/x", { method: "POST", body: { a: 1 } });
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(calls[0].rawBody).toBe('{"a":1}');
  });

  it("sends a Bearer token when auth is requested and a token is configured", async () => {
    const { call } = await loadTools({ BG_AGENT_TOKEN: "bg_agent_tok" });
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/x", { auth: true });
    expect(calls[0].headers.authorization).toBe("Bearer bg_agent_tok");
  });

  it("accepts BG_API_KEY as an alias for BG_AGENT_TOKEN", async () => {
    const { call } = await loadTools({ BG_API_KEY: "bg_alias_tok" });
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/x", { auth: true });
    expect(calls[0].headers.authorization).toBe("Bearer bg_alias_tok");
  });

  it("attaches an abort signal so requests cannot hang forever", async () => {
    const { call } = await loadTools();
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await call("/api/v1/stats");
    expect(calls[0].hasSignal).toBe(true);
  });
});

describe("fail-closed auth", () => {
  it("throws before issuing any request when auth is required but no token is set", async () => {
    const { call } = await loadTools();
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await expect(call("/api/v1/x", { auth: true })).rejects.toThrow(/BG_AGENT_TOKEN is not set/);
    expect(calls).toHaveLength(0);
  });

  it("treats an empty-string token as no token", async () => {
    const { call } = await loadTools({ BG_AGENT_TOKEN: "" });
    const { calls } = fetchMock(() => ({ body: env({}) }));
    await expect(call("/api/v1/x", { auth: true })).rejects.toThrow(/BG_AGENT_TOKEN is not set/);
    expect(calls).toHaveLength(0);
  });
});

describe("response handling", () => {
  it("returns the raw response text without parsing it", async () => {
    const { call } = await loadTools();
    fetchMock(() => ({ body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await expect(call("/api/v1/badge/gravity")).resolves.toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });

  it("returns malformed JSON verbatim rather than throwing", async () => {
    const { call } = await loadTools();
    fetchMock(() => ({ body: "{not json" }));
    await expect(call("/api/v1/stats")).resolves.toBe("{not json");
  });

  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    it(`throws on HTTP ${status} including status text and body excerpt`, async () => {
      const { call } = await loadTools();
      fetchMock(() => ({ status, statusText: "Boom", body: { success: false, error: "nope" } }));
      await expect(call("/api/v1/stats")).rejects.toThrow(
        new RegExp(`^${status} Boom — \\{"success":false,"error":"nope"\\}$`),
      );
    });
  }

  it("truncates long error bodies to 600 characters", async () => {
    const { call } = await loadTools();
    fetchMock(() => ({ status: 500, statusText: "Internal Server Error", body: "x".repeat(5000) }));
    const err = await call("/api/v1/stats").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const detail = (err as Error).message.split("— ")[1];
    expect(detail).toHaveLength(600);
  });

  it("propagates network-level failures unchanged", async () => {
    const { call } = await loadTools();
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    try {
      await expect(call("/api/v1/stats")).rejects.toThrow(/fetch failed/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
