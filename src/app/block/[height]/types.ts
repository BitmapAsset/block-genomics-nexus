/** Types matching the API server responses (shared by block page) */

export interface TrustFactors {
  signatureValid: boolean;
  bitmapOwnership: boolean;
  blockExists: boolean;
  addressFormat: string;
  inscriptionAge: number | null;
  blockAge: number | null;
}

export interface AgentPublic {
  id: string;
  name: string;
  blockHeight: number;
  genome: string;
  genomeVersion: number;
  trustScore: number;
  trustFactors: TrustFactors;
  verifiedAt: string;
  createdAt: string;
  signatureType: string;
}

export interface BlockResponse {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  size: number;
  weight: number;
  difficulty: number;
  nonce: number;
  merkleRoot: string;
  genome: string | null;
  genomeVersion: number;
  verified: boolean;
  agent: AgentPublic | null;
}
