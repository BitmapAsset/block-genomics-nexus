/**
 * Differential regression suite for the elliptic → noble BIP-322 migration.
 *
 * Every `expected` value in the fixture was produced by `bip322-js@3.0.0`, the
 * elliptic-backed implementation this code replaced. Passing this suite means
 * the replacement makes the identical accept/reject decision on all of them —
 * the compatibility guarantee, checked without shipping `elliptic`.
 *
 * Regenerate with `scripts/gen-bip322-vectors.ts` (see its header).
 */

import { verifyBip322Signature } from '@/lib/bip322-verify';
import vectorFile from '../fixtures/bip322-vectors.json';

interface Vector {
  name: string;
  kind: string;
  address: string;
  message: string;
  signature: string;
  expected: boolean;
}

const vectors = vectorFile.vectors as Vector[];
const accepted = vectors.filter((v) => v.expected);
const rejected = vectors.filter((v) => !v.expected);

describe('BIP-322 vectors: parity with bip322-js@3.0.0', () => {
  it('the fixture is present and non-trivial', () => {
    expect(vectorFile.reference).toBe('bip322-js@3.0.0');
    expect(accepted.length).toBeGreaterThanOrEqual(50);
    expect(rejected.length).toBeGreaterThanOrEqual(40);
  });

  // Guards against a regenerated fixture silently losing a whole address type:
  // an all-reject fixture would otherwise still "pass".
  it.each(['p2pkh', 'p2sh-p2wpkh', 'p2wpkh', 'p2tr'])(
    'covers %s with both accepted and rejected vectors',
    (kind) => {
      expect(accepted.filter((v) => v.kind === kind).length).toBeGreaterThan(0);
      expect(rejected.filter((v) => v.kind === kind).length).toBeGreaterThan(0);
    }
  );

  it('accepts every signature the previous implementation accepted', () => {
    const regressions = accepted.filter((v) => verifyBip322Signature(v.address, v.message, v.signature) !== true);
    expect(regressions.map((v) => v.name)).toEqual([]);
  });

  it('rejects every signature the previous implementation rejected', () => {
    const forgeries = rejected.filter((v) => verifyBip322Signature(v.address, v.message, v.signature) !== false);
    expect(forgeries.map((v) => v.name)).toEqual([]);
  });

  it('never throws, whatever the input', () => {
    for (const v of vectors) {
      expect(() => verifyBip322Signature(v.address, v.message, v.signature)).not.toThrow();
    }
  });
});

describe('BIP-322 official specification vectors', () => {
  // The two vectors published in BIP-322 itself, independent of our signer.
  const spec = vectors.filter((v) => v.name.startsWith('BIP-322 spec:'));

  it('includes the specification vectors', () => {
    expect(spec).toHaveLength(2);
  });

  it.each(spec.map((v) => [v.name, v] as const))('%s verifies', (_name, v) => {
    expect(v.expected).toBe(true);
    expect(verifyBip322Signature(v.address, v.message, v.signature)).toBe(true);
  });
});
