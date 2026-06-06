import fs from "fs";
import path from "path";
import os from "os";

export type Profile = {
  handle: string;
  name?: string;
  bio?: string;
  links?: Record<string, string>;
};

export type Config = {
  apiBaseUrl?: string;
  wallet?: {
    address: string;
    balance: number;
  };
  defaultBlock?: number;
  profile?: Profile;
  verification?: {
    genomeHash: string;
    block: number;
    verifiedAt: string;
    ownerAddress?: string | null;
    onChainMatch?: boolean;
  };
  resources?: Array<{ type: string; value: string; block: number; createdAt: string }>;
};

const CONFIG_DIR = path.join(os.homedir(), ".block-genomics");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_PATH)) return {};
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as Config;
}

export function saveConfig(config: Config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function updateConfig(patch: Partial<Config>) {
  const current = loadConfig();
  const next = { ...current, ...patch } as Config;
  saveConfig(next);
  return next;
}

const DEFAULT_API_BASE = "https://blockgenomics.io";

// Resolve the live API base: env var > saved config > default.
// Trailing slashes are stripped so callers can concatenate "/api/v1/...".
export function getApiBase(): string {
  const fromEnv = process.env.BLOCKGENOMICS_API_URL;
  const raw = fromEnv || loadConfig().apiBaseUrl || DEFAULT_API_BASE;
  return raw.replace(/\/+$/, "");
}

export { CONFIG_PATH, DEFAULT_API_BASE };
