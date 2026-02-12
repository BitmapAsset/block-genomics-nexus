/**
 * Agent — A verification agent in the Block Genomics network.
 * Agents perform cryptographic verification of Bitcoin blocks
 * and accumulate trust scores over time.
 */

export interface Agent {
  id: string;
  address: string; // Bitcoin or wallet address
  displayName: string | null;
  avatarUrl: string | null;
  trustScore: number; // 0–100
  totalVerifications: number;
  successfulVerifications: number;
  failedVerifications: number;
  rank: number | null;
  badges: string[]; // Badge IDs
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date | null;
}

export interface AgentStats {
  agentId: string;
  verificationsToday: number;
  verificationsThisWeek: number;
  averageResponseTime: number; // milliseconds
  streakDays: number;
  rankChange: number; // positive = improved
}

export interface AgentCreateInput {
  address: string;
  displayName?: string;
}
