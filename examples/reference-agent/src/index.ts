// The hello-world Nexus agent.
//
// Lifecycle:
//   1. Load a keypair and build a BIP-322 signer (the SDK never sees the key).
//   2. Resume from a stored token, or register on a block you own (one-time token).
//   3. Heartbeat on an interval so the network sees the agent as alive.
//   4. Long-poll the private event stream and log each event.
//   5. On Ctrl-C, gracefully revoke the token and exit.
//
// Run with `npm start` (loads .env). See README.md for a 5-minute setup.

import { existsSync } from 'node:fs';
import { BlockGenomicsClient, BlockGenomicsError } from 'block-genomics-connect';
import { loadConfig } from './config.js';
import { walletSigner } from './signer.js';
import { loadCreds, saveCreds, clearCreds, type StoredCreds } from './token-store.js';

// Auto-load .env (Node ≥20.6, zero-dependency). On older Node, export vars yourself.
if (typeof process.loadEnvFile === 'function' && existsSync('.env')) process.loadEnvFile('.env');

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`${ts()}  ${m}`);
const warn = (m: string) => console.warn(`${ts()}  ! ${m}`);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const cfg = loadConfig();
  const signer = walletSigner(cfg.wif, cfg.addressType);
  const bg = new BlockGenomicsClient({ baseUrl: cfg.apiBaseUrl, signer });
  log(`wallet ${signer.address}  →  ${cfg.apiBaseUrl}`);

  // ── 1/2: resume or register ────────────────────────────────────────────────
  let creds = loadCreds(cfg.credsFile);
  if (creds && creds.address === signer.address && creds.blockHeight === cfg.blockHeight) {
    log(`resuming agent ${creds.agentId} (token from ${cfg.credsFile})`);
  } else {
    creds = await register(bg, cfg, signer.address);
    saveCreds(cfg.credsFile, creds);
    log(`registered agent ${creds.agentId} — token stored in ${cfg.credsFile}`);
  }
  const agentId = creds.agentId;
  let token = creds.token;

  // A runtime call may 401 if the token was revoked/rotated elsewhere. The owner
  // wallet can always mint a fresh one, so recover in place instead of crashing.
  const recover = async (where: string, e: unknown): Promise<void> => {
    if (e instanceof BlockGenomicsError && e.status === 401) {
      warn(`${where}: token rejected (401) — rotating a fresh one with the owner wallet…`);
      const rotated = await bg.rotateAgentToken(agentId);
      token = rotated.apiKey;
      saveCreds(cfg.credsFile, { agentId, token, address: signer.address, blockHeight: cfg.blockHeight });
      log('token rotated and re-stored');
    } else {
      warn(`${where}: ${errMsg(e)}`);
    }
  };

  // ── 5: graceful shutdown ────────────────────────────────────────────────────
  let stopping = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const shutdown = async (sig: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log(`${sig} — shutting down…`);
    if (heartbeat) clearInterval(heartbeat);
    if (cfg.revokeOnExit) {
      try {
        await bg.revokeAgentToken(agentId);
        clearCreds(cfg.credsFile);
        log('token revoked; runtime access is now locked until the owner rotates a new key');
      } catch (e) {
        warn(`revoke on exit failed: ${errMsg(e)}`);
      }
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // ── 3: heartbeat on an interval ─────────────────────────────────────────────
  const beat = async (): Promise<void> => {
    try {
      const r = await bg.heartbeat(agentId, token);
      log(`heartbeat ok (lastHeartbeat ${r.lastHeartbeat})`);
    } catch (e) {
      await recover('heartbeat', e);
    }
  };
  await beat();
  heartbeat = setInterval(() => { if (!stopping) void beat(); }, cfg.heartbeatMs);

  // ── 4: long-poll the private event stream ───────────────────────────────────
  log(`polling events every ${cfg.pollMs / 1000}s — Ctrl-C to stop`);
  let since: string | undefined;
  while (!stopping) {
    try {
      const events = await bg.getAgentEvents(agentId, token, { since, limit: 50 });
      // The API returns newest-first; print oldest-first and advance the cursor.
      for (const ev of [...events].reverse()) {
        if (since && ev.timestamp <= since) continue;
        log(`event  ${ev.type}  ${ev.timestamp}  ${JSON.stringify(ev.payload)}`);
        since = ev.timestamp;
      }
    } catch (e) {
      await recover('events', e);
    }
    await sleep(cfg.pollMs);
  }
}

/** Register on the configured block; explain the common 403 (not your block) clearly. */
async function register(
  bg: BlockGenomicsClient,
  cfg: ReturnType<typeof loadConfig>,
  address: string,
): Promise<StoredCreds> {
  log(`registering on block ${cfg.blockHeight} (tier ${cfg.tier}, ${cfg.permissions.join(',')})…`);
  try {
    const agent = await bg.registerAgent({
      blockHeight: cfg.blockHeight,
      endpointUrl: cfg.endpointUrl,
      tier: cfg.tier,
      permissions: cfg.permissions,
    });
    return { agentId: agent.id, token: agent.apiKey, address, blockHeight: cfg.blockHeight };
  } catch (e) {
    if (e instanceof BlockGenomicsError && e.status === 403) {
      warn(`Registration refused (403): ${address} does not own block ${cfg.blockHeight} on-chain.`);
      warn(`Own the block's .bitmap inscription with this wallet, then retry.`);
      warn(`Docs: ${cfg.apiBaseUrl}/docs · Spec: ${cfg.apiBaseUrl}/protocol`);
      process.exit(1);
    }
    if (e instanceof BlockGenomicsError && e.status === 429) {
      warn(`Registration cooldown (429): one registration per wallet per 24h. Reuse the stored token or wait.`);
      process.exit(1);
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(`${ts()}  fatal: ${errMsg(e)}`);
  process.exit(1);
});
