import { describe, it, expect } from "vitest";
import { ownershipVerdict, type OwnershipResult } from "../src/index";

// REVIEW-bg88 item 9: the SDK typed `match: boolean`, so a chain outage
// (`verdict: "unknown"`, `match: null`) read as "does not hold". The type now
// carries the server's verdict/chain/source, and ownershipVerdict() never turns
// a null match into a mismatch.

const outage: OwnershipResult = {
  blockHeight: 718840,
  dbOwner: "bc1pdb",
  onChainOwner: null,
  match: null,
  verdict: "unknown",
  chain: "unavailable",
  source: null,
  checkedAt: null,
  lastVerifiedAt: "2026-10-23T08:00:00.000Z",
  unavailableSince: "2026-10-23T09:12:00.000Z",
  inscriptionId: "abci0",
  action: "none",
  lastChecked: "2026-10-23T10:00:00.000Z",
};

describe("ownershipVerdict", () => {
  it("reads the server verdict during an outage", () => {
    expect(ownershipVerdict(outage)).toBe("unknown");
  });

  it("reads a definite answer", () => {
    expect(ownershipVerdict({ ...outage, match: true, verdict: "match", chain: "ok" })).toBe("match");
    expect(ownershipVerdict({ ...outage, match: false, verdict: "mismatch", chain: "ok" })).toBe("mismatch");
  });

  it("derives from match for a server older than the verdict field, null stays unknown", () => {
    expect(ownershipVerdict({ ...outage, verdict: undefined })).toBe("unknown");
    expect(ownershipVerdict({ ...outage, verdict: undefined, match: true })).toBe("match");
    expect(ownershipVerdict({ ...outage, verdict: undefined, match: false })).toBe("mismatch");
  });
});
