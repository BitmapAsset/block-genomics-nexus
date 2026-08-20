import chalk from "chalk";
import Table from "cli-table3";
import { getMarketListings } from "../lib/api-client";
import { ApiError } from "../lib/api";

// `invokedAs` keeps the deprecated `bg market` alias byte-identical on stdout:
// lines that name the command render whichever name the caller actually typed.
export async function runRentals(action: string, options: any, invokedAs = "rentals") {
  if (action === "list") {
    let listings;
    try {
      listings = await getMarketListings(options.block ? { blockHeight: options.block } : {});
    } catch (e) {
      console.log(chalk.red(e instanceof ApiError ? e.message : String(e)));
      return;
    }
    if (listings.length === 0) {
      console.log(chalk.yellow("No active delegation/rental listings right now."));
      return;
    }
    const table = new Table({ head: ["Block", "Parcel", "Tier", "Owner", "Spots", "30d (sats)", "365d (sats)"] });
    listings.forEach((l) => {
      table.push([
        `#${l.blockHeight}${l.label ? ` (${l.label})` : ""}`,
        l.parcelTxIndex === null ? "whole" : `#${l.parcelTxIndex}`,
        `${l.tier}`,
        l.ownerHandle ? `@${l.ownerHandle}` : "—",
        `${l.spotsUsed}/${l.spotsTotal === -1 ? "∞" : l.spotsTotal}`,
        l.price30d.toLocaleString(),
        l.price365d.toLocaleString(),
      ]);
    });
    console.log(table.toString());
    console.log(chalk.gray("\nLive delegation listings from /api/v1/delegations/listings."));
    return;
  }

  if (action === "rent") {
    console.log(chalk.yellow("Renting a delegation requires a signed (BIP-322) purchase request."));
    console.log(chalk.gray("This CLI holds no keys and does not sign — renting is not wired here."));
    console.log(chalk.gray("Use the web app, or POST a signed request to /api/v1/delegations/purchase."));
    return;
  }

  if (action === "price") {
    console.log(chalk.yellow("There is no live spot-price endpoint — pricing is per-listing."));
    console.log(chalk.gray(`Run \`bg ${invokedAs} list\` to see real 30d / 365d delegation prices.`));
    return;
  }

  console.log(chalk.red(`Unknown ${invokedAs} action. Use: list | rent | price`));
}
