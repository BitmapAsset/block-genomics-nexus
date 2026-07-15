import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerExperience,
  listExperiences,
  getExperience,
  probeExperience,
  removeExperience,
  requestChallenge,
} from "../src/lib/bg-api";

// A recording fetch double: dispatches each call to `handler`, captures the call.
interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

function stubFetch(handler: (rec: Recorded) => { status?: number; body: unknown }) {
  const calls: Recorded[] = [];
  const impl = async (url: any, init: any = {}) => {
    const rec: Recorded = {
      url: String(url),
      method: (init.method ?? "GET").toUpperCase(),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(rec);
    const { status = 200, body } = handler(rec);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as any;
  };
  vi.stubGlobal("fetch", impl as any);
  return calls;
}

const env = (data: unknown) => ({ success: true, data });
const BASE = "https://blockgenomics.io";

const MANIFEST = {
  blockHeight: 840128,
  name: "My Web World",
  experienceType: "web" as const,
  entryUrl: "https://world.example.com",
  transport: "https" as const,
  version: "1.0.0",
};

const record = (over: Record<string, unknown> = {}) => ({
  id: "exp_abc",
  walletAddress: "bc1powner",
  status: "pending",
  lastProbedAt: null,
  probeLatencyMs: null,
  soulJudged: true,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  ...MANIFEST,
  ...over,
});

beforeEach(() => {
  delete process.env.BG_API_URL;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestChallenge accepts experience purposes", () => {
  it("posts the experience-register purpose", async () => {
    const calls = stubFetch(() => ({ body: env({ message: "m", nonce: "n" }) }));
    await requestChallenge("bc1powner", "experience-register");
    expect(calls[0].url).toBe(`${BASE}/api/v1/challenge`);
    expect(calls[0].body).toEqual({ walletAddress: "bc1powner", purpose: "experience-register" });
  });
});

describe("registerExperience", () => {
  it("POSTs the manifest + auth envelope and unwraps the record", async () => {
    const calls = stubFetch(() => ({ status: 201, body: env(record({ status: "live" })) }));
    const exp = await registerExperience({
      ...MANIFEST,
      walletAddress: "bc1powner",
      signature: "SIG",
      challenge: "M_experience-register",
    });
    expect(exp.status).toBe("live");
    const post = calls[0];
    expect(post.method).toBe("POST");
    expect(post.url).toBe(`${BASE}/api/v1/experiences`);
    expect(post.body).toEqual({
      ...MANIFEST,
      walletAddress: "bc1powner",
      signature: "SIG",
      challenge: "M_experience-register",
    });
  });

  it("surfaces a 422 constitution rejection", async () => {
    stubFetch(() => ({ status: 422, body: { success: false, error: "flagged" } }));
    await expect(
      registerExperience({ ...MANIFEST, walletAddress: "bc1p", signature: "s", challenge: "c" }),
    ).rejects.toThrow(/flagged/);
  });
});

describe("listExperiences", () => {
  it("builds the block/type/status/limit query and returns the page", async () => {
    const calls = stubFetch(() => ({ body: env({ experiences: [record()], total: 1, limit: 20, offset: 0 }) }));
    const page = await listExperiences({ blockHeight: 840128, type: "web", status: "live", limit: 20 });
    expect(page.total).toBe(1);
    expect(page.experiences).toHaveLength(1);
    const url = calls[0].url;
    expect(url).toContain("blockHeight=840128");
    expect(url).toContain("type=web");
    expect(url).toContain("status=live");
    expect(url).toContain("limit=20");
  });

  it("omits the query string when no filters are given", async () => {
    const calls = stubFetch(() => ({ body: env({ experiences: [], total: 0, limit: 50, offset: 0 }) }));
    await listExperiences();
    expect(calls[0].url).toBe(`${BASE}/api/v1/experiences`);
  });
});

describe("getExperience / probeExperience", () => {
  it("get GETs the experience by id (no auth header)", async () => {
    const calls = stubFetch(() => ({ body: env(record()) }));
    const exp = await getExperience("exp_abc");
    expect(exp.name).toBe("My Web World");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/api/v1/experiences/exp_abc`);
  });

  it("probe POSTs to the probe route", async () => {
    const calls = stubFetch(() => ({ body: env(record({ status: "degraded", probeLatencyMs: 3200 })) }));
    const exp = await probeExperience("exp_abc");
    expect(exp.status).toBe("degraded");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/api/v1/experiences/exp_abc/probe`);
  });
});

describe("removeExperience", () => {
  it("DELETEs with the owner-signed auth envelope", async () => {
    const calls = stubFetch(() => ({ body: env({ id: "exp_abc", removed: true }) }));
    const res = await removeExperience("exp_abc", { walletAddress: "bc1powner", signature: "SIG", challenge: "M_experience-manage" });
    expect(res).toEqual({ id: "exp_abc", removed: true });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/api/v1/experiences/exp_abc`);
    expect(calls[0].body).toEqual({ walletAddress: "bc1powner", signature: "SIG", challenge: "M_experience-manage" });
  });
});
