// Persist the agent's one-time API token to a local file so a restart resumes
// the same agent instead of hitting the 24h registration cooldown. The token is
// a live credential, so the file is written owner-only (0600) and gitignored.

import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

export interface StoredCreds {
  agentId: string;
  token: string;
  address: string;
  blockHeight: number;
}

export function loadCreds(file: string): StoredCreds | null {
  if (!existsSync(file)) return null;
  try {
    const c = JSON.parse(readFileSync(file, 'utf8')) as StoredCreds;
    return c.agentId && c.token ? c : null;
  } catch {
    return null; // corrupt file → treat as no creds; the agent will re-register
  }
}

export function saveCreds(file: string, creds: StoredCreds): void {
  writeFileSync(file, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function clearCreds(file: string): void {
  if (existsSync(file)) rmSync(file);
}
