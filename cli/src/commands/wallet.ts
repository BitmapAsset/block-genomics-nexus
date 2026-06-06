import chalk from "chalk";
import { ensureWallet } from "../lib/wallet-bridge";

// NOTE: This is a LOCAL DEMO wallet. The CLI holds no real keys and cannot
// sign Bitcoin transactions or BIP-322 messages. Balances and purchases are
// local bookkeeping only — nothing touches the chain or the live API.
export async function runWallet(action: string, _args: string[]) {
  const wallet = ensureWallet();

  if (action === "balance") {
    console.log(chalk.cyanBright(`Demo balance: ${wallet.balance.toLocaleString()} sats`));
    console.log(chalk.gray(`Demo address: ${wallet.address}`));
    console.log(chalk.yellow("\nThis is a local demo wallet — no real keys, no on-chain state."));
    return;
  }

  if (action === "buy-bitmap" || action === "buy-parcel") {
    console.log(chalk.yellow("Buying requires a real wallet that can sign and broadcast Bitcoin transactions."));
    console.log(chalk.gray("This CLI is read-first and holds no keys — purchasing is not wired here."));
    console.log(chalk.gray("Acquire Bitmaps via an ordinals marketplace, then `bg verify --block <height>`."));
    return;
  }

  console.log(chalk.red("Unknown wallet action. Use: balance"));
}
