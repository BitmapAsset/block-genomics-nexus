import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { banner, panel } from "../lib/display";
import { getOwnership, ApiError } from "../lib/api";
import { getApiBase, saveConfig } from "../lib/config";

export async function runInit() {
  console.log(banner());
  console.log(panel("Welcome", `Set up a Block Genomics identity against ${getApiBase()}.`));
  console.log(
    chalk.gray(
      "Note: this CLI is read-first and holds no keys. It cannot auto-detect Bitmaps in a real wallet,\n" +
        "so enter the block height of a Bitmap you own. Ownership is verified live, on-chain.\n"
    )
  );

  const { block } = await inquirer.prompt([
    {
      type: "input",
      name: "block",
      message: "Block height to anchor to",
      validate: (input: string) => /^\d+$/.test(input.trim()) || "Enter a numeric block height",
      filter: (input: string) => input.trim(),
    },
  ]);
  const blockHeight = Number(block);

  const spinner = ora(`Checking on-chain ownership for #${blockHeight}`).start();
  try {
    const ownership = await getOwnership(blockHeight);
    const owner = ownership.onChainOwner || ownership.dbOwner;
    if (owner) {
      spinner.succeed(`Block #${blockHeight} is owned on-chain by ${owner.slice(0, 16)}…`);
    } else {
      spinner.warn(`Block #${blockHeight} has no on-chain owner yet (unclaimed).`);
    }
  } catch (e) {
    spinner.fail("Ownership check failed");
    console.log(chalk.red(e instanceof ApiError ? e.message : String(e)));
    return;
  }

  const { handle } = await inquirer.prompt([
    {
      type: "input",
      name: "handle",
      message: "Choose a profile handle",
      validate: (input: string) =>
        /^[a-z0-9_]{3,20}$/.test(input) || "3-20 chars, lowercase + underscore",
    },
  ]);

  saveConfig({ defaultBlock: blockHeight, profile: { handle } });

  console.log(chalk.greenBright("\nSetup complete."));
  console.log(chalk.gray(`Run \`bg verify --block ${blockHeight}\` for the full on-chain genome readout.`));
}
