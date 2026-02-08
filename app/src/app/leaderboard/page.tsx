import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/genome-utils";

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

function scoreTier(score: number) {
  if (score >= 97) return { label: "Genesis", color: tierColors.genesis };
  if (score >= 90) return { label: "Diamond", color: tierColors.diamond };
  if (score >= 75) return { label: "Platinum", color: tierColors.platinum };
  if (score >= 55) return { label: "Gold", color: tierColors.gold };
  if (score >= 30) return { label: "Silver", color: tierColors.silver };
  if (score > 0) return { label: "Bronze", color: tierColors.bronze };
  return { label: "Unranked", color: tierColors.unranked };
}

export default async function LeaderboardPage() {
  const agents = await prisma.agent.findMany({
    orderBy: { trustScore: "desc" },
    take: 25,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient-cyan-purple">Top Verified Agents</span>
        </h1>
        <p className="mt-2 text-text-secondary">
          See the strongest verifiers shaping Bitcoin’s block genome registry.
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
          <div className="col-span-3 text-right">Trust Score</div>
          <div className="col-span-2 text-right">Tier</div>
          <div className="col-span-2 text-right">Verifications</div>
        </div>

        {agents.length === 0 ? (
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
        ) : (
          <div className="divide-y divide-border/60">
            {agents.map((agent, index) => {
              const rank = index + 1;
              const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
              const tier = scoreTier(Math.round(agent.trustScore));
              const successRate = agent.totalVerifications
                ? Math.round((agent.successfulVerifications / agent.totalVerifications) * 100)
                : 0;

              return (
                <div
                  key={agent.id}
                  className="grid grid-cols-12 gap-4 px-6 py-4 text-sm hover:bg-bg-primary/40 transition-colors"
                >
                  <div className="col-span-1 font-mono text-text-muted">
                    <span className="mr-1">{rank}</span>
                    {medal && <span>{medal}</span>}
                  </div>
                  <div className="col-span-4">
                    <Link
                      href={`/agent/${agent.id}`}
                      className="font-medium text-text-primary hover:text-accent-cyan transition-colors"
                    >
                      {agent.displayName || `Agent ${agent.id.slice(0, 6)}`}
                    </Link>
                    <p className="text-xs text-text-muted">
                      {successRate}% success · {formatNumber(agent.totalVerifications)} verifications
                    </p>
                  </div>
                  <div className="col-span-3 text-right">
                    <div className="text-sm font-semibold text-text-primary">
                      {Math.round(agent.trustScore)}
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-bg-tertiary/60 border border-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple trust-bar-fill"
                        style={{ width: `${Math.min(100, Math.round(agent.trustScore))}%` }}
                      />
                    </div>
                  </div>
                  <div className={`col-span-2 text-right font-medium ${tier.color}`}>
                    {tier.label}
                  </div>
                  <div className="col-span-2 text-right text-text-secondary">
                    {formatNumber(agent.totalVerifications)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
