/**
 * `bg session` — prove Bitcoin-native identity and hold the resulting credential.
 *
 *   bg session start --address bc1p… --block 840000   mint a scoped token
 *   bg session status                                  what this token may do
 *   bg session username <handle>                       claim a name (gated)
 *   bg session revoke                                  kill it now
 *
 * `start` runs the same two-step handshake the SDK and MCP server use:
 * challenge → BIP-322 signature → server-side on-chain ownership check → token.
 * The token is scoped to the blocks that actually verified, and every write
 * re-checks the chain, so a transferred bitmap stops working immediately.
 */

import {
  sessionStart,
  sessionVerify,
  sessionStatus,
  sessionRevoke,
  claimUsername,
  checkUsername,
  apiBase,
} from "../lib/bg-api";
import { signMessage } from "../lib/signer";
import { loadSessionToken, saveSession, clearSession } from "../lib/session-store";

export interface SessionOpts {
  address?: string;
  block?: number[];
  label?: string;
  sig?: string;
  json?: boolean;
}

export async function runSession(action: string, opts: SessionOpts = {}, arg?: string): Promise<void> {
  switch (action) {
    case "start":
      return start(opts);
    case "status":
      return status(opts);
    case "username":
      return username(arg, opts);
    case "revoke":
      return revoke(opts);
    default:
      fail(`Unknown action "${action}". Use: start | status | username | revoke`);
  }
}

/** The token every gated action needs, or a clear instruction on how to get one. */
function requireToken(): string {
  const token = loadSessionToken();
  if (!token) {
    fail(
      "No verified session. Run `bg session start --address <bc1p…> --block <height>` first — " +
        "connecting is not the same as being authorized.",
    );
  }
  return token;
}

async function start(opts: SessionOpts): Promise<void> {
  const walletAddress = opts.address || process.env.BG_WALLET_ADDRESS;
  if (!walletAddress) fail("--address <bc1p…> (or BG_WALLET_ADDRESS) is required");

  const blocks = opts.block ?? [];

  process.stderr.write(`[bg] challenge from ${apiBase()} ...\n`);
  const challenge = await sessionStart(walletAddress!);

  process.stderr.write(`[bg] signing challenge (nonce=${challenge.nonce.slice(0, 12)}…)\n`);
  const signature = await signMessage(challenge.message, { signatureFlag: opts.sig });

  process.stderr.write(
    blocks.length
      ? `[bg] verifying on-chain ownership of ${blocks.join(", ")} ...\n`
      : `[bg] verifying wallet (no blocks claimed — read-scoped session) ...\n`,
  );
  const session = await sessionVerify({
    walletAddress: walletAddress!,
    message: challenge.message,
    signature,
    blocks,
    ...(opts.label ? { label: opts.label } : {}),
  });

  saveSession({
    token: session.token,
    walletAddress: session.walletAddress,
    verifiedBlocks: session.verifiedBlocks,
    expiresAt: session.expiresAt,
  });

  if (opts.json) {
    // The token is deliberately omitted: --json output gets piped into logs.
    // It is on disk (0600) and in $BG_SESSION_TOKEN territory, not in stdout.
    const { token: _token, ...safe } = session;
    void _token;
    process.stdout.write(JSON.stringify(safe, null, 2) + "\n");
    return;
  }

  process.stdout.write(`✅ verified as ${session.walletAddress}\n`);
  process.stdout.write(
    session.verifiedBlocks.length
      ? `   blocks: ${session.verifiedBlocks.join(", ")}\n`
      : `   blocks: none — this session can read but not write\n`,
  );
  for (const r of session.rejected) {
    process.stdout.write(
      `   ⚠️  ${r.blockHeight}: ${r.reason}${r.retryable ? " (retryable)" : ""}\n`,
    );
  }
  process.stdout.write(`   expires: ${session.expiresAt}\n`);
}

async function status(opts: SessionOpts): Promise<void> {
  const info = await sessionStatus(requireToken());
  if (opts.json) {
    process.stdout.write(JSON.stringify(info, null, 2) + "\n");
    return;
  }
  process.stdout.write(`wallet:  ${info.walletAddress}\n`);
  process.stdout.write(`blocks:  ${info.verifiedBlocks.join(", ") || "none"}\n`);
  process.stdout.write(`write:   ${info.canWrite ? "yes" : "no"}\n`);
  process.stdout.write(`expires: ${info.expiresAt}\n`);
  process.stdout.write(
    `note:    blocks are the scope proven at verification time; every write re-checks the chain\n`,
  );
}

async function username(handle: string | undefined, opts: SessionOpts): Promise<void> {
  if (!handle) fail("A handle is required: bg session username <handle>");

  const availability = await checkUsername(handle!);
  if (!availability.available) fail(`"${handle}" is already taken`);

  const claimed = await claimUsername(requireToken(), handle!);
  if (opts.json) {
    process.stdout.write(JSON.stringify(claimed, null, 2) + "\n");
    return;
  }
  process.stdout.write(`✅ claimed @${claimed.handle} for ${claimed.walletAddress}\n`);
}

async function revoke(opts: SessionOpts): Promise<void> {
  const token = requireToken();
  try {
    const res = await sessionRevoke(token);
    if (opts.json) {
      process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    } else {
      process.stdout.write(res.revoked ? "✅ session revoked\n" : "session was already inactive\n");
    }
  } finally {
    // Drop the local copy either way — keeping a token the user asked to revoke
    // is the one outcome that is always wrong.
    clearSession();
  }
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(2);
}
