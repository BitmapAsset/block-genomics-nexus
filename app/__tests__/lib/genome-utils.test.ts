/**
 * Tests for src/lib/genome-utils.ts
 * Covers: formatting, genome generation, traits, DNA conversion, trust scoring
 */

import {
  formatBytes,
  formatWeight,
  parseGenomeTraits,
  truncateHash,
  formatNumber,
  hexPairToColor,
  dnaBaseColor,
  dnaBaseHex,
  genomeToDNA,
  genomeToColors,
  generateGenome,
  genomeToVisual,
  createChallenge,
  calculateTrustScore,
} from '@/lib/genome-utils';

import { MOCK_BLOCK_HASH, MOCK_BLOCK_HEIGHT, MOCK_GENOME_64, ZERO_GENOME, MAX_GENOME } from '../fixtures';

describe('genome-utils', () => {
  describe('formatBytes()', () => {
    it('formats 0 bytes', () => expect(formatBytes(0)).toBe('0 B'));
    it('formats bytes', () => expect(formatBytes(500)).toBe('500 B'));
    it('formats kilobytes', () => expect(formatBytes(1024)).toBe('1.0 KB'));
    it('formats megabytes', () => expect(formatBytes(1048576)).toBe('1.0 MB'));
    it('formats gigabytes', () => expect(formatBytes(1073741824)).toBe('1.0 GB'));
    it('formats fractional KB', () => expect(formatBytes(1536)).toBe('1.5 KB'));
  });

  describe('formatWeight()', () => {
    it('formats small weight', () => expect(formatWeight(500)).toBe('500 WU'));
    it('formats kWU', () => expect(formatWeight(1500)).toBe('1.5 kWU'));
    it('formats MWU', () => expect(formatWeight(4000000)).toBe('4.00 MWU'));
    it('handles boundary at 1000', () => expect(formatWeight(1000)).toBe('1.0 kWU'));
    it('handles boundary at 1000000', () => expect(formatWeight(1000000)).toBe('1.00 MWU'));
  });

  describe('parseGenomeTraits()', () => {
    it('returns 8 traits from 64-char genome', () => {
      const traits = parseGenomeTraits(MOCK_GENOME_64);
      expect(Object.keys(traits)).toHaveLength(8);
      expect(traits).toHaveProperty('Entropy');
      expect(traits).toHaveProperty('Density');
      expect(traits).toHaveProperty('Symmetry');
      expect(traits).toHaveProperty('Complexity');
      expect(traits).toHaveProperty('Resonance');
      expect(traits).toHaveProperty('Stability');
      expect(traits).toHaveProperty('Volatility');
      expect(traits).toHaveProperty('Harmony');
    });

    it('all traits are percentages', () => {
      const traits = parseGenomeTraits(MOCK_GENOME_64);
      for (const val of Object.values(traits)) {
        expect(val).toMatch(/^\d+%$/);
      }
    });

    it('zero genome produces 0% traits', () => {
      const traits = parseGenomeTraits(ZERO_GENOME);
      for (const val of Object.values(traits)) {
        expect(val).toBe('0%');
      }
    });

    it('max genome produces 100% traits', () => {
      const traits = parseGenomeTraits(MAX_GENOME);
      for (const val of Object.values(traits)) {
        expect(val).toBe('100%');
      }
    });
  });

  describe('truncateHash()', () => {
    it('truncates long hash', () => {
      const hash = 'abcdef1234567890abcdef1234567890';
      expect(truncateHash(hash)).toBe('abcdef12...34567890');
    });

    it('returns short hash unchanged', () => {
      expect(truncateHash('abcdef')).toBe('abcdef');
    });

    it('custom length', () => {
      const hash = 'abcdefghijklmnopqrstuvwxyz';
      expect(truncateHash(hash, 4)).toBe('abcd...wxyz');
    });
  });

  describe('hexPairToColor()', () => {
    it('converts 00 to hsl(0, 80%, 55%)', () => {
      expect(hexPairToColor('00')).toBe('hsl(0, 80%, 55%)');
    });

    it('converts ff to hsl(360, 80%, 55%)', () => {
      expect(hexPairToColor('ff')).toBe('hsl(360, 80%, 55%)');
    });

    it('converts 80 to approximately hsl(~180)', () => {
      const result = hexPairToColor('80');
      expect(result).toMatch(/^hsl\(\d+\.?\d*, 80%, 55%\)$/);
    });

    it('emits an integer hue for every byte', () => {
      // satori renders the OG share cards and drops a colour to black if the
      // hue has a fractional part, so this holds for all 256 inputs.
      for (let byte = 0; byte < 256; byte++) {
        const pair = byte.toString(16).padStart(2, '0');
        expect(hexPairToColor(pair)).toMatch(/^hsl\(\d+, 80%, 55%\)$/);
      }
    });
  });

  describe('dnaBaseColor()', () => {
    it('A = green', () => expect(dnaBaseColor('A')).toBe('text-green-400'));
    it('T = red', () => expect(dnaBaseColor('T')).toBe('text-red-400'));
    it('C = blue', () => expect(dnaBaseColor('C')).toBe('text-blue-400'));
    it('G = yellow', () => expect(dnaBaseColor('G')).toBe('text-yellow-400'));
    it('unknown = gray', () => expect(dnaBaseColor('X')).toBe('text-gray-400'));
  });

  describe('dnaBaseHex()', () => {
    it('A = #4ade80', () => expect(dnaBaseHex('A')).toBe('#4ade80'));
    it('T = #f87171', () => expect(dnaBaseHex('T')).toBe('#f87171'));
    it('C = #60a5fa', () => expect(dnaBaseHex('C')).toBe('#60a5fa'));
    it('G = #facc15', () => expect(dnaBaseHex('G')).toBe('#facc15'));
    it('unknown = #888', () => expect(dnaBaseHex('X')).toBe('#888'));
  });

  describe('genomeToDNA()', () => {
    it('converts hex to DNA bases', () => {
      const dna = genomeToDNA('0123456789abcdef');
      expect(dna).toHaveLength(16);
      // Each char maps to A/T/C/G based on hex value % 4
      for (const char of dna) {
        expect(['A', 'T', 'C', 'G']).toContain(char);
      }
    });

    it('is deterministic', () => {
      expect(genomeToDNA(MOCK_GENOME_64)).toBe(genomeToDNA(MOCK_GENOME_64));
    });

    it('0 maps to A (0 % 4 = 0)', () => {
      expect(genomeToDNA('0')[0]).toBe('A');
    });

    it('1 maps to T (1 % 4 = 1)', () => {
      expect(genomeToDNA('1')[0]).toBe('T');
    });
  });

  describe('genomeToColors()', () => {
    it('produces 32 colors from 64-char genome', () => {
      const colors = genomeToColors(MOCK_GENOME_64);
      expect(colors).toHaveLength(32);
    });

    it('each color has hex property', () => {
      const colors = genomeToColors(MOCK_GENOME_64);
      for (const c of colors) {
        expect(c).toHaveProperty('hex');
        expect(c.hex).toMatch(/^hsl\(/);
      }
    });
  });

  describe('generateGenome()', () => {
    it('produces deterministic output from block hash', () => {
      const g1 = generateGenome(MOCK_BLOCK_HASH);
      const g2 = generateGenome(MOCK_BLOCK_HASH);
      expect(g1).toEqual(g2);
    });

    it('returns sequence, integrity, complexity, signature', () => {
      const genome = generateGenome(MOCK_BLOCK_HASH);
      expect(genome.sequence).toHaveLength(64);
      expect(genome.integrity).toBeGreaterThanOrEqual(0);
      expect(genome.integrity).toBeLessThanOrEqual(1);
      expect(genome.complexity).toBeGreaterThanOrEqual(0);
      expect(genome.complexity).toBeLessThanOrEqual(1);
      expect(genome.signature).toHaveLength(64);
    });

    it('different hashes produce different genomes', () => {
      const g1 = generateGenome(MOCK_BLOCK_HASH);
      const g2 = generateGenome('0000000000000000000000000000000000000000000000000000000000000001');
      expect(g1.sequence).not.toBe(g2.sequence);
    });

    it('sequence is valid hex', () => {
      const genome = generateGenome(MOCK_BLOCK_HASH);
      expect(genome.sequence).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('genomeToVisual()', () => {
    it('produces 16 segments from 64-char sequence', () => {
      const genome = generateGenome(MOCK_BLOCK_HASH);
      const segments = genomeToVisual(genome.sequence);
      expect(segments).toHaveLength(16);
    });

    it('each segment has required properties', () => {
      const genome = generateGenome(MOCK_BLOCK_HASH);
      const segments = genomeToVisual(genome.sequence);
      for (const seg of segments) {
        expect(seg).toHaveProperty('position');
        expect(seg).toHaveProperty('nucleotide');
        expect(seg).toHaveProperty('color');
        expect(seg).toHaveProperty('strength');
        expect(seg).toHaveProperty('pair');
        expect(['A', 'T', 'C', 'G']).toContain(seg.nucleotide);
        expect(['A', 'T', 'C', 'G']).toContain(seg.pair);
        expect(seg.strength).toBeGreaterThanOrEqual(0);
        expect(seg.strength).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('createChallenge()', () => {
    it('returns nonce, timestamp, and message', () => {
      const challenge = createChallenge(MOCK_BLOCK_HEIGHT, MOCK_BLOCK_HASH);
      expect(challenge.nonce).toHaveLength(32); // 16 bytes hex
      expect(challenge.timestamp).toBeGreaterThan(0);
      expect(challenge.message).toContain('Block Genomics Verification');
      expect(challenge.message).toContain(String(MOCK_BLOCK_HEIGHT));
      expect(challenge.message).toContain(MOCK_BLOCK_HASH);
      expect(challenge.message).toContain(challenge.nonce);
    });

    it('generates unique nonces', () => {
      const c1 = createChallenge(MOCK_BLOCK_HEIGHT, MOCK_BLOCK_HASH);
      const c2 = createChallenge(MOCK_BLOCK_HEIGHT, MOCK_BLOCK_HASH);
      expect(c1.nonce).not.toBe(c2.nonce);
    });
  });

  describe('calculateTrustScore()', () => {
    it('returns 0 for no verifications', () => {
      expect(calculateTrustScore(0, 0, 0)).toBe(0);
    });

    it('returns 100 for perfect history with volume', () => {
      expect(calculateTrustScore(10, 10, 0)).toBe(100);
    });

    it('returns lower score for partial success', () => {
      const score = calculateTrustScore(10, 5, 5);
      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThan(0);
    });

    it('volume bonus caps at 20', () => {
      const score10 = calculateTrustScore(10, 10, 0);
      const score100 = calculateTrustScore(100, 100, 0);
      expect(score10).toBe(100);
      expect(score100).toBe(100);
    });

    it('low volume reduces score', () => {
      const lowVol = calculateTrustScore(1, 1, 0);
      const highVol = calculateTrustScore(10, 10, 0);
      expect(lowVol).toBeLessThan(highVol);
    });

    it('all failures gives only volume bonus', () => {
      const score = calculateTrustScore(10, 0, 10);
      expect(score).toBe(20); // 0% success * 80 + 20 volume bonus
    });
  });
});
