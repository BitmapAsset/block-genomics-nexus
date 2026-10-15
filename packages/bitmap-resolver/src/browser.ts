// Browser entry ("Check it yourself"): re-check a server bundle from the
// visitor's own browser, talking only to ordinals.com (it sends
// access-control-allow-origin: * on /r/* and /content/*). Same code as the
// package; no inscribed module is imported.
//
//   green  the chain still says what the bundle says
//   amber  only the holder moved since the bundle was made
//   red    anything else differs (the diffs say what)

import type { ProofBundle } from './types.js';
import { verifyProof, type VerifyOptions } from './verify.js';

export type CheckColor = 'green' | 'amber' | 'red';

export interface BrowserCheck {
  color: CheckColor;
  diffs: string[];
}

export async function checkInBrowser(height: number, bundle: ProofBundle, opts: VerifyOptions = {}): Promise<BrowserCheck> {
  if (bundle.height !== height) return { color: 'red', diffs: [`bundle is for ${bundle.height}, not ${height}`] };
  const r = await verifyProof(bundle, opts);
  if (r.ok) return { color: 'green', diffs: [] };
  const onlyHolder = r.diffs.length === r.holderDiffs.length;
  return { color: onlyHolder ? 'amber' : 'red', diffs: r.diffs };
}

export { verifyProof } from './verify.js';
export type { ProofBundle } from './types.js';
