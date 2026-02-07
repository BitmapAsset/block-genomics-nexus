/**
 * TrustScore — Composite reputation metric for agents.
 * Calculated from verification history, accuracy, consistency,
 * and community standing.
 */

export interface TrustScore {
  agentId: string;
  overall: number; // 0–100 composite score
  components: TrustScoreComponents;
  tier: TrustTier;
  history: TrustScoreSnapshot[];
  updatedAt: Date;
}

export interface TrustScoreComponents {
  accuracy: number; // 0–100 — verification correctness rate
  consistency: number; // 0–100 — regularity of participation
  speed: number; // 0–100 — response time performance
  volume: number; // 0–100 — total verifications weight
  longevity: number; // 0–100 — time-based reputation
}

export type TrustTier =
  | "unranked" // New, < 10 verifications
  | "bronze" // 0–25
  | "silver" // 26–50
  | "gold" // 51–75
  | "platinum" // 76–90
  | "diamond" // 91–100
  | "genesis"; // Special: top agents

export interface TrustScoreSnapshot {
  score: number;
  tier: TrustTier;
  timestamp: Date;
}

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentAddress: string;
  displayName: string | null;
  trustScore: number;
  tier: TrustTier;
  totalVerifications: number;
  streak: number;
}
