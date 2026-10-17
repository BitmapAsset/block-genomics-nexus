/**
 * Genome DNA for the browser.
 *
 * `deriveGenomeHash` in genome-utils uses node's `crypto`, which the client
 * bundle cannot import. This is the same v1 formula on @noble/hashes, so the
 * genome a wallet sees after verifying matches the one the server records in
 * `BlockProfile.genomeHash` and the one the CLI prints. A parity test pins the
 * two implementations together.
 *
 *   genome = sha256("block-genomics:genome:v1:{height}:{ownerAddress}")
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export const GENOME_V1_PREFIX = 'block-genomics:genome:v1';

/** "0x"-prefixed 64-hex genome for a block in a given owner's hands. */
export function genomeV1(height: number, ownerAddress: string): string {
  return '0x' + bytesToHex(sha256(utf8ToBytes(`${GENOME_V1_PREFIX}:${height}:${ownerAddress}`)));
}

/** The formula as a string, for the "how is this computed" line. */
export function genomeV1Formula(height: number, ownerAddress: string): string {
  return `sha256("${GENOME_V1_PREFIX}:${height}:${ownerAddress}")`;
}

const BASES = ['A', 'T', 'C', 'G'] as const;
export type Base = (typeof BASES)[number];

/** 64 bases, one per hex digit (value mod 4), as in the whitepaper §4. */
export function genomeBases(genome: string): Base[] {
  const hex = genome.replace(/^0x/, '');
  return Array.from(hex, (ch) => BASES[parseInt(ch, 16) % 4]);
}

/** Integer hue per byte (satori and some browsers drop fractional hues). */
export function genomeHues(genome: string): number[] {
  const hex = genome.replace(/^0x/, '');
  const hues: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    hues.push(Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 360));
  }
  return hues;
}

const TRAITS = ['Entropy', 'Density', 'Symmetry', 'Complexity', 'Resonance', 'Stability', 'Volatility', 'Harmony'] as const;

/** Eight deterministic traits, 0–100, one per 32-bit word of the genome. */
export function genomeTraits(genome: string): { name: (typeof TRAITS)[number]; value: number }[] {
  const hex = genome.replace(/^0x/, '');
  return TRAITS.map((name, i) => ({
    name,
    value: Math.round((parseInt(hex.slice(i * 8, i * 8 + 8), 16) / 0xffffffff) * 100),
  }));
}
