import inquirer from "inquirer";
import chalk from "chalk";
import { runVerify } from "./verify";

export async function runAgent(action: string) {
  if (action === "verify") {
    await runVerify(undefined, true);
    return;
  }

  if (action === "start") {
    console.log(chalk.cyanBright("Agent mode active. Type a command or 'exit'."));
    while (true) {
      const { cmd } = await inquirer.prompt([
        { type: "input", name: "cmd", message: "agent>" },
      ]);
      if (!cmd || cmd.trim() === "exit") break;
      if (cmd.includes("verify")) {
        await runVerify(undefined, true);
      } else {
        console.log(JSON.stringify({ ok: true, action: cmd }, null, 2));
      }
    }
    return;
  }

  console.log(chalk.red("Unknown agent action."));
}
