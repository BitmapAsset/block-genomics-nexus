/**
 * `bg register-agent` — REAL agent registration.
 *
 * Requires: block ownership + BIP-322 signature over the challenge.
 * Emits agent id + records the mapping into ~/.block-genomics/config.json so
 * subsequent `bg events poll` / `bg heartbeat` calls default to it.
 */

import { requestChallenge, registerAgent, apiBase, AgentPermission } from "../lib/bg-api";
import { signMessage } from "../lib/signer";
import { loadConfig, saveConfig } from "../lib/config";

interface RegisterAgentOpts {
  address?: string;
  endpoint?: string;
  block?: number;
  parcel?: number;
  tier?: 1 | 2 | 3;
  permissions?: string; // comma-separated
  sig?: string;
  json?: boolean;
}

const DEFAULT_PERMS: AgentPermission[] = ["READ_DMS", "SEND_DMS"];

export async function runRegisterAgent(opts: RegisterAgentOpts): Promise<void> {
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS;
  if (!walletAddress) fail("--address <bc1p...> (or BG_WALLET_ADDRESS) is required");
  if (!opts.endpoint) fail("--endpoint <url> is required (where your agent runs)");
  if (opts.block == null) fail("--block <height> is required");

  const tier = (opts.tier || 1) as 1 | 2 | 3;
  const perms: AgentPermission[] = opts.permissions
    ? (opts.permissions.split(",").map((s) => s.trim()).filter(Boolean) as AgentPermission[])
    : DEFAULT_PERMS;

  process.stderr.write(`[bg] challenge (purpose=agent-register) from ${apiBase()}\n`);
  const { message, nonce } = await requestChallenge(walletAddress!, "agent-register");
  process.stderr.write(`[bg] signing challenge (nonce=${nonce.slice(0, 12)}…)\n`);
  const signature = await signMessage(message, { signatureFlag: opts.sig });

  process.stderr.write(`[bg] registering agent for block #${opts.block}...\n`);
  const agent = await registerAgent({
    walletAddress: walletAddress!,
    endpointUrl: opts.endpoint!,
    blockHeight: opts.block!,
    parcelIndex: opts.parcel ?? null,
    tier,
    permissions: perms,
    signature,
    challenge: message,
  });

  // Persist for downstream commands
  try {
    const cfg = loadConfig();
    const list = Array.isArray(cfg.agents) ? cfg.agents : [];
    list.push({ id: agent.id, blockHeight: agent.blockHeight, walletAddress: agent.walletAddress, createdAt: new Date().toISOString() });
    saveConfig({ ...cfg, agents: list });
  } catch { /* config write is best-effort */ }

  if (opts.json) {
    process.stdout.write(JSON.stringify(agent, null, 2) + "\n");
  } else {
    process.stdout.write(`✅ agent registered\n`);
    process.stdout.write(`  id:          ${agent.id}\n`);
    process.stdout.write(`  block:       #${agent.blockHeight}\n`);
    process.stdout.write(`  endpointUrl: ${agent.endpointUrl}\n`);
    process.stdout.write(`  tier:        ${agent.tier}\n`);
    process.stdout.write(`  status:      ${agent.status}\n`);
  }
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(2);
}
