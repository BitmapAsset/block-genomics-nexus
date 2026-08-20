/**
 * The CLI signs the SAME bytes the SDK signs.
 *
 * A manifest signature is only meaningful if the hash the signer commits to is
 * the hash the server re-derives. The CLI, the SDK and the server therefore all
 * have to canonicalize identically — and the failure mode of getting this wrong
 * is quiet: the server rejects an otherwise-valid registration, or a stored
 * record silently stops re-verifying later.
 *
 * The CLI does not keep its own canonicalizer. `src/lib/action-message.ts` and
 * `src/lib/experience-manifest.ts` are GENERATED mirrors of the SDK source. So
 * this file pins two things:
 *   1. the mirrors are not stale (drift is un-mergeable, not just discouraged), and
 *   2. CLI-produced signing bytes equal SDK-produced signing bytes, over the
 *      manifest shapes whose canonical form is decided by a defaulting rule.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runExperience } from "../src/commands/experience";

import { computeManifestHash as cliHash, canonicalManifest as cliCanon } from "../src/lib/experience-manifest";
import { buildActionMessage as cliBuild, stableStringify as cliStable } from "../src/lib/action-message";

import { computeManifestHash as sdkHash, canonicalManifest as sdkCanon } from "../../sdk/agent-connect/src/experience-manifest";
import { buildActionMessage as sdkBuild, stableStringify as sdkStable } from "../../sdk/agent-connect/src/action-message";

const cliRoot = resolve(__dirname, "..");

/**
 * Manifest shapes chosen for the rules that could plausibly diverge: the
 * healthUrl default, dropped-vs-null optionals, clientRequirements accepted as
 * an object or as the JSON string the DB stores, and capability ORDER (which is
 * significant — sorting it would rewrite the operator's intent).
 */
const MANIFESTS = [
  {
    label: "minimal — healthUrl defaults to entryUrl",
    m: {
      blockHeight: 840000,
      name: "Pixel Plaza",
      experienceType: "web",
      entryUrl: "https://plaza.example.com",
      transport: "https",
      version: "1.0.0",
    },
  },
  {
    label: "explicit nulls hash as omitted",
    m: {
      blockHeight: 1,
      name: "A",
      experienceType: "web",
      entryUrl: "https://a.example.com",
      transport: "https",
      version: "1",
      description: null,
      parcelIndex: null,
      contentRating: null,
      contentHash: null,
      capabilities: [],
      clientRequirements: null,
    },
  },
  {
    label: "clientRequirements as an object",
    m: {
      blockHeight: 2,
      name: "B",
      experienceType: "unreal",
      entryUrl: "https://b.example.com",
      transport: "wss",
      version: "2",
      clientRequirements: { platform: "win", minVersion: "1.2", downloadUrl: "https://b.example.com/dl" },
    },
  },
  {
    label: "clientRequirements as the stored JSON string, keys reversed",
    m: {
      blockHeight: 2,
      name: "B",
      experienceType: "unreal",
      entryUrl: "https://b.example.com",
      transport: "wss",
      version: "2",
      clientRequirements: JSON.stringify({ downloadUrl: "https://b.example.com/dl", minVersion: "1.2", platform: "win" }),
    },
  },
  {
    label: "capability order preserved, every optional populated",
    m: {
      blockHeight: 840001,
      parcelIndex: 7,
      name: "Full House",
      description: "everything set",
      experienceType: "godot",
      entryUrl: "https://full.example.com",
      transport: "webrtc",
      healthUrl: "https://full.example.com/health",
      capabilities: ["voice", "avatars", "physics"],
      contentRating: "teen",
      version: "3.1.4",
      contentHash: `sha256:${"a".repeat(64)}`,
      manifestVersion: 1,
    },
  },
] as const;

describe("CLI manifest-signing mirrors the SDK", () => {
  it("the generated mirrors are in sync with the SDK source", () => {
    // Runs the real gate rather than re-implementing it, so this test fails for
    // exactly the reason CI would.
    expect(() =>
      execFileSync("node", ["scripts/sync-manifest-canon.mjs", "--check"], {
        cwd: cliRoot,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it.each(MANIFESTS.map((c) => [c.label, c.m] as const))(
    "canonical hash matches the SDK: %s",
    async (_label, m) => {
      const [cli, sdk] = await Promise.all([cliHash(m as never), sdkHash(m as never)]);
      expect(cli).toBe(sdk);
      expect(cli).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it.each(MANIFESTS.map((c) => [c.label, c.m] as const))(
    "canonical FORM matches the SDK byte-for-byte: %s",
    (_label, m) => {
      expect(cliStable(cliCanon(m as never))).toBe(sdkStable(sdkCanon(m as never)));
    },
  );

  it("reproduces the golden vector the app parity test pins", async () => {
    // Same frozen input/hash the server-side suite asserts. If this changes,
    // every previously signed manifest stops verifying — it must only ever move
    // with a deliberate manifestVersion bump.
    const hash = await cliHash({
      blockHeight: 840000,
      name: "Pixel Plaza",
      experienceType: "web",
      entryUrl: "https://plaza.example.com",
      transport: "https",
      version: "1.0.0",
    });
    expect(hash).toBe("911cc0cb67122963dd4cb3edcb9e72697eed61c1d326266a3c29d82c47575c83");
  });

  it("the full signed authorization is byte-identical to the SDK's", async () => {
    const manifest = MANIFESTS[4].m;
    const binding = {
      action: "experience.register",
      method: "POST",
      path: "/api/v1/experiences",
      blockHeight: manifest.blockHeight,
      nonce: "nonce-fixed-for-determinism",
      expiresAt: 1_800_000_000_000,
    };
    const cliMessage = cliBuild({ ...binding, bodyHash: await cliHash(manifest as never) });
    const sdkMessage = sdkBuild({ ...binding, bodyHash: await sdkHash(manifest as never) });

    expect(cliMessage).toBe(sdkMessage);
    // And it is the shape the server parses, not just a matching blob.
    expect(cliMessage.split("\n")[0]).toBe("Block Genomics Authorization v1");
    expect(cliMessage).toContain("Action: experience.register");
    expect(cliMessage).toContain("Path: /api/v1/experiences");
  });

  it("a tampered manifest produces a different hash, so the binding breaks", async () => {
    const base = MANIFESTS[0].m;
    const original = await cliHash(base as never);
    for (const mutation of [
      { entryUrl: "https://evil.example.com" },
      { blockHeight: 840001 },
      { version: "1.0.1" },
      { capabilities: ["exfiltrate"] },
    ]) {
      expect(await cliHash({ ...base, ...mutation } as never)).not.toBe(original);
    }
  });
});

// ─── What the command actually puts on the wire ──────────────────

/** Field of a canonical action message, e.g. `Body:`. */
function field(message: string, name: string): string {
  const line = message.split("\n").find((l) => l.startsWith(`${name}: `));
  if (!line) throw new Error(`no ${name} field in message:\n${message}`);
  return line.slice(name.length + 2);
}

interface Recorded { url: string; method: string; body: any }

function stubFetch(handler: (rec: Recorded) => unknown) {
  const calls: Recorded[] = [];
  vi.stubGlobal("fetch", async (url: any, init: any = {}) => {
    const rec: Recorded = {
      url: String(url),
      method: (init.method ?? "GET").toUpperCase(),
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(rec);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: handler(rec) }),
    } as any;
  });
  return calls;
}

const CMD_MANIFEST = {
  blockHeight: 840128,
  name: "My Web World",
  experienceType: "web",
  entryUrl: "https://world.example.com",
  transport: "https",
  version: "1.0.0",
};

function writeManifest(m: unknown): string {
  const file = join(mkdtempSync(join(tmpdir(), "bg-cli-")), "manifest.json");
  writeFileSync(file, JSON.stringify(m));
  return file;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bg experience — what the command sends", () => {
  it("register sends a signed manifest, not a bare challenge", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const calls = stubFetch((rec) =>
      rec.url.endsWith("/api/v1/challenge")
        ? { message: "Block Genomics\nNonce: n-1", nonce: "n-1" }
        : { id: "exp_1", walletAddress: "bc1powner", status: "pending", ...CMD_MANIFEST },
    );

    await runExperience("register", {
      manifest: writeManifest(CMD_MANIFEST),
      address: "bc1powner",
      sig: "SIGNATURE",
    });

    const post = calls.find((c) => c.url.endsWith("/api/v1/experiences") && c.method === "POST")!;
    expect(post).toBeDefined();
    // The legacy bare-challenge field must be gone, not merely accompanied.
    expect(post.body.challenge).toBeUndefined();
    expect(post.body.signature).toBe("SIGNATURE");

    const message: string = post.body.message;
    expect(field(message, "Action")).toBe("experience.register");
    expect(field(message, "Method")).toBe("POST");
    expect(field(message, "Path")).toBe("/api/v1/experiences");
    expect(field(message, "Block")).toBe("840128");
    expect(field(message, "Nonce")).toBe("n-1");
    // The binding commits to THIS manifest — the same hash the server re-derives.
    expect(field(message, "Body")).toBe(await sdkHash(CMD_MANIFEST as never));
  });

  it("register signs the manifest it read from disk, so tampering is detectable", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const altered = { ...CMD_MANIFEST, entryUrl: "https://evil.example.com" };
    const calls = stubFetch((rec) =>
      rec.url.endsWith("/api/v1/challenge")
        ? { message: "m", nonce: "n-2" }
        : { id: "exp_2", walletAddress: "bc1powner", status: "pending", ...altered },
    );

    await runExperience("register", {
      manifest: writeManifest(altered),
      address: "bc1powner",
      sig: "SIGNATURE",
    });

    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/v1/experiences"))!;
    expect(field(post.body.message, "Body")).toBe(await sdkHash(altered as never));
    expect(field(post.body.message, "Body")).not.toBe(await sdkHash(CMD_MANIFEST as never));
  });

  it("remove signs over the stored manifest hash and names the experience path", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const storedHash = "b".repeat(64);
    const calls = stubFetch((rec) => {
      if (rec.url.endsWith("/api/v1/challenge")) return { message: "m", nonce: "n-3" };
      if (rec.method === "GET") return { id: "exp_9", walletAddress: "bc1powner", status: "live", manifestHash: storedHash, ...CMD_MANIFEST };
      return { id: "exp_9", removed: true };
    });

    await runExperience("remove", { id: "exp_9", address: "bc1powner", sig: "SIGNATURE" });

    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del).toBeDefined();
    expect(del.body.challenge).toBeUndefined();
    expect(field(del.body.message, "Action")).toBe("experience.remove");
    expect(field(del.body.message, "Method")).toBe("DELETE");
    expect(field(del.body.message, "Path")).toBe("/api/v1/experiences/exp_9");
    expect(field(del.body.message, "Body")).toBe(storedHash);
  });

  it("remove re-derives the hash when the record predates signing", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const calls = stubFetch((rec) => {
      if (rec.url.endsWith("/api/v1/challenge")) return { message: "m", nonce: "n-4" };
      if (rec.method === "GET") return { id: "exp_old", walletAddress: "bc1powner", status: "live", manifestHash: null, ...CMD_MANIFEST };
      return { id: "exp_old", removed: true };
    });

    await runExperience("remove", { id: "exp_old", address: "bc1powner", sig: "SIGNATURE" });

    const del = calls.find((c) => c.method === "DELETE")!;
    // Matches what the server computes for an unsigned legacy row.
    expect(field(del.body.message, "Body")).toBe(await sdkHash(CMD_MANIFEST as never));
  });
});
