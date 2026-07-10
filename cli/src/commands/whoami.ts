/**
 * `bg whoami` — show the wallet this CLI is configured with, its verified tier,
 * and the agents registered from this machine.
 */

import { getWalletProfile } from "../lib/bg-api";
import { loadConfig } from "../lib/config";

interface WhoamiOpts {
  address?: string;
  json?: boolean;
}

export async function runWhoami(opts: WhoamiOpts): Promise<void> {
  const cfg = loadConfig();
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS || cfg.wallet?.address;
  const agents = Array.isArray(cfg.agents) ? cfg.agents : [];

  if (!walletAddress) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ walletAddress: null, profile: null, agents }, null, 2) + "\n");
      return;
    }
    process.stdout.write("No wallet configured. Set BG_WALLET_ADDRESS or run: bg verify --address <bc1p…>\n");
    return;
  }

  let profile = null;
  try {
    profile = await getWalletProfile(walletAddress);
  } catch {
    /* unverified wallet or offline — fall through to the unverified view */
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ walletAddress, profile, agents }, null, 2) + "\n");
    return;
  }

  process.stdout.write(`Wallet: ${walletAddress}\n`);
  if (profile) {
    process.stdout.write(`Tier:   ${profile.tier}${profile.verified ? " (verified)" : ""}\n`);
    if (profile.handle) process.stdout.write(`Handle: @${profile.handle}\n`);
    process.stdout.write(`Owned blocks: ${(profile.ownedBlocks || []).length}\n`);
  } else {
    process.stdout.write("Status: not verified yet (run: bg verify --block <height>)\n");
  }
  process.stdout.write(`Agents registered here: ${agents.length}\n`);
}
