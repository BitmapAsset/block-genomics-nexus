import { describe, it, expect } from "vitest";
import { computeGenomeHash } from "../src/lib/genome";

describe("computeGenomeHash", () => {
  it("creates a sha256 hash", () => {
    const hash = computeGenomeHash("block:1:test");
    expect(hash).toHaveLength(64);
  });
});
