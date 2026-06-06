import ora from "ora";
import chalk from "chalk";
import { loadConfig, updateConfig } from "../lib/config";
import { pingResource } from "../lib/api-client";

export async function runConnect(resource: string, block?: number) {
  const config = loadConfig();
  const targetBlock = block ?? config.defaultBlock ?? 840000;

  const spinner = ora(`Validating ${resource}`).start();
  const ok = await pingResource(resource);
  if (!ok) {
    spinner.fail("Resource unreachable");
    return;
  }
  spinner.succeed("Resource reachable");

  const resources = config.resources ?? [];
  resources.push({ type: "External resource", value: resource, block: targetBlock, createdAt: new Date().toISOString() });
  updateConfig({ resources });

  console.log(chalk.greenBright(`Reachability confirmed; linked ${resource} to block #${targetBlock} (local record).`));
  console.log(chalk.gray("Note: the reachability probe is real; the on-chain link requires a signed world deploy."));
}
