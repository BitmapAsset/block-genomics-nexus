/**
 * Signature acquisition for CLI commands.
 *
 * The CLI does NOT hold private keys. It resolves a BIP-322 signature over a
 * given message via one of three routes, in priority order:
 *
 *   1. Pre-supplied via CLI flag (`--sig` / `--signature`).
 *   2. Pre-supplied via env `BG_SIGNATURE` (matches the single message about
 *      to be signed — useful for a one-shot register).
 *   3. `BG_SIGNATURE_CMD` shell command: the message is written to stdin, and
 *      the command must print the raw BIP-322 signature on stdout (trimmed).
 *      This lets users plug in Sparrow's CLI, an HSM helper, `bip322-cli`,
 *      or even a hardware wallet script — without shipping wallet code here.
 *
 * All routes ultimately produce a string the server verifies with bip322-js.
 */

import { spawnSync } from "child_process";

export interface SignerOptions {
  /** Signature already supplied on the CLI (highest priority). */
  signatureFlag?: string;
}

export async function signMessage(message: string, opts: SignerOptions = {}): Promise<string> {
  if (opts.signatureFlag) return opts.signatureFlag.trim();

  if (process.env.BG_SIGNATURE && process.env.BG_SIGNATURE.trim()) {
    return process.env.BG_SIGNATURE.trim();
  }

  const cmd = process.env.BG_SIGNATURE_CMD;
  if (cmd && cmd.trim()) {
    // Run shell command with the message on stdin.
    const res = spawnSync("sh", ["-c", cmd], {
      input: message,
      encoding: "utf8",
      timeout: 60_000,
    });
    if (res.status !== 0) {
      throw new Error(
        `BG_SIGNATURE_CMD failed (exit ${res.status}): ${(res.stderr || "").trim() || "no stderr"}`,
      );
    }
    const sig = (res.stdout || "").trim();
    if (!sig) throw new Error("BG_SIGNATURE_CMD produced empty signature");
    return sig;
  }

  throw new Error(
    [
      "No BIP-322 signature source configured.",
      "Options:",
      "  --sig <bip322-signature>                (one-shot flag)",
      "  BG_SIGNATURE=<sig>                       (env, one-shot)",
      "  BG_SIGNATURE_CMD='sparrow sign-message'  (env, command reads message on stdin, prints sig on stdout)",
      "",
      `Message to sign:`,
      `  ${message}`,
    ].join("\n"),
  );
}
