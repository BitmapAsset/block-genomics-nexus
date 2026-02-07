/**
 * Block Genomics — Deterministic Genome Engine
 *
 * Generates a unique, immutable "genome" for every Bitcoin block
 * using ONLY block‑header data.  The same block will ALWAYS produce
 * the same genome regardless of when or where the code runs.
 *
 * Algorithm (v1):
 *   1. Build a GenomeInputs object from immutable block fields.
 *   2. JSON‑stringify with keys sorted alphabetically.
 *   3. SHA‑256 hash the resulting UTF‑8 string.
 *   4. The 64‑char hex digest IS the genome.
 *
 * @module genome
 */

import type { BlockData, Color, GenomeInputs, GenomeResult } from './types';

/** Current algorithm version — bump when the hash recipe changes. */
export const GENOME_VERSION = 1;

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/**
 * SHA‑256 using the Web Crypto API (SubtleCrypto).
 * Works in browsers, Deno, Cloudflare Workers, and Node ≥ 15.
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // globalThis.crypto works in browsers + modern runtimes
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build the canonical GenomeInputs from raw block data.
 * Only immutable, header‑level fields are included.
 */
export function buildGenomeInputs(block: BlockData): GenomeInputs {
  return {
    version: GENOME_VERSION,
    bits: block.bits,
    blockHash: block.id,
    difficulty: block.difficulty,
    merkleRoot: block.merkle_root,
    nonce: block.nonce,
    size: block.size,
    timestamp: block.timestamp,
    txCount: block.tx_count,
    weight: block.weight,
  };
}

/**
 * Canonical JSON serialisation: keys are sorted alphabetically
 * so the output is identical across JS engines and object‑key order.
 */
export function canonicalSerialise(inputs: GenomeInputs): string {
  const sortedKeys = Object.keys(inputs).sort() as (keyof GenomeInputs)[];
  const sorted: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sorted[key] = inputs[key];
  }
  return JSON.stringify(sorted);
}

// ────────────────────────────────────────────
// Core API
// ────────────────────────────────────────────

/**
 * Generate a deterministic 64‑char hex genome from a Bitcoin block.
 *
 * @param blockData - Raw block data (header fields required).
 * @returns The full GenomeResult including genome hash, DNA, and colours.
 *
 * @example
 * ```ts
 * const result = await generateGenome(block840000);
 * console.log(result.genome); // "a1b2c3…" (64 hex chars)
 * ```
 */
export async function generateGenome(blockData: BlockData): Promise<GenomeResult> {
  const inputs = buildGenomeInputs(blockData);
  const payload = canonicalSerialise(inputs);
  const genome = await sha256(payload);

  return {
    genome,
    dna: generateDNASequence(genome),
    colors: genomeToColors(genome),
    version: GENOME_VERSION,
  };
}

/**
 * Convert a 64‑char hex genome into a 128‑character ATGC DNA sequence.
 *
 * Each hex character (4 bits) maps to 2 DNA bases:
 *   bits 00 → A, 01 → T, 10 → G, 11 → C
 *
 * 64 hex chars × 4 bits = 256 bits → 128 bases.
 *
 * @param genome - 64‑char lowercase hex string.
 * @returns 128‑character string of A, T, G, C.
 */
export function generateDNASequence(genome: string): string {
  const BASE_MAP: Record<string, string> = {
    '00': 'A',
    '01': 'T',
    '10': 'G',
    '11': 'C',
  };

  let dna = '';
  for (const hexChar of genome) {
    const nibble = parseInt(hexChar, 16);
    const bits = nibble.toString(2).padStart(4, '0');
    // Split 4 bits into two 2‑bit pairs
    dna += BASE_MAP[bits.slice(0, 2)]!;
    dna += BASE_MAP[bits.slice(2, 4)]!;
  }
  return dna;
}

/**
 * Derive 64 RGBA colours from the genome hash.
 *
 * Strategy: cycle through the 32 bytes (64 hex chars).
 * Each colour uses the byte value to pick Hue (0‑360), with
 * Saturation and Lightness derived from position for variety.
 *
 * Additionally, every pair of adjacent bytes generates an extra
 * colour via blending, but we cap at 64 colours total.
 *
 * @param genome - 64‑char lowercase hex string.
 * @returns Array of 64 Color objects.
 */
export function genomeToColors(genome: string): Color[] {
  const colors: Color[] = [];
  const bytes: number[] = [];

  // Parse hex string into 32 bytes
  for (let i = 0; i < 64; i += 2) {
    bytes.push(parseInt(genome.slice(i, i + 2), 16));
  }

  // Generate 64 colours from 32 bytes
  for (let i = 0; i < 64; i++) {
    const byteIdx = i % 32;
    const byteVal = bytes[byteIdx]!;

    // Use position to vary saturation and lightness
    const hue = (byteVal / 255) * 360;
    const saturation = 55 + (((i * 7) % 32) / 32) * 40;    // 55‑95 %
    const lightness = 35 + (((i * 13) % 32) / 32) * 35;     // 35‑70 %

    const { r, g, b } = hslToRgb(hue, saturation, lightness);
    const a = 255;

    colors.push({
      r,
      g,
      b,
      a,
      hex: rgbToHex(r, g, b),
    });
  }

  return colors;
}

// ────────────────────────────────────────────
// Colour helpers
// ────────────────────────────────────────────

/** Convert HSL (h 0‑360, s 0‑100, l 0‑100) to RGB 0‑255. */
function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r1 = 0,
    g1 = 0,
    b1 = 0;

  if (h < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (h < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (h < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (h < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (h < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** RGB 0‑255 → CSS hex string "#rrggbb". */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
