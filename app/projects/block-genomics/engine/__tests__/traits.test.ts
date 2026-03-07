/**
 * Trait Detection — Tests
 *
 * Tests known blocks against expected traits and verifies
 * the mathematical helper functions.
 */

import { describe, it, expect } from 'vitest';
import { detectTraits, _testHelpers } from '../traits';
import type { BlockData } from '../types';

const { isPalindrome, isFibonacci, isPrime, isRoundNumber, isPatoshiBlock } = _testHelpers;

// ────────────────────────────────────────────
// Minimal block fixture factory
// ────────────────────────────────────────────

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: '0000000000000000000000000000000000000000000000000000000000000000',
    height: 0,
    version: 1,
    timestamp: 1231006505,
    nonce: 0,
    bits: 486604799,
    difficulty: 1,
    merkle_root: '0000000000000000000000000000000000000000000000000000000000000000',
    tx_count: 100,
    size: 500000,
    weight: 2000000,
    ...overrides,
  };
}

// ────────────────────────────────────────────
// Mathematical helpers
// ────────────────────────────────────────────

describe('Mathematical helpers', () => {
  describe('isPalindrome', () => {
    it('detects palindromes', () => {
      expect(isPalindrome(0)).toBe(true);
      expect(isPalindrome(1)).toBe(true);
      expect(isPalindrome(11)).toBe(true);
      expect(isPalindrome(121)).toBe(true);
      expect(isPalindrome(12321)).toBe(true);
      expect(isPalindrome(123321)).toBe(true);
    });

    it('rejects non-palindromes', () => {
      expect(isPalindrome(12)).toBe(false);
      expect(isPalindrome(123)).toBe(false);
      expect(isPalindrome(12345)).toBe(false);
    });
  });

  describe('isFibonacci', () => {
    it('detects Fibonacci numbers', () => {
      const fibs = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765];
      for (const f of fibs) {
        expect(isFibonacci(f)).toBe(true);
      }
    });

    it('rejects non-Fibonacci numbers', () => {
      expect(isFibonacci(4)).toBe(false);
      expect(isFibonacci(6)).toBe(false);
      expect(isFibonacci(7)).toBe(false);
      expect(isFibonacci(10)).toBe(false);
      expect(isFibonacci(100)).toBe(false);
    });
  });

  describe('isPrime', () => {
    it('detects primes', () => {
      const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 97, 101, 839999];
      for (const p of primes) {
        expect(isPrime(p)).toBe(true);
      }
    });

    it('rejects non-primes', () => {
      expect(isPrime(0)).toBe(false);
      expect(isPrime(1)).toBe(false);
      expect(isPrime(4)).toBe(false);
      expect(isPrime(6)).toBe(false);
      expect(isPrime(100)).toBe(false);
      expect(isPrime(840000)).toBe(false);
    });
  });

  describe('isRoundNumber', () => {
    it('detects round numbers', () => {
      expect(isRoundNumber(100000)).toBe(true);
      expect(isRoundNumber(200000)).toBe(true);
      expect(isRoundNumber(800000)).toBe(true);
    });

    it('rejects non-round numbers', () => {
      expect(isRoundNumber(0)).toBe(false);
      expect(isRoundNumber(1)).toBe(false);
      expect(isRoundNumber(99999)).toBe(false);
      expect(isRoundNumber(100001)).toBe(false);
    });
  });
});

// ────────────────────────────────────────────
// Trait detection for known blocks
// ────────────────────────────────────────────

describe('Trait detection', () => {
  it('detects mythic + epic + palindrome + fibonacci for Genesis (block 0)', () => {
    const result = detectTraits(0, makeBlock({ height: 0 }));
    expect(result.flags.is_mythic).toBe(true);
    expect(result.flags.is_epic).toBe(true);       // 0 is a halving height
    expect(result.flags.is_palindrome).toBe(true);  // "0" is palindrome
    expect(result.flags.is_fibonacci).toBe(true);   // 0 is fibonacci
  });

  it('detects halving epoch for block 840000', () => {
    const result = detectTraits(840_000, makeBlock({ height: 840_000 }));
    expect(result.flags.is_epic).toBe(true);
    // 840000 % 100000 = 40000, so NOT a round number
    expect(result.flags.is_round_number).toBeUndefined();
    // 840000 % 2016 = 1344, so NOT a difficulty adjustment block
    expect(result.flags.is_rare).toBeUndefined();
  });

  it('detects round number for block 800000', () => {
    const result = detectTraits(800_000, makeBlock({ height: 800_000 }));
    expect(result.flags.is_round_number).toBe(true);
  });

  it('detects first transaction for block 170', () => {
    const result = detectTraits(170, makeBlock({ height: 170 }));
    expect(result.flags.is_first_transaction).toBe(true);
  });

  it('detects pizza transaction for block 57043', () => {
    const result = detectTraits(57_043, makeBlock({ height: 57_043 }));
    expect(result.flags.is_pizza_transaction).toBe(true);
  });

  it('detects SegWit activation for block 481824', () => {
    const result = detectTraits(481_824, makeBlock({ height: 481_824 }));
    expect(result.flags.is_segwit_activation).toBe(true);
  });

  it('detects Taproot activation for block 709632', () => {
    const result = detectTraits(709_632, makeBlock({ height: 709_632 }));
    expect(result.flags.is_taproot_activation).toBe(true);
  });

  it('detects Ordinals birth for block 767430', () => {
    const result = detectTraits(767_430, makeBlock({ height: 767_430 }));
    expect(result.flags.is_ordinals_birth).toBe(true);
  });

  it('detects 21e8 in block hash', () => {
    const block = makeBlock({
      id: '000000000000000000021e8d0afab5a8a9c0a1b3c4d5e6f7890123456789abcd',
    });
    const result = detectTraits(500_000, block);
    expect(result.flags.is_21e8).toBe(true);
  });

  it('detects empty blocks (1 tx)', () => {
    const result = detectTraits(100, makeBlock({ tx_count: 1 }));
    expect(result.flags.is_empty).toBe(true);
  });

  it('detects full blocks (≥ 99% weight)', () => {
    const result = detectTraits(100, makeBlock({ weight: 3_970_000 }));
    expect(result.flags.is_full).toBe(true);
  });

  it('detects high fee blocks', () => {
    const result = detectTraits(100, makeBlock({
      extras: { totalFees: 200_000_000 }, // 2 BTC
    }));
    expect(result.flags.is_high_fee).toBe(true);
  });

  it('detects palindrome blocks', () => {
    const result = detectTraits(12321, makeBlock({ height: 12321 }));
    expect(result.flags.is_palindrome).toBe(true);
  });

  it('detects prime blocks', () => {
    const result = detectTraits(7, makeBlock({ height: 7 }));
    expect(result.flags.is_prime_number).toBe(true);
  });

  it('detects difficulty adjustment blocks', () => {
    const result = detectTraits(2016, makeBlock({ height: 2016 }));
    expect(result.flags.is_rare).toBe(true);
  });

  it('returns empty traits for a boring block', () => {
    const result = detectTraits(500_001, makeBlock({ height: 500_001 }));
    // 500001 is not palindrome, not fib, not prime, not round, no milestone
    expect(result.traits.length).toBeLessThan(3);
  });
});
