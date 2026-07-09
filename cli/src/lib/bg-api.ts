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
  purpose: "auth" | "agent-register" | "world" = "auth",
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

export async function registerAgent(input: RegisterAgentInput): Promise<AgentRecord> {
  return request<AgentRecord>("/api/v1/agents/register", { method: "POST", body: input });
}

export async function heartbeatAgent(agentId: string): Promise<{ alive: boolean; lastHeartbeat: string }> {
  return request(`/api/v1/agents/${encodeURIComponent(agentId)}/heartbeat`, { method: "POST" });
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
  opts: { since?: string; limit?: number } = {},
): Promise<AgentEventRecord[]> {
  const q = new URLSearchParams();
  if (opts.since) q.set("since", opts.since);
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  const path = `/api/v1/agents/${encodeURIComponent(agentId)}/events${qs ? `?${qs}` : ""}`;
  return request<AgentEventRecord[]>(path);
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
