import chalk from "chalk";

export function renderHelix(hash: string, turns = 10, width = 34) {
  const chars = ["⟋", "⟍", "⟋", "⟍", "⟋", "⟍"];
  const colors = [chalk.cyanBright, chalk.magentaBright, chalk.greenBright, chalk.hex("#F5C542")];
  const rows: string[] = [];
  for (let i = 0; i < turns; i++) {
    const left = i % 2 === 0 ? "◉" : "◍";
    const right = i % 2 === 0 ? "◍" : "◉";
    const color = colors[i % colors.length];
    const mid = "·".repeat(width - 4);
    const motif = `${left}${chars[i % chars.length]}${mid}${chars[(i + 3) % chars.length]}${right}`;
    rows.push(color(motif));
  }
  const hashLine = chalk.gray(hash.slice(0, 16) + "…" + hash.slice(-8));
  return rows.join("\n") + "\n" + hashLine;
}
