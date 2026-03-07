/**
 * Genome — The cryptographic "DNA" of a Bitcoin block.
 * A genome encodes the verification proof and structural
 * fingerprint of a block, serving as its immutable identity.
 */

export interface Genome {
  id: string;
  blockHeight: number;
  blockHash: string;
  sequence: string; // Encoded genome sequence
  markers: GenomeMarker[];
  integrity: number; // 0–1 integrity score
  complexity: number; // Computational complexity metric
  generatedBy: string; // Agent ID
  generatedAt: Date;
  signature: string; // Cryptographic signature
}

export interface GenomeMarker {
  position: number;
  type: GenomeMarkerType;
  value: string;
  confidence: number; // 0–1
}

export type GenomeMarkerType =
  | "merkle_branch"
  | "nonce_pattern"
  | "difficulty_signature"
  | "tx_fingerprint"
  | "coinbase_marker"
  | "timestamp_proof";

export interface GenomeSummary {
  id: string;
  blockHeight: number;
  integrity: number;
  complexity: number;
  markerCount: number;
}
