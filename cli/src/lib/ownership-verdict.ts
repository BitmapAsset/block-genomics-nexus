import type { OwnershipResult, OwnershipVerdict } from "./api";

// The API's answer to "does the chain agree with the registry?" has three
// values, not two. During a chain outage it answers `verdict: "unknown"` with
// `match: null`; reading that as a boolean printed "mismatch", which tells the
// user the wallet does not hold the block when nobody could check.

/** The server's verdict; derived from `match` only for a server older than the field. */
export function ownershipVerdict(o: Pick<OwnershipResult, "match"> & { verdict?: OwnershipVerdict }): OwnershipVerdict {
  if (o.verdict) return o.verdict;
  if (o.match === true) return "match";
  if (o.match === false) return "mismatch";
  return "unknown";
}

/** One-line label: the two definite words, or "unknown (why)". */
export function verdictLabel(
  o: OwnershipResult,
  words: { match: string; mismatch: string } = { match: "match", mismatch: "mismatch" }
): string {
  const verdict = ownershipVerdict(o);
  if (verdict === "match") return words.match;
  if (verdict === "mismatch") return words.mismatch;
  if (o.chain === "unchecked") return "unknown (no inscription on file)";
  return o.unavailableSince ? `unknown (chain unreachable since ${o.unavailableSince})` : "unknown (chain unreachable)";
}
