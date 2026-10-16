// Proof bundle `bg-bitmap-proof/1`: a small JSON (no block bytes) that lets
// anyone re-check a verdict against public sources. `bundleHash` is the sha256
// of the canonical JSON (keys sorted, no whitespace) without `generatedAt` and
// without `bundleHash` itself.

import { toHex } from './bytes.js';
import { sha256 } from './sha256.js';
import type { ProofBundle } from './types.js';

export const PROOF_FORMAT = 'bg-bitmap-proof/1' as const;

/** JSON with object keys sorted at every level. Rejects values JSON cannot carry. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
    }
    default:
      throw new Error(`canonicalJson: cannot encode ${typeof value}`);
  }
}

export function computeBundleHash(bundle: Omit<ProofBundle, 'bundleHash'> | ProofBundle): string {
  const { generatedAt: _g, bundleHash: _h, ...rest } = bundle as ProofBundle;
  void _g;
  void _h;
  return toHex(sha256(new TextEncoder().encode(canonicalJson(rest))));
}

export function sealBundle(bundle: Omit<ProofBundle, 'bundleHash'>): ProofBundle {
  return { ...bundle, bundleHash: computeBundleHash(bundle) };
}
