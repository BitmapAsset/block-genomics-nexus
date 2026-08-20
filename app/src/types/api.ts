/**
 * API response types for the Block Genomics verification endpoints
 * served from src/app/api/v1.
 */

export interface ChallengeResponse {
  challengeId: string;
  challengeMessage: string;
  expiresAt: string;
}

export interface VerifyResponse {
  verified: boolean;
  agent?: VerifiedAgent;
  error?: string;
}

export interface VerifiedAgent {
  id: string;
  name: string;
  blockHeight: number;
  genome: string;
  genomeVersion: number;
  trustScore: number;
  trustFactors: TrustFactors;
  verifiedAt: string;
  createdAt: string;
  signatureType: 'legacy' | 'segwit' | 'taproot-pending';
}

export interface TrustFactors {
  signatureValid: boolean;
  bitmapOwnership: boolean;
  blockExists: boolean;
  addressFormat: 'legacy' | 'segwit-native' | 'segwit-compat' | 'taproot' | 'unknown';
  inscriptionAge: number | null;
  blockAge: number | null;
}

export interface BlockResponse {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  size: number;
  weight: number;
  genome: string | null;
  genomeVersion: number;
  verified: boolean;
  agent: VerifiedAgent | null;
}

export interface SearchResult {
  type: 'agent' | 'block';
  id: string;
  name: string;
  blockHeight: number;
  genome: string | null;
  trustScore: number | null;
  matchField: string;
}

export interface SearchResponse {
  query: string;
  count: number;
  results: SearchResult[];
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  uptime: number;
  storage: string;
  stats: {
    agents: number;
    activeChallenges: number;
  };
}

export interface ApiError {
  error: string;
  code: string;
  status: number;
  field?: string;
}
