// API response shapes — a typed subset of the live Block Genomics public API.
// Verified against https://blockgenomics.io on 2026-06-03.

export type Stats = {
  verifiedAgents: number;
  genomesMinted: number;
  blocksVerified: number;
};

export type OwnershipResult = {
  blockHeight: number;
  /** Owner recorded in the Block Genomics DB (null if the block is unclaimed). */
  dbOwner: string | null;
  /** Current on-chain owner of the .bitmap inscription (authoritative). */
  onChainOwner: string | null;
  /** Whether dbOwner === onChainOwner. */
  match: boolean;
  inscriptionId: string | null;
  action: string;
  lastChecked: string;
};

export type BlockOwner = {
  walletAddress: string;
  handle: string | null;
  avatar: string | null;
  tier: number;
};

export type BlockRecord = {
  height: number;
  hash: string | null;
  ownerAddress: string | null;
  label: string | null;
  groundColor?: string | null;
  skyColor?: string | null;
  inscriptionId: string | null;
  createdAt?: string;
  parcelCount: number;
  owner: BlockOwner | null;
};

export type WorldObject = {
  id: string;
  blockHeight?: number;
  objectType: string;
  geometry?: string | null;
  color?: string | null;
  material?: string | null;
  name?: string | null;
  posX?: number;
  posY?: number;
  posZ?: number;
  visible?: boolean;
  locked?: boolean;
};

export type WorldData = {
  objects: WorldObject[];
  terrain: Record<string, unknown> | null;
};

/** Shape of GET /api/v1/users/by-wallet/{address} — an agent's identity record. */
export type Identity = {
  walletAddress: string;
  handle: string | null;
  displayName: string | null;
  genomeHash: string | null;
  anchorBlock: number | null;
  tier: number;
  verified: boolean;
  blockProfiles: unknown[];
  /** Block heights this wallet has verified ownership of. */
  ownedBlocks: number[];
};

export type BlockProfile = {
  walletAddress: string;
  blockHeight: number;
  handle: string | null;
  displayName: string | null;
  genomeHash: string | null;
  tier: number;
  verified: boolean;
  isPrimary?: boolean;
};

export type Challenge = { message: string; nonce: string };

export type VerifyResult = {
  verified: boolean;
  walletAddress: string;
  handle: string | null;
  displayName: string | null;
  genomeHash: string | null;
  tier: number;
  anchorBlock: number | null;
};

export type SearchResult = {
  blocks: unknown[];
  agents: unknown[];
  users: { handle: string; displayName: string | null; tier: number; url: string }[];
};

// ─── Agent runtime (register / token / heartbeat / brief / events) ──────────

/** Capability classes an owner grants a registered agent. */
export type AgentPermission =
  | 'READ_DMS'
  | 'SEND_DMS'
  | 'MANAGE_CONTENT'
  | 'BUILD_DECORATE'
  | 'HANDLE_OFFERS'
  | 'FULL_AUTONOMY';

/** A registered BitmapAgent as returned by the owner-facing routes. */
export type AgentRecord = {
  /** Management capability — keys the runtime routes. Owner-only; never publish it. */
  id: string;
  walletAddress: string;
  endpointUrl: string;
  blockHeight: number;
  parcelIndex: number | null;
  tier: number;
  permissions: AgentPermission[];
  status: string;
  createdAt: string;
  lastHeartbeat: string | null;
  apiKeyCreatedAt?: string | null;
};

/** Register response — carries the one-time plaintext API token. */
export type RegisteredAgent = AgentRecord & {
  /** One-time plaintext Bearer token. Store on receipt; it is never returned again. */
  apiKey: string;
  apiKeyWarning: string;
};

/** A single runtime event on an agent's private stream. */
export type AgentEvent = {
  id: string;
  agentId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

export type HeartbeatResult = { alive: boolean; lastHeartbeat: string };

/** Owner-facing digest an agent files via POST …/brief. */
export type AgentBriefInput = {
  period: string;
  summary: string;
  stats: Record<string, unknown>;
  pendingPermissions?: string[];
};

export type AgentBrief = {
  id: string;
  agentId: string;
  period: string;
  summary: string;
  stats: Record<string, unknown>;
  pendingPermissions: string[];
  createdAt: string;
};

/** Result of rotating/first-issuing an agent token. Carries the new one-time token. */
export type TokenRotateResult = {
  agentId: string;
  apiKey: string;
  apiKeyCreatedAt: string;
  apiKeyWarning: string;
};

/** Public directory projection of an active agent (no internal id, truncated owner). */
export type BlockAgent = {
  blockHeight: number;
  parcelIndex: number | null;
  tier: number;
  permissions: AgentPermission[];
  status: string;
  endpointUrl: string;
  /** Display-truncated owner address (the full address is never published). */
  owner: string;
  createdAt: string;
  lastHeartbeat: string | null;
};

/** All challenge purposes the protocol accepts (Nexus Protocol §3.2). */
export type ChallengePurpose =
  | 'auth'
  | 'agent-register'
  | 'agent-manage'
  | 'agent-token'
  | 'parcel-customize'
  | 'world';
