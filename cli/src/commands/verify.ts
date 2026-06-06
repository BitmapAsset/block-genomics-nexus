import ora from "ora";
import chalk from "chalk";
import { deriveGenomeHash } from "../lib/genome";
import { getOwnership, getBlock, requestChallenge, ApiError } from "../lib/api";
import { loadConfig, updateConfig } from "../lib/config";
import { dnaVisualization, panel, printKeyValues } from "../lib/display";

// `bg verify` performs a REAL, read-only on-chain ownership check against the
// live Block Genomics API. It does NOT fake a successful identity claim:
// claiming a block as your own identity requires signing a BIP-322 challenge
// with your wallet, which this CLI does not do (no key custody).
export async function runVerify(block?: number, json = false) {
  const config = loadConfig();
  const targetBlock = block ?? config.defaultBlock ?? config.verification?.block;

  if (!targetBlock) {
    console.log(chalk.red("No block specified. Use --block <height> (e.g. bg verify --block 718222)."));
    return;
  }

  const spinner = ora(`Checking on-chain ownership for block #${targetBlock}`).start();

  let ownership;
  try {
    ownership = await getOwnership(targetBlock);
  } catch (e) {
    spinner.fail("Ownership check failed");
    const msg = e instanceof ApiError ? e.message : String(e);
    console.log(chalk.red(msg));
    return;
  }

  // Enrich with the registered block record (handle/tier/label) when present.
  let ownerHandle: string | null = null;
  let tier: number | null = null;
  let label: string | null = null;
  try {
    const blockRecord = await getBlock(targetBlock);
    ownerHandle = blockRecord.owner?.handle ?? null;
    tier = blockRecord.owner?.tier ?? null;
    label = blockRecord.label ?? null;
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) {
      spinner.fail("Block lookup failed");
      console.log(chalk.red(e instanceof ApiError ? e.message : String(e)));
      return;
    }
  }

  spinner.succeed("On-chain ownership resolved");

  const ownerAddress = ownership.onChainOwner || ownership.dbOwner;
  // The genome is a deterministic function of block height + owner address —
  // this is the REAL genome the server derives for the verified owner.
  const genomeHash = ownerAddress ? deriveGenomeHash(targetBlock, ownerAddress) : null;

  if (ownerAddress && genomeHash) {
    updateConfig({
      verification: {
        genomeHash,
        block: targetBlock,
        verifiedAt: new Date().toISOString(),
        ownerAddress,
        onChainMatch: ownership.match,
      },
    });
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          block: targetBlock,
          claimed: Boolean(ownerAddress),
          onChainOwner: ownership.onChainOwner,
          dbOwner: ownership.dbOwner,
          ownerHandle,
          tier,
          label,
          inscriptionId: ownership.inscriptionId,
          dbOnChainMatch: ownership.match,
          genomeHash,
          lastChecked: ownership.lastChecked,
          note:
            "Read-only on-chain ownership check. To claim this block as your own identity you must sign a BIP-322 challenge with the owning wallet (not wired in this CLI).",
        },
        null,
        2
      )
    );
    return;
  }

  if (!ownerAddress) {
    console.log(panel("Block #" + targetBlock, chalk.yellow("Unclaimed — no on-chain owner found.")));
    return;
  }

  console.log(panel("Genome Hash", dnaVisualization(genomeHash!)));
  console.log(
    printKeyValues([
      ["Block", `#${targetBlock}${label ? ` (${label})` : ""}`],
      ["On-chain owner", ownerAddress],
      ["Handle", ownerHandle ? `@${ownerHandle}` : "—"],
      ["Tier", tier !== null ? `${tier}` : "—"],
      ["Inscription", ownership.inscriptionId ?? "—"],
      ["DB ↔ chain match", ownership.match ? chalk.green("yes") : chalk.yellow("no")],
      ["Genome", genomeHash!.slice(0, 26) + "…"],
    ])
  );

  console.log(
    chalk.gray(
      "\nThis is a read-only on-chain ownership check against the live API."
    )
  );
  console.log(
    chalk.yellow(
      "To CLAIM this block as your own identity, you must sign a BIP-322 challenge with the owning wallet."
    )
  );
  console.log(
    chalk.gray(
      "This CLI holds no keys and does not sign — wallet signing is not wired. Use the web app at /verify, or wire a signer."
    )
  );

  // Offer the real next step honestly: fetch a live challenge nonce to sign.
  try {
    const challenge = await requestChallenge(ownerAddress, "auth");
    console.log(chalk.gray("\nNext step (manual): sign this live challenge with your wallet, then POST to /api/v1/auth/verify:"));
    console.log(chalk.gray(`  message: ${challenge.message}`));
  } catch {
    // Non-fatal — the read result above already stands on its own.
  }
}
