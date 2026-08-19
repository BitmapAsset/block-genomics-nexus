/**
 * On-disk store for the `bg_vfy_` verified-session token.
 *
 * Kept OUT of `config.json` on purpose. That file holds preferences, is printed
 * in support threads, and is written with default permissions; a bearer token
 * that authorizes writes against someone's Bitcoin block does not belong in it.
 * This file is written `0600` (owner read/write only) and holds nothing else.
 *
 * `BG_SESSION_TOKEN` in the environment always wins, so CI and ephemeral agents
 * can run without ever touching the disk.
 */

import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".block-genomics");
const SESSION_PATH = path.join(CONFIG_DIR, "session.json");

/** Owner read/write only. The token authorizes writes; treat it like a key. */
const SECRET_MODE = 0o600;

export interface StoredSession {
  token: string;
  walletAddress: string;
  verifiedBlocks: number[];
  expiresAt: string;
}

/**
 * The active token, if any: environment first, then disk.
 *
 * An expired stored token is treated as absent — reporting "verified" for a
 * credential the server will reject just moves the failure later.
 */
export function loadSessionToken(): string | null {
  const fromEnv = process.env.BG_SESSION_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const stored = loadSession();
  if (!stored) return null;
  if (Date.parse(stored.expiresAt) <= Date.now()) return null;
  return stored.token;
}

/** The full stored record, or null when absent or unreadable. */
export function loadSession(): StoredSession | null {
  try {
    if (!fs.existsSync(SESSION_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(SESSION_PATH, "utf8")) as StoredSession;
    return typeof parsed?.token === "string" && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist a freshly minted session, replacing any previous one. */
export function saveSession(session: StoredSession): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  // `mode` only applies when the file is CREATED, so chmod after write to also
  // tighten a file that already existed with looser permissions.
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2), { mode: SECRET_MODE });
  fs.chmodSync(SESSION_PATH, SECRET_MODE);
}

/** Forget the local token. Safe to call when nothing is stored. */
export function clearSession(): void {
  try {
    fs.rmSync(SESSION_PATH, { force: true });
  } catch {
    /* nothing to clear */
  }
}

export { SESSION_PATH };
