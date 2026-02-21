"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useGlobalWallet } from "@/context/GlobalWalletContext";
import CrownShield, { type ShieldTier } from "@/components/CrownShield";
import BitmapThumbnail from "@/components/BitmapThumbnail";

interface BlockProfileData {
  id: string;
  walletAddress: string;
  blockHeight: number;
  handle: string;
  displayName?: string;
  genomeHash?: string;
  tier: number;
  verified: boolean;
  isPrimary: boolean;
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
    <div className="relative group rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-4 sm:p-5 transition-all hover:border-white/[0.15] hover:bg-white/[0.05]">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative">
        <div className="text-2xl mb-2">{icon}</div>
        <div className="text-2xl sm:text-3xl font-bold text-white">{value}</div>
        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

export default function ProfileHubPage() {
  const { isConnected, walletAddress, connect, availableWallets } = useGlobalWallet();
  const [profiles, setProfiles] = useState<BlockProfileData[]>([]);
  const [ownedBlocks, setOwnedBlocks] = useState<number[]>([]);
  const [empireStats, setEmpireStats] = useState<EmpireStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingPrimary, setSettingPrimary] = useState<number | null>(null);
  const [transferModal, setTransferModal] = useState<{ blockHeight: number; handle?: string } | null>(null);

  const guardianMap = new Map<number, GuardianDetail>();
  if (empireStats) {
    for (const g of empireStats.guardianDetails) {
      guardianMap.set(g.blockHeight, g);
    }
  }

  const fetchData = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const [profilesRes, userRes, statsRes] = await Promise.all([
        fetch(`/api/v1/profiles/by-wallet/${walletAddress}`),
        fetch(`/api/v1/users/by-wallet/${walletAddress}`),
        fetch(`/api/v1/profiles/empire-stats/${walletAddress}`),
      ]);

      if (profilesRes.ok) {
        const pData = await profilesRes.json();
        if (pData.success) setProfiles(pData.data.profiles || []);
      }

      if (userRes.ok) {
        const uData = await userRes.json();
        if (uData.success) setOwnedBlocks(uData.data.ownedBlocks || []);
      }

      if (statsRes.ok) {
        const sData = await statsRes.json();
        if (sData.success) setEmpireStats(sData.data);
      }
    } catch (err) {
      console.error("Failed to fetch profile data:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (isConnected && walletAddress) fetchData();
  }, [isConnected, walletAddress, fetchData]);

  const handleSetPrimary = async (blockHeight: number) => {
    if (!walletAddress || settingPrimary !== null) return;
    setSettingPrimary(blockHeight);
    try {
      const res = await fetch("/api/v1/profiles/set-primary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, blockHeight }),
      });
      if (res.ok) {
        setProfiles((prev) =>
          prev.map((p) => ({ ...p, isPrimary: p.blockHeight === blockHeight }))
        );
      }
    } catch (err) {
      console.error("Failed to set primary:", err);
    } finally {
      setSettingPrimary(null);
    }
  };

  const primaryProfile = profiles.find((p) => p.isPrimary) || profiles[0];
  const profiledBlockHeights = new Set(profiles.map((p) => p.blockHeight));
  const unprofiledBlocks = ownedBlocks.filter((b) => !profiledBlockHeights.has(b));

  // ─── Not Connected ───
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h1>
          <p className="text-gray-400 mb-6">
            Connect a Bitcoin wallet to view and manage your Block Genomics profiles.
          </p>
          <div className="flex flex-col gap-3">
            {availableWallets.map((wt) => (
              <button
                key={wt}
                onClick={() => connect(wt)}
                className="px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-500 text-white font-semibold rounded-lg hover:from-orange-500 hover:to-amber-400 transition-all"
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
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading command center…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white relative">
      {/* Matrix grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* ═══ HEADER ═══ */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500 bg-clip-text text-transparent">
            Command Center
          </h1>
          <p className="text-gray-400 mt-2">
            Manage your digital bitmap empire
          </p>
          <p className="text-gray-600 text-sm mt-1 font-mono truncate">
            {walletAddress}
          </p>
        </div>

        {/* ═══ EMPIRE STATS BANNER ═══ */}
        {empireStats && (
          <section className="mb-10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard icon="🏗️" label="Blocks Owned" value={empireStats.totalBlocks} />
              <StatCard icon="🟢" label="Guardians Active" value={empireStats.activeGuardians} />
              <StatCard icon="🌐" label="World Objects" value={empireStats.totalWorldObjects} />
              <StatCard icon="👥" label="Total Visitors" value={empireStats.totalVisitors} />
            </div>
          </section>
        )}

        {/* ═══ PRIMARY PROFILE ═══ */}
        {primaryProfile && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent mb-4 uppercase tracking-wider text-sm">
              Primary Identity
            </h2>
            <div className="relative overflow-hidden rounded-2xl border border-orange-500/20 bg-white/[0.03] backdrop-blur-md p-6 sm:p-8 transition-all hover:border-orange-500/30">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-purple-500/5" />

              <div className="relative flex flex-col sm:flex-row items-start gap-6">
                {/* Large bitmap thumbnail */}
                <div className="flex-shrink-0">
                  <BitmapThumbnail blockHeight={primaryProfile.blockHeight} size={160} className="border-2 border-orange-500/30 rounded-lg" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
                      {primaryProfile.displayName || primaryProfile.handle}
                    </h2>
                    <CrownShield
                      tier={(primaryProfile.tier || 1) as ShieldTier}
                      size={36}
                      verified={primaryProfile.verified}
                    />
                  </div>
                  <p className="text-gray-400 text-sm mb-1">@{primaryProfile.handle}</p>
                  <p className="text-gray-600 text-xs font-mono mb-4 truncate">
                    Block #{primaryProfile.blockHeight}
                    {primaryProfile.genomeHash && ` · ${primaryProfile.genomeHash.slice(0, 16)}…`}
                  </p>

                  {/* Guardian status */}
                  {(() => {
                    const g = guardianMap.get(primaryProfile.blockHeight);
                    if (!g) return null;
                    const isActive = g.status === "active" || g.status === "Online";
                    return (
                      <div className="space-y-1.5 mb-5">
                        <div className="flex items-center gap-2 text-sm">
                          <PulsingDot active={isActive} />
                          <span className={isActive ? "text-green-400" : "text-yellow-400"}>
                            Guardian {isActive ? "Online" : "Paused"}
                          </span>
                        </div>
                        <p className="text-gray-500 text-xs">
                          Last heartbeat: {timeAgo(g.lastHeartbeat)}
                        </p>
                        {g.lastAction && (
                          <p className="text-gray-500 text-xs italic">
                            &ldquo;{g.lastAction}&rdquo; — {timeAgo(g.lastActionTime)}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/agent/${primaryProfile.handle}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-all"
                    >
                      View Block →
                    </Link>
                    <Link
                      href={`/agent/${primaryProfile.handle}?chat=1`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all"
                    >
                      Talk to Guardian →
                    </Link>
                    <Link
                      href={`/agent/${primaryProfile.handle}/edit`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-white/[0.05] text-gray-400 border border-white/[0.08] hover:bg-white/[0.08] transition-all"
                    >
                      Edit Profile
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ═══ ALL BLOCK PROFILES ═══ */}
        {profiles.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent mb-4 uppercase tracking-wider text-sm">
              Block Profiles
              <span className="text-gray-600 text-xs font-normal ml-2 bg-none text-transparent bg-clip-text" style={{ WebkitTextFillColor: 'rgb(75,85,99)' }}>({profiles.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((profile) => {
                const g = guardianMap.get(profile.blockHeight);
                const isActive = g ? (g.status === "active" || g.status === "Online") : false;
                const isPrimary = profile.isPrimary || (primaryProfile?.id === profile.id && !profiles.some(p => p.isPrimary));
                return (
                  <div
                    key={profile.id}
                    className={`group relative rounded-xl border p-4 backdrop-blur-md transition-all hover:scale-[1.01] hover:shadow-lg hover:shadow-black/20 ${
                      isPrimary
                        ? "border-orange-500/20 bg-white/[0.04]"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                    }`}
                  >
                    {isPrimary && (
                      <div className="absolute top-2 right-2 text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">⭐ Primary</div>
                    )}

                    <div className="flex items-start gap-3">
                      <BitmapThumbnail blockHeight={profile.blockHeight} size={80} className="rounded-lg" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white truncate text-sm">
                            {profile.displayName || profile.handle}
                          </span>
                          <CrownShield
                            tier={(profile.tier || 1) as ShieldTier}
                            size={20}
                            verified={profile.verified}
                          />
                        </div>
                        <p className="text-gray-500 text-xs truncate">
                          @{profile.handle} · #{profile.blockHeight}
                        </p>

                        {/* Guardian status */}
                        {g ? (
                          <div className="mt-2 space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs">
                              <PulsingDot active={isActive} />
                              <span className={isActive ? "text-green-400" : "text-yellow-400"}>
                                {isActive ? "Online" : "Paused"}
                              </span>
                              <span className="text-gray-600">· {timeAgo(g.lastHeartbeat)}</span>
                            </div>
                            <p className="text-gray-600 text-xs truncate">
                              {g.lastAction ? `${g.lastAction} — ${timeAgo(g.lastActionTime)}` : "No activity yet"}
                            </p>
                            <p className="text-gray-500 text-xs">🏗️ {g.worldObjectCount} objects</p>
                          </div>
                        ) : (
                          <p className="text-gray-600 text-xs mt-2">No Guardian assigned</p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.05]">
                      <Link
                        href={`/agent/${profile.handle}`}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        View
                      </Link>
                      <Link
                        href={`/agent/${profile.handle}?chat=1`}
                        className="text-xs text-gray-400 hover:text-purple-400 transition-colors"
                      >
                        Guardian
                      </Link>
                      {!isPrimary ? (
                        <button
                          onClick={() => handleSetPrimary(profile.blockHeight)}
                          disabled={settingPrimary !== null}
                          className="text-xs text-gray-400 hover:text-orange-400 transition-colors disabled:opacity-50"
                        >
                          {settingPrimary === profile.blockHeight ? "Setting…" : "Set Primary"}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-600">Primary</span>
                      )}
                      <button
                        onClick={() => setTransferModal({ blockHeight: profile.blockHeight, handle: profile.handle })}
                        className="text-xs text-gray-600 hover:text-gray-300 transition-colors ml-auto"
                      >
                        Transfer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ═══ UNPROFILED BITMAPS ═══ */}
        {unprofiledBlocks.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent mb-4 uppercase tracking-wider text-sm">
              Unprofiled Bitmaps
              <span className="text-gray-600 text-xs font-normal ml-2" style={{ WebkitTextFillColor: 'rgb(75,85,99)' }}>({unprofiledBlocks.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {unprofiledBlocks.map((blockHeight) => (
                <div
                  key={blockHeight}
                  className="group rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] backdrop-blur-md p-4 hover:border-white/[0.15] transition-all hover:scale-[1.01]"
                >
                  <div className="flex items-center gap-3">
                    <BitmapThumbnail blockHeight={blockHeight} size={56} className="rounded-lg opacity-60 group-hover:opacity-100 transition-opacity" />
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">Block #{blockHeight}</p>
                      <p className="text-gray-600 text-xs">No Guardian assigned — activate to bring this block to life</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.05]">
                    <Link
                      href="/verify"
                      className="text-xs px-3 py-1.5 rounded-md bg-gradient-to-r from-orange-600 to-amber-500 text-white font-medium hover:from-orange-500 hover:to-amber-400 transition-all"
                    >
                      ⚡ Activate
                    </Link>
                    <button
                      onClick={() => setTransferModal({ blockHeight })}
                      className="text-xs px-3 py-1.5 rounded-md text-gray-600 hover:text-gray-300 transition-colors ml-auto"
                    >
                      Transfer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ EMPTY STATE ═══ */}
        {profiles.length === 0 && ownedBlocks.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🧬</div>
            <h2 className="text-xl font-semibold text-white mb-2">No Bitmaps Found</h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              You don&apos;t have any Bitmap blocks yet. Acquire one and verify ownership to create your first profile.
            </p>
            <Link
              href="/verify"
              className="inline-flex px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-500 text-white font-semibold rounded-lg hover:from-orange-500 hover:to-amber-400 transition-all"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>

      {/* ═══ TRANSFER MODAL ═══ */}
      {transferModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => setTransferModal(null)}
        >
          <div
            className="bg-[#151520] border border-white/[0.08] rounded-2xl p-6 max-w-md w-full backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-2">Transfer Bitmap</h3>
            <p className="text-gray-400 text-sm mb-4">
              Bitmap transfers are done through your wallet application. Use the inscription ID below
              to locate and send this bitmap.
            </p>

            <div className="bg-black/30 rounded-lg p-3 mb-4 border border-white/[0.05]">
              <p className="text-gray-500 text-xs mb-1">Block Height</p>
              <p className="text-white font-mono text-sm">{transferModal.blockHeight}</p>
              {transferModal.handle && (
                <>
                  <p className="text-gray-500 text-xs mb-1 mt-2">Handle</p>
                  <p className="text-white text-sm">@{transferModal.handle}</p>
                </>
              )}
              <p className="text-gray-500 text-xs mb-1 mt-2">Inscription ID</p>
              <p className="text-white font-mono text-xs break-all">
                {transferModal.blockHeight}.bitmap
              </p>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(`${transferModal.blockHeight}.bitmap`);
              }}
              className="w-full px-4 py-2 text-sm bg-white/[0.05] text-gray-300 rounded-lg hover:bg-white/[0.08] border border-white/[0.08] transition-colors mb-2"
            >
              Copy Inscription ID
            </button>
            <button
              onClick={() => setTransferModal(null)}
              className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
