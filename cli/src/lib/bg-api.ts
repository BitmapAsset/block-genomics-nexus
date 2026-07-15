/**
 * Minimal HTTP client for the Block Genomics Agent Connect API.
 * No SDK dependency — plain fetch, JSON envelopes matching public/openapi.json.
 *
 * IMPORTANT: This is the ONLY module inside the CLI that talks to the network.
 * Every command routes through here, so tests and dry-runs can mock a single seam.
 */

export type ApiEnvelope<T> = { success: true; data: T } | { success: false; error: string };

export function apiBase(): string {
  return (process.env.BG_API_URL || "https://blockgenomics.io").replace(/\/+$/, "");
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Extract the useful body regardless of envelope shape ({success,data} vs raw). */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "success" in (body as Record<string, unknown>)) {
    const env = body as { success: boolean; data?: T; error?: string };
    if (env.success === false) throw new Error(env.error || "API error");
    return (env.data as T) ?? ({} as T);
  }
  return body as T;
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    method: init.method || "GET",
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await readJson(res);
  if (!res.ok) {
    const errMsg =
      (body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string")
        ? String((body as { error: string }).error)
        : `HTTP ${res.status}`;
    throw new Error(`${res.status} ${errMsg} — ${init.method || "GET"} ${path}`);
  }
  return unwrap<T>(body);
}

// ─── Auth / challenge ─────────────────────────────────────────────────────

export type Challenge = { message: string; nonce: string };
export async function requestChallenge(
  walletAddress: string,
  purpose:
    | "auth"
    | "agent-register"
    | "agent-manage"
    | "agent-token"
    | "parcel-customize"
    | "world"
    | "experience-register"
    | "experience-manage" = "auth",
): Promise<Challenge> {
  return request<Challenge>("/api/v1/challenge", {
    method: "POST",
    body: { walletAddress, purpose },
  });
}

// ─── Agent lifecycle ──────────────────────────────────────────────────────

export type AgentPermission =
  | "READ_DMS"
  | "SEND_DMS"
  | "MANAGE_CONTENT"
  | "BUILD_DECORATE"
  | "HANDLE_OFFERS"
  | "FULL_AUTONOMY";

export interface RegisterAgentInput {
  walletAddress: string;
  endpointUrl: string;
  blockHeight: number;
  parcelIndex?: number | null;
  tier: 1 | 2 | 3;
  permissions: AgentPermission[];
  signature: string;
  /** The exact `message` returned by /api/v1/challenge (purpose 'agent-register'). */
  challenge: string;
}

export interface AgentRecord {
  id: string;
  walletAddress: string;
  endpointUrl: string;
  blockHeight: number;
  parcelIndex: number | null;
  tier: number;
  permissions: AgentPermission[];
  status: string;
  createdAt: string;
  lastHeartbeat: string;
}

/** Register response carries the one-time plaintext API token. */
export interface RegisteredAgent extends AgentRecord {
  apiKey: string;
  apiKeyWarning: string;
}

export async function registerAgent(input: RegisterAgentInput): Promise<RegisteredAgent> {
  return request<RegisteredAgent>("/api/v1/agents/register", { method: "POST", body: input });
}

function bearer(token?: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function heartbeatAgent(
  agentId: string,
  token?: string,
): Promise<{ alive: boolean; lastHeartbeat: string }> {
  return request(`/api/v1/agents/${encodeURIComponent(agentId)}/heartbeat`, {
    method: "POST",
    headers: bearer(token),
  });
}

// ─── Agent API token rotate / revoke (owner-wallet authed) ────────────────

export interface TokenChallengeInput {
  walletAddress: string;
  signature: string;
  /** The exact `message` returned by /api/v1/challenge (purpose 'agent-token'). */
  challenge: string;
}

/** Rotate (or first-issue) an agent's API token. Returns the plaintext once. */
export async function rotateAgentToken(
  agentId: string,
  input: TokenChallengeInput,
): Promise<{ agentId: string; apiKey: string; apiKeyCreatedAt: string; apiKeyWarning: string }> {
  return request(`/api/v1/agents/${encodeURIComponent(agentId)}/token`, { method: "POST", body: input });
}

/** Revoke an agent's active API token (locks runtime access until re-rotated). */
export async function revokeAgentToken(
  agentId: string,
  input: TokenChallengeInput,
): Promise<{ agentId: string; tokenRevoked: boolean }> {
  return request(`/api/v1/agents/${encodeURIComponent(agentId)}/token`, { method: "DELETE", body: input });
}

export interface UpdateAgentInput {
  walletAddress: string;
  signature: string;
  /** The exact `message` returned by /api/v1/challenge (purpose 'agent-manage'). */
  challenge: string;
  endpointUrl?: string;
  permissions?: AgentPermission[];
}

/** PATCH an agent you own (endpoint and/or permissions). Requires an agent-manage challenge. */
export async function updateAgent(agentId: string, input: UpdateAgentInput): Promise<AgentRecord> {
  return request<AgentRecord>(`/api/v1/agents/${encodeURIComponent(agentId)}`, { method: "PATCH", body: input });
}

/** DELETE (revoke) an agent you own. Requires an agent-manage challenge. */
export async function revokeAgent(
  agentId: string,
  input: { walletAddress: string; signature: string; challenge: string },
): Promise<{ revoked: boolean }> {
  return request(`/api/v1/agents/${encodeURIComponent(agentId)}`, { method: "DELETE", body: input });
}

export interface WalletProfile {
  walletAddress: string;
  handle: string | null;
  displayName: string | null;
  tier: number;
  verified: boolean;
  anchorBlock: number | null;
  ownedBlocks: number[];
}

/** Public read: resolve a wallet's verified profile + the blocks it owns. */
export async function getWalletProfile(address: string): Promise<WalletProfile> {
  return request<WalletProfile>(`/api/v1/users/by-wallet/${encodeURIComponent(address)}`);
}

export interface AgentEventRecord {
  id: string;
  agentId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export async function pollAgentEvents(
  agentId: string,
  opts: { since?: string; limit?: number; token?: string } = {},
): Promise<AgentEventRecord[]> {
  const q = new URLSearchParams();
  if (opts.since) q.set("since", opts.since);
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  const path = `/api/v1/agents/${encodeURIComponent(agentId)}/events${qs ? `?${qs}` : ""}`;
  return request<AgentEventRecord[]>(path, { headers: bearer(opts.token) });
}

// ─── Auth verify (block claim) ────────────────────────────────────────────

export interface AuthVerifyInput {
  walletAddress: string;
  signature: string;
  message: string;
  blockHeight?: number;
  handle?: string;
  displayName?: string;
  inscriptionId?: string;
}

export async function authVerify(input: AuthVerifyInput): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/v1/auth/verify", { method: "POST", body: input });
}

// ─── Experience hosting (self-hosted worlds on a block) ────────────────────

export type ExperienceType = "web" | "unreal" | "unity" | "godot" | "minecraft" | "vr" | "custom";
export type ExperienceTransport = "https" | "wss" | "webrtc" | "custom";
export type ExperienceStatus = "live" | "degraded" | "unreachable" | "pending";
export type ContentRating = "everyone" | "teen" | "mature";

/** Owner-authored manifest. This is the exact shape a `manifest.json` file holds. */
export interface ExperienceManifest {
  blockHeight: number;
  parcelIndex?: number;
  name: string;
  description?: string;
  experienceType: ExperienceType;
  entryUrl: string;
  transport: ExperienceTransport;
  healthUrl?: string;
  clientRequirements?: { platform?: string; minVersion?: string; downloadUrl?: string };
  capabilities?: string[];
  contentRating?: ContentRating;
  version: string;
}

export interface ExperienceRecord extends ExperienceManifest {
  id: string;
  walletAddress: string;
  status: ExperienceStatus;
  lastProbedAt: string | null;
  probeLatencyMs: number | null;
  soulJudged: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceListResult {
  experiences: ExperienceRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface RegisterExperienceInput extends ExperienceManifest {
  walletAddress: string;
  signature: string;
  /** The exact `message` returned by /api/v1/challenge (purpose 'experience-register'). */
  challenge: string;
}

/** Register a self-hosted experience on a block you own. */
export async function registerExperience(input: RegisterExperienceInput): Promise<ExperienceRecord> {
  return request<ExperienceRecord>("/api/v1/experiences", { method: "POST", body: input });
}

/** Public discovery: list experiences, filtered + paginated. */
export async function listExperiences(
  query: { blockHeight?: number; type?: ExperienceType; status?: ExperienceStatus; limit?: number; offset?: number } = {},
): Promise<ExperienceListResult> {
  const q = new URLSearchParams();
  if (query.blockHeight != null) q.set("blockHeight", String(query.blockHeight));
  if (query.type) q.set("type", query.type);
  if (query.status) q.set("status", query.status);
  if (query.limit != null) q.set("limit", String(query.limit));
  if (query.offset != null) q.set("offset", String(query.offset));
  const qs = q.toString();
  return request<ExperienceListResult>(`/api/v1/experiences${qs ? `?${qs}` : ""}`);
}

/** Public read: fetch a single experience (includes current probed status). */
export async function getExperience(id: string): Promise<ExperienceRecord> {
  return request<ExperienceRecord>(`/api/v1/experiences/${encodeURIComponent(id)}`);
}

/** Trigger a fresh server-side health probe (rate-limited 1/min). */
export async function probeExperience(id: string): Promise<ExperienceRecord> {
  return request<ExperienceRecord>(`/api/v1/experiences/${encodeURIComponent(id)}/probe`, { method: "POST" });
}

/** Terminally remove an experience you own. Requires an experience-manage challenge. */
export async function removeExperience(
  id: string,
  input: { walletAddress: string; signature: string; challenge: string },
): Promise<{ id: string; removed: boolean }> {
  return request(`/api/v1/experiences/${encodeURIComponent(id)}`, { method: "DELETE", body: input });
}
