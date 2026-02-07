/**
 * Genome Engine — Tests
 *
 * Core invariant: **determinism** — the same block data MUST always
 * produce the exact same genome hash, DNA sequence, and colours.
 */

import { describe, it, expect } from 'vitest';
import {
  generateGenome,
  generateDNASequence,
  genomeToColors,
  buildGenomeInputs,
  canonicalSerialise,
} from '../genome';
import type { BlockData } from '../types';

// ────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────

/** Genesis block (block 0). */
const GENESIS_BLOCK: BlockData = {
  id: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
  height: 0,
  version: 1,
  timestamp: 1231006505,
  nonce: 2083236893,
  bits: 486604799,
  difficulty: 1,
  merkle_root: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
  tx_count: 1,
  size: 285,
  weight: 816,
};

/** Block 840000 (4th halving). */
const BLOCK_840000: BlockData = {
  id: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
  height: 840000,
  version: 536870912,
  timestamp: 1713571767,
  nonce: 3932395645,
  bits: 386089497,
  difficulty: 86388558925171.02,
  merkle_root: '031b417c3a1828197c45e2507e09e78b0e8e4c4b6484e2348e248b9a0260e24b',
  tx_count: 3050,
  size: 1647840,
  weight: 3993381,
};

// ────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────

describe('Genome Engine', () => {
  // ── Determinism ──────────────────────────

  describe('determinism', () => {
    it('produces identical genome for the same block data on repeated calls', async () => {
      const r1 = await generateGenome(GENESIS_BLOCK);
      const r2 = await generateGenome(GENESIS_BLOCK);
      const r3 = await generateGenome(GENESIS_BLOCK);

      expect(r1.genome).toBe(r2.genome);
      expect(r2.genome).toBe(r3.genome);
    });

    it('produces identical DNA for the same genome', async () => {
      const r1 = await generateGenome(GENESIS_BLOCK);
      const r2 = await generateGenome(GENESIS_BLOCK);
      expect(r1.dna).toBe(r2.dna);
    });

    it('produces identical colours for the same genome', async () => {
      const r1 = await generateGenome(GENESIS_BLOCK);
      const r2 = await generateGenome(GENESIS_BLOCK);
      expect(r1.colors).toEqual(r2.colors);
    });

    it('produces different genomes for different blocks', async () => {
      const r1 = await generateGenome(GENESIS_BLOCK);
      const r2 = await generateGenome(BLOCK_840000);
      expect(r1.genome).not.toBe(r2.genome);
    });
  });

  // ── Format ──────────────────────────────

  describe('format', () => {
    it('genome is a 64-character lowercase hex string', async () => {
      const { genome } = await generateGenome(GENESIS_BLOCK);
      expect(genome).toMatch(/^[0-9a-f]{64}$/);
    });

    it('DNA is a 128-character ATGC string', async () => {
      const { dna } = await generateGenome(GENESIS_BLOCK);
      expect(dna).toHaveLength(128);
      expect(dna).toMatch(/^[ATGC]+$/);
    });

    it('produces exactly 64 colours', async () => {
      const { colors } = await generateGenome(GENESIS_BLOCK);
      expect(colors).toHaveLength(64);
    });

    it('each colour has valid RGB 0-255 and hex', async () => {
      const { colors } = await generateGenome(BLOCK_840000);
      for (const c of colors) {
        expect(c.r).toBeGreaterThanOrEqual(0);
        expect(c.r).toBeLessThanOrEqual(255);
        expect(c.g).toBeGreaterThanOrEqual(0);
        expect(c.g).toBeLessThanOrEqual(255);
        expect(c.b).toBeGreaterThanOrEqual(0);
        expect(c.b).toBeLessThanOrEqual(255);
        expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it('includes version number', async () => {
      const result = await generateGenome(GENESIS_BLOCK);
      expect(result.version).toBe(1);
    });
  });

  // ── Canonical serialisation ─────────────

  describe('canonicalSerialise', () => {
    it('sorts keys alphabetically', () => {
      const inputs = buildGenomeInputs(GENESIS_BLOCK);
      const json = canonicalSerialise(inputs);
      const parsed = JSON.parse(json);
      const keys = Object.keys(parsed);
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });

    it('is stable across multiple calls', () => {
      const a = canonicalSerialise(buildGenomeInputs(GENESIS_BLOCK));
      const b = canonicalSerialise(buildGenomeInputs(GENESIS_BLOCK));
      expect(a).toBe(b);
    });
  });

  // ── DNA sequence ────────────────────────

  describe('generateDNASequence', () => {
    it('maps hex to valid DNA bases', () => {
      // "00" hex = 0b00000000 → AA
      // "ff" hex = 0b11111111 → CC
      const dna = generateDNASequence('00ff');
      expect(dna).toBe('AAAACC CC'.replace(/ /g, ''));
      // 0x00 → 0000 → AA, 0x00 → AA, 0xff → 1111 → CC, 0xff → CC
      // Actually: "00" = two hex chars: '0' (0000→AA) and '0' (0000→AA) = AAAA
      // "ff" = 'f' (1111→CC) and 'f' (1111→CC) = CCCC
      expect(dna).toBe('AAAACCCC');
    });

    it('produces 2 bases per hex char', () => {
      const dna = generateDNASequence('abcdef0123456789');
      expect(dna).toHaveLength(32); // 16 hex chars × 2
    });
  });

  // ── Colour generation ───────────────────

  describe('genomeToColors', () => {
    it('returns 64 colours from a 64-char hex string', () => {
      const genome = 'a'.repeat(64);
      const colors = genomeToColors(genome);
      expect(colors).toHaveLength(64);
    });
  });
});
