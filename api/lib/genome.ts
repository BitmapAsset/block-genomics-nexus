/**
 * Block Genomics — Genome Generation Service
 *
 * Deterministic genome fingerprinting from Bitcoin block data.
 * The algorithm mirrors the PoC in `verify/app.js` exactly:
 *
 *   genome = SHA-256(JSON.stringify(genomeData))
 *
 * where `genomeData` is a structured representation of block header
 * fields plus transaction fingerprints.
 *
 * @module genome
 */

import { createHash } from "crypto";
import type { MempoolBlock, MempoolTransaction } from "./blockchain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Compact transaction fingerprint stored inside the genome payload. */
export interface TxFingerprint {
  id: string;           // first 16 chars of txid
  ins: number;          // input count
  outs: number;         // output count
  fee: number;          // fee in sats
  size: number;         // tx size bytes
  outputTypes: string;  // comma-joined scriptpubkey_type values
  totalValue: number;   // sum of output values (sats)
}

/** Full genome data object whose JSON serialization is hashed. */
export interface GenomeData {
  version: number;
  height: number;
  hash: string;
  merkleRoot: string;
  previousHash: string;
  timestamp: number;
  nonce: number;
  bits: number;
  difficulty: number;
  txCount: number;
  size: number;
  weight: number;
  txFingerprints: TxFingerprint[];
}

/** Visual / categorical traits extracted from a genome. */
export interface GenomeTraits {
  /** Primary colour as a 6-char hex string (no `#`). */
  primaryColor: string;
  /** Secondary colour. */
  secondaryColor: string;
  /** Accent colour. */
  accentColor: string;
  /** Background colour. */
  backgroundColor: string;
  /** Visual pattern family. */
  pattern: "helix" | "grid" | "spiral" | "wave" | "fractal" | "crystalline";
  /** Dominant ATCG base in the DNA sequence. */
  dominantBase: "A" | "T" | "G" | "C";
  /** Rarity band derived from genome entropy. */
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
  /** Era derived from block height. */
  era: string;
  /** Notable characteristics of the block. */
  notable: string[];
}

/** Complete genome result returned to callers. */
export interface GenomeResult {
  /** 64-char hex genome hash. */
  genome: string;
  /** Raw data object (for transparency / re-verification). */
  genomeData: GenomeData;
  /** ATCG DNA sequence. */
  dnaSequence: string;
  /** Decoded visual traits. */
  traits: GenomeTraits;
  /** Trust-score components (block-level, pre-ownership). */
  trustComponents: TrustComponents;
  /** Block analysis summary. */
  analysis: BlockAnalysis;
}

/** Trust score breakdown — matches PoC `calculateTrustScore`. */
export interface TrustComponents {
  total: number;
  age: { score: number; max: number; years: string };
  richness: { score: number; max: number; txCount: number; size: number };
  security: { score: number; max: number; difficulty: number };
  ownership: { score: number; max: number };
  history: { score: number; max: number };
}

/** Block analysis summary. */
export interface BlockAnalysis {
  typeCounts: Record<string, number>;
  totalOutputs: number;
  totalValue: number;
  totalFees: number;
  sampledTxCount: number;
  notable: string[];
  hasTaproot: boolean;
  hasOpReturn: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * SHA-256 of a UTF-8 string, returned as 64-char lowercase hex.
 *
 * Uses Node's `crypto` module (deterministic, no async needed).
 */
function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic genome hash from block data.
 *
 * The algorithm:
 * 1. Build `GenomeData` from the block header + first N transactions.
 * 2. `genome = SHA-256(JSON.stringify(genomeData))`.
 *
 * This matches the PoC in `verify/app.js` **exactly** (same field names,
 * same ordering because JS `JSON.stringify` is insertion-order-stable).
 *
 * @param block        - Block header from mempool.space.
 * @param transactions - Array of transactions (first ≤ 200).
 * @returns The 64-char hex genome hash and supporting data.
 */
export function generateGenome(
  block: MempoolBlock,
  transactions: MempoolTransaction[],
): GenomeResult {
  const genomeData: GenomeData = {
    version: 1,
    height: block.height,
    hash: block.id,
    merkleRoot: block.merkle_root,
    previousHash: block.previousblockhash,
    timestamp: block.timestamp,
    nonce: block.nonce,
    bits: block.bits,
    difficulty: block.difficulty,
    txCount: block.tx_count,
    size: block.size,
    weight: block.weight,
    txFingerprints: transactions.map((tx) => ({
      id: tx.txid.slice(0, 16),
      ins: tx.vin.length,
      outs: tx.vout.length,
      fee: tx.fee || 0,
      size: tx.size || 0,
      outputTypes: tx.vout.map((o) => o.scriptpubkey_type).join(","),
      totalValue: tx.vout.reduce((s, o) => s + o.value, 0),
    })),
  };

  const genome = sha256(JSON.stringify(genomeData));
  const dnaSequence = generateDNASequence(block, transactions);
  const traits = extractTraits(genome, block, dnaSequence);
  const trustComponents = calculateTrustScore(block, transactions);
  const analysis = analyzeBlock(block, transactions);

  return {
    genome,
    genomeData,
    dnaSequence,
    traits,
    trustComponents,
    analysis,
  };
}

/**
 * Generate the ATCG DNA sequence from block hash, merkle root, and transactions.
 *
 * Algorithm (matches PoC):
 * - Walk every hex char in `blockHash + merkleRoot`, map to {A,T,G,C} via `val % 4`.
 * - Then for every transaction append 3 bases: `fee%4`, `vin.length%4`, `vout.length%4`.
 *
 * @param block - Block header.
 * @param txs   - Transactions.
 * @returns DNA string consisting only of A, T, G, C.
 */
export function generateDNASequence(
  block: MempoolBlock,
  txs: MempoolTransaction[],
): string {
  const bases: readonly string[] = ["A", "T", "G", "C"];
  const fullData = block.id + block.merkle_root;
  let sequence = "";

  for (let i = 0; i < fullData.length; i++) {
    const val = parseInt(fullData[i], 16);
    if (!isNaN(val)) {
      sequence += bases[val % 4];
    }
  }

  for (const tx of txs) {
    const fee = tx.fee || 0;
    sequence += bases[fee % 4];
    sequence += bases[tx.vin.length % 4];
    sequence += bases[tx.vout.length % 4];
  }

  return sequence;
}

/**
 * Extract visual traits from the genome hex + block metadata.
 *
 * Colours are derived from genome hex slices so they're deterministic.
 * Pattern and rarity are derived from statistical properties.
 *
 * @param genome      - 64-char hex genome hash.
 * @param block       - Block header.
 * @param dnaSequence - DNA string.
 * @returns Decoded trait object.
 */
export function extractTraits(
  genome: string,
  block: MempoolBlock,
  dnaSequence: string,
): GenomeTraits {
  // Colours: pull 6-char slices from genome
  const primaryColor = genome.slice(0, 6);
  const secondaryColor = genome.slice(6, 12);
  const accentColor = genome.slice(12, 18);
  const backgroundColor = genome.slice(18, 24);

  // Pattern: determined by genome byte at position 24-25
  const patternByte = parseInt(genome.slice(24, 26), 16);
  const patterns: GenomeTraits["pattern"][] = [
    "helix",
    "grid",
    "spiral",
    "wave",
    "fractal",
    "crystalline",
  ];
  const pattern = patterns[patternByte % patterns.length];

  // Dominant base
  const baseCounts: Record<string, number> = { A: 0, T: 0, G: 0, C: 0 };
  for (const ch of dnaSequence) {
    if (ch in baseCounts) baseCounts[ch]++;
  }
  const dominantBase = (
    Object.entries(baseCounts).sort((a, b) => b[1] - a[1])[0][0]
  ) as GenomeTraits["dominantBase"];

  // Rarity — based on genome "entropy" (unique hex chars in first 32 chars)
  const uniqueChars = new Set(genome.slice(0, 32)).size;
  let rarity: GenomeTraits["rarity"];
  if (block.height === 0) rarity = "mythic";
  else if (block.height % 210_000 === 0) rarity = "legendary";
  else if (uniqueChars >= 15) rarity = "epic";
  else if (uniqueChars >= 13) rarity = "rare";
  else if (uniqueChars >= 10) rarity = "uncommon";
  else rarity = "common";

  // Era
  const eraIndex = Math.floor(block.height / 210_000);
  const eraNames = [
    "Genesis",
    "Halving 1",
    "Halving 2",
    "Halving 3",
    "Halving 4",
    "Halving 5",
  ];
  const era = eraNames[eraIndex] ?? `Era ${eraIndex}`;

  // Notable
  const notable: string[] = [];
  if (block.height === 0) notable.push("Genesis Block");
  if (block.height === 170) notable.push("First Bitcoin Transaction");
  if (block.height % 210_000 === 0 && block.height > 0) notable.push("Halving Block");
  if (block.height === 709_632) notable.push("Taproot Activation");
  if (block.height === 767_430) notable.push("Ordinals Protocol Birth");
  if (block.tx_count > 3000) notable.push("High Transaction Count");
  if (block.size > 3_000_000) notable.push("Near-Maximum Block Size");

  return {
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    pattern,
    dominantBase,
    rarity,
    era,
    notable,
  };
}

/**
 * Calculate trust score components for a block (pre-ownership baseline).
 *
 * Mirrors the PoC `calculateTrustScore` exactly.
 *
 * @param block - Block header.
 * @param txs   - Transaction array.
 * @returns Trust component breakdown (total 0–100).
 */
export function calculateTrustScore(
  block: MempoolBlock,
  txs: MempoolTransaction[],
): TrustComponents {
  const now = Date.now() / 1_000;
  const years = (now - block.timestamp) / (365.25 * 24 * 3_600);

  const ageFactor = Math.min(years / 10, 1) * 25;
  const txDensity = Math.min(block.tx_count / 4_000, 1);
  const sizeDensity = Math.min(block.size / 4_000_000, 1);
  const richnessFactor = ((txDensity + sizeDensity) / 2) * 25;
  const diffFactor = Math.min(block.difficulty / 100e12, 1) * 20;
  const ownershipFactor = 20; // full score for verified owner
  const historyFactor = 10;   // default for new registration

  const total = Math.min(
    Math.round(ageFactor + richnessFactor + diffFactor + ownershipFactor + historyFactor),
    100,
  );

  // Silence unused-var lint — txs is structurally required for API compat
  void txs;

  return {
    total,
    age: { score: Math.round(ageFactor), max: 25, years: years.toFixed(1) },
    richness: {
      score: Math.round(richnessFactor),
      max: 25,
      txCount: block.tx_count,
      size: block.size,
    },
    security: { score: Math.round(diffFactor), max: 20, difficulty: block.difficulty },
    ownership: { score: ownershipFactor, max: 20 },
    history: { score: historyFactor, max: 10 },
  };
}

/**
 * Produce a summary analysis of a block's transaction mix.
 *
 * Mirrors the PoC `analyzeBlock`.
 *
 * @param block - Block header.
 * @param txs   - Transaction array.
 * @returns Analysis object.
 */
export function analyzeBlock(
  block: MempoolBlock,
  txs: MempoolTransaction[],
): BlockAnalysis {
  const typeCounts: Record<string, number> = {};
  let totalOutputs = 0;
  let totalValue = 0;
  let totalFees = 0;

  for (const tx of txs) {
    totalFees += tx.fee || 0;
    for (const o of tx.vout) {
      const t = o.scriptpubkey_type || "unknown";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      totalOutputs++;
      totalValue += o.value;
    }
  }

  const notable: string[] = [];
  if (block.height === 0) notable.push("Genesis Block");
  if (block.height === 170) notable.push("First Bitcoin Transaction");
  if (block.height % 210_000 === 0 && block.height > 0) notable.push("Halving Block");
  if (block.height === 709_632) notable.push("Taproot Activation");
  if (block.height === 767_430) notable.push("Ordinals Protocol Birth");
  if (block.tx_count > 3_000) notable.push("High Transaction Count");
  if (block.size > 3_000_000) notable.push("Near-Maximum Block Size");

  const hasTaproot = (typeCounts["v1_p2tr"] ?? 0) > 0;
  const hasOpReturn = (typeCounts["op_return"] ?? 0) > 0;
  if (hasTaproot) notable.push("Contains Taproot Transactions");
  if (hasOpReturn) notable.push("Contains OP_RETURN Data");

  return {
    typeCounts,
    totalOutputs,
    totalValue,
    totalFees,
    sampledTxCount: txs.length,
    notable,
    hasTaproot,
    hasOpReturn,
  };
}
