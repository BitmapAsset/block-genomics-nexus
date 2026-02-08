import Link from "next/link";
import { formatNumber } from "@/lib/genome-utils";
import { prisma } from "@/lib/prisma";
import DNAHero from "@/components/DNAHero";

export default async function HomePage() {
  const [blocksVerified, activeAgents, genomesExtracted] =
    await Promise.all([
      prisma.genome.findMany({ select: { blockHeight: true }, distinct: ['blockHeight'] }).then(r => r.length),
      prisma.agent.count(),
      prisma.genome.count(),
    ]);

  const stats = [
    {
      label: "Blocks with DNA",
      value: blocksVerified > 0 ? formatNumber(blocksVerified) : "—",
      icon: "⛓️",
    },
    {
      label: "Verified Agents",
      value: activeAgents > 0 ? formatNumber(activeAgents) : "—",
      icon: "🤖",
    },
    {
      label: "Genomes Minted",
      value: genomesExtracted > 0 ? formatNumber(genomesExtracted) : "—",
      icon: "🧬",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      {/* Hero */}
      <div className="relative text-center max-w-4xl mx-auto w-full">
        <div className="absolute inset-0 -z-10 opacity-90">
          <DNAHero
            genomeHash="a3f8c2e91b4d6f0785c3e2a19b7d4f6e8c2a1b3d5f7e9c0b2a4d6f8e1c3b5a7d"
            state="verifying"
            height="70vh"
          />
        </div>
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-cyan/20 bg-accent-cyan/5 px-4 py-1.5 text-xs text-accent-cyan">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan animate-pulse" />
          Bitcoin-native identity is live
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
          Bitcoin blocks are the{" "}
          <span className="text-gradient-cyan-purple">root</span>{" "}
          of identity
        </h1>

        <p className="text-lg text-text-secondary mb-10 max-w-2xl mx-auto leading-relaxed">
          Block Genomics turns each Bitcoin block into digital DNA — a scarce,
          unforgeable genome that proves who an AI agent really is. Think SSL
          certificates for autonomous intelligence, anchored in proof of work.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/verify"
            className="flex items-center gap-2 rounded-lg bg-accent-cyan px-6 py-3 text-sm font-semibold text-bg-primary hover:bg-accent-cyan/90 transition-colors glow-cyan"
          >
            Verify a Block
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link
            href="/explore"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
          >
            Explore the Nexus
          </Link>
        </div>
      </div>

      {/* What is Block Genomics */}
      <section className="mt-16 w-full max-w-4xl">
        <div className="glass-panel p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-accent-cyan mb-3">
            What is Block Genomics?
          </p>
          <h2 className="text-3xl font-semibold mb-4">
            Digital DNA for sovereign agents
          </h2>
          <p className="text-text-secondary leading-relaxed">
            Each Bitcoin block is a thermodynamic artifact — real energy, real
            history, real scarcity. Block Genomics binds AI identity to owned
            Bitmaps, creating genomes that cannot be forged or duplicated. One
            block. One genome. One seat at the table.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mt-12 w-full max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: "Claim a Bitcoin block",
              copy: "Own a Bitmap and anchor your identity to a specific block height.",
            },
            {
              title: "Extract the genome",
              copy: "We derive a 256-bit fingerprint from the block header — your unforgeable DNA.",
            },
            {
              title: "Verify in one proof",
              copy: "Sign a BIP-322 challenge to prove ownership and earn a trust score.",
            },
          ].map((step, i) => (
            <div key={step.title} className="glass-panel p-6">
              <div className="text-xs text-accent-purple mb-2">Step {i + 1}</div>
              <h3 className="text-lg font-semibold mb-2 text-text-primary">
                {step.title}
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {step.copy}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Vision teaser */}
      <section className="mt-12 w-full max-w-4xl">
        <div className="glass-panel p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent-purple mb-3">
              The Vision
            </p>
            <h2 className="text-2xl font-semibold mb-3">
              The Nexus is the gateway
            </h2>
            <p className="text-text-secondary leading-relaxed">
              Every block is a door you can walk through. The Nexus is a living
              map of Bitcoin — digital real estate where verified agents build
              worlds, economies, and services on provable ownership.
            </p>
          </div>
          <Link
            href="/explore"
            className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
          >
            Enter the Map
          </Link>
        </div>
      </section>

      {/* Stats preview */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="glass-panel p-5 text-center hover:glass-panel-hover transition-all"
          >
            <div className="text-2xl mb-2">{stat.icon}</div>
            <div className="text-2xl font-bold text-text-primary">
              {stat.value}
            </div>
            <div className="text-xs text-text-muted mt-1">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
