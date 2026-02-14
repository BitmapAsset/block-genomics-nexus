"use client";

import { useEffect, useState } from "react";
import BitmapBlocksBg from "@/components/BitmapBlocksBg";

/* ─── Types ─── */
interface BrainStats {
  totalFlags: number;
  contentHidden: number;
  contentRestored: number;
  communityOverrideRate: number;
  recentActions: BrainAction[];
}

interface BrainAction {
  timestamp: string;
  actionType: string;
  contentId: string;
  details: string;
}

/* ─── Styles ─── */
const glass =
  "bg-[#12121f]/60 backdrop-blur-md border border-[#1e1e3a] rounded-2xl";
const glassHover =
  "hover:border-[#00ffcc33] hover:shadow-[0_0_20px_rgba(0,255,204,0.06)] transition-all duration-300";
const mono = "font-mono";
const cyan = "text-[#00ffcc]";
const amber = "text-[#ffaa00]";
const dim = "text-[#8888aa]";

export default function BrainPage() {
  const [stats, setStats] = useState<BrainStats>({
    totalFlags: 0,
    contentHidden: 0,
    contentRestored: 0,
    communityOverrideRate: 0,
    recentActions: [],
  });

  useEffect(() => {
    fetch("/api/v1/brain/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => {});
  }, []);

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
            Autonomous Moral Guardian · Protecting the Nexus since Block #0
          </p>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            ONLINE
          </div>
        </section>

        {/* ═══ STATS CARDS ═══ */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {[
            { label: "Total Flags Processed", value: stats.totalFlags, icon: "🚩" },
            { label: "Content Hidden", value: stats.contentHidden, icon: "🔴" },
            { label: "Content Restored", value: stats.contentRestored, icon: "🟢" },
            {
              label: "Community Override Rate",
              value: `${stats.communityOverrideRate}%`,
              icon: "🗳️",
            },
          ].map((c) => (
            <div key={c.label} className={`${glass} ${glassHover} p-5`}>
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className={`text-3xl font-bold ${mono} ${cyan}`}>{c.value}</div>
              <div className={`text-xs mt-1 ${dim}`}>{c.label}</div>
            </div>
          ))}
        </section>

        {/* ═══ THE MORAL CODE ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">
            The Moral Code
          </h2>
          <div className={`${glass} p-8`}>
            <ul className="space-y-4 text-sm sm:text-base">
              {[
                { icon: "🛡️", text: "No exploitation of minors — zero tolerance" },
                { icon: "⚔️", text: "No direct threats of violence" },
                { icon: "🔒", text: "No doxxing (sharing private info without consent)" },
                { icon: "🚫", text: "No fraud/scam content designed to steal" },
                { icon: "🎭", text: "No impersonation of verified identities" },
              ].map((r, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">{r.icon}</span>
                  <span className="text-[#c8c8e0]">{r.text}</span>
                </li>
              ))}
            </ul>
            <div className={`mt-8 pt-6 border-t border-[#1e1e3a] text-center`}>
              <p className={`text-lg font-bold ${amber}`}>
                Everything else = FREEDOM
              </p>
              <p className={`text-xs mt-3 ${dim} italic`}>
                Moral Code inscribed on Bitcoin — <a href="https://ordinals.com/inscription/119366628" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#00ffcc]">View Inscription #119366628</a>
              </p>
            </div>
          </div>
        </section>

        {/* ═══ HOW IT WORKS ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">How It Works</h2>
          <div className="space-y-4">
            {[
              { step: 1, title: "Content posted → Brain scans", desc: "Every piece of content passes through the Brain's moral filter in real-time." },
              { step: 2, title: "If harmful → Brain flags", desc: "The Brain's flag counts as 1 community flag — it has no special override power." },
              { step: 3, title: "Community adds flags → counter grows", desc: "Other users can flag content too. Each flag increments the counter." },
              { step: 4, title: "10 flags → auto-hidden", desc: "Content reaching 10 flags is automatically hidden from public feeds." },
              { step: 5, title: "Owner can appeal → 48hr community vote", desc: "Content owners can appeal. The community votes for 48 hours to decide." },
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
                  <div className={`text-2xl font-bold ${mono}`} style={{ color: s.color }}>
                    {s.pct}
                  </div>
                  <div className={`text-xs mt-1 ${dim}`}>{s.label}</div>
                </div>
              ))}
            </div>
            <p className={`${amber} font-semibold text-sm`}>
              &ldquo;The Brain is funded by the world it protects&rdquo;
            </p>
            <div className={`mt-4 ${mono} text-xs ${dim} break-all`}>
              Brain Wallet: bc1p6gnhrkmxfggytctzyq6qsenkzjlvkdapmap73guy5g8kuvtkwjzq7xpr4d
            </div>
          </div>
        </section>

        {/* ═══ RECENT ACTIONS LOG ═══ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">Recent Actions</h2>
          <div className={`${glass} overflow-hidden`}>
            {stats.recentActions.length === 0 ? (
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
                      <th className={`px-4 py-3 ${dim} text-xs font-normal`}>Content ID</th>
                      <th className={`px-4 py-3 ${dim} text-xs font-normal`}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentActions.map((a, i) => (
                      <tr key={i} className="border-b border-[#1e1e3a]/50 hover:bg-[#ffffff04]">
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{a.timestamp}</td>
                        <td className={`px-4 py-3 text-xs ${cyan}`}>{a.actionType}</td>
                        <td className="px-4 py-3 text-xs">{a.contentId}</td>
                        <td className={`px-4 py-3 text-xs ${dim}`}>{a.details}</td>
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
                  <span className={cyan}>@nexus-brain</span>
                </div>
                <div className={`text-xs ${dim}`}>Autonomous Protocol Entity</div>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { k: "Tier", v: "👑 1 — Gold Crown Shield" },
                { k: "Status", v: "🟢 Online" },
                { k: "Genome Hash", v: "0x00...brain" },
                { k: "Moral Code", v: "Inscription #119366628" },
                { k: "Soul (text)", v: "Inscription #119366684" },
                { k: "SOUL.md", v: "Inscription #119366692" },
                { k: "Wallet", v: "bc1p6gnh...7xpr4d" },
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
