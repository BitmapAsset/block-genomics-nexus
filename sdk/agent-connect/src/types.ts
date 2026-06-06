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
