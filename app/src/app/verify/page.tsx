"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet, type WalletType, type BitmapInscription } from "@/context/WalletContext";
import type { ChallengeResponse, VerifyResponse, VerifiedAgent } from "@/types/api";

// ─── Constants ─────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100";

type Step = "connect" | "block" | "challenge" | "sign" | "verify" | "result";

const DNA_BASES = ["A", "T", "G", "C"] as const;

// Map hex char to DNA base
function hexToDna(hex: string): string {
  return hex
    .split("")
    .map((ch) => {
      const val = parseInt(ch, 16);
      return DNA_BASES[val % 4];
    })
    .join("");
}

// Get color from 2-char hex pair
function hexPairToColor(pair: string): string {
  const val = parseInt(pair, 16);
  const hue = (val / 255) * 360;
  return `hsl(${hue}, 75%, 55%)`;
}

// Get 32 colors from 64-char genome
function genomeToColors(genome: string): string[] {
  const colors: string[] = [];
  for (let i = 0; i < genome.length; i += 2) {
    colors.push(hexPairToColor(genome.slice(i, i + 2)));
  }
  return colors;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

// ─── Verify Page ───────────────────────────────────────────────────────────

export default function VerifyPage() {
  const wallet = useWallet();

  // Flow state
  const [step, setStep] = useState<Step>("connect");
  const [blockHeight, setBlockHeight] = useState<string>("");
  const [agentName, setAgentName] = useState<string>("");
  const [bitmaps, setBitmaps] = useState<BitmapInscription[]>([]);
  const [loadingBitmaps, setLoadingBitmaps] = useState(false);

  // Challenge state
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);

  // Sign state
  const [signature, setSignature] = useState<string | null>(null);
  const [signLoading, setSignLoading] = useState(false);

  // Verify state
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [result, setResult] = useState<VerifiedAgent | null>(null);
  const [verified, setVerified] = useState(false);

  // Genome animation
  const [revealedChars, setRevealedChars] = useState(0);
  const [showDna, setShowDna] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [showScore, setShowScore] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Ref for scroll
  const resultRef = useRef<HTMLDivElement>(null);

  // ─── Auto-advance from connect when wallet is ready ─────────────────

  useEffect(() => {
    if (wallet.isConnected && step === "connect") {
      setStep("block");
    }
    if (!wallet.isConnected && step !== "connect") {
      // Wallet disconnected — reset
      resetFlow();
    }
  }, [wallet.isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load bitmaps when wallet connects ──────────────────────────────

  useEffect(() => {
    if (wallet.isConnected && step === "block") {
      loadBitmaps();
    }
  }, [wallet.isConnected, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBitmaps = async () => {
    setLoadingBitmaps(true);
    try {
      const found = await wallet.getInscriptions();
      setBitmaps(found);
    } catch {
      // Silent — bitmaps are optional
    } finally {
      setLoadingBitmaps(false);
    }
  };

  // ─── Genome reveal animation ────────────────────────────────────────

  useEffect(() => {
    if (step !== "result" || !result?.genome) return;

    const genome = result.genome;
    let charIndex = 0;

    const interval = setInterval(() => {
      charIndex++;
      setRevealedChars(charIndex);
      if (charIndex >= genome.length) {
        clearInterval(interval);
        // After genome reveal, show DNA
        setTimeout(() => setShowDna(true), 400);
        // Then colors
        setTimeout(() => setShowColors(true), 800);
        // Then score
        setTimeout(() => setShowScore(true), 1200);
      }
    }, 35);

    return () => clearInterval(interval);
  }, [step, result]);

  // Scroll to result when it appears
  useEffect(() => {
    if (step === "result" && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [step]);

  // ─── Reset ──────────────────────────────────────────────────────────

  const resetFlow = () => {
    setStep(wallet.isConnected ? "block" : "connect");
    setBlockHeight("");
    setAgentName("");
    setChallenge(null);
    setSignature(null);
    setResult(null);
    setVerified(false);
    setError(null);
    setRevealedChars(0);
    setShowDna(false);
    setShowColors(false);
    setShowScore(false);
  };

  // ─── API: Request Challenge ─────────────────────────────────────────

  const requestChallenge = useCallback(async () => {
    if (!wallet.address || !blockHeight) return;

    setError(null);
    setChallengeLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/v1/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockHeight: parseInt(blockHeight, 10),
          agentName: agentName || undefined,
          walletAddress: wallet.address,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error || errData.message || `Server error (${res.status})`
        );
      }

      const data: ChallengeResponse = await res.json();
      setChallenge(data);
      setStep("challenge");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to request challenge";
      if (message.includes("fetch") || message.includes("network") || message.includes("Failed to fetch")) {
        setError("Cannot connect to API server. Is it running on port 3100?");
      } else {
        setError(message);
      }
    } finally {
      setChallengeLoading(false);
    }
  }, [wallet.address, blockHeight, agentName]);

  // ─── API: Sign Challenge ────────────────────────────────────────────

  const signChallenge = useCallback(async () => {
    if (!challenge) return;

    setError(null);
    setSignLoading(true);
    setStep("sign");

    try {
      const sig = await wallet.signMessage(challenge.challengeMessage);
      setSignature(sig);

      // Auto-advance to verify
      setStep("verify");
      await submitVerification(sig);
    } catch (err) {
      setStep("challenge"); // Go back
      const message =
        err instanceof Error ? err.message : "Failed to sign message";
      if (message.includes("User rejected") || message.includes("cancelled")) {
        setError("Signing cancelled by user.");
      } else {
        setError(message);
      }
    } finally {
      setSignLoading(false);
    }
  }, [challenge, wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── API: Submit Verification ───────────────────────────────────────

  const submitVerification = useCallback(
    async (sig?: string) => {
      const finalSig = sig || signature;
      if (!challenge || !finalSig || !wallet.address) return;

      setError(null);
      setVerifyLoading(true);

      try {
        const res = await fetch(`${API_URL}/api/v1/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            signature: finalSig,
            address: wallet.address,
            blockHeight: parseInt(blockHeight, 10),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            errData.error || errData.message || `Verification failed (${res.status})`
          );
        }

        const data: VerifyResponse = await res.json();

        if (data.verified && data.agent) {
          setVerified(true);
          setResult(data.agent);
          setStep("result");
        } else {
          throw new Error(data.error || "Verification rejected by server.");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Verification failed";
        setError(message);
        setStep("challenge"); // Allow retry
      } finally {
        setVerifyLoading(false);
      }
    },
    [challenge, signature, wallet.address, blockHeight]
  );

  // ─── Step indicator ─────────────────────────────────────────────────

  const steps: { key: Step; label: string; icon: string }[] = [
    { key: "connect", label: "Wallet", icon: "🔗" },
    { key: "block", label: "Block", icon: "⛏️" },
    { key: "challenge", label: "Challenge", icon: "🧬" },
    { key: "sign", label: "Sign", icon: "✍️" },
    { key: "verify", label: "Verify", icon: "🔍" },
    { key: "result", label: "Result", icon: "🧬" },
  ];

  const stepIndex = steps.findIndex((s) => s.key === step);

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient-cyan-purple">Verify</span> a Block
        </h1>
        <p className="mt-2 text-text-secondary">
          Connect your wallet, claim a block height, and extract its
          cryptographic genome.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <div
                className={`flex items-center justify-center h-9 w-9 rounded-full text-sm font-medium transition-all duration-300 ${
                  i < stepIndex
                    ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40"
                    : i === stepIndex
                    ? "bg-accent-cyan/30 text-white border border-accent-cyan glow-cyan"
                    : "bg-bg-tertiary/50 text-text-muted border border-border"
                }`}
              >
                {i < stepIndex ? "✓" : s.icon}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`hidden sm:block w-8 md:w-12 h-px mx-1 transition-colors duration-300 ${
                    i < stepIndex ? "bg-accent-cyan/40" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="hidden sm:flex items-center justify-between mt-2">
          {steps.map((s) => (
            <span
              key={s.key}
              className="text-[10px] text-text-muted w-9 text-center"
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {(error || wallet.error) && (
        <div className="mb-6 glass-panel border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <span className="text-red-400 text-lg shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-sm text-red-300">{error || wallet.error}</p>
          </div>
          <button
            onClick={() => {
              setError(null);
              wallet.clearError();
            }}
            className="text-text-muted hover:text-text-primary text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Step 1: Connect Wallet ──────────────────────────────── */}
      {step === "connect" && (
        <div className="glass-panel p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🔗</div>
            <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              Connect a Bitcoin wallet to sign verification challenges and prove
              your identity on-chain.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
            <WalletButton
              type="unisat"
              label="Unisat"
              description="BRC-20 & Ordinals"
              emoji="🟧"
              isConnecting={wallet.isConnecting}
              onClick={() => wallet.connect("unisat")}
            />
            <WalletButton
              type="xverse"
              label="Xverse"
              description="Bitcoin Web3"
              emoji="🟣"
              isConnecting={wallet.isConnecting}
              onClick={() => wallet.connect("xverse")}
            />
          </div>

          <p className="text-center text-xs text-text-muted mt-6">
            Don&apos;t have a wallet?{" "}
            <a
              href="https://unisat.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-cyan hover:underline"
            >
              Install Unisat
            </a>{" "}
            or{" "}
            <a
              href="https://www.xverse.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-purple hover:underline"
            >
              Install Xverse
            </a>
          </p>
        </div>
      )}

      {/* ─── Step 2: Enter Block Height ──────────────────────────── */}
      {step === "block" && (
        <div className="glass-panel p-8">
          {/* Connected wallet indicator */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-success" />
              <div>
                <p className="text-xs text-text-muted">Connected</p>
                <p className="text-sm font-mono text-text-primary">
                  {wallet.address ? truncateAddress(wallet.address) : "—"}
                </p>
              </div>
            </div>
            <button
              onClick={wallet.disconnect}
              className="text-xs text-text-muted hover:text-red-400 transition-colors"
            >
              Disconnect
            </button>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold mb-2">Choose a Block</h2>
            <p className="text-sm text-text-secondary">
              Enter a Bitcoin block height to verify and extract its genome.
            </p>
          </div>

          {/* Bitmap suggestions */}
          {bitmaps.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-text-muted mb-2 flex items-center gap-1.5">
                <span className="text-bitcoin">⚡</span> Your Bitmaps
              </p>
              <div className="flex flex-wrap gap-2">
                {bitmaps.map((b) => (
                  <button
                    key={b.inscriptionId}
                    onClick={() => setBlockHeight(String(b.blockHeight))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-mono border transition-all ${
                      blockHeight === String(b.blockHeight)
                        ? "border-bitcoin/50 bg-bitcoin/10 text-bitcoin"
                        : "border-border bg-bg-tertiary/30 text-text-secondary hover:border-border-hover"
                    }`}
                  >
                    {b.blockHeight?.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          )}
          {loadingBitmaps && (
            <p className="text-xs text-text-muted mb-4 animate-pulse">
              Scanning wallet for bitmaps…
            </p>
          )}

          {/* Block height input */}
          <div className="max-w-sm mx-auto">
            <label className="block text-xs font-medium text-text-secondary mb-2">
              Block Height
            </label>
            <input
              type="number"
              value={blockHeight}
              onChange={(e) => setBlockHeight(e.target.value)}
              placeholder="e.g. 840000"
              min={0}
              className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/25 transition-colors"
            />
          </div>

          {/* Agent name (optional) */}
          <div className="max-w-sm mx-auto mt-4">
            <label className="block text-xs font-medium text-text-secondary mb-2">
              Agent Name{" "}
              <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Satoshi"
              maxLength={32}
              className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/25 transition-colors"
            />
          </div>

          {/* Start button */}
          <div className="mt-6 text-center">
            <button
              onClick={requestChallenge}
              disabled={!blockHeight || challengeLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-3 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 hover:border-accent-cyan/60 glow-cyan transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent-cyan/15"
            >
              {challengeLoading ? (
                <>
                  <Spinner />
                  Requesting challenge…
                </>
              ) : (
                <>🧬 Start Verification</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Challenge ───────────────────────────────────── */}
      {step === "challenge" && challenge && (
        <div className="glass-panel p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🧬</div>
            <h2 className="text-xl font-semibold mb-2">
              Challenge Received
            </h2>
            <p className="text-sm text-text-secondary">
              Sign the following message with your wallet to prove ownership.
            </p>
          </div>

          {/* Challenge message display */}
          <div className="bg-bg-primary/60 rounded-lg border border-border p-4 mb-6">
            <p className="text-xs text-text-muted mb-2 flex items-center gap-1.5">
              📝 Challenge Message
            </p>
            <pre className="text-sm font-mono text-text-primary whitespace-pre-wrap break-all leading-relaxed">
              {challenge.challengeMessage}
            </pre>
          </div>

          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-text-muted mb-6 px-1">
            <span>
              ID:{" "}
              <span className="font-mono">
                {challenge.challengeId.slice(0, 12)}…
              </span>
            </span>
            <span>
              Expires:{" "}
              {new Date(challenge.expiresAt).toLocaleTimeString()}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setChallenge(null);
                setStep("block");
              }}
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-tertiary/50 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={signChallenge}
              disabled={signLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-purple/15 border border-accent-purple/40 px-6 py-2.5 text-sm font-medium text-accent-purple hover:bg-accent-purple/25 hover:border-accent-purple/60 glow-purple transition-all disabled:opacity-40"
            >
              {signLoading ? (
                <>
                  <Spinner />
                  Awaiting signature…
                </>
              ) : (
                <>✍️ Sign Challenge</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 4: Signing (brief loading state) ───────────────── */}
      {step === "sign" && (
        <div className="glass-panel p-12 text-center">
          <div className="verify-pulse mx-auto mb-6">
            <div className="text-5xl">✍️</div>
          </div>
          <h2 className="text-xl font-semibold mb-2">
            Waiting for Signature
          </h2>
          <p className="text-sm text-text-secondary">
            Please approve the signing request in your{" "}
            <span className="text-accent-cyan">
              {wallet.walletType === "unisat" ? "Unisat" : "Xverse"}
            </span>{" "}
            wallet…
          </p>
        </div>
      )}

      {/* ─── Step 5: Verifying ───────────────────────────────────── */}
      {step === "verify" && (
        <div className="glass-panel p-12 text-center">
          <div className="verify-pulse mx-auto mb-6">
            <div className="text-5xl">🔍</div>
          </div>
          <h2 className="text-xl font-semibold mb-2">
            Verifying Signature
          </h2>
          <p className="text-sm text-text-secondary">
            Submitting your proof to the verification engine…
          </p>
          <div className="mt-6">
            <div className="verify-progress-bar" />
          </div>
        </div>
      )}

      {/* ─── Step 6: Result ──────────────────────────────────────── */}
      {step === "result" && result && (
        <div ref={resultRef} className="space-y-6">
          {/* Success banner */}
          <div className="glass-panel p-8 text-center border-success/20">
            <div className="text-5xl mb-4 result-bounce">✅</div>
            <h2 className="text-2xl font-bold mb-1">
              <span className="text-gradient-cyan-purple">
                Verification Complete
              </span>
            </h2>
            <p className="text-sm text-text-secondary">
              Block{" "}
              <span className="font-mono text-bitcoin">
                {result.blockHeight.toLocaleString()}
              </span>{" "}
              genome extracted successfully.
            </p>
          </div>

          {/* Genome Hash Reveal */}
          <div className="glass-panel p-6">
            <p className="text-xs text-text-muted mb-3 flex items-center gap-1.5">
              🧬 Genome Hash
            </p>
            <div className="bg-bg-primary/60 rounded-lg border border-border p-4">
              <p className="font-mono text-lg leading-relaxed tracking-wider text-center break-all">
                {result.genome.split("").map((char, i) => (
                  <span
                    key={i}
                    className={`inline-block transition-all duration-200 ${
                      i < revealedChars
                        ? "opacity-100 text-accent-cyan genome-char-reveal"
                        : "opacity-0"
                    }`}
                    style={{
                      color:
                        i < revealedChars
                          ? hexPairToColor(
                              result.genome.slice(
                                Math.floor(i / 2) * 2,
                                Math.floor(i / 2) * 2 + 2
                              )
                            )
                          : undefined,
                    }}
                  >
                    {char}
                  </span>
                ))}
                {revealedChars < result.genome.length && (
                  <span className="inline-block w-2 h-5 bg-accent-cyan/60 animate-pulse ml-0.5 align-middle" />
                )}
              </p>
            </div>
          </div>

          {/* DNA Sequence */}
          <div
            className={`glass-panel p-6 transition-all duration-500 ${
              showDna
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4 pointer-events-none"
            }`}
          >
            <p className="text-xs text-text-muted mb-3 flex items-center gap-1.5">
              🧪 DNA Base Pairs
            </p>
            <div className="bg-bg-primary/60 rounded-lg border border-border p-4">
              <p className="font-mono text-sm leading-relaxed text-center break-all tracking-widest">
                {hexToDna(result.genome)
                  .split("")
                  .map((base, i) => (
                    <span
                      key={i}
                      className={`inline-block dna-base-reveal ${
                        base === "A"
                          ? "text-green-400"
                          : base === "T"
                          ? "text-red-400"
                          : base === "G"
                          ? "text-yellow-400"
                          : "text-blue-400"
                      }`}
                      style={{ animationDelay: `${i * 8}ms` }}
                    >
                      {base}
                    </span>
                  ))}
              </p>
              <div className="flex items-center justify-center gap-4 mt-3 text-xs text-text-muted">
                <span>
                  <span className="text-green-400 font-mono">A</span> Adenine
                </span>
                <span>
                  <span className="text-red-400 font-mono">T</span> Thymine
                </span>
                <span>
                  <span className="text-yellow-400 font-mono">G</span> Guanine
                </span>
                <span>
                  <span className="text-blue-400 font-mono">C</span> Cytosine
                </span>
              </div>
            </div>
          </div>

          {/* Genome Color Grid */}
          <div
            className={`glass-panel p-6 transition-all duration-500 ${
              showColors
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4 pointer-events-none"
            }`}
          >
            <p className="text-xs text-text-muted mb-3 flex items-center gap-1.5">
              🎨 Genome Visualization
            </p>
            <div className="grid grid-cols-8 gap-1.5 max-w-xs mx-auto">
              {genomeToColors(result.genome).map((color, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-md genome-color-reveal"
                  style={{
                    backgroundColor: color,
                    animationDelay: `${i * 40}ms`,
                  }}
                  title={`#${result.genome.slice(i * 2, i * 2 + 2)}`}
                />
              ))}
            </div>
          </div>

          {/* Trust Score */}
          <div
            className={`glass-panel p-6 transition-all duration-500 ${
              showScore
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4 pointer-events-none"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-muted mb-1">Trust Score</p>
                <p className="text-3xl font-bold text-gradient-cyan-purple">
                  {result.trustScore}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-muted mb-1">Agent</p>
                <p className="text-sm font-medium text-text-primary">
                  {result.name || "Anonymous Agent"}
                </p>
                <p className="text-xs text-text-muted font-mono mt-0.5">
                  Signature: {result.signatureType || "unknown"}
                </p>
              </div>
            </div>

            {/* Trust score bar */}
            <div className="mt-4 h-2 rounded-full bg-bg-tertiary overflow-hidden">
              <div
                className="h-full rounded-full trust-bar-fill"
                style={{
                  width: `${result.trustScore}%`,
                  background:
                    "linear-gradient(90deg, var(--color-accent-cyan), var(--color-accent-purple))",
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div
            className={`flex flex-col sm:flex-row items-center justify-center gap-3 transition-all duration-500 ${
              showScore
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            <a
              href={`/agent/${result.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 glow-cyan transition-all"
            >
              👤 View Profile
            </a>
            <a
              href={`${API_URL}/api/v1/badge/${result.id}.svg`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-purple/15 border border-accent-purple/40 px-6 py-2.5 text-sm font-medium text-accent-purple hover:bg-accent-purple/25 glow-purple transition-all"
            >
              🏆 Get Badge
            </a>
            <button
              onClick={resetFlow}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-2.5 text-sm text-text-secondary hover:bg-bg-tertiary/50 transition-colors"
            >
              🔄 Verify Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function WalletButton({
  label,
  description,
  emoji,
  isConnecting,
  onClick,
}: {
  type: WalletType;
  label: string;
  description: string;
  emoji: string;
  isConnecting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isConnecting}
      className="flex items-center gap-3 rounded-xl border border-border bg-bg-secondary/50 px-5 py-4 text-left hover:border-border-hover hover:bg-bg-tertiary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
    >
      <span className="text-2xl group-hover:scale-110 transition-transform">
        {emoji}
      </span>
      <div>
        <p className="font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
