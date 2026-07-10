/**
 * `bg my-blocks` — list the blocks a wallet owns (public read; no signature needed).
 * Ownership-scoped: shows only what the given wallet has verified on-chain.
 */

import { getWalletProfile, apiBase } from "../lib/bg-api";
import { loadConfig } from "../lib/config";

interface MyBlocksOpts {
  address?: string;
  json?: boolean;
}

export async function runMyBlocks(opts: MyBlocksOpts): Promise<void> {
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS || loadConfig().wallet?.address;
  if (!walletAddress) fail("--address <bc1p…> (or BG_WALLET_ADDRESS) is required");

  process.stderr.write(`[bg] resolving ${walletAddress} via ${apiBase()}\n`);
  let profile;
  try {
    profile = await getWalletProfile(walletAddress!);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      process.stdout.write("No verified profile for this wallet yet. Run: bg verify --block <height>\n");
      return;
    }
    throw e;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(profile, null, 2) + "\n");
    return;
  }

  const blocks = (profile.ownedBlocks || []).slice().sort((a, b) => a - b);
  process.stdout.write(`Wallet: ${profile.walletAddress}\n`);
  process.stdout.write(`Tier:   ${profile.tier}${profile.verified ? " (verified)" : ""}\n`);
  if (profile.handle) process.stdout.write(`Handle: @${profile.handle}\n`);
  if (blocks.length === 0) {
    process.stdout.write("Owned blocks: none yet\n");
  } else {
    process.stdout.write(`Owned blocks (${blocks.length}): ${blocks.map((b) => `#${b}`).join(", ")}\n`);
  }
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(2);
}
