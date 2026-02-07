/**
 * Trust Score — Tests
 */

import { describe, it, expect } from 'vitest';
import { calculateTrustScore, TRUST_SCORE_VERSION } from '../trust-score';
import type { BlockData } from '../types';

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
    height: 840_000,
    version: 536870912,
    timestamp: 1713571767,
    nonce: 3932395645,
    bits: 386089497,
    difficulty: 86388558925171.02,
    merkle_root: '031b417c3a1828197c45e2507e09e78b0e8e4c4b6484e2348e248b9a0260e24b',
    tx_count: 3050,
    size: 1647840,
    weight: 3993381,
    ...overrides,
  };
}

const DEFAULT_OPTIONS = {
  tipHeight: 870_000,
  currentDifficulty: 86388558925171.02,
  nowSeconds: 1720000000,
};

describe('Trust Score', () => {
  it('returns a score between 0 and 100', () => {
    const result = calculateTrustScore(makeBlock(), 'owner', 3600, DEFAULT_OPTIONS);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('includes version number', () => {
    const result = calculateTrustScore(makeBlock(), 'owner', 0, DEFAULT_OPTIONS);
    expect(result.version).toBe(TRUST_SCORE_VERSION);
  });

  it('includes grade', () => {
    const result = calculateTrustScore(makeBlock(), 'owner', 0, DEFAULT_OPTIONS);
    expect(result.grade).toMatch(/^[A-F][+-]?$/);
  });

  it('owner tier scores higher than viewer tier', () => {
    const owner = calculateTrustScore(makeBlock(), 'owner', 0, DEFAULT_OPTIONS);
    const viewer = calculateTrustScore(makeBlock(), 'viewer', 0, DEFAULT_OPTIONS);
    expect(owner.score).toBeGreaterThan(viewer.score);
  });

  it('owner tier scores higher than none tier', () => {
    const owner = calculateTrustScore(makeBlock(), 'owner', 0, DEFAULT_OPTIONS);
    const none = calculateTrustScore(makeBlock(), 'none', 0, DEFAULT_OPTIONS);
    expect(owner.score).toBeGreaterThan(none.score);
  });

  it('recently verified scores higher than stale verification', () => {
    const fresh = calculateTrustScore(makeBlock(), 'owner', 0, DEFAULT_OPTIONS);
    const stale = calculateTrustScore(makeBlock(), 'owner', 365 * 24 * 3600, DEFAULT_OPTIONS);
    expect(fresh.score).toBeGreaterThanOrEqual(stale.score);
  });

  it('provides breakdown with all 5 components', () => {
    const result = calculateTrustScore(makeBlock(), 'owner', 0, DEFAULT_OPTIONS);
    expect(result.breakdown).toHaveProperty('confirmations');
    expect(result.breakdown).toHaveProperty('difficulty');
    expect(result.breakdown).toHaveProperty('blockAge');
    expect(result.breakdown).toHaveProperty('ownershipTier');
    expect(result.breakdown).toHaveProperty('verificationAge');
  });

  it('weights sum to 1.0', () => {
    const result = calculateTrustScore(makeBlock(), 'owner', 0, DEFAULT_OPTIONS);
    const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  it('includes ISO timestamp', () => {
    const result = calculateTrustScore(makeBlock(), 'owner', 0, DEFAULT_OPTIONS);
    expect(result.calculatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('more confirmations yield higher score', () => {
    const deep = calculateTrustScore(makeBlock(), 'owner', 0, {
      ...DEFAULT_OPTIONS,
      tipHeight: 900_000,
    });
    const shallow = calculateTrustScore(makeBlock(), 'owner', 0, {
      ...DEFAULT_OPTIONS,
      tipHeight: 840_005,
    });
    expect(deep.score).toBeGreaterThan(shallow.score);
  });
});
