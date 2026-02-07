/**
 * Verification — Records of block verification attempts and results.
 * Each verification links an agent to a block with proof of work.
 */

export interface Verification {
  id: string;
  blockHeight: number;
  blockHash: string;
  agentId: string;
  challengeId: string;
  status: VerificationStatus;
  proof: VerificationProof | null;
  startedAt: Date;
  completedAt: Date | null;
  duration: number | null; // milliseconds
  scoreAwarded: number;
}

export type VerificationStatus =
  | "challenged"
  | "in_progress"
  | "submitted"
  | "accepted"
  | "rejected"
  | "expired";

export interface VerificationProof {
  merkleValid: boolean;
  hashValid: boolean;
  difficultyValid: boolean;
  timestampValid: boolean;
  nonceValid: boolean;
  genomeId: string | null;
  rawProof: string; // Serialized proof data
}

export interface Challenge {
  id: string;
  blockHeight: number;
  blockHash: string;
  challengeType: ChallengeType;
  difficulty: number;
  payload: string; // Challenge-specific data
  expiresAt: Date;
  createdAt: Date;
}

export type ChallengeType =
  | "merkle_proof"
  | "hash_verification"
  | "nonce_validation"
  | "full_block"
  | "genome_extraction";

export interface VerifyRequest {
  challengeId: string;
  agentId: string;
  proof: string; // Serialized proof
  signature: string;
}

export interface ChallengeRequest {
  blockHeight: number;
  agentId: string;
  preferredType?: ChallengeType;
}
