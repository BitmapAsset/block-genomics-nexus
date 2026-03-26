"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useGlobalWallet } from "@/context/GlobalWalletContext";
import CrownShield, { type ShieldTier } from "@/components/CrownShield";
import BitmapThumbnail from "@/components/BitmapThumbnail";

/* ─── Types ─── */

interface BlockProfileData {
  id: string;
  walletAddress: string;
  blockHeight: number;
  handle: string;
  displayName?: string;
  bio?: string;
  genomeHash?: string;
  tier: number;
  verified: boolean;
  isPrimary: boolean;
}

interface GuardianData {
  id: string;
  blockHeight: number;
  ownerAddress: string;
  name: string;
  status: string;
  lastHeartbeat: string | null;
  personality?: string;
  llmProvider?: string;
  llmModel?: string;
  selfHosted?: boolean;
}

interface GuardianDetail {
  blockHeight: number;
  status: string;
  lastHeartbeat: string | null;
  lastAction: string | null;
  lastActionTime: string | null;
  worldObjectCount: number;
  name: string;
}

interface EmpireStats {
  totalBlocks: number;
  activeGuardians: number;
  totalWorldObjects: number;
  totalVisitors: number;
  guardianDetails: GuardianDetail[];
  ownedBlocks: number[];
}

/* ─── Helpers ─── */

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

function PulsingDot({ active }: { active: boolean }) {
  if (!active) return <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />;
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
    </span>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="relative group rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-4 sm:p-5 transition-all duration-300 hover:border-purple-500/20 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-purple-500/5">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative">
        <div className="text-2xl mb-2">{icon}</div>
        <div className="text-2xl sm:text-3xl font-bold text-white">{value}</div>
        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

/* ─── Agent Card ─── */

function AgentCard({
  guardian,
  profile,
  empireDetail,
}: {
  guardian: GuardianData;
  profile: BlockProfileData | null;
  empireDetail: GuardianDetail | null;
}) {
  const isOnline = guardian.status === "active" || guardian.status === "Online";
  const isPaused = guardian.status === "paused" || guardian.status === "Paused";
  const handle = profile?.handle;
  const href = handle ? `/agent/${handle}` : `/block/${guardian.blockHeight}`;

  const capabilities: string[] = [];
  if (guardian.personality) capabilities.push("Custom Personality");
  if (guardian.llmProvider) capabilities.push(`${guardian.llmProvider.charAt(0).toUpperCase() + guardian.llmProvider.slice(1)} LLM`);
  if (guardian.selfHosted) capabilities.push("Self-Hosted");
  if (empireDetail && empireDetail.worldObjectCount > 0) capabilities.push("World Builder");
  if (capabilities.length === 0) capabilities.push("Guardian Agent");

  return (
    <Link
      href={href}
      className="group relative rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-5 transition-all duration-300 hover:border-cyan-500/20 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-cyan-500/5 block"
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <BitmapThumbnail blockHeight={guardian.blockHeight} size={56} className="rounded-lg flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-semibold text-white truncate text-sm group-hover:text-cyan-400 transition-colors">
                {guardian.name || profile?.displayName || `Agent #${guardian.blockHeight}`}
              </span>
              {profile && (
                <CrownShield tier={(profile.tier || 1) as ShieldTier} size={18} verified={profile.verified} />
              )}
            </div>
            {profile && (
              <p className="text-gray-500 text-xs truncate">@{profile.handle} · Block #{guardian.blockHeight}</p>
            )}
            {!profile && (
              <p className="text-gray-600 text-xs">Block #{guardian.blockHeight}</p>
            )}
          </div>
        </div>

        {/* Status Row */}
        <div className="flex items-center gap-3 mb-3 text-xs">
          <span className="flex items-center gap-1.5">
            <PulsingDot active={isOnline} />
            <span className={isOnline ? "text-green-400" : isPaused ? "text-yellow-400" : "text-gray-500"}>
              {isOnline ? "Online" : isPaused ? "Paused" : guardian.status || "Offline"}
            </span>
          </span>
          {guardian.lastHeartbeat && (
            <span className="text-gray-600">Last seen: {timeAgo(guardian.lastHeartbeat)}</span>
          )}
          {empireDetail && empireDetail.worldObjectCount > 0 && (
            <span className="text-gray-600">🏗️ {empireDetail.worldObjectCount} objects</span>
          )}
        </div>

        {/* Last Action */}
        {empireDetail?.lastAction && (
          <p className="text-gray-500 text-xs italic mb-3 truncate">
            &ldquo;{empireDetail.lastAction}&rdquo; — {timeAgo(empireDetail.lastActionTime)}
          </p>
        )}

        {/* Capabilities */}
        <div className="flex flex-wrap gap-1.5">
          {capabilities.map((cap) => (
            <span
              key={cap}
              className="px-2 py-0.5 text-[10px] rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-wider"
            >
              {cap}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

/* ─── Deploy Section ─── */

function DeploySection({
  availableBlocks,
  profileMap,
  walletAddress,
  onDeployed,
}: {
  availableBlocks: number[];
  profileMap: Map<number, BlockProfileData>;
  walletAddress: string;
  onDeployed: () => void;
}) {
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [agentName, setAgentName] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleDeploy = async () => {
    if (!selectedBlock || !agentName.trim()) {
      setError("Select a block and provide a name for your agent.");
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/guardian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockHeight: selectedBlock,
          ownerAddress: walletAddress,
          name: agentName.trim(),
          // Signature would be required in production — the guardian API enforces it.
          // For now we pass empty to let the API return a clear auth error if needed.
          signature: "",
          message: "",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to deploy agent");
      }

      setSuccess(true);
      setAgentName("");
      setSelectedBlock(null);
      onDeployed();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deploy agent");
    } finally {
      setDeploying(false);
    }
  };

  if (availableBlocks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-8 text-center">
        <div className="text-4xl mb-3 opacity-60">🔒</div>
        <p className="text-gray-400 text-sm mb-2">All your blocks already have agents deployed.</p>
        <p className="text-gray-600 text-xs">Acquire more bitmaps to deploy additional agents.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-white mb-4">Deploy New Agent</h3>

      {/* Block Selector */}
      <div className="mb-4">
        <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">Assign to Block</label>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {availableBlocks.map((h) => {
            const profile = profileMap.get(h);
            return (
              <button
                key={h}
                onClick={() => setSelectedBlock(h)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs ${
                  selectedBlock === h
                    ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                    : "border-white/[0.08] bg-white/[0.02] text-gray-400 hover:border-white/[0.15] hover:bg-white/[0.04]"
                }`}
              >
                <BitmapThumbnail blockHeight={h} size={24} className="rounded" />
                <span>{profile?.displayName || profile?.handle || `#${h}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agent Name */}
      <div className="mb-4">
        <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">Agent Name</label>
        <input
          value={agentName}
          onChange={(e) => setAgentName(e.target.value.slice(0, 50))}
          placeholder="e.g. Guardian of Block #210000"
          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50 placeholder:text-gray-600"
        />
      </div>

      {/* Error / Success */}
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
          Agent deployed successfully!
        </div>
      )}

      {/* Deploy Button */}
      <button
        onClick={handleDeploy}
        disabled={deploying || !selectedBlock || !agentName.trim()}
        className="w-full px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-purple-600 text-white text-sm font-semibold rounded-lg hover:from-cyan-500 hover:to-purple-500 transition-all shadow-lg shadow-cyan-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {deploying ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Deploying…
          </span>
        ) : (
          "Deploy Agent"
        )}
      </button>
    </div>
  );
}

/* ─── Main Page ─── */

export default function AgentHubPage() {
  const { isConnected, walletAddress, connect, availableWallets } = useGlobalWallet();
  const [profiles, setProfiles] = useState<BlockProfileData[]>([]);
  const [guardians, setGuardians] = useState<GuardianData[]>([]);
  const [empireStats, setEmpireStats] = useState<EmpireStats | null>(null);
  const [ownedBlocks, setOwnedBlocks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const [profilesRes, guardiansRes, statsRes] = await Promise.all([
        fetch(`/api/v1/profiles/by-wallet/${walletAddress}`),
        fetch(`/api/v1/guardian?ownerAddress=${walletAddress}`),
        fetch(`/api/v1/profiles/empire-stats/${walletAddress}`),
      ]);

      if (profilesRes.ok) {
        const pData = await profilesRes.json();
        if (pData.success) setProfiles(pData.data.profiles || []);
      }

      if (guardiansRes.ok) {
        const gData = await guardiansRes.json();
        setGuardians(gData.guardians || []);
      }

      if (statsRes.ok) {
        const sData = await statsRes.json();
        if (sData.success) {
          setEmpireStats(sData.data);
          setOwnedBlocks(sData.data.ownedBlocks || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch agent data:", err);
      setError("Failed to load agent data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (isConnected && walletAddress) fetchData();
  }, [isConnected, walletAddress, fetchData]);

  const profileMap = new Map(profiles.map((p) => [p.blockHeight, p]));
  const guardianDetailMap = new Map<number, GuardianDetail>();
  if (empireStats) {
    for (const g of empireStats.guardianDetails) {
      guardianDetailMap.set(g.blockHeight, g);
    }
  }

  const guardianBlockSet = new Set(guardians.map((g) => g.blockHeight));
  const availableForDeploy = ownedBlocks.filter((h) => !guardianBlockSet.has(h));

  const onlineCount = guardians.filter(
    (g) => g.status === "active" || g.status === "Online"
  ).length;

  // ─── Not Connected ───
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🤖</div>
          <h1 className="text-2xl font-bold text-white mb-2">AI Agents</h1>
          <p className="text-gray-400 mb-6">
            Connect your Bitcoin wallet to view and manage your sovereign AI agents.
          </p>
          <div className="flex flex-col gap-3">
            {availableWallets.map((wt) => (
              <button
                key={wt}
                onClick={() => connect(wt)}
                className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 text-white font-semibold rounded-lg hover:from-cyan-500 hover:to-purple-500 transition-all"
              >
                Connect {wt.charAt(0).toUpperCase() + wt.slice(1)}
              </button>
            ))}
            {availableWallets.length === 0 && (
              <p className="text-gray-500 text-sm">No Bitcoin wallets detected. Install Unisat, Xverse, or Leather.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading your agents…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-white relative">
      {/* Grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold">
            <span className="text-gradient-cyan-purple">AI Agents</span>
          </h1>
          <p className="text-gray-400 mt-2">
            Sovereign agents tied to your Bitcoin blocks — autonomous, on-chain, and under your control.
          </p>
          <p className="text-gray-600 text-sm mt-1 font-mono truncate">{walletAddress}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchData} className="text-xs px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Stats */}
        <section className="mb-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon="🤖" label="Total Agents" value={guardians.length} />
            <StatCard icon="🟢" label="Online Now" value={onlineCount} />
            <StatCard icon="🏗️" label="World Objects" value={empireStats?.totalWorldObjects ?? 0} />
            <StatCard icon="⛓️" label="Blocks Owned" value={ownedBlocks.length} />
          </div>
        </section>

        {/* Active Agents */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gradient-cyan-purple mb-4 uppercase tracking-wider text-sm">
            Your Agents
            <span className="text-gray-600 text-xs font-normal ml-2" style={{ WebkitTextFillColor: "rgb(75,85,99)" }}>
              ({guardians.length})
            </span>
          </h2>

          {guardians.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {guardians.map((g) => (
                <AgentCard
                  key={g.id}
                  guardian={g}
                  profile={profileMap.get(g.blockHeight) || null}
                  empireDetail={guardianDetailMap.get(g.blockHeight) || null}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-12 text-center">
              <div className="text-5xl mb-4 opacity-60">🤖</div>
              <h3 className="text-lg font-semibold text-white mb-2">No Agents Deployed</h3>
              <p className="text-gray-400 text-sm mb-1 max-w-md mx-auto">
                Deploy your first AI agent to a block. Agents can guard your territory, interact with visitors,
                and build in your world autonomously.
              </p>
              {ownedBlocks.length === 0 && (
                <p className="text-gray-600 text-xs mt-4">
                  You need to own a bitmap block first.{" "}
                  <Link href="/verify" className="text-cyan-400 hover:underline">Verify a block</Link> to get started.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Deploy New Agent */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-gradient-cyan-purple mb-4 uppercase tracking-wider text-sm">
            Deploy New Agent
          </h2>
          <DeploySection
            availableBlocks={availableForDeploy}
            profileMap={profileMap}
            walletAddress={walletAddress!}
            onDeployed={fetchData}
          />
        </section>

        {/* Quick Links */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-gradient-cyan-purple mb-4 uppercase tracking-wider text-sm">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href="/profile"
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-4 hover:border-orange-500/20 hover:bg-white/[0.05] transition-all group"
            >
              <div className="text-xl mb-2">🏠</div>
              <div className="text-sm font-medium text-white group-hover:text-orange-400 transition-colors">Command Center</div>
              <div className="text-xs text-gray-500 mt-0.5">Manage blocks & profiles</div>
            </Link>
            <Link
              href="/directory"
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-4 hover:border-cyan-500/20 hover:bg-white/[0.05] transition-all group"
            >
              <div className="text-xl mb-2">📒</div>
              <div className="text-sm font-medium text-white group-hover:text-cyan-400 transition-colors">Agent Directory</div>
              <div className="text-xs text-gray-500 mt-0.5">Browse all agents</div>
            </Link>
            <Link
              href="/explore"
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-4 hover:border-purple-500/20 hover:bg-white/[0.05] transition-all group"
            >
              <div className="text-xl mb-2">🔍</div>
              <div className="text-sm font-medium text-white group-hover:text-purple-400 transition-colors">Explore</div>
              <div className="text-xs text-gray-500 mt-0.5">Discover blocks & genomes</div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
