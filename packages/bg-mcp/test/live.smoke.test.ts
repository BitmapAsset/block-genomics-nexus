import { describe, it, expect } from "vitest";
import { loadRaw } from "./helpers.js";

/**
 * Live smoke test against production. Opt-in only — CI and `npm test` skip it so
 * the suite never depends on the network:
 *
 *   npm run test:live
 *
 * Scope is deliberately limited to read endpoints verified healthy on
 * 2026-08-09. /api/v1/stats (hang), /api/v1/search, /api/v1/experiences and
 * /api/v1/delegations/listings were all failing server-side that day; add them
 * back here once prod is fixed so this stays a signal rather than a known-red.
 */
const LIVE = process.env.BG_LIVE_SMOKE === "1";
const TIMEOUT = 30_000;

describe.skipIf(!LIVE)("live smoke (https://blockgenomics.io)", () => {
  const run = async (name: string, args: Record<string, unknown>) => {
    const { activeTools } = await loadRaw();
    const tool = activeTools().find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool.run(args);
  };

  it(
    "bg_block returns the verified record for block 840000",
    async () => {
      const parsed = JSON.parse(await run("bg_block", { height: 840000 }));
      expect(parsed.success).toBe(true);
      expect(parsed.data.height).toBe(840000);
      expect(parsed.data.hash).toMatch(/^0{8}[0-9a-f]+$/);
    },
    TIMEOUT,
  );

  it(
    "bg_world returns a world payload for a block",
    async () => {
      const parsed = JSON.parse(await run("bg_world", { blockHeight: 840000 }));
      expect(parsed).toHaveProperty("objects");
    },
    TIMEOUT,
  );

  it(
    "bg_guardians returns a guardian list for a block",
    async () => {
      const parsed = JSON.parse(await run("bg_guardians", { blockHeight: 840000 }));
      expect(Array.isArray(parsed.guardians)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "bg_badge returns SVG markup for a block height",
    async () => {
      const text = await run("bg_badge", { id: "840000" });
      expect(text.trimStart().startsWith("<svg")).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "authenticated tools still fail closed against prod without a token",
    async () => {
      const { call } = await loadRaw();
      await expect(call("/api/v1/agents/does-not-exist/events", { auth: true })).rejects.toThrow(
        /BG_AGENT_TOKEN is not set/,
      );
    },
    TIMEOUT,
  );
});
