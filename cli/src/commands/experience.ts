/**
 * `bg experience <action>` — attach & manage self-hosted worlds on a block.
 *
 *   bg experience register [--manifest ./manifest.json] --address <bc1p>
 *   bg experience list [--block <h>] [--type <t>] [--status <s>]
 *   bg experience status --id <expId> [--probe]
 *   bg experience remove --id <expId> --address <bc1p>
 *
 * `register` / `remove` are ownership-scoped: they fetch a single-use server
 * challenge, sign it (BIP-322), and the server re-verifies on-chain ownership —
 * the SAME fail-closed path as `bg register-agent`. The CLI never holds a key;
 * it resolves the signature via --sig / BG_SIGNATURE / BG_SIGNATURE_CMD.
 *
 * Nexus is the registry + discovery + health layer. It never hosts your world.
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";
import {
  requestChallenge,
  registerExperience,
  listExperiences,
  getExperience,
  probeExperience,
  removeExperience,
  apiBase,
  ExperienceManifest,
  ExperienceRecord,
  ExperienceType,
  ExperienceStatus,
} from "../lib/bg-api";
import { signMessage } from "../lib/signer";

export interface ExperienceOpts {
  manifest?: string;
  address?: string;
  block?: number;
  type?: string;
  status?: string;
  id?: string;
  limit?: number;
  probe?: boolean;
  sig?: string;
  json?: boolean;
}

export async function runExperience(action: string, opts: ExperienceOpts = {}): Promise<void> {
  switch (action) {
    case "register": return registerCmd(opts);
    case "list": return listCmd(opts);
    case "status": return statusCmd(opts);
    case "remove": return removeCmd(opts);
    default:
      console.log(chalk.red(`Unknown experience action: ${action}`));
      console.log("Try: bg experience register | list | status | remove");
  }
}

// ─── register ────────────────────────────────────────────────────────────────

const REQUIRED_MANIFEST_FIELDS: (keyof ExperienceManifest)[] = [
  "blockHeight",
  "name",
  "experienceType",
  "entryUrl",
  "transport",
  "version",
];

function loadManifest(file: string): ExperienceManifest {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    fail(`manifest not found: ${abs}\n  Create a manifest.json (see: bg experience register --help) or pass --manifest <path>.`);
  }
  let parsed: ExperienceManifest;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, "utf8")) as ExperienceManifest;
  } catch (e) {
    fail(`manifest is not valid JSON (${abs}): ${(e as Error).message}`);
  }
  const missing = REQUIRED_MANIFEST_FIELDS.filter((k) => parsed[k] == null || parsed[k] === "");
  if (missing.length) fail(`manifest is missing required field(s): ${missing.join(", ")}`);
  return parsed;
}

async function registerCmd(opts: ExperienceOpts): Promise<void> {
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS;
  if (!walletAddress) fail("--address <bc1p…> (or BG_WALLET_ADDRESS) is required");

  const manifest = loadManifest(opts.manifest || "manifest.json");

  process.stderr.write(`[bg] challenge (purpose=experience-register) from ${apiBase()}\n`);
  const { message, nonce } = await requestChallenge(walletAddress!, "experience-register");
  process.stderr.write(`[bg] signing challenge (nonce=${nonce.slice(0, 12)}…)\n`);
  const signature = await signMessage(message, { signatureFlag: opts.sig });

  process.stderr.write(`[bg] registering experience "${manifest.name}" on block #${manifest.blockHeight}…\n`);
  const exp = await registerExperience({
    ...manifest,
    walletAddress: walletAddress!,
    signature,
    challenge: message,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(exp, null, 2) + "\n");
    return;
  }
  process.stdout.write(`✅ experience registered\n`);
  printExperience(exp);
  process.stdout.write(`\n  Discover it: bg experience list --block ${exp.blockHeight}\n`);
  process.stdout.write(`  Check health: bg experience status --id ${exp.id}\n`);
}

// ─── list ────────────────────────────────────────────────────────────────────

async function listCmd(opts: ExperienceOpts): Promise<void> {
  const page = await listExperiences({
    blockHeight: opts.block,
    type: opts.type as ExperienceType | undefined,
    status: opts.status as ExperienceStatus | undefined,
    limit: opts.limit,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(page, null, 2) + "\n");
    return;
  }
  if (page.experiences.length === 0) {
    console.log("No experiences found for that query.");
    return;
  }
  console.log(chalk.bold(`Experiences (${page.experiences.length} of ${page.total}):`));
  for (const e of page.experiences) {
    console.log(
      `  ${statusDot(e.status)} ${chalk.cyan(e.id)}  ${e.name}  ${chalk.gray(`[${e.experienceType}]`)}  block #${e.blockHeight}`,
    );
    console.log(`     ${chalk.gray(e.entryUrl)}`);
  }
}

// ─── status ──────────────────────────────────────────────────────────────────

async function statusCmd(opts: ExperienceOpts): Promise<void> {
  if (!opts.id) fail("--id <experienceId> is required");
  const exp = opts.probe ? await probeExperience(opts.id!) : await getExperience(opts.id!);

  if (opts.json) {
    process.stdout.write(JSON.stringify(exp, null, 2) + "\n");
    return;
  }
  printExperience(exp);
}

// ─── remove ──────────────────────────────────────────────────────────────────

async function removeCmd(opts: ExperienceOpts): Promise<void> {
  if (!opts.id) fail("--id <experienceId> is required");
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS;
  if (!walletAddress) fail("--address <bc1p…> (or BG_WALLET_ADDRESS) is required");

  process.stderr.write(`[bg] challenge (purpose=experience-manage) from ${apiBase()}\n`);
  const { message, nonce } = await requestChallenge(walletAddress!, "experience-manage");
  process.stderr.write(`[bg] signing challenge (nonce=${nonce.slice(0, 12)}…)\n`);
  const signature = await signMessage(message, { signatureFlag: opts.sig });

  const res = await removeExperience(opts.id!, { walletAddress: walletAddress!, signature, challenge: message });
  if (opts.json) {
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    return;
  }
  process.stdout.write(`✅ experience ${opts.id} removed (terminal)\n`);
}

// ─── display helpers ─────────────────────────────────────────────────────────

function statusDot(status: ExperienceStatus): string {
  switch (status) {
    case "live": return chalk.green("●");
    case "degraded": return chalk.yellow("●");
    case "unreachable": return chalk.red("●");
    default: return chalk.gray("○");
  }
}

function printExperience(exp: ExperienceRecord): void {
  const probed = exp.lastProbedAt
    ? `${exp.lastProbedAt}${exp.probeLatencyMs != null ? ` (${exp.probeLatencyMs}ms)` : ""}`
    : "never";
  process.stdout.write(`  id:          ${exp.id}\n`);
  process.stdout.write(`  name:        ${exp.name}\n`);
  process.stdout.write(`  type:        ${exp.experienceType}\n`);
  process.stdout.write(`  block:       #${exp.blockHeight}${exp.parcelIndex != null ? ` / parcel ${exp.parcelIndex}` : ""}\n`);
  process.stdout.write(`  entryUrl:    ${exp.entryUrl}\n`);
  process.stdout.write(`  transport:   ${exp.transport}\n`);
  process.stdout.write(`  status:      ${statusDot(exp.status)} ${exp.status}\n`);
  process.stdout.write(`  lastProbed:  ${probed}\n`);
  process.stdout.write(`  soulJudged:  ${exp.soulJudged}\n`);
  process.stdout.write(`  version:     ${exp.version}\n`);
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(2);
}
