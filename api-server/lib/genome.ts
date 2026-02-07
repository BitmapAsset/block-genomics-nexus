// ============================================================================
// Deterministic Genome Generation
// ============================================================================
// The genome is a SHA-256 hash of canonical block data.
// MUST be deterministic — same block always produces the same genome.
// ============================================================================

import { createHash } from 'node:crypto';
import type { BlockData, GenomeInputs } from '../types.js';

export const GENOME_VERSION = 1;

/**
 * Build the canonical genome input object from block data.
 * Keys are explicitly ordered to guarantee determinism across JSON.stringify.
 */
export function buildGenomeInputs(block: BlockData): GenomeInputs {
  return {
    version: GENOME_VERSION,
    blockHash: block.hash,
    merkleRoot: block.merkleRoot,
    timestamp: block.timestamp,
    nonce: block.nonce,
    bits: block.bits,
    difficulty: block.difficulty,
    txCount: block.txCount,
    size: block.size,
    weight: block.weight,
  };
}

/**
 * Generate a deterministic 64-char hex genome from block data.
 */
export function generateGenome(block: BlockData): string {
  const inputs = buildGenomeInputs(block);
  // Sort keys to ensure deterministic serialization
  const sortedKeys = Object.keys(inputs).sort();
  const canonical = JSON.stringify(inputs, sortedKeys);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Parse a genome hex string into trait segments.
 * The 64-char hex genome is split into 8-char segments, each representing
 * a trait domain. This is for display / downstream consumption.
 */
export function parseGenomeTraits(genome: string): Record<string, string> {
  if (genome.length !== 64) throw new Error('Invalid genome length');
  return {
    structure:   genome.slice(0, 8),
    energy:      genome.slice(8, 16),
    complexity:  genome.slice(16, 24),
    resilience:  genome.slice(24, 32),
    temporal:    genome.slice(32, 40),
    network:     genome.slice(40, 48),
    entropy:     genome.slice(48, 56),
    signature:   genome.slice(56, 64),
  };
}
