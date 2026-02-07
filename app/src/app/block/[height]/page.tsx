import type { Metadata } from "next";
import Link from "next/link";
import {
  genomeToDNA,
  genomeToColors,
  hexPairToColor,
  formatBlockTime,
  formatRelativeTime,
  truncateHash,
  formatBytes,
  formatNumber,
  formatWeight,
  parseGenomeTraits,
  dnaBaseColor,
} from "@/lib/genome-utils";
import type { AgentPublic, BlockResponse } from "./types";
import CopyButton from "./copy-button";

// ─── Types (matching API server response) ──────────────────────────────────

interface BlockPageProps {
  params: Promise<{ height: string }>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100";

// ─── Data fetching ─────────────────────────────────────────────────────────

async function fetchBlock(height: number): Promise<BlockResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/block/${height}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: BlockPageProps): Promise<Metadata> {
  const { height } = await params;
  return {
    title: `Block #${Number(height).toLocaleString()} — Block Genomics`,
    description: `Genome profile, verification status, and DNA sequence for Bitcoin block #${height}.`,
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function BlockPage({ params }: BlockPageProps) {
  const { height } = await params;
  const blockHeight = parseInt(height, 10);

  if (isNaN(blockHeight) || blockHeight < 0) {
    return <ErrorState message="Invalid block height." />;
  }

  const block = await fetchBlock(blockHeight);

  if (!block) {
    return <ErrorState message={`Block #${formatNumber(blockHeight)} could not be loaded. The API server may be offline.`} />;
  }

  const genome = block.genome;
  const dna = genome ? genomeToDNA(genome) : null;
  const colors = genome ? genomeToColors(genome) : null;
  const traits = genome ? parseGenomeTraits(genome) : null;
  const agent = block.agent;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      {/* ─── Block Header ──────────────────────────────────────── */}
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-bitcoin text-xl">₿</span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="text-gradient-cyan-purple">Block</span>{" "}
            <span className="font-mono">#{formatNumber(block.height)}</span>
          </h1>
          <StatusBadge verified={block.verified} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted font-mono">
          <span className="break-all">{block.hash}</span>
          {genome && <CopyButton text={block.hash} label="hash" />}
        </div>
        <p className="text-sm text-text-secondary mt-2">
          Mined {formatBlockTime(block.timestamp)} · {formatRelativeTime(block.timestamp)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left Column: Main Content ─────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Block Data Grid */}
          <section className="glass-panel p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-5">
              Block Data
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DataCell label="Height" value={formatNumber(block.height)} mono />
              <DataCell label="Transactions" value={formatNumber(block.txCount)} />
              <DataCell label="Size" value={formatBytes(block.size)} />
              <DataCell label="Weight" value={formatWeight(block.weight)} />
              <DataCell label="Timestamp" value={formatBlockTime(block.timestamp)} />
              <DataCell label="Genome Version" value={block.genomeVersion ? `v${block.genomeVersion}` : "—"} />
            </div>
          </section>

          {/* Genome Hash Visualization */}
          {genome && (
            <section className="glass-panel p-6 glow-cyan">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                  🧬 Genome Hash
                </h2>
                <CopyButton text={genome} label="genome" />
              </div>
              <div className="bg-bg-primary/60 rounded-xl border border-border p-5">
                <p className="font-mono text-base sm:text-lg leading-relaxed tracking-wider text-center break-all">
                  {genome.split("").map((char, i) => (
                    <span
                      key={i}
                      className="inline-block genome-char-reveal"
                      style={{
                        color: hexPairToColor(
                          genome.slice(Math.floor(i / 2) * 2, Math.floor(i / 2) * 2 + 2)
                        ),
                        animationDelay: `${i * 15}ms`,
                      }}
                    >
                      {char}
                    </span>
                  ))}
                </p>
              </div>

              {/* Trait segments */}
              {traits && (
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(traits).map(([name, segment]) => (
                    <div
                      key={name}
                      className="rounded-lg bg-bg-primary/40 border border-border px-3 py-2"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
                        {name}
                      </p>
                      <p className="font-mono text-xs text-accent-cyan tracking-wide">
                        {segment}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* DNA Sequence */}
          {dna && (
            <section className="glass-panel p-6">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-5">
                🧪 DNA Sequence — {dna.length} bases
              </h2>
              <div className="bg-bg-primary/60 rounded-xl border border-border p-5">
                <p className="font-mono text-sm leading-relaxed text-center break-all tracking-widest">
                  {dna.split("").map((base, i) => (
                    <span
                      key={i}
                      className={`inline-block dna-base-reveal ${dnaBaseColor(base)}`}
                      style={{ animationDelay: `${i * 5}ms` }}
                    >
                      {base}
                    </span>
                  ))}
                </p>
                <div className="flex items-center justify-center gap-5 mt-4 text-xs text-text-muted">
                  <span><span className="text-green-400 font-mono font-bold">A</span> Adenine</span>
                  <span><span className="text-red-400 font-mono font-bold">T</span> Thymine</span>
                  <span><span className="text-blue-400 font-mono font-bold">G</span> Guanine</span>
                  <span><span className="text-yellow-400 font-mono font-bold">C</span> Cytosine</span>
                </div>
              </div>
            </section>
          )}

          {/* Genome Color Grid */}
          {colors && (
            <section className="glass-panel p-6">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-5">
                🎨 Genome Visualization
              </h2>
              <div className="grid grid-cols-8 gap-2 max-w-sm mx-auto">
                {colors.map((color, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-lg genome-color-reveal shadow-lg"
                    style={{
                      backgroundColor: color.hex,
                      animationDelay: `${i * 30}ms`,
                    }}
                    title={`${color.hex} (byte ${Math.floor(i / 2)})`}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ─── Right Column: Sidebar ─────────────────────────── */}
        <div className="space-y-6">
          {/* Verification Status */}
          <section className="glass-panel p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-5">
              Verification
            </h2>

            {block.verified && agent ? (
              <div className="text-center">
                {/* Trust Score Ring */}
                <TrustScoreRing score={agent.trustScore} />

                <p className="text-sm text-text-secondary mt-4 mb-1">
                  Verified by
                </p>
                <Link
                  href={`/agent/${agent.id}`}
                  className="text-accent-cyan hover:underline font-medium text-lg"
                >
                  {agent.name || truncateHash(agent.id)}
                </Link>
                <p className="text-xs text-text-muted mt-2 font-mono">
                  {new Date(agent.verifiedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>

                {/* Trust factors */}
                <div className="mt-5 space-y-2 text-left">
                  <TrustFactor label="Signature" ok={agent.trustFactors.signatureValid} />
                  <TrustFactor label="Bitmap" ok={agent.trustFactors.bitmapOwnership} />
                  <TrustFactor label="Block exists" ok={agent.trustFactors.blockExists} />
                  <TrustFactorText label="Address" value={agent.trustFactors.addressFormat} />
                  {agent.trustFactors.blockAge !== null && (
                    <TrustFactorText
                      label="Block age"
                      value={`${formatNumber(agent.trustFactors.blockAge)} days`}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-bg-tertiary/50 border border-border flex items-center justify-center">
                  <span className="text-2xl opacity-40">🔒</span>
                </div>
                <p className="text-text-secondary text-sm mb-1">Unverified</p>
                <p className="text-text-muted text-xs mb-5">
                  Be the first to verify this block
                </p>
                <Link
                  href={`/verify?block=${blockHeight}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-5 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 hover:border-accent-cyan/60 glow-cyan transition-all"
                >
                  🧬 Verify this Block
                </Link>
              </div>
            )}
          </section>

          {/* Verify CTA (even if already verified — re-verify) */}
          {block.verified && (
            <section className="glass-panel p-5">
              <Link
                href={`/verify?block=${blockHeight}`}
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-accent-purple/10 border border-accent-purple/30 px-4 py-3 text-sm font-medium text-accent-purple hover:bg-accent-purple/20 hover:border-accent-purple/50 transition-all"
              >
                🔄 Re-verify this Block
              </Link>
            </section>
          )}

          {/* Quick Nav */}
          <section className="glass-panel p-5 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">
              Navigate
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {blockHeight > 0 && (
                <Link
                  href={`/block/${blockHeight - 1}`}
                  className="flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
                >
                  ← #{formatNumber(blockHeight - 1)}
                </Link>
              )}
              <Link
                href={`/block/${blockHeight + 1}`}
                className="flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
              >
                #{formatNumber(blockHeight + 1)} →
              </Link>
            </div>
          </section>

          {/* Genome not available */}
          {!genome && (
            <section className="glass-panel p-6 text-center">
              <div className="text-3xl mb-3 opacity-40">🧬</div>
              <p className="text-sm text-text-muted">
                No genome extracted yet. Verify this block to generate its cryptographic DNA.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components (inline, no separate files) ────────────────────────────

function StatusBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="rounded-full bg-success/10 border border-success/30 px-3 py-0.5 text-xs font-medium text-success">
      ✓ Verified
    </span>
  ) : (
    <span className="rounded-full border border-text-muted/30 px-3 py-0.5 text-xs text-text-muted">
      Unverified
    </span>
  );
}

function DataCell({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-bg-primary/40 border border-border px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
        {label}
      </p>
      <p className={`text-sm text-text-primary ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function TrustScoreRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        {/* Background ring */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--color-bg-tertiary)"
          strokeWidth="6"
        />
        {/* Progress ring */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="url(#trustGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="trustGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-accent-cyan)" />
            <stop offset="100%" stopColor="var(--color-accent-purple)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gradient-cyan-purple">
          {score}
        </span>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">
          Trust
        </span>
      </div>
    </div>
  );
}

function TrustFactor({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span className={ok ? "text-success" : "text-red-400"}>
        {ok ? "✓" : "✗"}
      </span>
    </div>
  );
}

function TrustFactorText({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary font-mono text-xs">{value}</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <div className="text-5xl mb-4 opacity-40">⛓️‍💥</div>
      <h1 className="text-2xl font-bold mb-3">Block Not Found</h1>
      <p className="text-text-secondary mb-6">{message}</p>
      <Link
        href="/explore"
        className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
      >
        ← Back to Explorer
      </Link>
    </div>
  );
}
