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
  VerifyResult,
  SearchResult,
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

export class BlockGenomicsClient {
  readonly baseUrl: string;
  private readonly signer?: BitcoinSigner;
  private readonly _fetch: typeof fetch;

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
  requestChallenge(walletAddress: string, purpose: 'auth' | 'world' = 'auth'): Promise<Challenge> {
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
}
