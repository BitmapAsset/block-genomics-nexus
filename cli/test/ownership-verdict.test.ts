import { describe, it, expect } from "vitest";
import { ownershipVerdict, verdictLabel } from "../src/lib/ownership-verdict";
import type { OwnershipResult } from "../src/lib/api";

// REVIEW-bg88 item 9: the CLI typed `match: boolean` and printed "mismatch"/"no"
// when the API answered `verdict: unknown` during a chain outage. An outage is
// not a negative: it now prints "unknown (chain unreachable since …)".

const base: OwnershipResult = {
  blockHeight: 718840,
  dbOwner: "bc1pdb",
  onChainOwner: "bc1pdb",
  match: true,
  verdict: "match",
  chain: "ok",
  source: "ordinals.com",
  checkedAt: "2026-10-23T10:00:00.000Z",
  lastVerifiedAt: "2026-10-23T10:00:00.000Z",
  unavailableSince: null,
  inscriptionId: "abci0",
  action: "none",
  lastChecked: "2026-10-23T10:00:01.000Z",
};

const outage: OwnershipResult = {
  ...base,
  onChainOwner: null,
  match: null,
  verdict: "unknown",
  chain: "unavailable",
  source: null,
  unavailableSince: "2026-10-23T09:12:00.000Z",
};

describe("ownershipVerdict", () => {
  it("reads the server verdict", () => {
    expect(ownershipVerdict(base)).toBe("match");
    expect(ownershipVerdict({ ...base, match: false, verdict: "mismatch" })).toBe("mismatch");
    expect(ownershipVerdict(outage)).toBe("unknown");
  });

  it("never turns a null match into a mismatch", () => {
    const { verdict: _v, ...noVerdict } = outage;
    expect(ownershipVerdict(noVerdict as OwnershipResult)).toBe("unknown");
  });

  it("falls back to match for a server older than the verdict field", () => {
    const { verdict: _v, ...old } = base;
    expect(ownershipVerdict(old as OwnershipResult)).toBe("match");
    expect(ownershipVerdict({ ...old, match: false } as OwnershipResult)).toBe("mismatch");
  });
});

describe("verdictLabel", () => {
  it("prints match / mismatch when the chain answered", () => {
    expect(verdictLabel(base)).toBe("match");
    expect(verdictLabel({ ...base, match: false, verdict: "mismatch" })).toBe("mismatch");
    expect(verdictLabel(base, { match: "yes", mismatch: "no" })).toBe("yes");
  });

  it("prints unknown with the outage start during a chain outage", () => {
    expect(verdictLabel(outage)).toBe("unknown (chain unreachable since 2026-10-23T09:12:00.000Z)");
    expect(verdictLabel(outage, { match: "yes", mismatch: "no" })).toBe(
      "unknown (chain unreachable since 2026-10-23T09:12:00.000Z)"
    );
    expect(verdictLabel({ ...outage, unavailableSince: null })).toBe("unknown (chain unreachable)");
  });

  it("says why when nothing was asked", () => {
    expect(verdictLabel({ ...outage, chain: "unchecked", unavailableSince: null, inscriptionId: null })).toBe(
      "unknown (no inscription on file)"
    );
  });
});
