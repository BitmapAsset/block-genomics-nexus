import inquirer from "inquirer";
import chalk from "chalk";
import { getWallet, updateBalance, ensureWallet } from "../lib/wallet-bridge";
import { getPrice } from "../lib/api-client";

export async function runWallet(action: string, args: string[]) {
  ensureWallet();
  const wallet = getWallet();
  if (!wallet) return;

  if (action === "balance") {
    console.log(chalk.cyanBright(`Balance: ${wallet.balance.toLocaleString()} sats`));
    return;
  }

  if (action === "buy-bitmap") {
    const height = Number(args[0]);
    const price = getPrice(height);
    const { confirm } = await inquirer.prompt([
      { type: "confirm", name: "confirm", message: `Buy Bitmap #${height} for ${price} sats?` },
    ]);
    if (!confirm) return;
    updateBalance(-price);
    console.log(chalk.greenBright(`Bitmap #${height} purchased.`));
    return;
  }

  if (action === "buy-parcel") {
    const parcel = args[0];
    const price = 45000;
    const { confirm } = await inquirer.prompt([
      { type: "confirm", name: "confirm", message: `Buy parcel ${parcel} for ${price} sats?` },
    ]);
    if (!confirm) return;
    updateBalance(-price);
    console.log(chalk.greenBright(`Parcel ${parcel} purchased.`));
    return;
  }

  console.log(chalk.red("Unknown wallet action."));
}
