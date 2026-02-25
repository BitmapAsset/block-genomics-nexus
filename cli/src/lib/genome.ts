import crypto from "crypto";

export function computeGenomeHash(blockData: string): string {
  return crypto.createHash("sha256").update(blockData).digest("hex");
}
