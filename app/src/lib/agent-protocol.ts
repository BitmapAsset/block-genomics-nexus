/**
 * Bitmap Agent Protocol — Type definitions, constants, and helpers
 * for AI agents and VPS servers connecting to Bitcoin Bitmap parcels.
 */

import crypto from 'crypto';
import { verifyBip322 } from './bip322';

// ─── Enums ───────────────────────────────────────────────────────

export enum AgentPermission {
  READ_DMS = 'READ_DMS',
  SEND_DMS = 'SEND_DMS',
  MANAGE_CONTENT = 'MANAGE_CONTENT',
  BUILD_DECORATE = 'BUILD_DECORATE',
  HANDLE_OFFERS = 'HANDLE_OFFERS',
  FULL_AUTONOMY = 'FULL_AUTONOMY',
}

export type AgentStatus = 'active' | 'inactive' | 'revoked' | 'suspended';
export type ConnectionType = 'https' | 'websocket' | 'webrtc';
export type VPSStatus = 'linked' | 'unlinked' | 'unhealthy';

export type AgentEventType =
  | 'visitor_arrived'
  | 'dm_received'
  | 'offer_made'
  | 'content_reported'
  | 'permission_request'
  | 'heartbeat';

// ─── Interfaces ──────────────────────────────────────────────────

export interface BitmapAgent {
  id: string;
  walletAddress: string;
  endpointUrl: string;
  blockHeight: number;
  parcelIndex: number | null;
  tier: number; // 1, 2, or 3
  permissions: AgentPermission[];
  status: AgentStatus;
  createdAt: Date;
  lastHeartbeat: Date;
}

export interface AgentEvent {
  id: string;
  agentId: string;
  type: AgentEventType;
  payload: Record<string, unknown>;
  timestamp: Date;
}

export interface AgentBrief {
  id: string;
  agentId: string;
  period: string; // e.g. "2026-02-12T00:00:00Z/2026-02-12T23:59:59Z"
  summary: string;
  stats: {
    visitors: number;
    dms: number;
    offers: number;
    actions: number;
  };
  pendingPermissions: AgentPermission[];
  createdAt: Date;
}

export interface VPSLink {
  id: string;
  walletAddress: string;
  blockHeight: number;
  parcelIndex: number | null;
  serverUrl: string;
  connectionType: ConnectionType;
  status: VPSStatus;
  tlsVerified: boolean;
  lastHealthCheck: Date | null;
}

export interface AgentSession {
  id: string;
  agentId: string;
  bitmapAddress: string;
  sandboxId: string;
  startedAt: Date;
  permissions: AgentPermission[];
  activityLog: string[];
}

// ─── Constants ───────────────────────────────────────────────────

export const MAX_AGENTS_TIER1 = 10;
export const MAX_AGENTS_TIER2 = 3;
export const MAX_AGENTS_TIER3 = 1;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEALTH_CHECK_INTERVAL_MS = 60_000;
export const REGISTRATION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export function maxAgentsForTier(tier: number): number {
  switch (tier) {
    case 1: return MAX_AGENTS_TIER1;
    case 2: return MAX_AGENTS_TIER2;
    case 3: return MAX_AGENTS_TIER3;
    default: return 0;
  }
}

// ─── Helper Functions ────────────────────────────────────────────

const PERMISSION_HIERARCHY: AgentPermission[] = [
  AgentPermission.READ_DMS,
  AgentPermission.SEND_DMS,
  AgentPermission.MANAGE_CONTENT,
  AgentPermission.BUILD_DECORATE,
  AgentPermission.HANDLE_OFFERS,
  AgentPermission.FULL_AUTONOMY,
];

/**
 * Validate that all requested permissions are known enum values.
 */
export function validatePermissions(permissions: string[]): { valid: boolean; invalid: string[] } {
  const values = Object.values(AgentPermission) as string[];
  const invalid = permissions.filter((p) => !values.includes(p));
  return { valid: invalid.length === 0, invalid };
}

/**
 * Check if an agent with `grantedPermissions` can perform `requiredPermission`.
 * FULL_AUTONOMY implies all other permissions.
 */
export function canPerformAction(
  grantedPermissions: AgentPermission[],
  requiredPermission: AgentPermission
): boolean {
  if (grantedPermissions.includes(AgentPermission.FULL_AUTONOMY)) return true;
  return grantedPermissions.includes(requiredPermission);
}

/**
 * Generate a random challenge string for agent authentication.
 */
export function generateAgentChallenge(): string {
  return `bitmap-agent-challenge:${crypto.randomUUID()}:${Date.now()}`;
}

/**
 * Verify an agent's wallet signature against a challenge using BIP-322.
 */
export function verifyAgentSignature(
  walletAddress: string,
  challenge: string,
  signature: string
): boolean {
  if (!signature || signature.length === 0) return false;
  if (!walletAddress || !challenge) return false;

  // SECURITY: no length-only fallback — any 64-byte base64 would pass.
  // `verifyBip322` fails closed and accepts the encodings real wallets emit.
  return verifyBip322(walletAddress, challenge, signature);
}
