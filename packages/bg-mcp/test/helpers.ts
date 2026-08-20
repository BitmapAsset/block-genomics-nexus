import { vi } from "vitest";

/** Base URL every mocked test points at, so assertions never depend on prod. */
export const TEST_BASE = "https://api.test.invalid";

const BG_ENV_KEYS = ["BG_API_BASE", "BG_AGENT_TOKEN", "BG_API_KEY", "BG_SESSION_TOKEN", "BG_ENABLE_WRITES", "BG_TIMEOUT_MS"] as const;
type BgEnv = Partial<Record<(typeof BG_ENV_KEYS)[number], string>>;

export function clearBgEnv(): void {
  for (const k of BG_ENV_KEYS) delete process.env[k];
}

/**
 * client.ts snapshots env into module-level consts at import time, so every env
 * permutation needs a fresh module registry.
 */
export async function loadRaw(env: BgEnv = {}) {
  clearBgEnv();
  Object.assign(process.env, env);
  vi.resetModules();
  const client = await import("../src/client.js");
  const tools = await import("../src/tools.js");
  return { ...client, ...tools };
}

/** Same as {@link loadRaw} but pinned to {@link TEST_BASE} so nothing can reach prod. */
export const loadTools = (env: BgEnv = {}) => loadRaw({ BG_API_BASE: TEST_BASE, ...env });

export interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  rawBody: string | undefined;
  hasSignal: boolean;
}

export interface Served {
  status?: number;
  statusText?: string;
  body: unknown;
}

/**
 * Installs a recording `globalThis.fetch` double. Every request is dispatched to
 * `handler`; requests and served responses are captured for assertions.
 */
export function harness(handler: (rec: Recorded) => Served = () => ({ body: { ok: true } })) {
  const calls: Recorded[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: any, init: any = {}) => {
    const rec: Recorded = {
      url: String(input),
      method: (init.method ?? "GET").toUpperCase(),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body) : undefined,
      rawBody: init.body,
      hasSignal: Boolean(init.signal),
    };
    calls.push(rec);
    const { status = 200, statusText, body } = handler(rec);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: statusText ?? (status === 200 ? "OK" : "Error"),
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  }) as unknown as typeof fetch;

  return {
    calls,
    only: () => calls[0],
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export const env = (data: unknown) => ({ success: true, data });

/** The tools that must be exposed with no agent token and no write flag. */
export const PUBLIC_TOOL_NAMES = [
  "bg_stats",
  "bg_search",
  "bg_block",
  "bg_ownership_verify",
  "bg_agents_by_block",
  "bg_agent_briefs",
  "bg_badge",
  "bg_delegation_listings",
  "bg_game_elements",
  "bg_experiences",
  "bg_experience",
  "bg_experience_verify",
  "bg_profiles_by_block",
  "bg_profiles_by_wallet",
  "bg_user_by_wallet",
  "bg_world",
  "bg_guardians",
  "bg_guardian_chat",
  "bg_challenge",
  "bg_verify_start",
  "bg_verify_submit",
  "bg_username_available",
] as const;

/** Tools unlocked only by BG_AGENT_TOKEN / BG_API_KEY. */
export const AGENT_TOOL_NAMES = ["bg_agent_events", "bg_agent_heartbeat", "bg_agent_brief"] as const;

/**
 * Tools unlocked only by BG_SESSION_TOKEN — a `bg_vfy_` credential from
 * bg_verify_submit, which only exists behind BIP-322 + on-chain bitmap ownership.
 */
export const OWNER_TOOL_NAMES = [
  "bg_my_blocks",
  "bg_claim_username",
  "bg_session_revoke",
  "bg_world_create",
] as const;

/** Tools unlocked only by BG_ENABLE_WRITES=1. */
export const WRITE_TOOL_NAMES = [
  "bg_agent_register",
  "bg_experience_register",
  "bg_experience_update",
  "bg_experience_remove",
  "bg_auth_verify",
] as const;
