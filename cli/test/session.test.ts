// Verified sessions in the CLI. Two auth-critical surfaces here:
//   1. the wire calls — does a gated request actually carry the credential?
//   2. the token store — is a write-authorizing secret handled like one?

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  sessionStart,
  sessionVerify,
  sessionStatus,
  sessionRevoke,
  claimUsername,
  checkUsername,
} from "../src/lib/bg-api";

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
    };
  };
  vi.stubGlobal("fetch", impl as unknown as typeof fetch);
  return calls;
}

const env = (data: unknown) => ({ body: { success: true, data } });
const TOKEN = "bg_vfy_" + "a".repeat(64);
const ADDRESS = "bc1ptestowneraddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("session handshake calls", () => {
  it("asks for a challenge bound to the wallet", async () => {
    const calls = stubFetch(() => env({ message: "m", nonce: "n", walletAddress: ADDRESS }));

    await sessionStart(ADDRESS);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/api/v1/session/start");
    expect(calls[0].body).toEqual({ walletAddress: ADDRESS });
  });

  it("submits the signature and the claimed blocks verbatim", async () => {
    const calls = stubFetch(() =>
      env({ token: TOKEN, walletAddress: ADDRESS, verifiedBlocks: [840000], rejected: [] }),
    );

    await sessionVerify({
      walletAddress: ADDRESS,
      message: "Block Genomics verification: abc",
      signature: "SIG",
      blocks: [840000],
    });

    expect(calls[0].url).toContain("/api/v1/session/verify");
    expect(calls[0].body).toEqual({
      walletAddress: ADDRESS,
      message: "Block Genomics verification: abc",
      signature: "SIG",
      blocks: [840000],
    });
  });

  it("surfaces a server refusal as an error rather than a silent empty session", async () => {
    stubFetch(() => ({
      status: 403,
      body: { success: false, error: "No claimed block could be verified as owned by this wallet" },
    }));

    await expect(
      sessionVerify({ walletAddress: ADDRESS, message: "m", signature: "s", blocks: [840000] }),
    ).rejects.toThrow(/could be verified/);
  });
});

describe("gated calls carry the credential", () => {
  it("sends the Bearer on status", async () => {
    const calls = stubFetch(() => env({ walletAddress: ADDRESS, verifiedBlocks: [840000] }));
    await sessionStatus(TOKEN);
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("sends the Bearer on revoke", async () => {
    const calls = stubFetch(() => env({ revoked: true }));
    await sessionRevoke(TOKEN);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("sends the Bearer when claiming a username", async () => {
    const calls = stubFetch(() => env({ handle: "satoshi", walletAddress: ADDRESS }));
    await claimUsername(TOKEN, "satoshi");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].body).toEqual({ handle: "satoshi" });
  });

  it("checks availability publicly, with no credential attached", async () => {
    const calls = stubFetch(() => env({ handle: "satoshi", available: true }));
    await checkUsername("satoshi");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.authorization).toBeUndefined();
  });
});

describe("session token store", () => {
  let home: string;

  /** Re-import the store against a throwaway HOME (its paths resolve at load). */
  async function freshStore() {
    vi.resetModules();
    vi.spyOn(os, "homedir").mockReturnValue(home);
    return import("../src/lib/session-store");
  }

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "bg-session-test-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("returns null when nothing is stored", async () => {
    const store = await freshStore();
    expect(store.loadSessionToken()).toBeNull();
  });

  it("round-trips a saved session", async () => {
    const store = await freshStore();
    store.saveSession({
      token: TOKEN,
      walletAddress: ADDRESS,
      verifiedBlocks: [840000],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(store.loadSessionToken()).toBe(TOKEN);
    expect(store.loadSession()?.verifiedBlocks).toEqual([840000]);
  });

  it("writes the token file owner-only (0600)", async () => {
    const store = await freshStore();
    store.saveSession({
      token: TOKEN,
      walletAddress: ADDRESS,
      verifiedBlocks: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    // A bearer token that authorizes writes against a Bitcoin block must not be
    // group- or world-readable.
    const mode = fs.statSync(path.join(home, ".block-genomics", "session.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("treats an expired token as absent instead of reporting a live session", async () => {
    const store = await freshStore();
    store.saveSession({
      token: TOKEN,
      walletAddress: ADDRESS,
      verifiedBlocks: [840000],
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    expect(store.loadSessionToken()).toBeNull();
  });

  it("lets the environment override the stored token", async () => {
    const store = await freshStore();
    store.saveSession({
      token: TOKEN,
      walletAddress: ADDRESS,
      verifiedBlocks: [840000],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.stubEnv("BG_SESSION_TOKEN", "bg_vfy_fromenv");

    expect(store.loadSessionToken()).toBe("bg_vfy_fromenv");
  });

  it("clear removes the token and is safe to repeat", async () => {
    const store = await freshStore();
    store.saveSession({
      token: TOKEN,
      walletAddress: ADDRESS,
      verifiedBlocks: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    store.clearSession();
    store.clearSession();

    expect(store.loadSessionToken()).toBeNull();
  });

  it("ignores a corrupt store rather than crashing the CLI", async () => {
    const store = await freshStore();
    fs.mkdirSync(path.join(home, ".block-genomics"), { recursive: true });
    fs.writeFileSync(path.join(home, ".block-genomics", "session.json"), "{not json");

    expect(store.loadSession()).toBeNull();
    expect(store.loadSessionToken()).toBeNull();
  });
});
