import { Command } from "commander";
import chalk from "chalk";
import { runInit } from "./commands/init";
import { runVerify } from "./commands/verify";
import { runExplore } from "./commands/explore";
import { runBuild } from "./commands/build";
import { runConnect } from "./commands/connect";
import { runProfile } from "./commands/profile";
import { runWallet } from "./commands/wallet";
import { runMarket } from "./commands/market";
import { runAgent } from "./commands/agent";
import { runStatus } from "./commands/status";
import { runBlock } from "./commands/block";
import { banner } from "./lib/display";

export function createCLI() {
  const program = new Command();

  program
    .name("bg")
    .description("Block Genomics CLI")
    .version("0.1.0")
    .addHelpText("beforeAll", banner());

  program.command("init").description("Interactive setup wizard").action(runInit);

  program
    .command("verify")
    .description("Verify block ownership")
    .option("--block <height>", "Block height", (v) => Number(v))
    .option("--json", "Output JSON")
    .action((options) => runVerify(options.block, options.json));

  program
    .command("block <height>")
    .description("Look up real on-chain ownership + world data for a block")
    .option("--json", "Output JSON")
    .action((height, options) => runBlock(Number(height), options.json));

  program.command("explore").description("Explore the Nexus map").action(runExplore);

  program
    .command("build")
    .description("Deploy resources to a block")
    .requiredOption("--block <height>", "Block height", (v) => Number(v))
    .action((options) => runBuild(options.block));

  program
    .command("connect")
    .description("Connect an external resource")
    .requiredOption("--resource <url>", "Resource URL")
    .option("--block <height>", "Block height", (v) => Number(v))
    .action((options) => runConnect(options.resource, options.block));

  program
    .command("profile <action>")
    .description("Profile management")
    .option("--handle <name>")
    .option("--name <displayName>")
    .option("--bio <bio>")
    .option("--link-x <handle>")
    .action((action, options) => runProfile(action, options));

  program
    .command("wallet <action> [args...]")
    .description("Wallet operations")
    .action((action, args) => runWallet(action, args));

  program
    .command("market <action>")
    .description("Marketplace")
    .option("--type <type>")
    .option("--block <height>", "Block height", (v) => Number(v))
    .action((action, options) => runMarket(action, options));

  program
    .command("agent <action>")
    .description("AI agent mode")
    .action((action) => runAgent(action));

  program.command("status").description("Show current status").action(runStatus);

  program.on("command:*", () => {
    console.log(chalk.red("Unknown command."));
    program.help();
  });

  return program;
}
