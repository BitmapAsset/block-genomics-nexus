import crypto from "crypto";

export function computeGenomeHash(blockData: string): string {
  return crypto.createHash("sha256").update(blockData).digest("hex");
}

// Mirrors the server's deriveGenomeHash (app/src/lib/genome-utils.ts):
// a deterministic 256-bit identity genome that is a pure function of
// block height + owner address. Same block+owner ALWAYS yields the same
// genome, so the CLI can display the real genome for a verified owner.
export function deriveGenomeHash(blockHeight: number, ownerAddress: string): string {
  return (
    "0x" +
    crypto
      .createHash("sha256")
      .update(`block-genomics:genome:v1:${blockHeight}:${ownerAddress}`)
      .digest("hex")
  );
}
