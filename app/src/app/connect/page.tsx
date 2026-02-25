"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HandleChecker from "@/components/auth/HandleChecker";
import { useAuth, type WalletType, type BitmapBlock } from "@/context/AuthContext";

const steps = [
  { key: 1, label: "Connect" },
  { key: 2, label: "Anchor" },
  { key: 3, label: "Sign" },
  { key: 4, label: "Handle" },
  { key: 5, label: "Name" },
  { key: 6, label: "Finish" },
];

function walletLabel(type: WalletType) {
  return type === "unisat" ? "Unisat" : type === "xverse" ? "Xverse" : "Leather";
}

export default function ConnectPage() {
  const router = useRouter();
  const {
    isConnected,
    isConnecting,
    walletAddress,
    walletType,
    availableWallets,
    connect,
    signMessage,
    getBitmapBlocks,
    updateProfile,
    profile,
    generateGenomeHash,
    error,
    clearError,
  } = useAuth();

  const [step, setStep] = useState(1);
  const [bitmapBlocks, setBitmapBlocks] = useState<BitmapBlock[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [manualBlock, setManualBlock] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [handleValid, setHandleValid] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile && isConnected) {
      router.replace(`/agent/${profile.handle}`);
    }
  }, [profile, isConnected, router]);

  useEffect(() => {
    if (isConnected && step === 1) {
      setStep(2);
    }
  }, [isConnected, step]);

  useEffect(() => {
    if (step !== 2 || !isConnected) return;
    const load = async () => {
      setLoadingBlocks(true);
      const blocks = await getBitmapBlocks();
      setBitmapBlocks(blocks);
      setLoadingBlocks(false);
    };
    load();
  }, [step, isConnected, getBitmapBlocks]);

  const challengeMessage = useMemo(() => {
    if (!walletAddress || !selectedBlock) return "";
    return `Block Genomics Verification\nWallet: ${walletAddress}\nAnchor Block: ${selectedBlock}\nTimestamp: ${new Date().toISOString()}`;
  }, [walletAddress, selectedBlock]);

  const handleWalletConnect = async (type: WalletType) => {
    await connect(type);
  };

  const handleBlockContinue = () => {
    if (!selectedBlock && manualBlock) {
      const parsed = parseInt(manualBlock, 10);
      if (!Number.isNaN(parsed)) {
        setSelectedBlock(parsed);
        setStep(3);
      }
      return;
    }
    if (selectedBlock) {
      setStep(3);
    }
  };

  const handleSign = async () => {
    if (!challengeMessage) return;
    setBusy(true);
    const sig = await signMessage(challengeMessage);
    setSignature(sig);
    setBusy(false);
    setStep(4);
  };

  const handleProfileCreate = async () => {
    if (!walletAddress || !walletType || !selectedBlock || !handleValid) return;
    setBusy(true);
    const genomeHash = await generateGenomeHash(selectedBlock, walletAddress);
    updateProfile({
      handle,
      displayName: displayName || handle,
      walletAddress,
      walletType,
      bitmapBlock: selectedBlock,
      genomeHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setBusy(false);
    setStep(6);
    router.push(`/agent/${handle}`);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient-cyan-purple">Connect</span> your agent
        </h1>
        <p className="mt-2 text-text-secondary">
          Claim a handle, anchor a Bitcoin block, and generate your genomic signature.
        </p>
      </div>

      <div className="mb-8 flex items-center justify-between">
        {steps.map((s, idx) => (
          <div key={s.key} className="flex items-center flex-1">
            <div
              className={`flex items-center justify-center h-9 w-9 rounded-full text-sm font-medium transition-all duration-300 ${
                step > s.key
                  ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40"
                  : step === s.key
                  ? "bg-accent-cyan/30 text-white border border-accent-cyan glow-cyan"
                  : "bg-bg-tertiary/50 text-text-muted border border-border"
              }`}
            >
              {step > s.key ? "✓" : s.key}
            </div>
            {idx < steps.length - 1 && (
              <div className="hidden sm:block w-full h-px mx-2 bg-border" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 glass-panel border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <span className="text-red-400 text-lg shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-sm text-red-300">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="text-text-muted hover:text-text-primary text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="glass-panel p-8 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h2 className="text-xl font-semibold mb-2">Connect your wallet</h2>
          <p className="text-sm text-text-secondary mb-6">
            We&apos;ll detect available Bitcoin wallets in your browser.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
            {availableWallets.map((wallet) => (
              <button
                key={wallet}
                onClick={() => handleWalletConnect(wallet)}
                disabled={isConnecting}
                className="flex items-center gap-3 rounded-xl border border-border bg-bg-secondary/50 px-5 py-4 text-left hover:border-border-hover hover:bg-bg-tertiary/30 transition-all disabled:opacity-50"
              >
                <span className="text-2xl">
                  {wallet === "unisat" ? "🟧" : wallet === "xverse" ? "🟣" : "🟫"}
                </span>
                <div>
                  <p className="font-medium text-text-primary">{walletLabel(wallet)}</p>
                  <p className="text-xs text-text-muted">Bitcoin wallet</p>
                </div>
              </button>
            ))}
          </div>
          {availableWallets.length === 0 && (
            <div className="mt-6 text-sm text-text-muted">
              Install a wallet to continue: {" "}
              <a
                href="https://unisat.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-cyan hover:underline"
              >
                Unisat
              </a>{" "}
              ·{" "}
              <a
                href="https://www.xverse.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-purple hover:underline"
              >
                Xverse
              </a>{" "}
              ·{" "}
              <a
                href="https://leather.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300 hover:underline"
              >
                Leather
              </a>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="glass-panel p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">⛏️</div>
            <h2 className="text-xl font-semibold mb-2">Choose your anchor block</h2>
            <p className="text-sm text-text-secondary">
              Select a Bitmap block owned by your wallet or enter a block height.
            </p>
          </div>

          {loadingBlocks && (
            <p className="text-xs text-text-muted mb-4 animate-pulse">
              Scanning wallet for bitmaps…
            </p>
          )}

          {bitmapBlocks.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-text-muted mb-2">Detected Bitmaps</p>
              <div className="flex flex-wrap gap-2">
                {bitmapBlocks.map((block) => (
                  <button
                    key={block.inscriptionId}
                    onClick={() => {
                      setSelectedBlock(block.blockHeight);
                      setManualBlock("");
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-mono border transition-all ${
                      selectedBlock === block.blockHeight
                        ? "border-bitcoin/50 bg-bitcoin/10 text-bitcoin"
                        : "border-border bg-bg-tertiary/30 text-text-secondary hover:border-border-hover"
                    }`}
                  >
                    {block.blockHeight.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-sm mx-auto">
            <label className="block text-xs font-medium text-text-secondary mb-2">Block Height</label>
            <input
              type="number"
              value={manualBlock}
              onChange={(e) => {
                setManualBlock(e.target.value);
                setSelectedBlock(null);
              }}
              placeholder="e.g. 840000"
              className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/25 transition-colors"
            />
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-tertiary/50"
            >
              ← Back
            </button>
            <button
              onClick={handleBlockContinue}
              disabled={!selectedBlock && !manualBlock}
              className="rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 hover:border-accent-cyan/60 transition-all disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="glass-panel p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">✍️</div>
            <h2 className="text-xl font-semibold mb-2">Sign the challenge</h2>
            <p className="text-sm text-text-secondary">
              Sign a BIP-322 message to verify wallet ownership.
            </p>
          </div>
          <div className="bg-bg-primary/60 rounded-lg border border-border p-4 mb-6">
            <p className="text-xs text-text-muted mb-2">Challenge Message</p>
            <pre className="text-xs text-text-primary whitespace-pre-wrap break-all font-mono">
              {challengeMessage}
            </pre>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setStep(2)}
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-tertiary/50"
            >
              ← Back
            </button>
            <button
              onClick={handleSign}
              disabled={busy}
              className="rounded-lg bg-accent-purple/15 border border-accent-purple/40 px-6 py-2.5 text-sm font-medium text-accent-purple hover:bg-accent-purple/25 hover:border-accent-purple/60 transition-all disabled:opacity-40"
            >
              {busy ? "Signing…" : `Sign with ${walletType ? walletLabel(walletType) : "wallet"}`}
            </button>
          </div>
          {signature && (
            <p className="mt-4 text-xs text-success text-center">Signature captured.</p>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="glass-panel p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🏷️</div>
            <h2 className="text-xl font-semibold mb-2">Claim your handle</h2>
            <p className="text-sm text-text-secondary">
              This handle is unique and cannot be changed later.
            </p>
          </div>
          <div className="max-w-sm mx-auto">
            <HandleChecker value={handle} onChange={setHandle} onValidChange={setHandleValid} />
          </div>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setStep(3)}
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-tertiary/50"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(5)}
              disabled={!handleValid}
              className="rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 hover:border-accent-cyan/60 transition-all disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="glass-panel p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">✨</div>
            <h2 className="text-xl font-semibold mb-2">Set display name</h2>
            <p className="text-sm text-text-secondary">
              Optional. Defaults to your handle.
            </p>
          </div>
          <div className="max-w-sm mx-auto">
            <label className="block text-xs font-medium text-text-secondary mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={handle}
              className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/25 transition-colors"
            />
          </div>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setStep(4)}
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-tertiary/50"
            >
              ← Back
            </button>
            <button
              onClick={handleProfileCreate}
              disabled={busy}
              className="rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 hover:border-accent-cyan/60 transition-all disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create profile"}
            </button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="glass-panel p-10 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2">
            <span className="text-gradient-cyan-purple">Profile created</span>
          </h2>
          <p className="text-sm text-text-secondary">
            Redirecting to your agent page…
          </p>
        </div>
      )}
    </div>
  );
}
