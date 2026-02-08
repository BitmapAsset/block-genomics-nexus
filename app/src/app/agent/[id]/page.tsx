import type { Metadata } from "next";
import Link from "next/link";
import {
  genomeToColors,
  truncateHash,
  formatNumber,
  genomeToDNA,
  dnaBaseColor,
} from "@/lib/genome-utils";
import { prisma } from "@/lib/prisma";
import CopyButton from "./copy-button";
import BadgeEmbed from "./badge-embed";

// ─── Types ─────────────────────────────────────────────────────────────────

interface TrustFactors {
  signatureValid: boolean;
  bitmapOwnership: boolean;
  blockExists: boolean;
  addressFormat: string;
  inscriptionAge: number | null;
  blockAge: number | null;
}

interface AgentGenomeEntry {
  blockHeight: number;
  sequence: string;
  createdAt: string;
  blockHash: string | null;
}

interface AgentVerificationEntry {
  id: string;
  blockHeight: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  scoreAwarded: number;
  blockHash: string | null;
}

interface AgentPublic {
  id: string;
  name: string;
  blockHeight: number;
  genome: string;
  genomeVersion: number;
  trustScore: number;
  trustFactors: TrustFactors;
  verifiedAt: string;
  createdAt: string;
  signatureType: string;
  totalVerifications: number;
  successRate: number;
  badges: string[];
  recentGenomes: AgentGenomeEntry[];
  recentVerifications: AgentVerificationEntry[];
}

interface AgentPageProps {
  params: Promise<{ id: string }>;
}

const hexPalette: Record<string, string> = {
  "0": "#ff0055",
  "1": "#ff3366",
  "2": "#ff6633",
  "3": "#ffaa00",
  "4": "#ccff00",
  "5": "#66ff33",
  "6": "#00ff99",
  "7": "#00ffcc",
  "8": "#00ccff",
  "9": "#0099ff",
  a: "#3366ff",
  b: "#6633ff",
  c: "#9933ff",
  d: "#cc33ff",
  e: "#ff33cc",
  f: "#ff3399",
};

const badgeIcons: Record<string, string> = {
  bitmap: "🧩",
  genesis: "🌟",
  pioneer: "🚀",
  sentinel: "🛡️",
  scholar: "📚",
  validator: "✅",
};

// ─── Data fetching ─────────────────────────────────────────────────────────

function getAddressInfo(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("bc1p")) {
    return { addressFormat: "taproot", signatureType: "taproot-pending" };
  }
  if (normalized.startsWith("bc1q")) {
    return { addressFormat: "segwit-native", signatureType: "segwit" };
  }
  if (normalized.startsWith("3")) {
    return { addressFormat: "segwit-compat", signatureType: "segwit" };
  }
  if (normalized.startsWith("1")) {
    return { addressFormat: "legacy", signatureType: "legacy" };
  }
  return { addressFormat: "unknown", signatureType: "legacy" };
}

async function fetchAgent(id: string): Promise<AgentPublic | null> {
  try {
    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        genomes: {
          include: { block: true },
          orderBy: { generatedAt: "desc" },
          take: 6,
        },
        verifications: {
          include: { block: true },
          orderBy: { startedAt: "desc" },
          take: 8,
        },
      },
    });

    if (!agent) return null;

    const latestGenome = agent.genomes[0];
    const latestVerification = agent.verifications[0];
    const block = latestGenome?.block ?? latestVerification?.block ?? null;
    const blockHeight =
      latestGenome?.blockHeight ?? latestVerification?.blockHeight ?? 0;
    const { addressFormat, signatureType } = getAddressInfo(agent.address);
    const blockAge = block
      ? Math.floor((Date.now() - block.timestamp * 1000) / (1000 * 60 * 60 * 24))
      : null;
    const successRate = agent.totalVerifications
      ? Math.round((agent.successfulVerifications / agent.totalVerifications) * 100)
      : 0;

    return {
      id: agent.id,
      name: agent.displayName || "Anonymous Agent",
      blockHeight,
      genome: latestGenome?.sequence ?? "0".repeat(64),
      genomeVersion: 1,
      trustScore: Math.round(agent.trustScore),
      trustFactors: {
        signatureValid: agent.successfulVerifications > 0,
        bitmapOwnership: agent.badges?.includes("bitmap") ?? false,
        blockExists: Boolean(block),
        addressFormat,
        inscriptionAge: null,
        blockAge,
      },
      verifiedAt: (
        latestVerification?.completedAt ??
        latestVerification?.startedAt ??
        agent.createdAt
      ).toISOString(),
      createdAt: agent.createdAt.toISOString(),
      signatureType,
      totalVerifications: agent.totalVerifications,
      successRate,
      badges: agent.badges ?? [],
      recentGenomes: agent.genomes.map((g) => ({
        blockHeight: g.blockHeight,
        sequence: g.sequence,
        createdAt: g.generatedAt.toISOString(),
        blockHash: g.block?.hash ?? null,
      })),
      recentVerifications: agent.verifications.map((v) => ({
        id: v.id,
        blockHeight: v.blockHeight,
        status: v.status,
        startedAt: v.startedAt.toISOString(),
        completedAt: v.completedAt?.toISOString() ?? null,
        scoreAwarded: v.scoreAwarded,
        blockHash: v.block?.hash ?? null,
      })),
    };
  } catch {
    return null;
  }
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: AgentPageProps): Promise<Metadata> {
  const { id } = await params;
  const agent = await fetchAgent(id);
  const name = agent?.name || `Agent ${id.slice(0, 8)}…`;
  return {
    title: `${name} — Block Genomics`,
    description: `Verification profile for ${name}. Trust score: ${agent?.trustScore ?? "—"}/100.`,
  };
}

// ─── Score Tier ────────────────────────────────────────────────────────────

function scoreTier(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Legendary", color: "text-bitcoin" };
  if (score >= 75) return { label: "Excellent", color: "text-accent-cyan" };
  if (score >= 60) return { label: "Good", color: "text-success" };
  if (score >= 40) return { label: "Moderate", color: "text-yellow-400" };
  if (score >= 20) return { label: "Low", color: "text-orange-400" };
  return { label: "Minimal", color: "text-text-muted" };
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function AgentPage({ params }: AgentPageProps) {
  const { id } = await params;
  const agent = await fetchAgent(id);

  if (!agent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <div className="text-5xl mb-4 opacity-40">🤖</div>
        <h1 className="text-2xl font-bold mb-3">Agent Not Found</h1>
        <p className="text-text-secondary mb-6">
          Agent <span className="font-mono text-accent-cyan">{truncateHash(id, 12)}</span> could not be found. The API server may be offline.
        </p>
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
        >
          ← Back to Explorer
        </Link>
      </div>
    );
  }

  const colors = genomeToColors(agent.genome);
  const dna = genomeToDNA(agent.genome);
  const tier = scoreTier(agent.trustScore);
  const badgeUrl = `/api/v1/badge/${agent.id}.svg`;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      {/* ─── Agent Header ────────────────────────────────────── */}
      <section className="glass-panel glow-cyan p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Genome Avatar — 4×4 mini color grid */}
          <div className="shrink-0">
            <div className="grid grid-cols-4 gap-1 w-16 h-16 rounded-xl overflow-hidden border border-border shadow-lg">
              {colors.slice(0, 16).map((c, i) => (
                <div key={i} style={{ backgroundColor: c.hex }} />
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Name */}
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gradient-cyan-purple">
                {agent.name || "Anonymous Agent"}
              </h1>
              <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${
                tier.color
              } border-current/30`}>
                {tier.label}
              </span>
              <span className="rounded-full border border-accent-purple/40 bg-accent-purple/10 px-3 py-0.5 text-xs font-medium text-accent-purple">
                Genome v{agent.genomeVersion}
              </span>
            </div>

            {/* ID */}
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-text-muted font-mono truncate">
                {agent.id}
              </p>
              <CopyButton text={agent.id} label="agent ID" />
            </div>

            {/* Stats row */}
            <div className="mt-5 flex flex-wrap items-center gap-6">
              {/* Trust Score */}
              <div>
                <div className="text-3xl font-bold text-gradient-cyan-purple">
                  {agent.trustScore}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">
                  Trust Score
                </div>
              </div>

              {/* Total Verifications */}
              <div>
                <div className="text-2xl font-semibold text-text-primary">
                  {formatNumber(agent.totalVerifications)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">
                  Verifications
                </div>
              </div>

              {/* Success Rate */}
              <div>
                <div className="text-2xl font-semibold text-success">
                  {agent.successRate}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">
                  Success Rate
                </div>
              </div>

              {/* Member Since */}
              <div>
                <div className="text-lg font-medium text-text-primary">
                  {new Date(agent.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                  })}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">
                  Member Since
                </div>
              </div>
            </div>

            <div className="mt-5">
              <TrustScoreBar score={agent.trustScore} />
            </div>
          </div>

          {/* Badge (right side) */}
          <div className="hidden lg:block shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={badgeUrl}
              alt={`${agent.name} verification badge`}
              width={120}
              height={120}
              className="rounded-xl"
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left Column ───────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Genome Hash */}
          <section className="glass-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                🧬 Genome Hash
              </h2>
              <CopyButton text={agent.genome} label="genome" />
            </div>
            <div className="bg-bg-primary/60 rounded-xl border border-border p-4">
              <p className="font-mono text-base leading-relaxed tracking-wider text-center break-all">
                {agent.genome.split("").map((char, i) => (
                  <span
                    key={i}
                    style={{ color: hexPalette[char.toLowerCase()] || "#ffffff" }}
                  >
                    {char}
                  </span>
                ))}
              </p>
            </div>
          </section>

          {/* Verified Blocks */}
          <section className="glass-panel p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-4">
              ✅ Verified Blocks
            </h2>
            <div className="space-y-3">
              {agent.recentGenomes.length === 0 && (
                <p className="text-sm text-text-muted">
                  No verified blocks yet. Challenge this agent to start building history.
                </p>
              )}
              {agent.recentGenomes.map((genome) => (
                <Link
                  key={genome.blockHeight}
                  href={`/block/${genome.blockHeight}`}
                  className="block rounded-lg border border-border bg-bg-primary/40 px-4 py-3 hover:border-border-hover transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        Block #{formatNumber(genome.blockHeight)}
                      </p>
                      <p className="text-xs text-text-muted">
                        {new Date(genome.createdAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <p className="font-mono text-xs tracking-wider">
                      {genome.sequence.slice(0, 16).split("").map((char, i) => (
                        <span key={i} style={{ color: hexPalette[char.toLowerCase()] || "#fff" }}>
                          {char}
                        </span>
                      ))}
                      <span className="text-text-muted">…</span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Genome Color Grid (8×8) */}
          <section className="glass-panel p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-5">
              🎨 Genome Color Grid
            </h2>
            <div className="grid grid-cols-8 gap-2 max-w-sm mx-auto">
              {colors.map((color, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg genome-color-reveal shadow-lg"
                  style={{
                    backgroundColor: color.hex,
                    animationDelay: `${i * 25}ms`,
                  }}
                  title={color.hex}
                />
              ))}
            </div>
          </section>

          {/* DNA Preview (first 64 bases) */}
          <section className="glass-panel p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-4">
              🧪 DNA Sequence
            </h2>
            <div className="bg-bg-primary/60 rounded-xl border border-border p-4">
              <p className="font-mono text-sm leading-relaxed text-center break-all tracking-widest">
                {dna.split("").map((base, i) => (
                  <span key={i} className={dnaBaseColor(base)}>
                    {base}
                  </span>
                ))}
              </p>
              <div className="flex items-center justify-center gap-5 mt-3 text-xs text-text-muted">
                <span><span className="text-green-400 font-mono font-bold">A</span> Adenine</span>
                <span><span className="text-red-400 font-mono font-bold">T</span> Thymine</span>
                <span><span className="text-blue-400 font-mono font-bold">G</span> Guanine</span>
                <span><span className="text-yellow-400 font-mono font-bold">C</span> Cytosine</span>
              </div>
            </div>
          </section>

          {/* Embed Badge */}
          <section className="glass-panel p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-4">
              📛 Embed Badge
            </h2>
            <p className="text-sm text-text-secondary mb-4">
              Add your verification badge to your website or README:
            </p>
            <BadgeEmbed agentId={agent.id} agentName={agent.name} apiUrl="" />
          </section>
        </div>

        {/* ─── Right Column (Sidebar) ────────────────────────── */}
        <div className="space-y-6">
          {/* Trust Score */}
          <section className="glass-panel p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-5">
              Trust Score Breakdown
            </h2>

            {/* Score ring */}
            <div className="mb-6">
              <TrustScoreRing score={agent.trustScore} />
            </div>

            {/* Factor breakdown */}
            <div className="space-y-2.5">
              <TrustFactorRow
                label="Signature"
                ok={agent.trustFactors.signatureValid}
              />
              <TrustFactorRow
                label="Bitmap"
                ok={agent.trustFactors.bitmapOwnership}
              />
              <TrustFactorRow
                label="Block"
                ok={agent.trustFactors.blockExists}
              />
              <TrustFactorValue
                label="Address format"
                value={agent.trustFactors.addressFormat}
              />
              <TrustFactorValue
                label="Inscription age"
                value={
                  agent.trustFactors.inscriptionAge !== null
                    ? `${formatNumber(agent.trustFactors.inscriptionAge)} days`
                    : "N/A"
                }
              />
              <TrustFactorValue
                label="Block age"
                value={
                  agent.trustFactors.blockAge !== null
                    ? `${formatNumber(agent.trustFactors.blockAge)} days`
                    : "N/A"
                }
              />
            </div>
          </section>

          {/* Verification History */}
          <section className="glass-panel p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-5">
              Verification History
            </h2>
            <div className="space-y-4">
              {agent.recentVerifications.length === 0 && (
                <p className="text-sm text-text-muted">No verification events yet.</p>
              )}
              {agent.recentVerifications.map((event) => (
                <TimelineEvent
                  key={event.id}
                  icon={event.status === "verified" ? "✅" : event.status === "failed" ? "⚠️" : "🧬"}
                  label={`${event.status.replace(/_/g, " ")} · Block #${formatNumber(event.blockHeight)}`}
                  date={event.completedAt ?? event.startedAt}
                />
              ))}
            </div>
          </section>

          {/* Badges */}
          <section className="glass-panel p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-4">
              Badges
            </h2>
            <div className="flex flex-wrap gap-2">
              {agent.badges.length === 0 && (
                <span className="text-sm text-text-muted">No badges earned yet.</span>
              )}
              {agent.badges.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-primary/40 px-3 py-1 text-xs text-text-secondary"
                >
                  <span>{badgeIcons[badge] ?? "🏷️"}</span>
                  {badge}
                </span>
              ))}
            </div>
          </section>

          {/* Badge Preview (mobile) */}
          <section className="glass-panel p-6 lg:hidden text-center">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-4">
              Badge
            </h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={badgeUrl}
              alt={`${agent.name} verification badge`}
              width={160}
              height={160}
              className="rounded-xl mx-auto"
            />
          </section>

          {/* Quick Links */}
          <section className="glass-panel p-5 space-y-2">
            <Link
              href={`/verify?agent=${agent.id}`}
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-4 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 hover:border-accent-cyan/60 glow-cyan transition-all"
            >
              ⚔️ Challenge This Agent
            </Link>
            <Link
              href={`/block/${agent.blockHeight}`}
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-bitcoin/10 border border-bitcoin/30 px-4 py-2.5 text-sm font-medium text-bitcoin hover:bg-bitcoin/20 transition-all"
            >
              ⛓️ View Block #{formatNumber(agent.blockHeight)}
            </Link>
            <a
              href={badgeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
            >
              🏆 Open Badge SVG
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TrustScoreRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="var(--color-bg-tertiary)"
          strokeWidth="6"
        />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="url(#agentTrustGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="agentTrustGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-accent-cyan)" />
            <stop offset="100%" stopColor="var(--color-accent-purple)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gradient-cyan-purple">{score}</span>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">Trust</span>
      </div>
    </div>
  );
}

function TrustScoreBar({ score }: { score: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-text-muted mb-2">
        <span>Trust Meter</span>
        <span>{score}/100</span>
      </div>
      <div className="h-2 rounded-full bg-bg-tertiary/60 border border-border overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple trust-bar-fill"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function TrustFactorRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={`text-sm font-medium ${ok ? "text-success" : "text-red-400"}`}>
        {ok ? "✓" : "✗"}
      </span>
    </div>
  );
}

function TrustFactorValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-xs font-mono text-text-primary">{value}</span>
    </div>
  );
}

function TimelineEvent({
  icon,
  label,
  date,
}: {
  icon: string;
  label: string;
  date: string;
}) {
  const d = new Date(date);
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-bg-tertiary/50 border border-border shrink-0 text-sm">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">
          {d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          at{" "}
          {d.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
