"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────

interface BlockDetails {
  id: string;
  height: number;
  hash: string;
  timestamp: number;
  tx_count: number;
  size: number;
  weight: number;
  difficulty: number;
  bits: string;
  nonce: number;
  merkle_root: string;
  previousblockhash: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDifficulty(d: number): string {
  if (d >= 1e12) return `${(d / 1e12).toFixed(2)} T`;
  if (d >= 1e9) return `${(d / 1e9).toFixed(2)} B`;
  if (d >= 1e6) return `${(d / 1e6).toFixed(2)} M`;
  return formatNumber(d);
}

// ─── Notable blocks for quick access ───────────────────────────────────────

const NOTABLE_BLOCKS = [
  { height: 0, label: "Genesis Block", desc: "The beginning of Bitcoin" },
  { height: 170, label: "First Transaction", desc: "Satoshi to Hal Finney" },
  { height: 210000, label: "First Halving", desc: "50 to 25 BTC reward" },
  { height: 481824, label: "SegWit Activation", desc: "BIP-141 activated" },
  { height: 709632, label: "Taproot Activation", desc: "BIP-341 activated" },
  { height: 840000, label: "Fourth Halving", desc: "6.25 to 3.125 BTC" },
];

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ExplorerPage() {
  const [query, setQuery] = useState("");
  const [block, setBlock] = useState<BlockDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchBlock = useCallback(async (height: string) => {
    const h = parseInt(height.trim(), 10);
    if (isNaN(h) || h < 0) {
      setError("Enter a valid block height (0 or above)");
      return;
    }

    setLoading(true);
    setError(null);
    setBlock(null);

    try {
      const res = await fetch(
        `https://mempool.space/api/block-height/${h}`
      );
      if (!res.ok) {
        setError(h > 900000 ? "Block not found — it may not exist yet" : "Block not found");
        setLoading(false);
        return;
      }
      const hash = await res.text();

      const blockRes = await fetch(
        `https://mempool.space/api/block/${hash}`
      );
      if (!blockRes.ok) {
        setError("Failed to fetch block details");
        setLoading(false);
        return;
      }

      const data = await blockRes.json();
      setBlock(data);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchBlock(query);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          <span className="text-gradient-cyan-purple">Bitcoin</span> Block
          Explorer
        </h1>
        <p className="text-text-secondary text-lg max-w-2xl">
          Look up any Bitcoin block by height. View hash, timestamp,
          transaction count, size, and mining difficulty.
        </p>
      </div>

      {/* ─── Search ────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="mb-10">
        <div className="glass-panel p-2 flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter block height (e.g. 840000)"
            className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-text-primary placeholder:text-text-muted font-mono text-lg"
          />
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-3 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 glow-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {/* ─── Error ─────────────────────────────────────────────── */}
      {error && (
        <div className="glass-panel p-6 mb-10 border-red-500/30 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* ─── Loading ───────────────────────────────────────────── */}
      {loading && (
        <div className="glass-panel p-12 mb-10 text-center">
          <div className="verify-pulse mx-auto mb-4">
            <span className="text-2xl">⛓️</span>
          </div>
          <p className="text-text-secondary text-sm">
            Fetching block data from the Bitcoin network...
          </p>
          <div className="verify-progress-bar mt-4 mx-auto max-w-xs" />
        </div>
      )}

      {/* ─── Block Details ─────────────────────────────────────── */}
      {block && !loading && (
        <div className="mb-10 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="text-bitcoin">₿</span> Block #{formatNumber(block.height)}
            </h2>
            <Link
              href={`/block/${block.height}`}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 glow-cyan transition-all"
            >
              View in Nexus
            </Link>
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DetailCard label="Height" value={formatNumber(block.height)} icon="📏" />
            <DetailCard label="Timestamp" value={formatTimestamp(block.timestamp)} icon="🕐" />
            <DetailCard label="Transactions" value={formatNumber(block.tx_count)} icon="📝" />
            <DetailCard label="Size" value={formatBytes(block.size)} icon="💾" />
            <DetailCard label="Weight" value={`${formatNumber(block.weight)} WU`} icon="⚖️" />
            <DetailCard label="Difficulty" value={formatDifficulty(block.difficulty)} icon="🎯" />
          </div>

          {/* Hash */}
          <div className="glass-panel p-5">
            <div className="text-xs text-text-muted mb-1.5 uppercase tracking-wider">Block Hash</div>
            <div className="font-mono text-sm text-accent-cyan break-all leading-relaxed">
              {block.id}
            </div>
          </div>

          {/* Merkle root & previous hash */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-panel p-5">
              <div className="text-xs text-text-muted mb-1.5 uppercase tracking-wider">Merkle Root</div>
              <div className="font-mono text-xs text-text-secondary break-all leading-relaxed">
                {block.merkle_root}
              </div>
            </div>
            <div className="glass-panel p-5">
              <div className="text-xs text-text-muted mb-1.5 uppercase tracking-wider">Previous Block Hash</div>
              <div className="font-mono text-xs text-text-secondary break-all leading-relaxed">
                {block.previousblockhash}
              </div>
            </div>
          </div>

          {/* Technical details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-panel p-5 text-center">
              <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Nonce</div>
              <div className="font-mono text-sm text-text-primary">{formatNumber(block.nonce)}</div>
            </div>
            <div className="glass-panel p-5 text-center">
              <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Bits</div>
              <div className="font-mono text-sm text-text-primary">{block.bits}</div>
            </div>
            <div className="glass-panel p-5 text-center">
              <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Block Weight %</div>
              <div className="font-mono text-sm text-text-primary">
                {((block.weight / 4_000_000) * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Navigation between blocks */}
          <div className="flex items-center justify-between">
            {block.height > 0 ? (
              <button
                onClick={() => {
                  setQuery(String(block.height - 1));
                  searchBlock(String(block.height - 1));
                }}
                className="glass-panel px-4 py-2 text-sm text-text-secondary hover:text-accent-cyan transition-colors"
              >
                ← Block #{formatNumber(block.height - 1)}
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={() => {
                setQuery(String(block.height + 1));
                searchBlock(String(block.height + 1));
              }}
              className="glass-panel px-4 py-2 text-sm text-text-secondary hover:text-accent-cyan transition-colors"
            >
              Block #{formatNumber(block.height + 1)} →
            </button>
          </div>
        </div>
      )}

      {/* ─── Notable Blocks ────────────────────────────────────── */}
      {!block && !loading && (
        <section>
          <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
            <span className="text-bitcoin">₿</span> Notable Blocks
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {NOTABLE_BLOCKS.map((b) => (
              <button
                key={b.height}
                onClick={() => {
                  setQuery(String(b.height));
                  searchBlock(String(b.height));
                }}
                className="glass-panel p-5 text-left group hover:glass-panel-hover transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-bitcoin text-sm">₿</span>
                  <span className="font-mono text-sm font-semibold group-hover:text-accent-cyan transition-colors">
                    #{formatNumber(b.height)}
                  </span>
                </div>
                <p className="text-sm font-medium text-text-primary">
                  {b.label}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{b.desc}</p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function DetailCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="glass-panel p-5 hover:glass-panel-hover transition-all">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}
