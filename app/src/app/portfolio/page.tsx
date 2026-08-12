"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useGlobalWallet } from "@/context/GlobalWalletContext";

interface BlockHolding {
  blockHeight: number;
  handle?: string;
  displayName?: string;
  tier?: number;
  verified?: boolean;
  genomeHash?: string;
  hasGuardian?: boolean;
  guardianStatus?: string;
}

interface DelegationIncome {
  id: string;
  blockHeight: number;
  priceSats: number;
  tier: number;
  active: boolean;
  delegateeAddress: string;
  createdAt: string;
  endDate: string;
}

interface GuardianSummary {
  blockHeight: number;
  name: string;
  status: string;
  lastHeartbeat: string | null;
  worldObjectCount: number;
  lastAction: string | null;
}

interface PortfolioData {
  blocks: BlockHolding[];
  delegations: DelegationIncome[];
  guardians: GuardianSummary[];
  stats: {
    totalBlocks: number;
    profiledBlocks: number;
    activeGuardians: number;
    totalWorldObjects: number;
    activeDelegations: number;
    totalDelegationIncome: number;
    totalVisitors: number;
  };
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ─── Stat Card ─── */
function StatCard({
  icon,
  label,
  value,
  subtext,
  accentColor,
  delay,
}: {
  icon: string;
  label: string;
  value: string | number;
  subtext?: string;
  accentColor: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="glass-panel p-5 relative overflow-hidden group hover:border-border-hover transition-all"
    >
      {/* Accent glow */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ background: `radial-gradient(circle, ${accentColor}, transparent)` }}
      />
      <div className="relative">
        <span className="text-2xl mb-2 block">{icon}</span>
        <div className="text-2xl sm:text-3xl font-bold text-text-primary font-mono">{value}</div>
        <div className="text-xs text-text-muted mt-1 uppercase tracking-wider">{label}</div>
        {subtext && <div className="text-[10px] text-text-muted/60 mt-0.5">{subtext}</div>}
      </div>
    </motion.div>
  );
}

/* ─── Block Thumbnail Grid Item ─── */
function BlockThumb({ block, index }: { block: BlockHolding; index: number }) {
  const colors = ["#f7931a", "#00ffcc", "#a855f7", "#22c55e", "#ff6b6b"];
  const color = colors[block.blockHeight % colors.length];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
    >
      <Link
        href={block.handle ? `/agent/${block.handle}` : `/block/${block.blockHeight}`}
        className="group glass-panel p-3 block hover:border-border-hover transition-all duration-300 hover:translate-y-[-2px]"
      >
        {/* Mini thumbnail */}
        <div
          className="w-full aspect-square rounded-lg mb-2 flex items-center justify-center text-3xl font-bold font-mono opacity-30 group-hover:opacity-50 transition-opacity"
          style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)`, color }}
        >
          {block.blockHeight}
        </div>

        <div className="min-w-0">
          <div className="text-xs font-semibold text-text-primary truncate">
            {block.displayName || block.handle || `Block #${block.blockHeight}`}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] font-mono text-text-muted">#{block.blockHeight}</span>
            {block.tier && (
              <span
                className="text-[9px] px-1 py-0.5 rounded font-bold"
                style={{
                  color: block.tier === 1 ? "#f7931a" : block.tier === 2 ? "#00d4ff" : "#a855f7",
                  background: `${block.tier === 1 ? "#f7931a" : block.tier === 2 ? "#00d4ff" : "#a855f7"}15`,
                }}
              >
                T{block.tier}
              </span>
            )}
            {block.hasGuardian && (
              <span className={`w-1.5 h-1.5 rounded-full ${block.guardianStatus === "active" || block.guardianStatus === "Online" ? "bg-green-500" : "bg-yellow-500"}`} />
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ─── Guardian Row ─── */
function GuardianRow({ guardian, index }: { guardian: GuardianSummary; index: number }) {
  const isActive = guardian.status === "active" || guardian.status === "Online";

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="glass-panel p-4 flex items-center gap-4 hover:border-border-hover transition-all"
    >
      {/* Status dot */}
      <div className="shrink-0">
        <span className={`relative flex h-3 w-3 ${isActive ? "" : ""}`}>
          {isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${isActive ? "bg-green-500" : "bg-yellow-500"}`} />
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-text-primary">{guardian.name || `Guardian #${guardian.blockHeight}`}</span>
          <span className="text-[10px] font-mono text-text-muted">Block #{guardian.blockHeight}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>{isActive ? "Online" : guardian.status}</span>
          <span>Heartbeat: {timeAgo(guardian.lastHeartbeat)}</span>
          <span>Objects: {guardian.worldObjectCount}</span>
        </div>
        {guardian.lastAction && (
          <p className="text-xs text-text-muted/60 mt-1 italic truncate">&ldquo;{guardian.lastAction}&rdquo;</p>
        )}
      </div>

      <Link
        href={`/block/${guardian.blockHeight}`}
        className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:border-border-hover hover:text-text-primary transition-all"
      >
        View
      </Link>
    </motion.div>
  );
}

/* ─── Delegation Row ─── */
function DelegationRow({ delegation, index }: { delegation: DelegationIncome; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="glass-panel p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-border-hover transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-bold font-mono text-text-primary">Block #{delegation.blockHeight.toLocaleString()}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${delegation.active ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-text-muted bg-bg-tertiary border-border"}`}>
            {delegation.active ? "Active" : "Expired"}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border text-purple-400 bg-purple-500/10 border-purple-500/20">
            Tier {delegation.tier}
          </span>
        </div>
        <div className="text-xs text-text-muted">
          Delegated to <span className="font-mono">{delegation.delegateeAddress.slice(0, 8)}...{delegation.delegateeAddress.slice(-6)}</span>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-sm font-bold font-mono text-orange-400">{delegation.priceSats.toLocaleString()} sats</span>
        <span className="text-xs text-text-muted">
          {delegation.active ? `Expires ${new Date(delegation.endDate).toLocaleDateString()}` : "Ended"}
        </span>
      </div>
    </motion.div>
  );
}

/* ─── Tab navigation ─── */
type Tab = "overview" | "blocks" | "guardians" | "delegations";

/* ─── Main Page ─── */
export default function PortfolioPage() {
  const { isConnected, walletAddress } = useGlobalWallet();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const fetchPortfolio = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      // Fetch all data in parallel
      const [userRes, profilesRes, statsRes] = await Promise.all([
        fetch(`/api/v1/users/by-wallet/${walletAddress}`),
        fetch(`/api/v1/profiles/by-wallet/${walletAddress}`),
        fetch(`/api/v1/profiles/empire-stats/${walletAddress}`),
      ]);

      const blocks: BlockHolding[] = [];
      const delegations: DelegationIncome[] = [];
      const guardians: GuardianSummary[] = [];
      const stats = {
        totalBlocks: 0,
        profiledBlocks: 0,
        activeGuardians: 0,
        totalWorldObjects: 0,
        activeDelegations: 0,
        totalDelegationIncome: 0,
        totalVisitors: 0,
      };

      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.success && userData.data) {
          const u = userData.data;
          const ownedBlocks = u.ownedBlocks || [];
          for (const h of ownedBlocks) {
            blocks.push({ blockHeight: h });
          }
          // Delegations from user data
          if (u.activeDelegations) {
            for (const d of u.activeDelegations) {
              delegations.push(d);
            }
          }
        }
      }

      if (profilesRes.ok) {
        const profileData = await profilesRes.json();
        if (profileData.success && profileData.data?.profiles) {
          for (const p of profileData.data.profiles) {
            const existing = blocks.find((b) => b.blockHeight === p.blockHeight);
            if (existing) {
              Object.assign(existing, {
                handle: p.handle,
                displayName: p.displayName,
                tier: p.tier,
                verified: p.verified,
                genomeHash: p.genomeHash,
              });
            } else {
              blocks.push({
                blockHeight: p.blockHeight,
                handle: p.handle,
                displayName: p.displayName,
                tier: p.tier,
                verified: p.verified,
                genomeHash: p.genomeHash,
              });
            }
          }
          stats.profiledBlocks = profileData.data.profiles.length;
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success && statsData.data) {
          const s = statsData.data;
          stats.totalBlocks = s.totalBlocks || blocks.length;
          stats.activeGuardians = s.activeGuardians || 0;
          stats.totalWorldObjects = s.totalWorldObjects || 0;
          stats.totalVisitors = s.totalVisitors || 0;

          // Map guardian info onto blocks
          if (s.guardianDetails) {
            for (const g of s.guardianDetails) {
              guardians.push(g);
              const block = blocks.find((b) => b.blockHeight === g.blockHeight);
              if (block) {
                block.hasGuardian = true;
                block.guardianStatus = g.status;
              }
            }
          }

          // Merge owned blocks from stats
          if (s.ownedBlocks) {
            for (const h of s.ownedBlocks) {
              if (!blocks.find((b) => b.blockHeight === h)) {
                blocks.push({ blockHeight: h });
              }
            }
          }
        }
      }

      stats.totalBlocks = blocks.length;
      stats.activeDelegations = delegations.filter((d) => d.active).length;
      stats.totalDelegationIncome = delegations.reduce((sum, d) => sum + d.priceSats, 0);

      blocks.sort((a, b) => a.blockHeight - b.blockHeight);

      setData({ blocks, delegations, guardians, stats });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchPortfolio();
    } else {
      setLoading(false);
    }
  }, [isConnected, walletAddress, fetchPortfolio]);

  // Not connected
  if (!isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 text-center max-w-md"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-bitcoin/10 border border-bitcoin/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-bitcoin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Portfolio Dashboard</h2>
          <p className="text-sm text-text-secondary mb-6">
            Connect your Bitcoin wallet to view your complete holdings and activity.
          </p>
          <button
            onClick={() => window.dispatchEvent(new Event("open-wallet-modal"))}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-bitcoin/15 border border-bitcoin/40 text-bitcoin hover:bg-bitcoin/25 transition-all cursor-pointer"
          >
            Connect Wallet
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-bold mb-2">
              <span className="text-gradient-cyan-purple">Portfolio</span>
            </h1>
            <p className="text-text-secondary text-sm">
              Your Bitcoin block holdings, delegation income, and Guardian activity.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="sticky top-16 z-40 bg-bg-primary/90 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex gap-2">
            {(["overview", "blocks", "guardians", "delegations"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                  tab === t
                    ? "bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan"
                    : "border-border text-text-muted hover:text-text-secondary hover:border-border-hover"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
            <p className="text-text-muted text-sm">Loading portfolio...</p>
          </div>
        ) : !data ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">No data available</h3>
            <p className="text-sm text-text-muted">Unable to load portfolio data. Please try again.</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Overview Tab */}
              {tab === "overview" && (
                <div className="space-y-8">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard icon="🧱" label="Blocks Owned" value={data.stats.totalBlocks} subtext={`${data.stats.profiledBlocks} profiled`} accentColor="#f7931a" delay={0} />
                    <StatCard icon="🟢" label="Active Guardians" value={data.stats.activeGuardians} subtext={`of ${data.stats.totalBlocks} blocks`} accentColor="#22c55e" delay={0.1} />
                    <StatCard icon="💰" label="Delegation Income" value={`${data.stats.totalDelegationIncome.toLocaleString()}`} subtext={`${data.stats.activeDelegations} active`} accentColor="#a855f7" delay={0.2} />
                    <StatCard icon="👥" label="Total Visitors" value={data.stats.totalVisitors} subtext="across all blocks" accentColor="#00ffcc" delay={0.3} />
                  </div>

                  {/* Quick Block Grid */}
                  {data.blocks.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Your Blocks</h2>
                        <button onClick={() => setTab("blocks")} className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors cursor-pointer">View all</button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {data.blocks.slice(0, 12).map((block, i) => (
                          <BlockThumb key={block.blockHeight} block={block} index={i} />
                        ))}
                        {data.blocks.length > 12 && (
                          <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            onClick={() => setTab("blocks")}
                            className="glass-panel flex items-center justify-center text-sm text-text-muted hover:text-text-secondary hover:border-border-hover transition-all aspect-square rounded-xl cursor-pointer"
                          >
                            +{data.blocks.length - 12} more
                          </motion.button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Active Guardians */}
                  {data.guardians.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Guardians</h2>
                        <button onClick={() => setTab("guardians")} className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors cursor-pointer">View all</button>
                      </div>
                      <div className="space-y-2">
                        {data.guardians.slice(0, 3).map((g, i) => (
                          <GuardianRow key={g.blockHeight} guardian={g} index={i} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {data.blocks.length === 0 && (
                    <div className="text-center py-12">
                      <div className="text-5xl mb-4">🧬</div>
                      <h3 className="text-lg font-semibold text-text-primary mb-2">No Blocks Found</h3>
                      <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">
                        Acquire a Bitmap block and verify ownership to start building your portfolio.
                      </p>
                      <Link
                        href="/verify"
                        className="inline-block px-6 py-2.5 rounded-lg text-sm font-semibold bg-bitcoin/15 border border-bitcoin/40 text-bitcoin hover:bg-bitcoin/25 transition-all"
                      >
                        Get Started
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Blocks Tab */}
              {tab === "blocks" && (
                <div>
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
                    All Blocks ({data.blocks.length})
                  </h2>
                  {data.blocks.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                      {data.blocks.map((block, i) => (
                        <BlockThumb key={block.blockHeight} block={block} index={i} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-text-muted text-sm">No blocks owned yet.</div>
                  )}
                </div>
              )}

              {/* Guardians Tab */}
              {tab === "guardians" && (
                <div>
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
                    Guardians ({data.guardians.length})
                  </h2>
                  {data.guardians.length > 0 ? (
                    <div className="space-y-2">
                      {data.guardians.map((g, i) => (
                        <GuardianRow key={g.blockHeight} guardian={g} index={i} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-3">🛡️</div>
                      <p className="text-sm text-text-muted mb-4">No Guardians assigned yet.</p>
                      <p className="text-xs text-text-muted/60">Create a profile for a block to assign a Guardian AI.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Delegations Tab */}
              {tab === "delegations" && (
                <div>
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
                    Delegations ({data.delegations.length})
                  </h2>
                  {data.delegations.length > 0 ? (
                    <div className="space-y-2">
                      {data.delegations.map((d, i) => (
                        <DelegationRow key={d.id} delegation={d} index={i} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-3">💰</div>
                      <p className="text-sm text-text-muted mb-4">No delegation history.</p>
                      <Link href="/marketplace" className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors">
                        Visit the Marketplace
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
