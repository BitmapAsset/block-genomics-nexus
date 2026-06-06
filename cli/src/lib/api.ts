// Real HTTP client for the Block Genomics public API.
// No mocks — every call here hits the live protocol so external agents get
// real data. Base URL is configurable (env > config > default).

import { getApiBase } from "./config";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Envelope<T> = { success: true; data: T } | { success: false; error: string };

function isEnvelope<T>(v: unknown): v is Envelope<T> {
  return typeof v === "object" && v !== null && "success" in v;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new ApiError(`Network error reaching ${url}: ${detail}`, 0);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(`Non-JSON response (${res.status}) from ${url}`, res.status);
  }

  // Envelope-style responses: { success, data } | { success:false, error }
  if (isEnvelope<T>(body)) {
    if (body.success) return body.data;
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status);
  }

  // Raw responses (stats, world, terrain) — surface HTTP errors honestly.
  if (!res.ok) {
    const msg =
      (body as { error?: string })?.error || `Request failed (${res.status}) for ${url}`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

// ─── Types (subset of real API shapes) ──────────────────────────────

export type Stats = {
  verifiedAgents: number;
  genomesMinted: number;
  blocksVerified: number;
};

export type OwnershipResult = {
  blockHeight: number;
  dbOwner: string | null;
  onChainOwner: string | null;
  match: boolean;
  inscriptionId: string | null;
  action: string;
  lastChecked: string;
};

export type BlockRecord = {
  height: number;
  hash: string | null;
  ownerAddress: string | null;
  label: string | null;
  inscriptionId: string | null;
  groundColor?: string | null;
  skyColor?: string | null;
  parcelCount: number;
  owner: { walletAddress: string; handle: string | null; avatar: string | null; tier: number } | null;
};

export type WorldObject = {
  id: string;
  objectType: string;
  geometry?: string | null;
  name?: string | null;
};

export type WorldData = {
  objects: WorldObject[];
  terrain: Record<string, unknown> | null;
};

export type Listing = {
  id: string;
  blockHeight: number;
  parcelTxIndex: number | null;
  tier: number;
  spotsTotal: number;
  spotsUsed: number;
  price30d: number;
  price365d: number;
  active: boolean;
  owner: { handle: string | null; walletAddress: string } | null;
  block: { height: number; label: string | null } | null;
};

export type Challenge = { message: string; nonce: string };

// ─── Read endpoints (public, no auth) ────────────────────────────────

export function getStats(): Promise<Stats> {
  return request<Stats>("/api/v1/stats");
}

export function getOwnership(blockHeight: number): Promise<OwnershipResult> {
  return request<OwnershipResult>(`/api/v1/ownership/verify?blockHeight=${blockHeight}`);
}

export function getBlock(blockHeight: number): Promise<BlockRecord> {
  return request<BlockRecord>(`/api/v1/blocks/${blockHeight}`);
}

export function getWorld(blockHeight: number): Promise<WorldData> {
  return request<WorldData>(`/api/v1/world?blockHeight=${blockHeight}`);
}

export function getListings(opts: { limit?: number; blockHeight?: number; tier?: number } = {}): Promise<{
  listings: Listing[];
  total: number;
}> {
  const q = new URLSearchParams();
  q.set("limit", String(opts.limit ?? 50));
  if (opts.blockHeight) q.set("blockHeight", String(opts.blockHeight));
  if (opts.tier) q.set("tier", String(opts.tier));
  return request(`/api/v1/delegations/listings?${q.toString()}`);
}

export function searchProtocol(q: string): Promise<{
  blocks: unknown[];
  agents: unknown[];
  users: { handle: string; displayName: string | null; tier: number; url: string }[];
}> {
  return request(`/api/v1/search?q=${encodeURIComponent(q)}`);
}

// ─── Identity / signing path (write) ─────────────────────────────────

export function requestChallenge(walletAddress: string, purpose = "auth"): Promise<Challenge> {
  return request<Challenge>("/api/v1/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, purpose }),
  });
}

// Resource reachability check for `bg connect` — a real HTTP probe.
export async function pingUrl(url: string, timeoutMs = 6000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    return res.ok || (res.status >= 200 && res.status < 500);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
