/**
 * Block — Represents a Bitcoin block with its verification state
 * within the Block Genomics platform.
 */

export interface Block {
  height: number;
  hash: string;
  previousHash: string;
  merkleRoot: string;
  timestamp: number; // Unix timestamp
  nonce: number;
  difficulty: number;
  txCount: number;
  size: number; // bytes
  weight: number;
  version: number;
  verificationStatus: BlockVerificationStatus;
  genomeId: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

export type BlockVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "disputed"
  | "failed";

export interface BlockSummary {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  verificationStatus: BlockVerificationStatus;
}
