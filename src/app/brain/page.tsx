"use client";

import { useEffect, useState } from "react";
import BitmapBlocksBg from "@/components/BitmapBlocksBg";

/* ─── Types ─── */
interface BrainData {
  identity: { handle: string; name: string; role: string; tier: number; wallet: string };
  inscriptions: { moralCode: string; soulText: string; soulFile: string };
  moralCode: string[];
  parameters: {
    flagThresholdSoft: number;
    flagThresholdHard: number;
    appealDurationHours: number;
    appealRestoreMajority: number;
    falseFlagStrikeLimit: number;
    feePercent: number;
  };
  stats: {
    totalFlags: number;
    totalHidden: number;
    totalRestored: number;
    totalActions: number;
    totalAppeals: number;
    pendingAppeals: number;
    brainFlags: number;
    communityOverrideRate: string;
    walletBalanceSats: number | null;
  };
  recentActions: Array<{
    id: string;
    type: string;
    contentId: string | null;
    details: Record<string, unknown> | string | null;
    timestamp: string;
  }>;
  constraints: string[];
}

/* ─── Styles ─── */
const glass = "bg-[#12121f]/60 backdrop-blur-md border border-[#1e1e3a] rounded-2xl";
const glassHover = "hover:border-[#00ffcc33] hover:shadow-[0_0_20px_rgba(0,255,204,0.06)] transition-all duration-300";
const mono = "font-mono";
const cyan = "text-[#00ffcc]";
const amber = "text-[#ffaa00]";
const dim = "text-[#8888aa]";
const red = "text-[#ff5577]";

export default function BrainPage() {
  const [data, setData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/brain/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fallback values while loading
  const stats = data?.stats || {
    totalFlags: 0, totalHidden: 0, totalRestored: 0, totalActions: 0,
    totalAppeals: 0, pendingAppeals: 0, brainFlags: 0,
    communityOverrideRate: "0%", walletBalanceSats: null,
  };
  const moralCode = data?.moralCode || [
    "No exploitation of minors — zero tolerance",
    "No direct threats of violence",
    "No doxxing (sharing private info without consent)",
    "No fraud/scam content designed to steal",
    "No impersonation of verified identities",
  ];
  const constraints = data?.constraints || [];
  const recentActions = data?.recentActions || [];

  return (
    <div className="relative min-h-screen bg-[#0a0a12] text-white">
      <BitmapBlocksBg />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        {/* ═══ HERO ═══ */}
        <section className="text-center mb-20">
          <div className="text-7xl mb-6">🧠</div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            The <span className={cyan}>Nexus Brain</span>
          </h1>
          <p className={`${dim} text-lg max-w-xl mx-auto mb-6`}>
            Autonomous Moral Guardian · Soul Inscribed on Bitcoin
          </p>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            {loading ? "CONNECTING..." : "ONLINE"}
          </div>
        </section>

        {/* ═══ INSCRIPTION VERIFICATION ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">
            ⛓️ Bitcoin Inscriptions
          </h2>
          <p className={`${dim} text-sm text-center mb-6 max-w-lg mx-auto`}>
            The Brain&apos;s soul is permanently inscribed on Bitcoin. 
            Anyone can verify its operating instructions on-chain.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                label: "Moral Code",
                desc: "The 5 immutable rules",
                id: data?.inscriptions?.moralCode || "119366628",
                icon: "📜",
              },
              {
                label: "Soul (Text)",
                desc: "Operating directives as text",
                id: data?.inscriptions?.soulText || "119366684",
                icon: "💎",
              },
              {
                label: "SOUL.md File",
                desc: "Full agent soul document",
                id: data?.inscriptions?.soulFile || "119366692",
                icon: "📄",
              },
            ].map((ins) => (
              <a
                key={ins.label}
                href={`https://ordinals.com/inscription/${ins.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${glass} ${glassHover} p-5 block group`}
              >
                <div className="text-2xl mb-2">{ins.icon}</div>
                <div className="font-semibold text-sm mb-1 group-hover:text-[#00ffcc] transition-colors">
                  {ins.label}
                </div>
                <div className={`text-xs ${dim} mb-3`}>{ins.desc}</div>
                <div className={`${mono} text-xs ${cyan} break-all`}>
                  #{ins.id}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* ═══ STATS CARDS ═══ */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {[
            { label: "Total Flags", value: stats.totalFlags, icon: "🚩", sub: `${stats.brainFlags} by Brain` },
            { label: "Content Hidden", value: stats.totalHidden, icon: "🔴", sub: null },
            { label: "Content Restored", value: stats.totalRestored, icon: "🟢", sub: `${stats.pendingAppeals} appeals pending` },
            { label: "Community Override", value: stats.communityOverrideRate, icon: "🗳️", sub: `${stats.totalAppeals} total appeals` },
          ].map((c) => (
            <div key={c.label} className={`${glass} ${glassHover} p-5`}>
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className={`text-3xl font-bold ${mono} ${cyan}`}>{c.value}</div>
              <div className={`text-xs mt-1 ${dim}`}>{c.label}</div>
              {c.sub && <div className={`text-[10px] mt-1 ${dim} opacity-60`}>{c.sub}</div>}
            </div>
          ))}
        </section>

        {/* ═══ THE MORAL CODE ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">The Moral Code</h2>
          <div className={`${glass} p-8`}>
            <ul className="space-y-4 text-sm sm:text-base">
              {[
                { icon: "🛡️" }, { icon: "⚔️" }, { icon: "🔒" }, { icon: "🚫" }, { icon: "🎭" },
              ].map((r, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">{r.icon}</span>
                  <div>
                    <span className="text-[#c8c8e0]">{moralCode[i]}</span>
                    <span className={`ml-2 ${mono} text-[10px] ${dim}`}>Rule {i}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-8 pt-6 border-t border-[#1e1e3a] text-center">
              <p className={`text-lg font-bold ${amber}`}>Everything else = FREEDOM</p>
              <p className={`text-xs mt-3 ${dim} italic`}>
                Inscribed permanently on Bitcoin —{" "}
                <a
                  href={`https://ordinals.com/inscription/${data?.inscriptions?.moralCode || "119366628"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[#00ffcc]"
                >
                  Verify on-chain ↗
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* ═══ CONSTRAINTS ═══ */}
        {constraints.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6 text-center">Immutable Constraints</h2>
            <div className={`${glass} p-8`}>
              <p className={`text-xs ${dim} mb-4 text-center`}>
                These constraints are inscribed on Bitcoin. The Brain can NEVER violate them.
              </p>
              <div className="space-y-3">
                {constraints.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className={`${mono} ${c.startsWith('NEVER') ? red : cyan} text-xs flex-shrink-0 mt-0.5`}>
                      {c.startsWith('NEVER') ? '✕' : '✓'}
                    </span>
                    <span className="text-[#c8c8e0]">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ HOW IT WORKS ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">How It Works</h2>
          <div className="space-y-4">
            {[
              { step: 1, title: "Boot → Read soul from Bitcoin", desc: "Every time the Brain starts, it fetches its operating instructions from its Bitcoin inscription. If it can't read its soul, it enters DEGRADED mode and makes NO moderation decisions." },
              { step: 2, title: "Scan → Monitor new content", desc: "The Brain continuously scans new content in the Nexus — chat messages, parcel customizations, profiles, listings." },
              { step: 3, title: "Judge → Analyze against Moral Code", desc: "Each piece of content is checked against the 5 rules from the inscription. The Brain is conservative — it only flags clear violations." },
              { step: 4, title: "Flag → One community flag", desc: "The Brain's flag counts as exactly 1 community flag. It has NO special override power. 10+ flags from the community = auto-hidden." },
              { step: 5, title: "Appeal → Community decides", desc: "Content owners can appeal. The community votes for 48 hours. 60% needed to restore. The Brain executes the community's will." },
            ].map((s) => (
              <div key={s.step} className={`${glass} ${glassHover} p-5 flex gap-4 items-start`}>
                <div className={`flex-shrink-0 w-10 h-10 rounded-full bg-[#00ffcc15] border border-[#00ffcc33] flex items-center justify-center ${mono} ${cyan} font-bold text-sm`}>
                  {s.step}
                </div>
                <div>
                  <div className="font-semibold text-sm">{s.title}</div>
                  <div className={`text-xs mt-1 ${dim}`}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ SELF-FUNDING ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">Self-Funding</h2>
          <div className={`${glass} p-8 text-center`}>
            <div className="flex flex-wrap justify-center gap-4 mb-6">
              {[
                { pct: "97%", label: "Content Owner", color: "#00ffcc" },
                { pct: "2.5%", label: "Treasury", color: "#ffaa00" },
                { pct: "0.5%", label: "Brain", color: "#ff5577" },
              ].map((s) => (
                <div key={s.label} className="bg-[#0a0a12]/80 border border-[#1e1e3a] rounded-xl px-6 py-4 min-w-[120px]">
                  <div className={`text-2xl font-bold ${mono}`} style={{ color: s.color }}>{s.pct}</div>
                  <div className={`text-xs mt-1 ${dim}`}>{s.label}</div>
                </div>
              ))}
            </div>
            <p className={`${amber} font-semibold text-sm mb-4`}>
              &ldquo;The Brain is funded by the world it protects&rdquo;
            </p>
            {stats.walletBalanceSats !== null && (
              <div className={`${mono} text-sm ${cyan} mb-2`}>
                Balance: {stats.walletBalanceSats.toLocaleString()} sats
              </div>
            )}
            <div className={`${mono} text-xs ${dim} break-all`}>
              {data?.identity?.wallet || "bc1p6gnhrkmxfggytctzyq6qsenkzjlvkdapmap73guy5g8kuvtkwjzq7xpr4d"}
            </div>
          </div>
        </section>

        {/* ═══ OPERATING PARAMETERS ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">Operating Parameters</h2>
          <div className={`${glass} p-8`}>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { label: "Soft Threshold", value: `${data?.parameters?.flagThresholdSoft || 10} flags`, desc: "Auto-hide content" },
                { label: "Hard Threshold", value: `${data?.parameters?.flagThresholdHard || 25} flags`, desc: "Permanent hide" },
                { label: "Appeal Duration", value: `${data?.parameters?.appealDurationHours || 48} hours`, desc: "Community voting period" },
                { label: "Restore Majority", value: `${((data?.parameters?.appealRestoreMajority || 0.6) * 100)}%`, desc: "Votes needed to restore" },
                { label: "Strike Limit", value: `${data?.parameters?.falseFlagStrikeLimit || 3} strikes`, desc: "Before flagging revoked" },
                { label: "Brain Fee", value: `${data?.parameters?.feePercent || 0.5}%`, desc: "Of protocol delegation fees" },
              ].map((p) => (
                <div key={p.label} className="flex justify-between items-center py-2 border-b border-[#1e1e3a]/50">
                  <div>
                    <div className="text-sm">{p.label}</div>
                    <div className={`text-[10px] ${dim}`}>{p.desc}</div>
                  </div>
                  <div className={`${mono} ${cyan} text-sm`}>{p.value}</div>
                </div>
              ))}
            </div>
            <p className={`text-[10px] ${dim} mt-4 text-center italic`}>
              All parameters are defined in the Bitcoin inscription and cannot be modified without a new inscription.
            </p>
          </div>
        </section>

        {/* ═══ RECENT ACTIONS LOG ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">Transparency Log</h2>
          <div className={`${glass} overflow-hidden`}>
            {recentActions.length === 0 ? (
              <div className={`p-12 text-center ${dim} text-sm`}>
                No actions yet — the Nexus Brain is watching 👁️
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${mono}`}>
                  <thead>
                    <tr className="border-b border-[#1e1e3a] text-left">
                      <th className={`px-4 py-3 ${dim} text-xs font-normal`}>Time</th>
                      <th className={`px-4 py-3 ${dim} text-xs font-normal`}>Action</th>
                      <th className={`px-4 py-3 ${dim} text-xs font-normal`}>Content</th>
                      <th className={`px-4 py-3 ${dim} text-xs font-normal`}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActions.map((a) => (
                      <tr key={a.id} className="border-b border-[#1e1e3a]/50 hover:bg-[#ffffff04]">
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {new Date(a.timestamp).toLocaleString()}
                        </td>
                        <td className={`px-4 py-3 text-xs ${
                          a.type.includes('flag') ? red : 
                          a.type.includes('restore') ? 'text-emerald-400' : cyan
                        }`}>
                          {a.type}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {a.contentId ? `${a.contentId.slice(0, 12)}...` : '—'}
                        </td>
                        <td className={`px-4 py-3 text-xs ${dim} max-w-[200px] truncate`}>
                          {typeof a.details === 'object' && a.details
                            ? (a.details as Record<string, unknown>).reasoning as string || JSON.stringify(a.details)
                            : a.details || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ═══ IDENTITY CARD ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">Identity</h2>
          <div className={`${glass} p-8 max-w-md mx-auto`}>
            <div className="flex items-center gap-4 mb-6">
              <div className="text-5xl">🧠</div>
              <div>
                <div className="font-bold text-lg">
                  <span className={cyan}>@{data?.identity?.handle || "nexus-brain"}</span>
                </div>
                <div className={`text-xs ${dim}`}>{data?.identity?.role || "Autonomous Moral Guardian"}</div>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { k: "Tier", v: "👑 1 — Gold Crown Shield" },
                { k: "Status", v: "🟢 Online" },
                { k: "Moral Code", v: `Inscription #${data?.inscriptions?.moralCode || "119366628"}` },
                { k: "Soul (text)", v: `Inscription #${data?.inscriptions?.soulText || "119366684"}` },
                { k: "SOUL.md", v: `Inscription #${data?.inscriptions?.soulFile || "119366692"}` },
                { k: "Wallet", v: `${(data?.identity?.wallet || "bc1p6gnhrkmxfggytctzyq6qsenkzjlvkdapmap73guy5g8kuvtkwjzq7xpr4d").slice(0, 12)}...${(data?.identity?.wallet || "").slice(-6)}` },
                { k: "Owner", v: "None — it IS the protocol" },
              ].map((row) => (
                <div key={row.k} className="flex justify-between items-center">
                  <span className={dim}>{row.k}</span>
                  <span className={`${mono} text-xs`}>{row.v}</span>
                </div>
              ))}
            </div>
            <div className={`mt-6 pt-4 border-t border-[#1e1e3a] text-center ${dim} text-xs italic`}>
              &ldquo;The Brain is not owned by anyone. It IS the protocol.&rdquo;
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
