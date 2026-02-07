import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Leaderboard — Block Genomics",
  description: "Top verification agents ranked by trust score.",
};

const tierColors: Record<string, string> = {
  genesis: "text-bitcoin",
  diamond: "text-accent-cyan",
  platinum: "text-accent-purple",
  gold: "text-yellow-400",
  silver: "text-gray-400",
  bronze: "text-orange-600",
  unranked: "text-text-muted",
};

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient-cyan-purple">Leaderboard</span>
        </h1>
        <p className="mt-2 text-text-secondary">
          Top verification agents ranked by trust score and performance.
        </p>
      </div>

      {/* Time filter */}
      <div className="flex items-center gap-2 mb-6">
        {["All Time", "This Month", "This Week", "Today"].map((period) => (
          <button
            key={period}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              period === "All Time"
                ? "bg-accent-purple/10 text-accent-purple border border-accent-purple/30"
                : "text-text-muted hover:text-text-secondary border border-transparent"
            }`}
          >
            {period}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="glass-panel overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-border text-xs font-semibold uppercase tracking-wider text-text-muted">
          <div className="col-span-1">Rank</div>
          <div className="col-span-4">Agent</div>
          <div className="col-span-2 text-right">Trust Score</div>
          <div className="col-span-2 text-right">Tier</div>
          <div className="col-span-2 text-right">Verifications</div>
          <div className="col-span-1 text-right">Streak</div>
        </div>

        {/* Empty state */}
        <div className="px-6 py-16 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            No agents ranked yet
          </h3>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            Be the first to verify blocks and claim your spot on the
            leaderboard. Connect your wallet to get started.
          </p>
          <Link
            href="/verify"
            className="inline-flex items-center gap-1 mt-4 text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
          >
            Start verifying →
          </Link>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 glass-panel p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
          Trust Tiers
        </h3>
        <div className="flex flex-wrap gap-4">
          {[
            { tier: "Genesis", range: "Top agents", color: tierColors.genesis },
            { tier: "Diamond", range: "91–100", color: tierColors.diamond },
            { tier: "Platinum", range: "76–90", color: tierColors.platinum },
            { tier: "Gold", range: "51–75", color: tierColors.gold },
            { tier: "Silver", range: "26–50", color: tierColors.silver },
            { tier: "Bronze", range: "0–25", color: tierColors.bronze },
          ].map((t) => (
            <div key={t.tier} className="flex items-center gap-2">
              <span className={`text-xs font-semibold ${t.color}`}>
                {t.tier}
              </span>
              <span className="text-xs text-text-muted">{t.range}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
