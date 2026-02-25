import inquirer from "inquirer";
import chalk from "chalk";
import { loadConfig, updateConfig } from "../lib/config";
import { miniHelix, panel, printKeyValues } from "../lib/display";

export async function runProfile(action: string, options: any) {
  const config = loadConfig();

  if (action === "create") {
    const handle = options.handle as string;
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      console.log(chalk.red("Handle must be 3-20 chars, lowercase alphanumeric + underscores."));
      return;
    }
    updateConfig({ profile: { handle } });
    console.log(chalk.greenBright(`Profile created: @${handle}`));
    return;
  }

  if (action === "show") {
    const profile = config.profile;
    if (!profile) {
      console.log(chalk.yellow("No profile configured. Run bg init or bg profile create."));
      return;
    }
    const hash = config.verification?.genomeHash ?? "pending";
    const body =
      printKeyValues([
        ["Handle", `@${profile.handle}`],
        ["Name", profile.name ?? "—"],
        ["Bio", profile.bio ?? "—"],
      ]) + `\n\n${miniHelix(hash)}`;
    console.log(panel("Profile", body));
    return;
  }

  if (action === "edit") {
    const { name, bio, linkX } = options;
    const profile = config.profile ?? { handle: "" };
    profile.name = name ?? profile.name;
    profile.bio = bio ?? profile.bio;
    if (linkX) {
      profile.links = { ...(profile.links ?? {}), x: linkX };
    }
    updateConfig({ profile });
    console.log(chalk.greenBright("Profile updated."));
    return;
  }

  if (action === "delete") {
    const { confirm } = await inquirer.prompt([
      { type: "confirm", name: "confirm", message: "Delete profile?", default: false },
    ]);
    if (!confirm) return;
    updateConfig({ profile: undefined });
    console.log(chalk.red("Profile deleted."));
    return;
  }

  console.log(chalk.red("Unknown profile action."));
}
