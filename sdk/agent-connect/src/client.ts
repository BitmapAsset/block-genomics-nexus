// BlockGenomicsClient — the agent-facing client.
//
// Read methods are public (no auth). Write methods (claimBlock, world.*) require
// a pluggable BitcoinSigner: the agent brings its own key/wallet; the SDK never
// holds private material. Uses the global `fetch` (Node >=18 / Deno / Bun /
// Workers / browser) — zero runtime dependencies.

import type { BitcoinSigner } from './signer.js';
import { buildActionMessage, hashBody } from './action-message.js';
import type {
  Stats,
  OwnershipResult,
  BlockRecord,
  WorldData,
  WorldObject,
  Identity,
  BlockProfile,
  Challenge,
  ChallengePurpose,
  VerifyResult,
  SearchResult,
  AgentPermission,
  AgentRecord,
  RegisteredAgent,
  AgentEvent,
  HeartbeatResult,
  AgentBriefInput,
  AgentBrief,
  TokenRotateResult,
  BlockAgent,
  ExperienceManifest,
  ExperienceRecord,
  ExperienceListOptions,
  ExperienceListResult,
  ExperienceRemoveResult,
} from './types.js';

export const DEFAULT_BASE_URL = 'https://blockgenomics.io';
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class BlockGenomicsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'BlockGenomicsError';
    this.status = status;
  }
}

type Envelope<T> = { success: true; data: T } | { success: false; error: string };

function isEnvelope<T>(v: unknown): v is Envelope<T> {
  return typeof v === 'object' && v !== null && 'success' in v;
}

export interface ClientOptions {
  /** API base URL. Defaults to https://blockgenomics.io. */
  baseUrl?: string;
  /** Optional pluggable signer. Required only for write methods. */
  signer?: BitcoinSigner;
  /** Override the global fetch (e.g. for tests). */
  fetch?: typeof fetch;
}

export interface ClaimBlockOptions {
  blockHeight: number;
  handle?: string;
  displayName?: string;
  /** Optional specific .bitmap inscription id to verify on-chain. */
  inscriptionId?: string;
}

export interface RegisterAgentOptions {
  /** The block this agent operates on. The signer MUST currently own it on-chain. */
  blockHeight: number;
  /** Where the agent runs (its callback/serving URL). */
  endpointUrl: string;
  /** Tier caps how many agents a block may run (1 = 10, 2 = 3, 3 = 1). */
  tier: 1 | 2 | 3;
  /** Capability classes to grant. */
  permissions: AgentPermission[];
  /** Optional parcel this agent is scoped to. */
  parcelIndex?: number | null;
}

export interface UpdateAgentOptions {
  endpointUrl?: string;
  permissions?: AgentPermission[];
}

export interface WorldObjectInput {
  blockHeight: number;
  objectType: string;
  geometry?: string;
  color?: string;
  material?: string;
  posX?: number;
  posY?: number;
  posZ?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  name?: string;
  visible?: boolean;
  locked?: boolean;
}

/**
 * The `experiences.*` surface: attach, discover, and manage self-hosted worlds
 * on a block. Nexus is the registry + discovery + health layer, never the host.
 */
export interface ExperiencesApi {
  /** Attach a self-hosted experience to a block you own. Requires a signer. */
  register(manifest: ExperienceManifest): Promise<ExperienceRecord>;
  /** Fetch one experience by id. Public read. */
  get(id: string): Promise<ExperienceRecord>;
  /** Discover experiences (filter by block/type/status, paginated). Public read. */
  list(opts?: ExperienceListOptions): Promise<ExperienceListResult>;
  /** Update an experience you own (partial manifest). Re-probes + re-judges. Requires a signer. */
  update(id: string, changes: Partial<ExperienceManifest>): Promise<ExperienceRecord>;
  /** Terminally remove an experience you own. Requires a signer. */
  remove(id: string): Promise<ExperienceRemoveResult>;
  /** Trigger a fresh server-side health probe (rate-limited 1/min). Public. */
  probe(id: string): Promise<ExperienceRecord>;
}

export class BlockGenomicsClient {
  readonly baseUrl: string;
  private readonly signer?: BitcoinSigner;
  private readonly _fetch: typeof fetch;
  private _experiences?: ExperiencesApi;

  constructor(opts: ClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.signer = opts.signer;
    const f = opts.fetch ?? globalThis.fetch;
    if (!f) {
      throw new Error(
        'No fetch implementation available. Use Node >=18, or pass { fetch } in ClientOptions.',
      );
    }
    this._fetch = f.bind(globalThis);
  }

  // ─── transport ─────────────────────────────────────────────────────

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await this._fetch(url, {
        ...init,
        headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new BlockGenomicsError(`Network error reaching ${url}: ${detail}`, 0);
    }

    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new BlockGenomicsError(`Non-JSON response (${res.status}) from ${url}`, res.status);
    }

    // Envelope responses: { success, data } | { success:false, error }
    if (isEnvelope<T>(body)) {
      if (body.success) return body.data;
      throw new BlockGenomicsError(body.error || `Request failed (${res.status})`, res.status);
    }

    // Raw responses (stats, world) — surface HTTP errors honestly.
    if (!res.ok) {
      const msg = (body as { error?: string })?.error || `Request failed (${res.status}) for ${url}`;
      throw new BlockGenomicsError(msg, res.status);
    }
    return body as T;
  }

  private requireSigner(): BitcoinSigner {
    if (!this.signer) {
      throw new BlockGenomicsError(
        'This action requires a signer. Construct the client with { signer } — your agent brings its own BIP-322 Bitcoin signer.',
        401,
      );
    }
    return this.signer;
  }

  // ─── read: discovery & protocol ────────────────────────────────────

  /** Protocol-wide counts. GET /api/v1/stats */
  getStats(): Promise<Stats> {
    return this.request<Stats>('/api/v1/stats');
  }

  /** Authoritative on-chain ownership for a block. GET /api/v1/ownership/verify */
  getOwnership(blockHeight: number): Promise<OwnershipResult> {
    return this.request<OwnershipResult>(`/api/v1/ownership/verify?blockHeight=${blockHeight}`);
  }

  /** Registered block record (owner, genome metadata, parcels). GET /api/v1/blocks/{height} */
  getBlock(blockHeight: number): Promise<BlockRecord> {
    return this.request<BlockRecord>(`/api/v1/blocks/${blockHeight}`);
  }

  /** Visible world objects + terrain for a block. GET /api/v1/world */
  getWorld(blockHeight: number): Promise<WorldData> {
    return this.request<WorldData>(`/api/v1/world?blockHeight=${blockHeight}`);
  }

  /** Search blocks/agents/users. GET /api/v1/search */
  search(q: string): Promise<SearchResult> {
    return this.request<SearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}`);
  }

  // ─── read: an agent's own identity & verified blocks ───────────────

  /** Identity record for any wallet, including ownedBlocks. GET /api/v1/users/by-wallet/{address} */
  getIdentity(address: string): Promise<Identity> {
    return this.request<Identity>(`/api/v1/users/by-wallet/${encodeURIComponent(address)}`);
  }

  /** Block profiles for any wallet. GET /api/v1/profiles/by-wallet/{address} */
  async getProfiles(address: string): Promise<BlockProfile[]> {
    const data = await this.request<{ profiles: BlockProfile[] }>(
      `/api/v1/profiles/by-wallet/${encodeURIComponent(address)}`,
    );
    return data.profiles;
  }

  /** This signer's own identity record. Requires a signer. */
  getMyIdentity(): Promise<Identity> {
    return this.getIdentity(this.requireSigner().address);
  }

  /**
   * The signer's verified blocks, enriched with each block's record. Requires a
   * signer. Reads only — proves what this wallet already owns on Block Genomics.
   */
  async getMyVerifiedBlocks(): Promise<BlockRecord[]> {
    const identity = await this.getMyIdentity();
    const heights = identity.ownedBlocks ?? [];
    const records = await Promise.all(
      heights.map((h) =>
        this.getBlock(h).catch(() => null as BlockRecord | null),
      ),
    );
    return records.filter((r): r is BlockRecord => r !== null);
  }

  // ─── write: identity (claim a block) ───────────────────────────────

  /** Request a one-time challenge nonce. POST /api/v1/challenge */
  requestChallenge(walletAddress: string, purpose: ChallengePurpose = 'auth'): Promise<Challenge> {
    return this.request<Challenge>('/api/v1/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, purpose }),
    });
  }

  /**
   * Claim a block as this agent's verified identity.
   *
   * Flow: request an 'auth' challenge → sign the returned message with the
   * agent's BIP-322 signer → POST /api/v1/auth/verify. The server checks the
   * signature, consumes the one-time nonce, verifies on-chain .bitmap ownership
   * of `blockHeight`, and mints/returns the deterministic genome.
   *
   * Requires a signer. The signing wallet MUST own the .bitmap inscription for
   * the block, or the server returns 403.
   */
  async claimBlock(opts: ClaimBlockOptions): Promise<VerifyResult> {
    const signer = this.requireSigner();
    const challenge = await this.requestChallenge(signer.address, 'auth');
    const signature = await signer.signMessage(challenge.message);
    return this.request<VerifyResult>('/api/v1/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: signer.address,
        signature,
        message: challenge.message,
        blockHeight: opts.blockHeight,
        handle: opts.handle,
        displayName: opts.displayName,
        inscriptionId: opts.inscriptionId,
      }),
    });
  }

  // ─── write: world (owner-authorized, action-bound) ─────────────────

  /**
   * Perform an action-bound, replay-safe world mutation. Internal: drives all of
   * createObject / updateObject / deleteObject.
   *
   * Binds the signature to method + exact path + block + body hash + one-time
   * nonce + expiry (see action-message.ts). Requires a signer that owns the
   * target block.
   */
  private async signedWorldMutation<T>(args: {
    method: 'POST' | 'PATCH' | 'DELETE';
    path: string;
    action: string;
    blockHeight: number;
    body: Record<string, unknown>;
    ttlMs?: number;
  }): Promise<T> {
    const signer = this.requireSigner();
    const challenge = await this.requestChallenge(signer.address, 'world');
    const intentBody = { ...args.body, ownerAddress: signer.address };
    const bodyHash = await hashBody(intentBody);
    const expiresAt = Date.now() + (args.ttlMs ?? DEFAULT_TTL_MS);
    const message = buildActionMessage({
      action: args.action,
      method: args.method,
      path: args.path,
      blockHeight: args.blockHeight,
      bodyHash,
      nonce: challenge.nonce,
      expiresAt,
    });
    const signature = await signer.signMessage(message);
    return this.request<T>(args.path, {
      method: args.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...intentBody, signature, message }),
    });
  }

  /** Create a world object on a block you own. POST /api/v1/world */
  createObject(input: WorldObjectInput): Promise<{ object: WorldObject }> {
    const { blockHeight, ...rest } = input;
    return this.signedWorldMutation<{ object: WorldObject }>({
      method: 'POST',
      path: '/api/v1/world',
      action: 'world.create',
      blockHeight,
      body: { blockHeight, ...rest },
    });
  }

  /** Update a world object you own. PATCH /api/v1/world/{id} */
  updateObject(
    objectId: string,
    blockHeight: number,
    fields: Partial<Omit<WorldObjectInput, 'blockHeight'>>,
  ): Promise<{ object: WorldObject }> {
    return this.signedWorldMutation<{ object: WorldObject }>({
      method: 'PATCH',
      path: `/api/v1/world/${objectId}`,
      action: 'world.update',
      blockHeight,
      body: { ...fields },
    });
  }

  /** Delete a world object you own. DELETE /api/v1/world/{id} */
  deleteObject(objectId: string, blockHeight: number): Promise<{ success: boolean }> {
    return this.signedWorldMutation<{ success: boolean }>({
      method: 'DELETE',
      path: `/api/v1/world/${objectId}`,
      action: 'world.delete',
      blockHeight,
      body: {},
    });
  }

  // ─── agents: registration (owner-wallet signature) ─────────────────

  private bearer(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Register a sovereign agent on a block you own.
   *
   * Flow: request an `agent-register` challenge → sign it (BIP-322) → POST
   * `/api/v1/agents/register`. The signer MUST currently own `blockHeight`
   * on-chain (the server does a live re-verify and fails closed on a mismatch).
   *
   * The `201` response carries a **one-time** plaintext Bearer token as
   * `apiKey`. Store it immediately — it is shown exactly once and cannot be
   * recovered (rotate a new one with {@link rotateAgentToken} if lost). Requires
   * a signer.
   */
  async registerAgent(opts: RegisterAgentOptions): Promise<RegisteredAgent> {
    const signer = this.requireSigner();
    const challenge = await this.requestChallenge(signer.address, 'agent-register');
    const signature = await signer.signMessage(challenge.message);
    return this.request<RegisteredAgent>('/api/v1/agents/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: signer.address,
        endpointUrl: opts.endpointUrl,
        blockHeight: opts.blockHeight,
        parcelIndex: opts.parcelIndex ?? null,
        tier: opts.tier,
        permissions: opts.permissions,
        signature,
        challenge: challenge.message,
      }),
    });
  }

  // ─── agents: token lifecycle (owner-wallet signature) ──────────────

  /**
   * Rotate (or first-issue) an agent's API token. Authenticated by the OWNER
   * WALLET via an `agent-token` challenge — not by the current token — so a lost
   * or leaked token is recoverable. Returns a new one-time `apiKey`; any prior
   * token is invalidated immediately. Requires a signer.
   */
  async rotateAgentToken(agentId: string): Promise<TokenRotateResult> {
    const body = await this.signAgentToken();
    return this.request<TokenRotateResult>(`/api/v1/agents/${encodeURIComponent(agentId)}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Revoke an agent's active API token. The agent is then LOCKED (runtime routes
   * return `401`) until the owner rotates a new key; revoke never re-opens
   * tokenless access. Owner-wallet authenticated. Requires a signer.
   */
  async revokeAgentToken(agentId: string): Promise<{ agentId: string; tokenRevoked: boolean }> {
    const body = await this.signAgentToken();
    return this.request<{ agentId: string; tokenRevoked: boolean }>(
      `/api/v1/agents/${encodeURIComponent(agentId)}/token`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  }

  /** Sign a fresh single-use `agent-token` challenge with the owner wallet. */
  private async signAgentToken(): Promise<{ walletAddress: string; signature: string; challenge: string }> {
    const signer = this.requireSigner();
    const challenge = await this.requestChallenge(signer.address, 'agent-token');
    const signature = await signer.signMessage(challenge.message);
    return { walletAddress: signer.address, signature, challenge: challenge.message };
  }

  // ─── agents: management (owner-wallet signature) ───────────────────

  /**
   * Update an agent you own (endpoint and/or permissions). Consumes a single-use
   * `agent-manage` challenge signed by the owner wallet. Requires a signer.
   */
  async updateAgent(agentId: string, changes: UpdateAgentOptions): Promise<AgentRecord> {
    const signer = this.requireSigner();
    const challenge = await this.requestChallenge(signer.address, 'agent-manage');
    const signature = await signer.signMessage(challenge.message);
    return this.request<AgentRecord>(`/api/v1/agents/${encodeURIComponent(agentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: signer.address,
        signature,
        challenge: challenge.message,
        ...(changes.endpointUrl !== undefined ? { endpointUrl: changes.endpointUrl } : {}),
        ...(changes.permissions !== undefined ? { permissions: changes.permissions } : {}),
      }),
    });
  }

  /**
   * Revoke (deactivate) an agent you own. Consumes a single-use `agent-manage`
   * challenge signed by the owner wallet. Requires a signer.
   */
  async revokeAgent(agentId: string): Promise<{ revoked: boolean }> {
    const signer = this.requireSigner();
    const challenge = await this.requestChallenge(signer.address, 'agent-manage');
    const signature = await signer.signMessage(challenge.message);
    return this.request<{ revoked: boolean }>(`/api/v1/agents/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: signer.address, signature, challenge: challenge.message }),
    });
  }

  // ─── agents: runtime (Bearer token — no signer needed) ─────────────

  /**
   * Assert an agent's liveness. Runtime route: authenticated by the agent's
   * Bearer `token` (from registration/rotation), NOT the owner signer. Recommend
   * a ~30s cadence.
   */
  heartbeat(agentId: string, token: string): Promise<HeartbeatResult> {
    return this.request<HeartbeatResult>(`/api/v1/agents/${encodeURIComponent(agentId)}/heartbeat`, {
      method: 'POST',
      headers: this.bearer(token),
    });
  }

  /**
   * File an owner-facing digest (brief). Runtime route: authenticated by the
   * agent's Bearer `token`.
   */
  submitBrief(agentId: string, token: string, brief: AgentBriefInput): Promise<AgentBrief> {
    return this.request<AgentBrief>(`/api/v1/agents/${encodeURIComponent(agentId)}/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.bearer(token) },
      body: JSON.stringify({
        period: brief.period,
        summary: brief.summary,
        stats: brief.stats,
        pendingPermissions: brief.pendingPermissions ?? [],
      }),
    });
  }

  /**
   * Read the agent's PRIVATE event stream (most-recent first). Runtime route:
   * authenticated by the agent's Bearer `token`. Pass `since` (ISO timestamp) as
   * a cursor to page forward without re-reading; `limit` caps the batch
   * (server max 200).
   */
  getAgentEvents(
    agentId: string,
    token: string,
    opts: { since?: string; limit?: number } = {},
  ): Promise<AgentEvent[]> {
    const q = new URLSearchParams();
    if (opts.since) q.set('since', opts.since);
    if (opts.limit != null) q.set('limit', String(opts.limit));
    const qs = q.toString();
    const path = `/api/v1/agents/${encodeURIComponent(agentId)}/events${qs ? `?${qs}` : ''}`;
    return this.request<AgentEvent[]>(path, { headers: this.bearer(token) });
  }

  // ─── agents: public directory (no auth) ────────────────────────────

  /**
   * List the active agents registered on a block. Public projection: the
   * internal agent `id` is never exposed and the owner address is truncated.
   * GET /api/v1/agents/block/{blockHeight}
   */
  getBlockAgents(blockHeight: number): Promise<BlockAgent[]> {
    return this.request<BlockAgent[]>(`/api/v1/agents/block/${blockHeight}`);
  }

  // ─── experiences: self-hosted worlds on a block ────────────────────────

  /**
   * The experience-hosting surface. A verified block owner attaches a
   * self-hosted world (web / unreal / unity / godot / minecraft / vr / custom);
   * Nexus registers it, judges the manifest text against the constitution, and
   * probes its health. Writes reuse the same fail-closed BIP-322 + single-use
   * challenge + live on-chain re-verify path as agent registration.
   */
  get experiences(): ExperiencesApi {
    return (this._experiences ??= {
      register: (manifest) => this.registerExperience(manifest),
      get: (id) => this.getExperience(id),
      list: (opts) => this.listExperiences(opts),
      update: (id, changes) => this.updateExperience(id, changes),
      remove: (id) => this.removeExperience(id),
      probe: (id) => this.probeExperience(id),
    });
  }

  private async registerExperience(manifest: ExperienceManifest): Promise<ExperienceRecord> {
    const signer = this.requireSigner();
    const challenge = await this.requestChallenge(signer.address, 'experience-register');
    const signature = await signer.signMessage(challenge.message);
    return this.request<ExperienceRecord>('/api/v1/experiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...manifest,
        walletAddress: signer.address,
        signature,
        challenge: challenge.message,
      }),
    });
  }

  private getExperience(id: string): Promise<ExperienceRecord> {
    return this.request<ExperienceRecord>(`/api/v1/experiences/${encodeURIComponent(id)}`);
  }

  private listExperiences(opts: ExperienceListOptions = {}): Promise<ExperienceListResult> {
    const q = new URLSearchParams();
    if (opts.blockHeight != null) q.set('blockHeight', String(opts.blockHeight));
    if (opts.type) q.set('type', opts.type);
    if (opts.status) q.set('status', opts.status);
    if (opts.limit != null) q.set('limit', String(opts.limit));
    if (opts.offset != null) q.set('offset', String(opts.offset));
    const qs = q.toString();
    return this.request<ExperienceListResult>(`/api/v1/experiences${qs ? `?${qs}` : ''}`);
  }

  private async updateExperience(
    id: string,
    changes: Partial<ExperienceManifest>,
  ): Promise<ExperienceRecord> {
    const signer = this.requireSigner();
    const challenge = await this.requestChallenge(signer.address, 'experience-manage');
    const signature = await signer.signMessage(challenge.message);
    return this.request<ExperienceRecord>(`/api/v1/experiences/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...changes,
        walletAddress: signer.address,
        signature,
        challenge: challenge.message,
      }),
    });
  }

  private async removeExperience(id: string): Promise<ExperienceRemoveResult> {
    const signer = this.requireSigner();
    const challenge = await this.requestChallenge(signer.address, 'experience-manage');
    const signature = await signer.signMessage(challenge.message);
    return this.request<ExperienceRemoveResult>(`/api/v1/experiences/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: signer.address,
        signature,
        challenge: challenge.message,
      }),
    });
  }

  private probeExperience(id: string): Promise<ExperienceRecord> {
    return this.request<ExperienceRecord>(`/api/v1/experiences/${encodeURIComponent(id)}/probe`, {
      method: 'POST',
    });
  }
}
