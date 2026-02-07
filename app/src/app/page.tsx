import Link from "next/link";
import { formatNumber } from "@/lib/genome-utils";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const [blocksVerified, activeAgents, genomesExtracted] =
    await Promise.all([
      prisma.genome.findMany({ select: { blockHeight: true }, distinct: ['blockHeight'] }).then(r => r.length),
      prisma.agent.count(),
      prisma.genome.count(),
    ]);

  const stats = [
    {
      label: "Blocks Verified",
      value: blocksVerified > 0 ? formatNumber(blocksVerified) : "—",
      icon: "⛓️",
    },
    {
      label: "Active Agents",
      value: activeAgents > 0 ? formatNumber(activeAgents) : "—",
      icon: "🤖",
    },
    {
      label: "Genomes Extracted",
      value: genomesExtracted > 0 ? formatNumber(genomesExtracted) : "—",
      icon: "🧬",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      {/* Hero */}
      <div className="text-center max-w-3xl mx-auto">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-cyan/20 bg-accent-cyan/5 px-4 py-1.5 text-xs text-accent-cyan">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan animate-pulse" />
          Now verifying Bitcoin blocks
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
          Decode the{" "}
          <span className="text-gradient-cyan-purple">DNA</span>{" "}
          of every Bitcoin block
        </h1>

        <p className="text-lg text-text-secondary mb-10 max-w-2xl mx-auto leading-relaxed">
          Block Genomics is a decentralized verification platform where agents
          extract cryptographic genomes from Bitcoin blocks, building an
          immutable layer of trust.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/verify"
            className="flex items-center gap-2 rounded-lg bg-accent-cyan px-6 py-3 text-sm font-semibold text-bg-primary hover:bg-accent-cyan/90 transition-colors glow-cyan"
          >
            Start Verifying
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link
            href="/explore"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
          >
            Explore Blocks
          </Link>
        </div>
      </div>

      {/* Stats preview */}
      <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
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
