import chalk from "chalk";
import boxen from "boxen";
import { renderHelix } from "../ui/helix";

export const brand = {
  gold: chalk.hex("#F5C542"),
  cyan: chalk.cyanBright,
  purple: chalk.magentaBright,
  green: chalk.greenBright,
  emerald: chalk.hex("#2EE59D"),
};

export function banner() {
  const lines = [
    "  ____  _            _       ____                            _          ",
    " | __ )| | ___   ___| | __  / ___| ___ _ __   ___  _ __ ___ (_) ___ ___ ",
    " |  _ \\| |/ _ \\ / __| |/ / | |  _ / _ \\ '_ \\ / _ \\| '_ ` _ \\| |/ __/ __|",
    " | |_) | | (_) | (__|   <  | |_| |  __/ | | | (_) | | | | | | | (__\\__ \\",
    " |____/|_|\\___/ \\___|_|\\_\\  \\____|\\___|_| |_|\\___/|_| |_| |_|_|\\___|___/",
  ];
  return brand.cyan(lines.join("\n"));
}

export function panel(title: string, body: string) {
  return boxen(body, {
    padding: 1,
    margin: 0,
    borderStyle: "round",
    title,
    titleAlignment: "center",
    borderColor: "cyan",
  });
}

export function printKeyValues(rows: Array<[string, string]>) {
  const longest = Math.max(...rows.map((r) => r[0].length));
  return rows
    .map(([k, v]) => `${chalk.gray(k.padEnd(longest))}  ${chalk.white(v)}`)
    .join("\n");
}

export function dnaVisualization(hash: string) {
  return renderHelix(hash);
}

export function miniHelix(hash: string) {
  return renderHelix(hash, 6, 22);
}
