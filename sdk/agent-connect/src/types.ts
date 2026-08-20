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
  | 'session'
  | 'agent-register'
  | 'agent-manage'
  | 'agent-token'
  | 'parcel-customize'
  | 'world'
  | 'experience-register'
  | 'experience-manage';

// ─── Verified sessions (Bitcoin-native identity + bitmap ownership) ──────────

/**
 * Step 1 of the ownership handshake: the exact message to sign, plus the
 * server's own description of what to do with it.
 */
export type SessionChallenge = {
  /** Sign this verbatim (BIP-322) with the wallet holding your .bitmap. */
  message: string;
  nonce: string;
  expiresAt: string;
  walletAddress: string;
  next: {
    sign: string;
    then: string;
    steps: readonly string[];
    maxBlocks: number;
    sessionTtlSeconds: number;
  };
};

/** A claimed block that did NOT verify on-chain during session minting. */
export type RejectedBlock = {
  blockHeight: number;
  reason: string;
  /** True when the chain was merely unreachable — retry rather than give up. */
  retryable: boolean;
};

/**
 * Step 2 result: the scoped `bg_vfy_` credential.
 *
 * `token` is returned exactly once and is never retrievable again. Blocks that
 * failed their on-chain check arrive in `rejected` rather than being silently
 * dropped.
 */
export type VerifiedSession = {
  token: string;
  tokenPrefix: string;
  walletAddress: string;
  verifiedBlocks: number[];
  rejected: RejectedBlock[];
  expiresAt: string;
  usage: string;
  note: string;
};

/**
 * The capability surface of the current session.
 *
 * `verifiedBlocks` is the scope proven at verification time, NOT a live
 * ownership claim — every write re-checks the chain.
 */
export type SessionInfo = {
  walletAddress: string;
  verifiedBlocks: number[];
  tokenPrefix: string;
  createdAt: string;
  expiresAt: string;
  canWrite: boolean;
  note: string;
};

/** Handle availability across both the user and block-profile namespaces. */
export type UsernameAvailability = { handle: string; available: boolean };

/** A username successfully bound to the verified wallet. */
export type ClaimedUsername = {
  handle: string | null;
  walletAddress: string;
  displayName: string | null;
};

// ─── Experience hosting (Nexus Protocol v1 — Experience Hosting) ─────────────

/** The kind of self-hosted world an owner attaches to a block. */
export type ExperienceType =
  | 'web'
  | 'unreal'
  | 'unity'
  | 'godot'
  | 'minecraft'
  | 'vr'
  | 'custom';

/** How a client reaches the experience's entry point. */
export type ExperienceTransport = 'https' | 'wss' | 'webrtc' | 'custom';

/** Server-probed reachability of the experience's healthUrl. */
export type ExperienceStatus = 'live' | 'degraded' | 'unreachable' | 'pending';

/** Suggested audience rating for the experience. */
export type ContentRating = 'everyone' | 'teen' | 'mature';

/** Optional client the visitor needs to enter a non-web experience. */
export type ClientRequirements = {
  platform?: string;
  minVersion?: string;
  downloadUrl?: string;
};

/**
 * The owner-authored manifest describing a self-hosted experience. This is the
 * exact input the SDK sends on register (and, partially, on update). Nexus is
 * the registry + discovery + health layer — it never hosts the experience.
 *
 * `entryUrl`/`healthUrl` MUST be `https://` or `wss://` (the server rejects
 * `http:`, localhost, and private IP ranges as an SSRF guard).
 */
export type ExperienceManifest = {
  /** The Bitcoin block this experience is attached to. Required. */
  blockHeight: number;
  /** Optional parcel within the block. */
  parcelIndex?: number;
  /** Human-readable name (1..64 chars). */
  name: string;
  /** Optional description (..512 chars). Brain-judged on register/update. */
  description?: string;
  experienceType: ExperienceType;
  /** Where a client connects. https:// or wss:// only. */
  entryUrl: string;
  transport: ExperienceTransport;
  /** URL the server probes for health. Defaults to `entryUrl`. Same URL rules. */
  healthUrl?: string;
  clientRequirements?: ClientRequirements;
  /** Free-form capability tags (max 16). */
  capabilities?: string[];
  contentRating?: ContentRating;
  /** Semver-ish version string for the experience. */
  version: string;
  /**
   * Schema version of the manifest envelope (currently 1). NOT the same as
   * `version`, which is your own build/content version and opaque to Nexus.
   */
  manifestVersion?: number;
  /**
   * Owner-attested digest of your content bundle, `sha256:<64 hex>`.
   * Nexus never fetches or checks the bundle — storing the digest under your
   * signature is what lets a client pin what it expects and detect a swap.
   */
  contentHash?: string;
};

/**
 * A registered experience as returned by the API: the owner's manifest plus the
 * server-added identity, ownership, probed-health, and moderation fields.
 */
export type ExperienceRecord = ExperienceManifest & {
  id: string;
  /** The verified owning wallet (server-derived from the BIP-322 signature). */
  walletAddress: string;
  /** Last server-probed reachability of `healthUrl`. */
  status: ExperienceStatus;
  /** ISO timestamp of the last health probe (null before the first probe). */
  lastProbedAt: string | null;
  /** Round-trip latency of the last probe, in ms (null if never reached). */
  probeLatencyMs: number | null;
  /** Whether the manifest text passed the Brain's constitution judgment. */
  soulJudged: boolean;
  /** Canonical hash of the manifest, computed by the server at write time. */
  manifestHash: string | null;
  /** The action-bound message the owner signed. Published for verifiability. */
  manifestMessage: string | null;
  /** The owner's BIP-322 signature over `manifestMessage`. */
  manifestSignature: string | null;
  /** True when this registration carries an owner signature. */
  signed: boolean;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Result of `experiences.verify()` — whether a registration is still exactly
 * what its owner signed.
 *
 * `verified` is the single answer most callers want. The individual flags are
 * there so a client can distinguish "unsigned legacy record" (trustworthy
 * ownership, no tamper-evidence) from "signature present but does not match"
 * (actively suspicious).
 */
export type ExperienceIntegrityReport = {
  id: string;
  blockHeight: number;
  walletAddress: string;
  manifestVersion: number;
  contentHash: string | null;
  /** Path a host publishes its own manifest at. */
  wellKnownPath: string;
  signed: boolean;
  /** Hash re-derived from the record's fields right now. */
  computedManifestHash: string;
  storedManifestHash: string | null;
  manifestHashMatches: boolean;
  signatureCoversManifest: boolean;
  signatureValid: boolean;
  /** Every applicable check passed. */
  verified: boolean;
  issues: string[];
  trustChain: { deed: string; signature: string; manifest: string };
  /** Present only when verify() was called with `remote`. */
  remote: {
    checked: boolean;
    url?: string;
    reachable: boolean;
    reason?: string;
    bytes?: number;
    remoteManifestHash?: string | null;
    /** The host's published manifest hashes identically to the registry's. */
    matchesRegistry?: boolean;
    declaredBlockHeight?: number | null;
    blockHeightMatches?: boolean;
  } | null;
};

/** Filters + pagination for {@link BlockGenomicsClient.experiences}.list. */
export type ExperienceListOptions = {
  blockHeight?: number;
  type?: ExperienceType;
  status?: ExperienceStatus;
  /** Page size (server default 50, max 100). */
  limit?: number;
  /** Row offset for pagination (default 0). */
  offset?: number;
};

/** Paginated discovery result. Mirrors the protocol's list envelope. */
export type ExperienceListResult = {
  experiences: ExperienceRecord[];
  total: number;
  limit: number;
  offset: number;
};

/** Result of a terminal experience removal. */
export type ExperienceRemoveResult = { id: string; removed: boolean };
