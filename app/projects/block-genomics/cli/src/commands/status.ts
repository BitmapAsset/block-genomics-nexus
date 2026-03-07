import chalk from "chalk";
import { loadConfig } from "../lib/config";
import { panel, printKeyValues, miniHelix } from "../lib/display";

export async function runStatus() {
  const config = loadConfig();
  const verification = config.verification;
  const hash = verification?.genomeHash ?? "pending";

  const body =
    printKeyValues([
      ["Block", verification ? `#${verification.block}` : "—"],
      ["Handle", config.profile ? `@${config.profile.handle}` : "—"],
      ["Trust Score", verification ? `${verification.trustScore}` : "—"],
      ["Tier", verification ? "Tier 1" : "—"],
      ["Resources", `${config.resources?.length ?? 0}`],
    ]) + `\n\n${miniHelix(hash)}`;

  console.log(panel("Status", body));
  if (!verification) {
    console.log(chalk.gray("Run bg verify to generate your genome hash."));
  }
}
