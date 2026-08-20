// `bg rentals` and its deprecated `bg market` alias.
//
// The alias exists because `market` shipped in published scripts before the
// name was reassigned to the advisory third-party venue lane. The contract this
// file defends: the alias keeps listing *rentals*, its stdout stays identical to
// `bg rentals`, and the deprecation notice goes to stderr where a pipe won't see it.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCLI } from "../src/index";

const LISTING = {
  id: "lst_1",
  blockHeight: 840128,
  parcelTxIndex: null,
  tier: 2,
  spotsTotal: 4,
  spotsUsed: 1,
  price30d: 25000,
  price365d: 210000,
  active: true,
  owner: { handle: "satoshi", walletAddress: "bc1powner" },
  block: { height: 840128, label: "Genesis Lab" },
};

function stubFetch(body: unknown, status = 200) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", (async (url: any) => {
    urls.push(String(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    };
  }) as any);
  return urls;
}

// Capture stdout and stderr separately — the split is the whole point of the alias.
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
  return { out, err };
}

const run = (argv: string[]) => createCLI().parseAsync(["node", "bg", ...argv]);

beforeEach(() => {
  // Pin the base URL so the asserted request path is deterministic.
  process.env.BLOCKGENOMICS_API_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.BLOCKGENOMICS_API_URL;
});

describe("bg rentals", () => {
  it("lists rentals from the delegations endpoint", async () => {
    const urls = stubFetch({ success: true, data: { listings: [LISTING], total: 1 } });
    const { out } = capture();

    await run(["rentals", "list"]);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/api/v1/delegations/listings");
    const text = out.join("\n");
    expect(text).toContain("840128");
    expect(text).toContain("Genesis Lab");
    expect(text).toContain("@satoshi");
    expect(text).toContain("25,000");
    expect(text).toContain("/api/v1/delegations/listings");
  });

  it("passes --block through as a blockHeight filter", async () => {
    const urls = stubFetch({ success: true, data: { listings: [], total: 0 } });
    capture();

    await run(["rentals", "list", "--block", "840128"]);

    expect(urls[0]).toContain("blockHeight=840128");
  });

  it("reports an empty result instead of an empty table", async () => {
    stubFetch({ success: true, data: { listings: [], total: 0 } });
    const { out } = capture();

    await run(["rentals", "list"]);

    expect(out.join("\n")).toContain("No active delegation/rental listings right now.");
  });

  it("surfaces an API error without throwing", async () => {
    stubFetch({ success: false, error: "upstream exploded" }, 500);
    const { out } = capture();

    await expect(run(["rentals", "list"])).resolves.toBeDefined();
    expect(out.join("\n")).toContain("upstream exploded");
  });

  it("names itself, not `market`, in its own help copy", async () => {
    stubFetch({ success: true, data: { listings: [], total: 0 } });
    const { out } = capture();

    await run(["rentals", "price"]);

    expect(out.join("\n")).toContain("`bg rentals list`");
    expect(out.join("\n")).not.toContain("`bg market list`");
  });

  it("rejects an unknown action", async () => {
    stubFetch({ success: true, data: { listings: [], total: 0 } });
    const { out } = capture();

    await run(["rentals", "nonsense"]);

    expect(out.join("\n")).toContain("Unknown rentals action. Use: list | rent | price");
  });
});

describe("bg market (deprecated alias)", () => {
  it("still lists rentals, not the advisory venue lane", async () => {
    const urls = stubFetch({ success: true, data: { listings: [LISTING], total: 1 } });
    const { out } = capture();

    await run(["market", "list"]);

    expect(urls[0]).toContain("/api/v1/delegations/listings");
    // The external market lane must not be reachable through this alias.
    expect(urls[0]).not.toContain("/market");
    expect(out.join("\n")).toContain("840128");
  });

  it("warns on stderr and writes nothing extra to stdout", async () => {
    stubFetch({ success: true, data: { listings: [LISTING], total: 1 } });
    const { out, err } = capture();

    await run(["market", "list"]);

    expect(err).toHaveLength(1);
    expect(err[0]).toContain("deprecated");
    expect(err[0]).toContain("bg rentals");
    expect(out.join("\n")).not.toContain("deprecated");
  });

  it("produces stdout byte-identical to `bg rentals`", async () => {
    stubFetch({ success: true, data: { listings: [LISTING], total: 1 } });
    const viaAlias = capture();
    await run(["market", "list"]);

    vi.restoreAllMocks();
    stubFetch({ success: true, data: { listings: [LISTING], total: 1 } });
    const viaCanonical = capture();
    await run(["rentals", "list"]);

    expect(viaAlias.out).toEqual(viaCanonical.out);
    expect(viaCanonical.err).toHaveLength(0);
  });

  it("keeps its legacy self-reference so published scripts read consistently", async () => {
    stubFetch({ success: true, data: { listings: [], total: 0 } });
    const { out } = capture();

    await run(["market", "price"]);

    expect(out.join("\n")).toContain("`bg market list`");
  });

  it("keeps its legacy unknown-action text", async () => {
    stubFetch({ success: true, data: { listings: [], total: 0 } });
    const { out } = capture();

    await run(["market", "nonsense"]);

    expect(out.join("\n")).toContain("Unknown market action. Use: list | rent | price");
  });
});
