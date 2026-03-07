import blessed from "blessed";
import chalk from "chalk";
import { getMockBlockInfo } from "../lib/bitmap-api";

const epochColors: Record<string, (text: string) => string> = {
  gold: chalk.hex("#F5C542"),
  cyan: chalk.cyanBright,
  purple: chalk.magentaBright,
  green: chalk.greenBright,
  emerald: chalk.hex("#2EE59D"),
};

export function launchMap(startHeight = 840000) {
  const screen = blessed.screen({ smartCSR: true, title: "Block Genomics Nexus" });

  const mapBox = blessed.box({
    top: 0,
    left: 0,
    width: "70%",
    height: "100%",
    border: "line",
    label: " Nexus Map ",
    style: { border: { fg: "cyan" } },
  });

  const detailBox = blessed.box({
    top: 0,
    left: "70%",
    width: "30%",
    height: "100%",
    border: "line",
    label: " Block Details ",
    style: { border: { fg: "magenta" } },
    tags: true,
  });

  const searchBox = blessed.textbox({
    parent: detailBox,
    bottom: 1,
    left: 1,
    width: "95%",
    height: 3,
    border: "line",
    label: " Search block ",
    inputOnFocus: true,
  });

  let cursorX = 0;
  let cursorY = 0;
  const cols = 24;
  const rows = 18;

  function render() {
    const lines: string[] = [];
    for (let y = 0; y < rows; y++) {
      let line = "";
      for (let x = 0; x < cols; x++) {
        const height = startHeight + y * cols + x;
        const info = getMockBlockInfo(height);
        const char = info.claimed ? "█" : "▒";
        const color = epochColors[info.epoch] || chalk.white;
        let cell = color(char);
        if (x === cursorX && y === cursorY) {
          cell = chalk.inverse(cell);
        }
        line += cell;
      }
      lines.push(line);
    }
    mapBox.setContent(lines.join("\n"));
    updateDetails();
    screen.render();
  }

  function updateDetails() {
    const height = startHeight + cursorY * cols + cursorX;
    const info = getMockBlockInfo(height);
    const status = info.claimed ? chalk.green("Claimed") : chalk.yellow("Unclaimed");
    detailBox.setContent(
      `${chalk.bold("Block")}: ${height}\n` +
        `${chalk.bold("Epoch")}: ${info.epoch}\n` +
        `${chalk.bold("Status")}: ${status}\n` +
        `${chalk.bold("Owner")}: ${info.owner ?? "—"}\n\n` +
        chalk.gray("Arrows to navigate • Enter to select • / to search")
    );
  }

  screen.key(["escape", "q", "C-c"], () => process.exit(0));
  screen.key(["left"], () => {
    cursorX = Math.max(0, cursorX - 1);
    render();
  });
  screen.key(["right"], () => {
    cursorX = Math.min(cols - 1, cursorX + 1);
    render();
  });
  screen.key(["up"], () => {
    cursorY = Math.max(0, cursorY - 1);
    render();
  });
  screen.key(["down"], () => {
    cursorY = Math.min(rows - 1, cursorY + 1);
    render();
  });
  screen.key(["enter"], () => {
    const height = startHeight + cursorY * cols + cursorX;
    detailBox.setContent(detailBox.getContent() + `\n\n${chalk.cyan("Selected")}: ${height}`);
    screen.render();
  });
  screen.key(["/"], () => {
    searchBox.focus();
    searchBox.readInput((err, value) => {
      if (err) return;
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        const offset = parsed - startHeight;
        cursorY = Math.max(0, Math.min(rows - 1, Math.floor(offset / cols)));
        cursorX = Math.max(0, Math.min(cols - 1, offset % cols));
      }
      mapBox.focus();
      render();
    });
  });

  screen.append(mapBox);
  screen.append(detailBox);
  render();
  mapBox.focus();
}
