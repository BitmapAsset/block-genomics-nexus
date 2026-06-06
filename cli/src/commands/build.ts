import inquirer from "inquirer";
import chalk from "chalk";
import { loadConfig, updateConfig } from "../lib/config";

export async function runBuild(block?: number) {
  const config = loadConfig();
  const targetBlock = block ?? config.defaultBlock ?? 840000;

  const { type } = await inquirer.prompt([
    {
      type: "list",
      name: "type",
      message: "What do you want to deploy?",
      choices: [
        "Website/URL",
        "API endpoint",
        "File storage (IPFS)",
        "Custom metadata",
        "Agent service",
      ],
    },
  ]);

  const { value } = await inquirer.prompt([
    { type: "input", name: "value", message: "Enter the resource URL/metadata" },
  ]);

  const resources = config.resources ?? [];
  resources.push({ type, value, block: targetBlock, createdAt: new Date().toISOString() });
  updateConfig({ resources });

  console.log(chalk.greenBright(`\n${type} recorded locally for block #${targetBlock}.`));
  console.log(chalk.yellow("Note: this is a LOCAL draft, not an on-chain/API deployment."));
  console.log(
    chalk.gray(
      "Real world-object deploys require a BIP-322-signed request with a one-time challenge nonce\n" +
        "(POST /api/v1/world). This CLI holds no keys and does not sign — wiring a signer is pending."
    )
  );
}
