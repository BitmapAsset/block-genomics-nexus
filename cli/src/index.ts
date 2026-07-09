import { Command } from "commander";
import chalk from "chalk";
import { runInit } from "./commands/init";
import { runVerify } from "./commands/verify";
import { runVerifyReal } from "./commands/verify-real";
import { runRegisterAgent } from "./commands/register-agent";
import { runEventsPoll } from "./commands/events";
import { runHeartbeat } from "./commands/heartbeat";
import { runExplore } from "./commands/explore";
import { runBuild } from "./commands/build";
import { runConnect } from "./commands/connect";
import { runProfile } from "./commands/profile";
import { runWallet } from "./commands/wallet";
import { runMarket } from "./commands/market";
import { runAgent } from "./commands/agent";
import { runStatus } from "./commands/status";
import { banner } from "./lib/display";

export function createCLI() {
  const program = new Command();

  program
    .name("block-genomics")
    .description("Block Genomics CLI — Bitcoin-anchored identity for AI agents and humans")
    .version("0.2.0")
    .addHelpText("beforeAll", banner());

  program.command("init").description("Interactive setup wizard").action(runInit);

  // Legacy demo verify (kept for backward compat + demo mode)
  program
    .command("verify-demo")
    .description("[demo] verify with the mock wallet path (offline)")
    .option("--block <height>", "Block height", (v) => Number(v))
    .option("--json", "Output JSON")
    .action((options) => runVerify(options.block, options.json));

  // Real verify against api/v1/challenge + api/v1/auth/verify
  program
    .command("verify")
    .description("Verify block ownership against the real API")
    .option("--address <bc1p>", "Owner Bitcoin address (or set BG_WALLET_ADDRESS)")
    .option("--block <height>", "Block height to claim", (v) => Number(v))
    .option("--handle <name>", "Handle to claim (optional)")
    .option("--display-name <name>", "Display name (optional)")
    .option("--sig <bip322>", "Pre-supplied BIP-322 signature (else uses BG_SIGNATURE / BG_SIGNATURE_CMD)")
    .option("--json", "Output raw JSON")
    .action((options) => runVerifyReal({
      address: options.address, block: options.block,
      handle: options.handle, displayName: options.displayName,
      sig: options.sig, json: options.json,
    }));

  // Register an agent on a block you own
  program
    .command("register-agent")
    .description("Register a BitmapAgent on a block you own (challenge → sign → register)")
    .option("--address <bc1p>", "Owner Bitcoin address (or BG_WALLET_ADDRESS)")
    .option("--endpoint <url>", "Endpoint URL where the agent runs")
    .option("--block <height>", "Block height you own", (v) => Number(v))
    .option("--parcel <index>", "Optional parcel index", (v) => Number(v))
    .option("--tier <1|2|3>", "Tier (1=block,2=parcel,3=delegated)", (v) => Number(v))
    .option("--permissions <csv>", "Comma-separated permissions (default: READ_DMS,SEND_DMS)")
    .option("--sig <bip322>", "Pre-supplied BIP-322 signature")
    .option("--json", "Output raw JSON")
    .action((options) => runRegisterAgent(options));

  // Long-poll the event stream
  program
    .command("events [subcommand]")
    .description("Poll an agent's event stream (JSON lines). Usage: bg events poll --agent <id>")
    .option("--agent <id>", "Agent id (or BG_AGENT_ID)")
    .option("--since <iso>", "Only events after this ISO timestamp")
    .option("--limit <n>", "Max events per poll", (v) => Number(v))
    .option("--interval <sec>", "Poll interval seconds", (v) => Number(v))
    .option("--once", "Fetch one batch and exit")
    .action((subcommand, options) => runEventsPoll(subcommand, options));

  // Heartbeat
  program
    .command("heartbeat")
    .description("Send a heartbeat (single shot; --loop keeps it alive)")
    .option("--agent <id>", "Agent id (or BG_AGENT_ID)")
    .option("--interval <sec>", "Loop interval (default 30)", (v) => Number(v))
    .option("--loop", "Send repeatedly until Ctrl+C")
    .option("--json", "JSON output")
    .action((options) => runHeartbeat(options));

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
