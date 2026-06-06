import chalk from "chalk";
import { getOwnership, getBlock, getWorld, ApiError } from "../lib/api";
import { deriveGenomeHash } from "../lib/genome";
import { panel, printKeyValues } from "../lib/display";

// Real, read-only block lookup — the fastest "get started" command for an
// external agent. Hits the live public API: ownership/verify + blocks/[h] + world.
export async function runBlock(height: number, json = false) {
  if (!height || Number.isNaN(height)) {
    console.log(chalk.red("Provide a block height: bg block <height>"));
    return;
  }

  let ownership, world;
  let blockRecord = null;
  try {
    [ownership, world] = await Promise.all([getOwnership(height), getWorld(height)]);
  } catch (e) {
    console.log(chalk.red(e instanceof ApiError ? e.message : String(e)));
    return;
  }
  try {
    blockRecord = await getBlock(height);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) {
      console.log(chalk.red(e instanceof ApiError ? e.message : String(e)));
      return;
    }
  }

  const ownerAddress = ownership.onChainOwner || ownership.dbOwner;
  const genomeHash = ownerAddress ? deriveGenomeHash(height, ownerAddress) : null;

  if (json) {
    console.log(
      JSON.stringify(
        {
          height,
          onChainOwner: ownership.onChainOwner,
          dbOwner: ownership.dbOwner,
          dbOnChainMatch: ownership.match,
          inscriptionId: ownership.inscriptionId,
          label: blockRecord?.label ?? null,
          ownerHandle: blockRecord?.owner?.handle ?? null,
          tier: blockRecord?.owner?.tier ?? null,
          parcelCount: blockRecord?.parcelCount ?? null,
          worldObjects: world.objects.length,
          hasTerrain: Boolean(world.terrain),
          genomeHash,
        },
        null,
        2
      )
    );
    return;
  }

  const rows: [string, string][] = [
    ["Height", `#${height}`],
    ["Label", blockRecord?.label ?? "—"],
    ["On-chain owner", ownership.onChainOwner ?? "—"],
    ["Handle", blockRecord?.owner?.handle ? `@${blockRecord.owner.handle}` : "—"],
    ["Tier", blockRecord?.owner?.tier != null ? `${blockRecord.owner.tier}` : "—"],
    ["Inscription", ownership.inscriptionId ?? "—"],
    ["DB ↔ chain", ownership.match ? chalk.green("match") : chalk.yellow("mismatch")],
    ["Parcels", `${blockRecord?.parcelCount ?? 0}`],
    ["World objects", `${world.objects.length}`],
    ["Terrain", world.terrain ? "set" : "none"],
    ["Genome", genomeHash ? genomeHash.slice(0, 26) + "…" : "—"],
  ];

  console.log(panel(`Block #${height}`, printKeyValues(rows)));
  console.log(chalk.gray("Live data from /api/v1 (ownership/verify, blocks, world)."));
}
