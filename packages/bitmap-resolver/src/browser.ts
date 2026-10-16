// Browser entry ("Check it yourself"): re-check a server bundle from the
// visitor's own browser, talking only to ordinals.com (it sends
// access-control-allow-origin: * on /r/* and /content/*). Same code as the
// package; no inscribed module is imported.
//
//   green  the chain still says what the bundle says, first-ness included
//          (OCI page re-decoded, or walked blocks re-scanned)
//   amber  only the holder moved since the bundle was made
//   red    anything else differs (the diffs say what)

import type { ProofBundle } from './types.js';
import { verifyProof, type VerifyOptions } from './verify.js';

export type CheckColor = 'green' | 'amber' | 'red';

export interface BrowserCheck {
  color: CheckColor;
  diffs: string[];
  /** What was not re-checked (e.g. "re-scanned 2 of 9 walked blocks"); show it next to the color. */
  notes: string[];
}

export async function checkInBrowser(height: number, bundle: ProofBundle, opts: VerifyOptions = {}): Promise<BrowserCheck> {
  if (bundle.height !== height) return { color: 'red', diffs: [`bundle is for ${bundle.height}, not ${height}`], notes: [] };
  const r = await verifyProof(bundle, opts);
  if (r.ok) return { color: 'green', diffs: [], notes: r.notes };
  const onlyHolder = r.diffs.length === r.holderDiffs.length;
  return { color: onlyHolder ? 'amber' : 'red', diffs: r.diffs, notes: r.notes };
}

export { verifyProof } from './verify.js';
export type { ProofBundle } from './types.js';
