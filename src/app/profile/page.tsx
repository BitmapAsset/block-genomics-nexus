"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
    <div className="relative group rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-4 sm:p-5 transition-all duration-300 hover:border-orange-500/20 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-orange-500/5">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative">
        <div className="text-2xl mb-2">{icon}</div>
        <div className="text-2xl sm:text-3xl font-bold text-white">{value}</div>
        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm backdrop-blur-md animate-in slide-in-from-bottom-4">
      ✓ {message}
    </div>
  );
}

/* ─── Inline Editable Field ─── */
function InlineEdit({
  value,
  onSave,
  multiline,
  placeholder,
  className,
}: {
  value: string;
  onSave: (val: string) => Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`text-left hover:bg-white/[0.05] rounded px-1 -mx-1 transition-colors cursor-text group/edit ${className || ""}`}
        title="Click to edit"
      >
        {value || <span className="text-gray-600 italic">{placeholder || "Click to edit"}</span>}
        <span className="text-gray-600 opacity-0 group-hover/edit:opacity-100 ml-1.5 text-xs transition-opacity">✏️</span>
      </button>
    );
  }

  const save = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch { /* keep editing */ }
    finally { setSaving(false); }
  };

  const Tag = multiline ? "textarea" : "input";
  return (
    <div className="flex items-start gap-2">
      <Tag
        ref={ref as any}
        value={draft}
        onChange={(e: any) => setDraft(e.target.value)}
        onKeyDown={(e: any) => { if (e.key === "Enter" && !multiline) save(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        rows={multiline ? 3 : undefined}
        className={`flex-1 bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500/50 resize-none ${className || ""}`}
        placeholder={placeholder}
      />
      <button onClick={save} disabled={saving} className="px-2.5 py-1.5 text-xs bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 disabled:opacity-50 transition-colors">
        {saving ? "…" : "Save"}
      </button>
      <button onClick={() => { setDraft(value); setEditing(false); }} className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
        ✕
      </button>
    </div>
  );
}

/* ─── Block Card ─── */
function BlockCard({
  blockHeight,
  profile,
  guardian,
  isPrimary,
  onSetPrimary,
  settingPrimary,
  onTransfer,
  onProfileUpdate,
  walletAddress,
  onToast,
}: {
  blockHeight: number;
  profile: BlockProfileData | null;
  guardian: GuardianDetail | null;
  isPrimary: boolean;
  onSetPrimary: (h: number) => void;
  settingPrimary: number | null;
  onTransfer: (h: number, handle?: string) => void;
  onProfileUpdate: (blockHeight: number, data: Partial<BlockProfileData>) => void;
  walletAddress: string;
  onToast: (msg: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActive = guardian ? (guardian.status === "active" || guardian.status === "Online") : false;
  const isPaused = guardian ? guardian.status === "paused" || guardian.status === "Paused" : false;
  const profiled = !!profile;

  const saveField = async (field: string, value: string) => {
    const res = await fetch("/api/v1/profiles/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, blockHeight, [field]: value }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to save");
    }
    const data = await res.json();
    onProfileUpdate(blockHeight, data.data);
    onToast(`${field.charAt(0).toUpperCase() + field.slice(1)} updated`);
  };

  return (
    <div
      className={`group relative rounded-xl border backdrop-blur-md transition-all duration-300 overflow-hidden ${
        isPrimary
          ? "border-orange-500/25 bg-white/[0.04] shadow-lg shadow-orange-500/5"
          : profiled
          ? "border-white/[0.08] bg-white/[0.03] hover:border-orange-500/15"
          : "border-dashed border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
      }`}
    >
      {/* Collapsed / Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        <div className="flex-shrink-0 relative">
          <BitmapThumbnail blockHeight={blockHeight} size={80} className={`rounded-lg transition-opacity ${profiled ? "" : "opacity-60 group-hover:opacity-90"}`} />
          {isPrimary && (
            <span className="absolute -top-1.5 -right-1.5 text-sm">⭐</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-white truncate text-sm">
              {profile?.displayName || profile?.handle || `Block #${blockHeight}`}
            </span>
            {profile && (
              <CrownShield tier={(profile.tier || 1) as ShieldTier} size={20} verified={profile.verified} />
            )}
          </div>
          {profile && (
            <p className="text-gray-500 text-xs truncate">@{profile.handle} · #{blockHeight}</p>
          )}
          {!profile && (
            <p className="text-gray-600 text-xs">#{blockHeight} · Not profiled</p>
          )}

          {/* Quick stats row */}
          <div className="flex items-center gap-3 mt-2 text-xs">
            {guardian ? (
              <span className="flex items-center gap-1.5">
                <PulsingDot active={isActive} />
                <span className={isActive ? "text-green-400" : isPaused ? "text-yellow-400" : "text-gray-500"}>
                  {isActive ? "Online" : isPaused ? "Paused" : guardian.status}
                </span>
              </span>
            ) : (
              <span className="text-gray-600">No Guardian</span>
            )}
            {guardian && <span className="text-gray-600">🏗️ {guardian.worldObjectCount}</span>}
            {isPrimary && <span className="text-orange-400/70 text-[10px] uppercase tracking-wider font-medium">Primary</span>}
          </div>
        </div>

        <span className={`text-gray-600 text-xs transition-transform duration-300 mt-2 ${expanded ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {/* Expanded */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: expanded ? "800px" : "0px", opacity: expanded ? 1 : 0 }}
      >
        <div className="px-4 pb-4 space-y-4 border-t border-white/[0.05] pt-4">
          {profiled ? (
            <>
              {/* Profile Section */}
              <div>
                <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-medium">Profile</h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-600 uppercase tracking-wider">Display Name</label>
                    <InlineEdit
                      value={profile!.displayName || ""}
                      placeholder="Set display name"
                      onSave={(v) => saveField("displayName", v)}
                      className="text-sm text-white block"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600 uppercase tracking-wider">Bio</label>
                    <InlineEdit
                      value={profile!.bio || ""}
                      placeholder="Write a bio…"
                      onSave={(v) => saveField("bio", v)}
                      multiline
                      className="text-sm text-gray-300 block"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600 uppercase tracking-wider">Handle</label>
                    <InlineEdit
                      value={profile!.handle}
                      placeholder="handle"
                      onSave={(v) => saveField("handle", v)}
                      className="text-sm text-gray-400 block"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    {!isPrimary && (
                      <button
                        onClick={() => onSetPrimary(blockHeight)}
                        disabled={settingPrimary !== null}
                        className="text-xs px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-all disabled:opacity-50"
                      >
                        {settingPrimary === blockHeight ? "Setting…" : "⭐ Set as Primary"}
                      </button>
                    )}
                    <Link
                      href={`/agent/${profile!.handle}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] text-gray-400 border border-white/[0.08] hover:bg-white/[0.08] transition-all"
                    >
                      View Public Profile →
                    </Link>
                  </div>
                </div>
              </div>

              {/* Guardian Section */}
              <div>
                <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-medium">Guardian</h4>
                {guardian ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <PulsingDot active={isActive} />
                      <span className={isActive ? "text-green-400" : "text-yellow-400"}>
                        {isActive ? "Online" : isPaused ? "Paused" : guardian.status}
                      </span>
                      <span className="text-gray-600 text-xs">· Last heartbeat: {timeAgo(guardian.lastHeartbeat)}</span>
                    </div>
                    {guardian.lastAction && (
                      <p className="text-gray-500 text-xs italic">&ldquo;{guardian.lastAction}&rdquo; — {timeAgo(guardian.lastActionTime)}</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link href={`/agent/${profile!.handle}?tab=guardian`} className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all">
                        Configure Guardian →
                      </Link>
                      <Link href={`/agent/${profile!.handle}?tab=openclaw`} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all">
                        Connect OpenClaw →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs">No Guardian assigned</p>
                )}
              </div>

              {/* World Section */}
              <div>
                <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-medium">World</h4>
                <p className="text-gray-400 text-sm mb-2">🏗️ {guardian?.worldObjectCount ?? 0} objects</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/agent/${profile!.handle}`} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                    Enter Block →
                  </Link>
                  {guardian && (
                    <Link href={`/agent/${profile!.handle}?chat=1`} className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all">
                      Build with Guardian →
                    </Link>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Unprofiled */
            <div className="text-center py-4">
              <p className="text-gray-500 text-sm mb-3">This block hasn&apos;t been profiled yet.</p>
              <Link
                href="/verify"
                className="inline-flex px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 text-white text-sm font-semibold rounded-lg hover:from-orange-500 hover:to-amber-400 transition-all shadow-lg shadow-orange-500/20"
              >
                ⚡ Create Profile
              </Link>
              <div className="mt-4 space-y-1">
                {["Guardian", "World Building", "Marketplace"].map((s) => (
                  <p key={s} className="text-gray-700 text-xs">🔒 {s} — <span className="italic">Activate to unlock</span></p>
                ))}
              </div>
            </div>
          )}

          {/* Actions — always shown */}
          <div className="border-t border-white/[0.05] pt-3">
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-medium">Actions</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onTransfer(blockHeight, profile?.handle)}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] text-gray-400 border border-white/[0.08] hover:bg-white/[0.08] transition-all"
              >
                Transfer Bitmap
              </button>
              <Link
                href="/marketplace"
                className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] text-gray-400 border border-white/[0.08] hover:bg-white/[0.08] transition-all"
              >
                List on Marketplace
              </Link>
              <Link
                href="/marketplace"
                className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] text-gray-400 border border-white/[0.08] hover:bg-white/[0.08] transition-all"
              >
                Create Delegation
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function ProfileHubPage() {
  const { isConnected, walletAddress, connect, availableWallets } = useGlobalWallet();
  const [profiles, setProfiles] = useState<BlockProfileData[]>([]);
  const [ownedBlocks, setOwnedBlocks] = useState<number[]>([]);
  const [empireStats, setEmpireStats] = useState<EmpireStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingPrimary, setSettingPrimary] = useState<number | null>(null);
  const [transferModal, setTransferModal] = useState<{ blockHeight: number; handle?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

      let allBlocks: number[] = [];

      if (profilesRes.ok) {
        const pData = await profilesRes.json();
        if (pData.success) setProfiles(pData.data.profiles || []);
      }

      if (userRes.ok) {
        const uData = await userRes.json();
        if (uData.success) allBlocks = [...(uData.data.ownedBlocks || [])];
      }

      if (statsRes.ok) {
        const sData = await statsRes.json();
        if (sData.success) {
          setEmpireStats(sData.data);
          if (sData.data.ownedBlocks) {
            const merged = new Set([...allBlocks, ...sData.data.ownedBlocks]);
            allBlocks = [...merged];
          }
        }
      }

      setOwnedBlocks(allBlocks);
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

  const handleProfileUpdate = (blockHeight: number, data: Partial<BlockProfileData>) => {
    setProfiles((prev) =>
      prev.map((p) => (p.blockHeight === blockHeight ? { ...p, ...data } : p))
    );
  };

  const profileMap = new Map(profiles.map((p) => [p.blockHeight, p]));
  const allBlockHeights = [...new Set([...ownedBlocks, ...profiles.map((p) => p.blockHeight)])].sort((a, b) => a - b);

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
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500 bg-clip-text text-transparent">
            Command Center
          </h1>
          <p className="text-gray-400 mt-2">Manage your digital bitmap empire</p>
          <p className="text-gray-600 text-sm mt-1 font-mono truncate">{walletAddress}</p>
        </div>

        {/* Empire Stats */}
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

        {/* Block Cards Grid */}
        {allBlockHeights.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent mb-4 uppercase tracking-wider text-sm">
              Your Blocks
              <span className="text-gray-600 text-xs font-normal ml-2" style={{ WebkitTextFillColor: "rgb(75,85,99)" }}>
                ({allBlockHeights.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {allBlockHeights.map((h) => {
                const profile = profileMap.get(h) || null;
                const primaryProfile = profiles.find((p) => p.isPrimary) || profiles[0];
                const isPrimary = profile ? (profile.isPrimary || (!profiles.some((p) => p.isPrimary) && primaryProfile?.id === profile.id)) : false;
                return (
                  <BlockCard
                    key={h}
                    blockHeight={h}
                    profile={profile}
                    guardian={guardianMap.get(h) || null}
                    isPrimary={isPrimary}
                    onSetPrimary={handleSetPrimary}
                    settingPrimary={settingPrimary}
                    onTransfer={(bh, handle) => setTransferModal({ blockHeight: bh, handle })}
                    onProfileUpdate={handleProfileUpdate}
                    walletAddress={walletAddress!}
                    onToast={setToast}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Empty State */}
        {allBlockHeights.length === 0 && (
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

      {/* Transfer Modal */}
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
              Bitmap transfers are done through your wallet application. Use the inscription ID below to locate and send this bitmap.
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
              <p className="text-white font-mono text-xs break-all">{transferModal.blockHeight}.bitmap</p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(`${transferModal.blockHeight}.bitmap`)}
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

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
