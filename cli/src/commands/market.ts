import chalk from "chalk";
import Table from "cli-table3";
import { getMarketListings, getPrice } from "../lib/api-client";

export async function runMarket(action: string, options: any) {
  if (action === "list") {
    const listings = getMarketListings(options.type);
    const table = new Table({ head: ["Type", "Block", "Price (sats)", "Status"] });
    listings.forEach((l) => {
      const status = l.status === "available" ? chalk.green(l.status) : chalk.yellow(l.status);
      table.push([l.type, `#${l.block}`, l.price.toLocaleString(), status]);
    });
    console.log(table.toString());
    return;
  }

  if (action === "rent") {
    console.log(chalk.cyanBright(`Rental request sent for block #${options.block}`));
    return;
  }

  if (action === "price") {
    const price = getPrice(options.block);
    console.log(chalk.cyanBright(`Current price for #${options.block}: ${price} sats`));
    return;
  }

  console.log(chalk.red("Unknown market action."));
}
