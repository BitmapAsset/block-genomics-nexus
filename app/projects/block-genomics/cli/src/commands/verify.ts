import ora from "ora";
import chalk from "chalk";
import { computeGenomeHash } from "../lib/genome";
import { mockTrustFactors, computeTrustScore } from "../lib/trust-score";
import { getMockBlockData } from "../lib/bitmap-api";
import { signMessageBIP322 } from "../lib/bip322";
import { loadConfig, updateConfig } from "../lib/config";
import { dnaVisualization, panel, printKeyValues } from "../lib/display";

export async function runVerify(block?: number, json = false) {
  const config = loadConfig();
  const targetBlock = block ?? config.defaultBlock ?? 840000;

  const spinner = ora(`Verifying block #${targetBlock}`).start();
  const nonce = `challenge:${Math.random().toString(36).slice(2)}`;
  const signature = signMessageBIP322(nonce, config.wallet?.address ?? "bc1qmockwalletaddressxyz");
  const blockData = getMockBlockData(targetBlock);
  const genomeHash = computeGenomeHash(blockData);
  const trustScore = computeTrustScore(mockTrustFactors());
  await new Promise((r) => setTimeout(r, 900));
  spinner.succeed("Verification complete");

  updateConfig({
    verification: {
      genomeHash,
      trustScore,
      block: targetBlock,
      verifiedAt: new Date().toISOString(),
    },
  });

  if (json) {
    console.log(JSON.stringify({ block: targetBlock, genomeHash, trustScore, signature }, null, 2));
    return;
  }

  console.log(panel("Genome Hash", dnaVisualization(genomeHash)));
  console.log(
    printKeyValues([
      ["Block", `#${targetBlock}`],
      ["Trust Score", `${trustScore}`],
      ["Signature", signature.slice(0, 24) + "…"],
    ])
  );

  console.log(chalk.gray("\nGenome locked to block — ready for deployment."));
}
