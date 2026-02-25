import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { banner, panel } from "../lib/display";
import { searchBitmapHeights } from "../lib/bitmap-api";
import { ensureWallet } from "../lib/wallet-bridge";
import { saveConfig } from "../lib/config";

export async function runInit() {
  console.log(banner());
  console.log(panel("Welcome", "Let’s link your wallet and anchor your Block Genomics identity."));

  const walletSpinner = ora("Connecting wallet").start();
  const wallet = ensureWallet();
  await new Promise((r) => setTimeout(r, 800));
  walletSpinner.succeed(`Wallet linked: ${chalk.cyan(wallet.address)}`);

  const bitmapSpinner = ora("Detecting Bitmaps").start();
  await new Promise((r) => setTimeout(r, 900));
  const bitmaps = searchBitmapHeights();
  bitmapSpinner.succeed(`Found ${bitmaps.length} Bitmaps`);

  const { block } = await inquirer.prompt([
    {
      type: "list",
      name: "block",
      message: "Choose your primary block",
      choices: bitmaps.map((height) => ({ name: `#${height}`, value: height })),
    },
  ]);

  const { handle } = await inquirer.prompt([
    {
      type: "input",
      name: "handle",
      message: "Choose a profile handle",
      validate: (input: string) => /^[a-z0-9_]{3,20}$/.test(input) || "3-20 chars, lowercase + underscore",
    },
  ]);

  saveConfig({
    wallet,
    defaultBlock: block,
    profile: { handle },
  });

  console.log(chalk.greenBright("\nSetup complete!"));
  console.log(chalk.gray("Run `bg verify` to generate your genome hash."));
}
