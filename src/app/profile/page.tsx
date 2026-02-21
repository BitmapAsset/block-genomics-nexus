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

interface GuardianInfo {
  blockHeight: number;
  status: string;
}

interface UserData {
  ownedBlocks: number[];
  blockProfiles: BlockProfileData[];
}

export default function ProfileHubPage() {
  const { isConnected, walletAddress, connect, availableWallets } = useGlobalWallet();
  const [profiles, setProfiles] = useState<BlockProfileData[]>([]);
  const [ownedBlocks, setOwnedBlocks] = useState<number[]>([]);
  const [guardians, setGuardians] = useState<Map<number, GuardianInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [settingPrimary, setSettingPrimary] = useState<number | null>(null);
  const [transferModal, setTransferModal] = useState<{ blockHeight: number; handle?: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const [profilesRes, userRes] = await Promise.all([
        fetch(`/api/v1/profiles/by-wallet/${walletAddress}`),
        fetch(`/api/v1/users/by-wallet/${walletAddress}`),
      ]);

      if (profilesRes.ok) {
        const pData = await profilesRes.json();
        if (pData.success) {
          setProfiles(pData.data.profiles || []);
        }
      }

      if (userRes.ok) {
        const uData = await userRes.json();
        if (uData.success) {
          setOwnedBlocks(uData.data.ownedBlocks || []);
        }
      }

      // Fetch guardian status for each profiled block
      const profilesData = profiles.length > 0 ? profiles : [];
      const guardianMap = new Map<number, GuardianInfo>();
      // We'll fetch guardians after profiles are set
    } catch (err) {
      console.error("Failed to fetch profile data:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Fetch guardian info for profiled blocks
  const fetchGuardians = useCallback(async () => {
    if (!profiles.length) return;
    const guardianMap = new Map<number, GuardianInfo>();
    await Promise.all(
      profiles.map(async (p) => {
        try {
          const res = await fetch(`/api/v1/agents/block/${p.blockHeight}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.data) {
              guardianMap.set(p.blockHeight, {
                blockHeight: p.blockHeight,
                status: data.data.status || "active",
              });
            }
          }
        } catch {}
      })
    );
    setGuardians(guardianMap);
  }, [profiles]);

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchData();
    }
  }, [isConnected, walletAddress, fetchData]);

  useEffect(() => {
    fetchGuardians();
  }, [profiles, fetchGuardians]);

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
          <p className="text-gray-400">Loading your profiles…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
            Profile Hub
          </h1>
          <p className="text-gray-400 mt-2">
            Manage your Block Genomics identities
          </p>
          <p className="text-gray-600 text-sm mt-1 font-mono truncate">
            {walletAddress}
          </p>
        </div>

        {/* ═══ PRIMARY PROFILE ═══ */}
        {primaryProfile && (
          <section className="mb-12">
            <div className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-[#1a1520] to-[#0f0a14] p-6 sm:p-8">
              {/* Star badge */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-orange-500/20 text-orange-300 text-xs font-semibold px-3 py-1.5 rounded-full border border-orange-500/30">
                ⭐ Primary Identity
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-6">
                {/* Large bitmap thumbnail */}
                <div className="flex-shrink-0">
                  <BitmapThumbnail blockHeight={primaryProfile.blockHeight} size={128} className="border-2 border-orange-500/40" />
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
                  <p className="text-gray-500 text-xs font-mono mb-3 truncate">
                    Block #{primaryProfile.blockHeight}
                    {primaryProfile.genomeHash && ` · ${primaryProfile.genomeHash.slice(0, 16)}…`}
                  </p>

                  {/* Guardian status */}
                  {guardians.has(primaryProfile.blockHeight) && (
                    <div className="flex items-center gap-2 text-sm">
                      {guardians.get(primaryProfile.blockHeight)!.status === "active" ? (
                        <span className="text-green-400">🟢 Guardian Online</span>
                      ) : (
                        <span className="text-yellow-400">🟡 Guardian Paused</span>
                      )}
                    </div>
                  )}

                  <div className="mt-4">
                    <Link
                      href={`/agent/${primaryProfile.handle}`}
                      className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
                    >
                      View Profile →
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
            <h2 className="text-xl font-semibold text-white mb-4">
              All Block Profiles
              <span className="text-gray-500 text-sm font-normal ml-2">({profiles.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((profile) => {
                const guardian = guardians.get(profile.blockHeight);
                const isPrimary = profile.isPrimary || (primaryProfile?.id === profile.id && !profiles.some(p => p.isPrimary));
                return (
                  <div
                    key={profile.id}
                    className={`relative rounded-xl border p-4 transition-all ${
                      isPrimary
                        ? "border-orange-500/40 bg-[#161220]"
                        : "border-gray-700/50 bg-[#111118] hover:border-gray-600/60"
                    }`}
                  >
                    {isPrimary && (
                      <div className="absolute top-2 right-2 text-xs text-orange-400">⭐</div>
                    )}

                    <div className="flex items-start gap-3">
                      {/* Small bitmap */}
                      <BitmapThumbnail blockHeight={profile.blockHeight} size={56} />

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
                        {guardian && (
                          <p className="text-xs mt-1">
                            {guardian.status === "active" ? (
                              <span className="text-green-400">🟢 Online</span>
                            ) : (
                              <span className="text-yellow-400">🟡 Paused</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800/60">
                      {!isPrimary ? (
                        <button
                          onClick={() => handleSetPrimary(profile.blockHeight)}
                          disabled={settingPrimary !== null}
                          className="text-xs px-3 py-1.5 rounded-md bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 transition-all disabled:opacity-50"
                        >
                          {settingPrimary === profile.blockHeight ? "Setting…" : "Set as Primary"}
                        </button>
                      ) : (
                        <span className="text-xs px-3 py-1.5 rounded-md bg-gray-800/50 text-gray-500 border border-gray-700/30">
                          Primary
                        </span>
                      )}
                      <Link
                        href={`/agent/${profile.handle}`}
                        className="text-xs px-3 py-1.5 rounded-md text-gray-400 hover:text-white transition-colors"
                      >
                        View Profile →
                      </Link>
                      <button
                        onClick={() => setTransferModal({ blockHeight: profile.blockHeight, handle: profile.handle })}
                        className="text-xs px-3 py-1.5 rounded-md text-gray-500 hover:text-gray-300 transition-colors ml-auto"
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
            <h2 className="text-xl font-semibold text-white mb-4">
              Unprofiled Bitmaps
              <span className="text-gray-500 text-sm font-normal ml-2">({unprofiledBlocks.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {unprofiledBlocks.map((blockHeight) => (
                <div
                  key={blockHeight}
                  className="rounded-xl border border-dashed border-gray-700/50 bg-[#111118] p-4 hover:border-gray-600/60 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <BitmapThumbnail blockHeight={blockHeight} size={56} />
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">Block #{blockHeight}</p>
                      <p className="text-gray-500 text-xs">No profile created</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800/60">
                    <Link
                      href="/verify"
                      className="text-xs px-3 py-1.5 rounded-md bg-gradient-to-r from-orange-600 to-amber-500 text-white font-medium hover:from-orange-500 hover:to-amber-400 transition-all"
                    >
                      Create Profile
                    </Link>
                    <button
                      onClick={() => setTransferModal({ blockHeight })}
                      className="text-xs px-3 py-1.5 rounded-md text-gray-500 hover:text-gray-300 transition-colors ml-auto"
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
              You don't have any Bitmap blocks yet. Acquire one and verify ownership to create your first profile.
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
            className="bg-[#151520] border border-gray-700/60 rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-2">Transfer Bitmap</h3>
            <p className="text-gray-400 text-sm mb-4">
              Bitmap transfers are done through your wallet application. Use the inscription ID below
              to locate and send this bitmap.
            </p>

            <div className="bg-[#0a0a0f] rounded-lg p-3 mb-4">
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
              className="w-full px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors mb-2"
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
