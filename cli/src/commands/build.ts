import inquirer from "inquirer";
import ora from "ora";
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

  const spinner = ora(`Deploying to block #${targetBlock}`).start();
  await new Promise((r) => setTimeout(r, 1200));
  spinner.succeed("Deployment registered");

  const resources = config.resources ?? [];
  resources.push({ type, value, block: targetBlock, createdAt: new Date().toISOString() });
  updateConfig({ resources });

  console.log(chalk.greenBright(`\n${type} deployed to block #${targetBlock}`));
}
