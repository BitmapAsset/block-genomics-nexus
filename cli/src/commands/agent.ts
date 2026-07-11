/**
 * `bg agent <action>` — manage the BitmapAgents you own.
 *
 *   bg agent list                          list agents registered from this machine
 *   bg agent update --agent <id> --endpoint <url> [--permissions csv] --address <bc1p>
 *   bg agent revoke --agent <id> --address <bc1p>
 *   bg agent verify                        (legacy) run the block verify flow
 *
 * `update` / `revoke` are ownership-scoped: they fetch a server 'agent-manage'
 * challenge, sign it, and the server verifies BIP-322 AND that the signer owns
 * the agent. The challenge is single-use, so a captured signature cannot be
 * replayed to mutate or revoke someone else's agent.
 */

import chalk from "chalk";
import inquirer from "inquirer";
import { runVerify } from "./verify";
import {
  requestChallenge,
  updateAgent,
  revokeAgent,
  rotateAgentToken,
  revokeAgentToken,
  apiBase,
  AgentPermission,
} from "../lib/bg-api";
import { signMessage } from "../lib/signer";
import { loadConfig } from "../lib/config";

export interface AgentOpts {
  agent?: string;
  address?: string;
  endpoint?: string;
  permissions?: string; // comma-separated
  sig?: string;
  json?: boolean;
}

export async function runAgent(action: string, opts: AgentOpts = {}, sub?: string): Promise<void> {
  switch (action) {
    case "list": return listAgents(opts);
    case "update": return updateAgentCmd(opts);
    case "revoke": return revokeAgentCmd(opts);
    case "token": return tokenCmd(sub, opts);
    case "verify": await runVerify(undefined, true); return;
    case "start": return startRepl();
    default:
      console.log(chalk.red(`Unknown agent action: ${action}`));
      console.log("Try: bg agent list | update | revoke | token rotate|revoke | verify");
  }
}

function knownAgents() {
  const cfg = loadConfig();
  return Array.isArray(cfg.agents) ? cfg.agents : [];
}

function resolveAgentId(opts: AgentOpts): string {
  const id = opts.agent || process.env.BG_AGENT_ID || knownAgents()[0]?.id;
  if (!id) fail("--agent <id> is required (no agents found in ~/.block-genomics/config.json)");
  return id!;
}

function listAgents(opts: AgentOpts): void {
  const agents = knownAgents();
  if (opts.json) {
    process.stdout.write(JSON.stringify(agents, null, 2) + "\n");
    return;
  }
  if (agents.length === 0) {
    console.log("No agents registered from this machine. Run: bg register-agent …");
    return;
  }
  console.log(chalk.bold(`Agents registered from this machine (${agents.length}):`));
  for (const a of agents) {
    console.log(`  ${chalk.cyan(a.id)}  block #${a.blockHeight}  ${a.walletAddress}`);
  }
}

async function updateAgentCmd(opts: AgentOpts): Promise<void> {
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS;
  if (!walletAddress) fail("--address <bc1p…> (or BG_WALLET_ADDRESS) is required");
  const agentId = resolveAgentId(opts);
  if (!opts.endpoint && !opts.permissions) fail("Nothing to update — pass --endpoint and/or --permissions");

  const perms = opts.permissions
    ? (opts.permissions.split(",").map((s) => s.trim()).filter(Boolean) as AgentPermission[])
    : undefined;

  process.stderr.write(`[bg] challenge (purpose=agent-manage) from ${apiBase()}\n`);
  const { message, nonce } = await requestChallenge(walletAddress!, "agent-manage");
  process.stderr.write(`[bg] signing challenge (nonce=${nonce.slice(0, 12)}…)\n`);
  const signature = await signMessage(message, { signatureFlag: opts.sig });

  const updated = await updateAgent(agentId, {
    walletAddress: walletAddress!,
    signature,
    challenge: message,
    ...(opts.endpoint ? { endpointUrl: opts.endpoint } : {}),
    ...(perms ? { permissions: perms } : {}),
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(updated, null, 2) + "\n");
    return;
  }
  process.stdout.write(`✅ agent updated\n`);
  process.stdout.write(`  id:          ${updated.id}\n`);
  process.stdout.write(`  endpointUrl: ${updated.endpointUrl}\n`);
  process.stdout.write(`  permissions: ${updated.permissions.join(", ")}\n`);
}

async function revokeAgentCmd(opts: AgentOpts): Promise<void> {
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS;
  if (!walletAddress) fail("--address <bc1p…> (or BG_WALLET_ADDRESS) is required");
  const agentId = resolveAgentId(opts);

  process.stderr.write(`[bg] challenge (purpose=agent-manage) from ${apiBase()}\n`);
  const { message, nonce } = await requestChallenge(walletAddress!, "agent-manage");
  process.stderr.write(`[bg] signing challenge (nonce=${nonce.slice(0, 12)}…)\n`);
  const signature = await signMessage(message, { signatureFlag: opts.sig });

  const res = await revokeAgent(agentId, { walletAddress: walletAddress!, signature, challenge: message });
  if (opts.json) {
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    return;
  }
  process.stdout.write(`✅ agent ${agentId} revoked\n`);
}

async function tokenCmd(sub: string | undefined, opts: AgentOpts): Promise<void> {
  const action = (sub || "").toLowerCase();
  if (action !== "rotate" && action !== "revoke") {
    fail("Usage: bg agent token rotate|revoke --agent <id> --address <bc1p>");
  }
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS;
  if (!walletAddress) fail("--address <bc1p…> (or BG_WALLET_ADDRESS) is required");
  const agentId = resolveAgentId(opts);

  process.stderr.write(`[bg] challenge (purpose=agent-token) from ${apiBase()}\n`);
  const { message, nonce } = await requestChallenge(walletAddress!, "agent-token");
  process.stderr.write(`[bg] signing challenge (nonce=${nonce.slice(0, 12)}…)\n`);
  const signature = await signMessage(message, { signatureFlag: opts.sig });

  if (action === "rotate") {
    const res = await rotateAgentToken(agentId, { walletAddress: walletAddress!, signature, challenge: message });
    if (opts.json) {
      process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      return;
    }
    process.stdout.write(`✅ token rotated for agent ${agentId}\n`);
    process.stdout.write(`\n  ┌─ NEW API TOKEN (store now — shown only once) ─────────────\n`);
    process.stdout.write(`  │  ${res.apiKey}\n`);
    process.stdout.write(`  └───────────────────────────────────────────────────────────\n`);
    process.stdout.write(`  The previous token is now invalid.\n`);
    return;
  }

  const res = await revokeAgentToken(agentId, { walletAddress: walletAddress!, signature, challenge: message });
  if (opts.json) {
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    return;
  }
  process.stdout.write(`✅ token revoked for agent ${agentId} — runtime calls will 401 until you rotate a new key.\n`);
}

async function startRepl(): Promise<void> {
  console.log(chalk.cyanBright("Agent mode active. Type a command or 'exit'."));
  while (true) {
    const { cmd } = await inquirer.prompt([{ type: "input", name: "cmd", message: "agent>" }]);
    if (!cmd || cmd.trim() === "exit") break;
    if (cmd.includes("verify")) await runVerify(undefined, true);
    else console.log(JSON.stringify({ ok: true, action: cmd }, null, 2));
  }
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(2);
}
