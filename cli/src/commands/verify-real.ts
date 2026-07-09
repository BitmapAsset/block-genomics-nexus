/**
 * `bg verify` — REAL block ownership proof.
 *
 * Flow (mirrors docs/SDK.md):
 *   1. POST /api/v1/challenge { walletAddress, purpose:'auth' } → { message, nonce }
 *   2. Sign `message` via signer.ts.
 *   3. POST /api/v1/auth/verify { walletAddress, signature, message, blockHeight, handle? }
 */

import { requestChallenge, authVerify, apiBase } from "../lib/bg-api";
import { signMessage } from "../lib/signer";

interface VerifyRealOpts {
  address?: string;
  block?: number;
  handle?: string;
  displayName?: string;
  sig?: string;
  json?: boolean;
}

export async function runVerifyReal(opts: VerifyRealOpts): Promise<void> {
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS;
  if (!walletAddress) {
    fail("--address <bc1p...> (or BG_WALLET_ADDRESS) is required");
  }

  process.stderr.write(`[bg] challenge from ${apiBase()} ...\n`);
  const { message, nonce } = await requestChallenge(walletAddress!, "auth");
  process.stderr.write(`[bg] signing challenge (nonce=${nonce.slice(0, 12)}…)\n`);
  const signature = await signMessage(message, { signatureFlag: opts.sig });

  process.stderr.write(`[bg] verifying...\n`);
  const result = await authVerify({
    walletAddress: walletAddress!,
    signature,
    message,
    blockHeight: opts.block,
    handle: opts.handle,
    displayName: opts.displayName,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`✅ verified\n`);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(2);
}
