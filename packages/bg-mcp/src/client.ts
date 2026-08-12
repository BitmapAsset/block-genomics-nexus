const BASE = (process.env.BG_API_BASE ?? "https://blockgenomics.io").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.BG_TIMEOUT_MS ?? 20000);

export const AGENT_TOKEN = process.env.BG_AGENT_TOKEN ?? process.env.BG_API_KEY;

/**
 * A verified-ownership session token (`bg_vfy_…`) from the bg_verify_submit flow.
 * Unlocks the ownership-gated tools; obtained by signing a challenge with the
 * wallet that holds your .bitmap inscription.
 */
export const SESSION_TOKEN = process.env.BG_SESSION_TOKEN;

/**
 * Both credential kinds ride the same `Authorization: Bearer` header — the
 * server tells them apart by prefix. An agent token wins when both are set,
 * since it is the narrower, longer-lived runtime credential.
 */
export const BEARER = AGENT_TOKEN ?? SESSION_TOKEN;

export const WRITES_ENABLED = process.env.BG_ENABLE_WRITES === "1";

export type Query = Record<string, string | number | boolean | undefined | null>;

export async function call(
  path: string,
  opts: { method?: string; query?: Query; body?: unknown; auth?: boolean } = {},
): Promise<string> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { accept: "application/json, image/svg+xml;q=0.9, */*;q=0.8" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth) {
    if (!BEARER) {
      throw new Error(
        "No credential configured. Set BG_AGENT_TOKEN for agent runtime tools, or BG_SESSION_TOKEN " +
          "with a bg_vfy_ token from bg_verify_submit for ownership-gated tools.",
      );
    }
    headers.authorization = `Bearer ${BEARER}`;
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    // res.statusText is empty on HTTP/2 (spec drops the reason phrase). Compose
    // the status label so the error string stays clean instead of "404  — body".
    const status = res.statusText ? `${res.status} ${res.statusText}` : `${res.status}`;
    throw new Error(`${status} — ${text.slice(0, 600)}`);
  }
  return text;
}
