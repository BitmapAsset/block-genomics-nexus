"use client";

import Link from "next/link";
import { useState } from "react";
import { useGlobalWallet } from "@/context/GlobalWalletContext";
import ThemeToggle from "@/components/ThemeToggle";
import { openWalletModal } from "@/lib/open-wallet-modal";
import { ADDRESS_TYPE_LABEL, addressType, describeVerifyFailure, parseScanResponse } from "@/lib/my-bitmaps";
import { badgeId as badgeIdFor, resolvePublicHandle } from "@/lib/public-handle";

const WALLET_NAMES: Record<string, string> = {
  unisat: "Unisat",
  xverse: "Xverse",
  leather: "Leather",
  magiceden: "Magic Eden",
  okx: "OKX Wallet",
};

/** Server cap on blocks per verified session (lib/verified-sessions MAX_BLOCKS_PER_SESSION). */
const MAX_SESSION_BLOCKS = 25;

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-7">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-black/20 p-3">
      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-text-primary">{value}</code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard blocked; the value is selectable */
          }
        }}
        className="inline-flex min-h-[44px] min-w-[64px] shrink-0 items-center justify-center rounded-lg border border-white/10 px-3 text-xs text-text-primary hover:bg-white/5"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const button =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition disabled:opacity-60";
const primary = `${button} bg-bitcoin font-semibold text-black hover:brightness-110`;
const secondary = `${button} border border-white/15 text-text-primary hover:bg-white/5`;

/* ── Agent session: one signature → a 24 h bg_vfy_ token scoped to the bitmaps the chain confirms ── */

type SessionState =
  | { phase: "idle" }
  | { phase: "working"; step: string }
  | { phase: "minted"; token: string; expiresAt: string; verifiedBlocks: number[]; rejected: { blockHeight: number; reason: string }[] }
  | { phase: "revoked" }
  | { phase: "failed"; message: string };

function AgentSession({ walletAddress, signMessage }: { walletAddress: string; signMessage: (m: string) => Promise<string> }) {
  const [state, setState] = useState<SessionState>({ phase: "idle" });

  const create = async () => {
    try {
      setState({ phase: "working", step: "Reading the chain for your bitmaps…" });
      const scanRes = await fetch(`/api/v1/inscriptions/scan?address=${encodeURIComponent(walletAddress)}`);
      const scan = parseScanResponse(scanRes.status, await scanRes.json().catch(() => null));
      if (scan.status !== "ok") {
        setState({ phase: "failed", message: "The chain couldn't be read just now, so there is nothing to scope a session to. Try again in a moment." });
        return;
      }
      const held = scan.inscriptions.filter((i) => i.type === "block").slice(0, MAX_SESSION_BLOCKS);
      const inscriptionIds = Object.fromEntries(held.map((i) => [String(i.height), i.inscriptionId]));

      setState({ phase: "working", step: "Waiting for your wallet…" });
      const start = await fetch("/api/v1/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const startBody = await start.json().catch(() => null);
      if (!start.ok || !startBody?.success) {
        setState({ phase: "failed", message: startBody?.error || `Could not start a session (HTTP ${start.status}).` });
        return;
      }
      const message: string = startBody.data.message;
      let signature: string;
      try {
        signature = await signMessage(message);
      } catch (e) {
        setState({ phase: "failed", message: describeVerifyFailure(0, e).message });
        return;
      }

      setState({ phase: "working", step: "Checking each bitmap on-chain…" });
      const res = await fetch("/api/v1/session/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          message,
          signature,
          blocks: held.map((i) => i.height),
          inscriptionIds,
          label: "blockgenomics.io account page",
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setState({
          phase: "failed",
          message:
            res.status === 503
              ? "Your signature is fine, but the chain couldn't confirm your bitmaps right now. No session was created. Try again in a moment."
              : body?.error || `No session was created (HTTP ${res.status}).`,
        });
        return;
      }
      setState({
        phase: "minted",
        token: body.data.token,
        expiresAt: body.data.expiresAt,
        verifiedBlocks: body.data.verifiedBlocks ?? [],
        rejected: body.data.rejected ?? [],
      });
    } catch {
      setState({ phase: "failed", message: "Network error. No session was created." });
    }
  };

  const revoke = async (token: string) => {
    const res = await fetch("/api/v1/session", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (res?.ok) setState({ phase: "revoked" });
    else setState({ phase: "failed", message: "Couldn't revoke the session. It still expires on its own within 24 hours." });
  };

  if (state.phase === "minted") {
    const mcpConfig = JSON.stringify(
      { mcpServers: { "block-genomics": { url: "https://blockgenomics.io/mcp", headers: { Authorization: `Bearer ${state.token}` } } } },
      null,
      2,
    );
    return (
      <div className="space-y-4" data-testid="session-minted">
        <p className="rounded-xl border border-green-500/20 bg-green-500/[0.06] px-4 py-3 text-sm leading-relaxed text-green-300">
          Session created for {state.verifiedBlocks.length} bitmap{state.verifiedBlocks.length === 1 ? "" : "s"}, valid until{" "}
          {new Date(state.expiresAt).toLocaleString()}. This token is shown once; copy it now.
        </p>
        <CopyField value={state.token} label="session token" />
        {state.rejected.length > 0 && (
          <p className="text-xs leading-relaxed text-amber-200">
            Not included: {state.rejected.map((r) => `${r.blockHeight}.bitmap (${r.reason})`).join("; ")}
          </p>
        )}
        <div>
          <p className="text-xs text-text-secondary">Add it to an MCP client:</p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-white/[0.07] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-text-primary">{mcpConfig}</pre>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => revoke(state.token)} className={secondary}>
            Revoke now
          </button>
          <a href="/mcp" className={secondary}>
            MCP tools that use it
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-text-secondary">
        One signature gives an agent a 24-hour token for the bitmaps the chain confirms you hold right now. Use it with the
        MCP server, the SDK or the CLI. Every write still re-checks the chain, so a bitmap you sell stops working at once.
      </p>
      {state.phase === "revoked" && <p className="text-sm text-text-secondary">Session revoked. The token no longer works.</p>}
      {state.phase === "failed" && (
        <p className="text-sm leading-relaxed text-red-300" role="alert">
          {state.message}
        </p>
      )}
      <button
        type="button"
        onClick={create}
        disabled={state.phase === "working"}
        className={primary}
        data-testid="create-session"
      >
        {state.phase === "working" && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black" />}
        {state.phase === "working" ? state.step : "Create agent session · 1 signature"}
      </button>
    </div>
  );
}

/* ── Agent API token rotation (owner wallet signs; the agent id comes from registration) ── */

function AgentToken({ walletAddress, signMessage }: { walletAddress: string; signMessage: (m: string) => Promise<string> }) {
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; apiKey: string } | { ok: false; message: string } | null>(null);

  const rotate = async () => {
    const id = agentId.trim();
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
      setResult({ ok: false, message: "That doesn't look like an agent id. It is printed when the agent is registered." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const ch = await fetch("/api/v1/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, purpose: "agent-token" }),
      });
      const chBody = await ch.json().catch(() => null);
      if (!ch.ok || !chBody?.success) {
        setResult({ ok: false, message: chBody?.error || `Could not start (HTTP ${ch.status}).` });
        return;
      }
      let signature: string;
      try {
        signature = await signMessage(chBody.data.message);
      } catch (e) {
        setResult({ ok: false, message: describeVerifyFailure(0, e).message });
        return;
      }
      const res = await fetch(`/api/v1/agents/${encodeURIComponent(id)}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature, challenge: chBody.data.message }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setResult({ ok: false, message: body?.error || `Rotation failed (HTTP ${res.status}).` });
        return;
      }
      setResult({ ok: true, apiKey: body.data.apiKey });
    } catch {
      setResult({ ok: false, message: "Network error. Nothing changed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-text-secondary">
        Lost an agent&apos;s API token, or think it leaked? Rotate it with your wallet. The old token stops working immediately.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="agent-id">
          Agent id
        </label>
        <input
          id="agent-id"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="Agent id (from registration)"
          autoComplete="off"
          spellCheck={false}
          className="min-h-[44px] flex-1 rounded-full border border-white/10 bg-black/20 px-4 font-mono text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-cyan/50 focus:outline-none"
        />
        <button type="button" onClick={rotate} disabled={busy || !agentId.trim()} className={secondary}>
          {busy ? "Waiting for your wallet…" : "Rotate · 1 signature"}
        </button>
      </div>
      {result?.ok === true && (
        <div className="space-y-2">
          <p className="text-sm text-green-300">New token issued. It is shown once; copy it now.</p>
          <CopyField value={result.apiKey} label="agent token" />
        </div>
      )}
      {result?.ok === false && (
        <p className="text-sm leading-relaxed text-red-300" role="alert">
          {result.message}
        </p>
      )}
    </div>
  );
}

/* ── Page ── */

export default function AccountClient() {
  const { isConnected, isConnecting, walletAddress, walletType, profile, disconnect, signMessage } = useGlobalWallet();

  if (!isConnected || !walletAddress) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 py-20 text-center sm:py-28">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-text-secondary">Account</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {isConnecting ? "Connecting your wallet…" : "Connect a wallet to open your account."}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-text-secondary">
          Your wallet is your account. No email, no password: agent sessions, tokens and badges all hang off the address you connect.
        </p>
        <button type="button" onClick={() => openWalletModal()} disabled={isConnecting} className={`${primary} mt-8 min-h-[48px] px-7`}>
          {isConnecting ? "Connecting…" : "Connect wallet"}
        </button>
      </main>
    );
  }

  const type = addressType(walletAddress);
  // User.handle first, else the handle claimed on a block in My Bitmaps (REVIEW bg57 P1-5).
  const publicHandle = resolvePublicHandle(profile);
  const handle = publicHandle?.handle ?? null;
  const badgeId = badgeIdFor(publicHandle, walletAddress);
  const badgeUrl = `https://blockgenomics.io/api/v1/badge/${badgeId}.svg`;
  const profileUrl = handle ? `https://blockgenomics.io/agent/${handle}` : "https://blockgenomics.io";

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-text-secondary">Account</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
        {handle ? `@${handle}` : "Your account"}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {walletType ? WALLET_NAMES[walletType] ?? "Wallet" : "Wallet"} · {ADDRESS_TYPE_LABEL[type]} address
      </p>

      <div className="mt-8 space-y-5">
        <Section title="Wallet">
          <CopyField value={walletAddress} label="wallet address" />
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/my-bitmaps" className={primary}>
              My Bitmaps
            </Link>
            <button
              type="button"
              onClick={() => {
                disconnect();
                openWalletModal("/account");
              }}
              className={secondary}
            >
              Switch wallet
            </button>
            <button type="button" onClick={disconnect} className={`${secondary} text-red-300`}>
              Disconnect
            </button>
          </div>
        </Section>

        <Section title="Public identity">
          {publicHandle && profile ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-text-primary">
                  {publicHandle.source === "user"
                    ? `${profile.displayName && profile.displayName !== publicHandle.handle ? `${profile.displayName} · ` : ""}@${publicHandle.handle}`
                    : `@${publicHandle.handle} · from ${publicHandle.blockHeight!.toLocaleString("en-US")}.bitmap`}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {profile.anchorBlock ? `Anchored to ${profile.anchorBlock}.bitmap` : "No anchor block on record"}
                </p>
              </div>
              <Link href={`/agent/${publicHandle.handle}`} className={secondary}>
                View public profile
              </Link>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-text-secondary">
              No public handle yet. Verify a bitmap in <Link href="/my-bitmaps" className="text-accent-cyan underline-offset-4 hover:underline">My Bitmaps</Link> first; your handle and profile hang off a verified block.
            </p>
          )}
        </Section>

        <Section title="Agent sessions" id="sessions">
          <AgentSession walletAddress={walletAddress} signMessage={signMessage} />
        </Section>

        <Section title="Agent tokens" id="agent-tokens">
          <AgentToken walletAddress={walletAddress} signMessage={signMessage} />
        </Section>

        <Section title="Badge" id="badges">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic SVG badge from our own API */}
            <img src={`/api/v1/badge/${badgeId}.svg`} alt="Block Genomics badge" className="h-auto w-[200px] shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm leading-relaxed text-text-secondary">
                Your live trust badge. It follows your on-chain tier, so it updates when you verify or sell a bitmap. Embed it anywhere:
              </p>
              <CopyField value={`[![Block Genomics](${badgeUrl})](${profileUrl})`} label="Markdown badge" />
            </div>
          </div>
        </Section>

        <Section title="Appearance">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">Light or dark</p>
            <ThemeToggle />
          </div>
        </Section>
      </div>
    </main>
  );
}
