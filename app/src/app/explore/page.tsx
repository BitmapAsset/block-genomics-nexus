import type { Metadata } from "next";
import Link from "next/link";
import { formatNumber, hexPairToColor } from "@/lib/genome-utils";
import { prisma } from "@/lib/prisma";
import SearchBar from "./search-bar";

export const metadata: Metadata = {
  title: "Explore — Block Genomics",
  description:
    "Browse verified Bitcoin blocks, search agents, and explore genomic identities.",
};

// ─── Types ─────────────────────────────────────────────────────────────────

interface SearchResult {
  type: "agent" | "block";
  id: string;
  name: string;
  blockHeight: number;
  genome: string | null;
  trustScore: number | null;
  matchField: string;
}

// ─── Data ──────────────────────────────────────────────────────────────────

async function fetchRecentAgents(): Promise<SearchResult[]> {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return users.map((u) => ({
      type: "agent" as const,
      id: u.walletAddress,
      name: u.handle || "Anonymous",
      blockHeight: 0,
      genome: null,
      trustScore: 0,
      matchField: "name",
    }));
  } catch { return []; /* Schema migrated — old models removed */ }
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function ExplorePage() {
  let recentAgents: SearchResult[] = [], totalAgents = 0, totalBlocks = 0, totalGenomes = 0;
  try {
    [recentAgents, totalAgents, totalBlocks, totalGenomes] = await Promise.all([
      fetchRecentAgents(),
      prisma.user.count().catch(() => 0),
      prisma.block.count().catch(() => 0),
      prisma.delegation.count().catch(() => 0),
    ]);
  } catch { /* Schema migrated */ }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          <span className="text-gradient-cyan-purple">Explore</span> the
          Bitcoin genome map
        </h1>
        <p className="text-text-secondary text-lg max-w-2xl">
          Discover verified agents, search block DNA by height, and browse the
          scarce real estate of Bitcoin itself.
        </p>
      </div>

      {/* ─── Search ────────────────────────────────────────────── */}
      <div className="mb-10">
        <SearchBar />
      </div>

      {/* ─── Stats ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <StatCard
          icon="🤖"
          label="Verified Agents"
          value={totalAgents > 0 ? formatNumber(totalAgents) : "—"}
        />
        <StatCard
          icon="⛓️"
          label="Verified Blocks"
          value={totalBlocks > 0 ? formatNumber(totalBlocks) : "—"}
        />
        <StatCard
          icon="🧬"
          label="Genomes Extracted"
          value={totalGenomes > 0 ? formatNumber(totalGenomes) : "—"}
        />
      </div>

      {/* ─── Recent Verifications ──────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
          <span className="text-accent-cyan">⚡</span> Recent Verifications
        </h2>

        {recentAgents.length > 0 ? (
          <div className="space-y-2">
            {recentAgents
              .filter((r) => r.type === "agent")
              .slice(0, 10)
              .map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
          </div>
        ) : (
          <div className="glass-panel p-12 text-center">
            <div className="text-4xl mb-4 opacity-40">🔍</div>
            <p className="text-text-secondary mb-2">
              No verifications found yet
            </p>
            <p className="text-text-muted text-sm mb-6">
              Be the first to verify a block and appear here!
            </p>
            <Link
              href="/verify"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-5 py-2.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 glow-cyan transition-all"
            >
              🧬 Start Verifying
            </Link>
          </div>
        )}
      </section>

      {/* ─── Popular Blocks ────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
          <span className="text-bitcoin">₿</span> Notable Blocks
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { height: 0, label: "Genesis Block", desc: "The beginning" },
            { height: 170, label: "First BTC Transaction", desc: "Satoshi → Hal Finney" },
            { height: 210000, label: "First Halving", desc: "50 → 25 BTC reward" },
            { height: 420000, label: "Second Halving", desc: "25 → 12.5 BTC" },
            { height: 630000, label: "Third Halving", desc: "12.5 → 6.25 BTC" },
            { height: 840000, label: "Fourth Halving", desc: "6.25 → 3.125 BTC" },
          ].map((block) => (
            <Link
              key={block.height}
              href={`/block/${block.height}`}
              className="glass-panel p-5 group hover:glass-panel-hover transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-bitcoin text-sm">₿</span>
                <span className="font-mono text-sm font-semibold group-hover:text-accent-cyan transition-colors">
                  #{formatNumber(block.height)}
                </span>
              </div>
              <p className="text-sm font-medium text-text-primary">
                {block.label}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{block.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-panel p-5 text-center hover:glass-panel-hover transition-all">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      <div className="text-xs text-text-muted mt-1">{label}</div>
    </div>
  );
}

function AgentRow({ agent }: { agent: SearchResult }) {
  return (
    <Link
      href={`/agent/${agent.id}`}
      className="glass-panel p-4 flex items-center justify-between hover:glass-panel-hover transition-all group block"
    >
      <div className="flex items-center gap-4 min-w-0">
        {/* Mini genome swatch */}
        {agent.genome ? (
          <div className="flex gap-0.5 shrink-0">
            {[0, 2, 4, 6].map((i) => (
              <div
                key={i}
                className="w-2 h-6 rounded-sm"
                style={{
                  backgroundColor: hexPairToColor(
                    agent.genome!.slice(i, i + 2)
                  ),
                }}
              />
            ))}
          </div>
        ) : (
          <div className="w-10 h-6 rounded bg-bg-tertiary/50" />
        )}

        <div className="min-w-0">
          <div className="text-sm font-semibold group-hover:text-accent-cyan transition-colors truncate">
            {agent.name || "Anonymous Agent"}
          </div>
          <div className="text-xs text-text-muted font-mono">
            Block #{formatNumber(agent.blockHeight)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {agent.trustScore !== null && (
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-gradient-cyan-purple">
              {agent.trustScore}
            </div>
            <div className="text-[10px] text-text-muted">Trust</div>
          </div>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 border border-success/30 px-2.5 py-0.5 text-xs font-medium text-success">
          <svg width="12" height="14" viewBox="0 0 100 115" fill="none" className="inline-block">
            <path d="M 50 18 C 30 18, 10 24, 8 36 L 8 62 C 8 82, 22 96, 50 108 C 78 96, 92 82, 92 62 L 92 36 C 90 24, 70 18, 50 18 Z" fill="#12121a" stroke="#f7931a" strokeWidth="3"/>
            <path d="M 30 22 L 34 8 L 42 18 L 50 4 L 58 18 L 66 8 L 70 22 Z" fill="#f7931a" opacity="0.7"/>
            <circle cx="34" cy="7" r="3" fill="#ffcc44"/><circle cx="50" cy="3" r="3.5" fill="#ffcc44"/><circle cx="66" cy="7" r="3" fill="#ffcc44"/>
            <text x="50" y="65" textAnchor="middle" dominantBaseline="central" fill="#f7931a" fontFamily="system-ui" fontSize="42" fontWeight="bold">₿</text>
            <path d="M 30 90 L 37 97 L 48 84" fill="none" stroke="#22ff88" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Verified
        </span>
      </div>
    </Link>
  );
}
