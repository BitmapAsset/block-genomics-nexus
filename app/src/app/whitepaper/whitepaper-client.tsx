"use client";

import { useState, useRef } from "react";
import Link from "next/link";

import { sections, WHITEPAPER_VERSION, WHITEPAPER_DATE } from "./sections";

/* ─── Palette ─── */
const palette = [
  "#ff0055","#ff3366","#ff6633","#ffaa00","#ccff00","#66ff33","#00ff99","#00ffcc",
  "#00ccff","#0099ff","#3366ff","#6633ff","#9933ff","#cc33ff","#ff33cc","#ff3399",
];

const HASH = "a3f8c2e91b4d6f0785c3e2a19b7d4f6e8c2a1b3d5f7e9c0b2a4d6f8e1c3b5a7d";

/* ═══════════════════════════════════════════════
   SHARED CONTENT — canonical prose lives in ./sections
   ═══════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════
   MODERN VIEW
   ═══════════════════════════════════════════════ */

function GenomeBar() {
  return (
    <div className="flex justify-center gap-[2px] my-8 opacity-60">
      {HASH.split("").map((c, i) => (
        <div key={i} className="w-2 h-6 rounded-sm" style={{ backgroundColor: palette[parseInt(c, 16)] }} />
      ))}
    </div>
  );
}

function ModernSection({ s }: { s: typeof sections[0] }) {
  return (
    <section id={s.id} className="scroll-mt-24 mb-16">
      <div className="flex items-center gap-4 mb-6">
        <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan font-bold text-sm shrink-0">
          §{s.num}
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{s.title}</h2>
      </div>
      <div className="text-text-secondary leading-relaxed space-y-4 text-[15px]">
        {s.id === "abstract" ? (
          <>
            <div className="glass-panel glow-cyan p-6 rounded-xl">
              <p className="text-text-primary leading-relaxed">{s.content.split("\n\n")[0]}</p>
            </div>
            <p>{s.content.split("\n\n")[1]}</p>
          </>
        ) : s.id === "genome" ? (
          <>
            {s.content.split("\n\n").map((para, i) => {
              if (para.startsWith("Example Genome:")) {
                return (
                  <div key={i} className="glass-panel p-6 rounded-xl">
                    <div className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">Example Genome</div>
                    <p className="font-mono text-base leading-relaxed tracking-wider text-center break-all">
                      {HASH.split("").map((c, j) => (
                        <span key={j} style={{ color: palette[parseInt(c, 16)] }}>{c}</span>
                      ))}
                    </p>
                  </div>
                );
              }
              if (para.startsWith("•")) {
                return (
                  <ul key={i} className="list-disc list-inside space-y-1 text-sm">
                    {para.split("\n").map((line, j) => <li key={j}>{line.replace(/^• /, "")}</li>)}
                  </ul>
                );
              }
              return <p key={i}>{para}</p>;
            })}
            <div className="flex justify-center gap-1 mt-6">
              {palette.map((color, i) => (
                <div key={i} className="text-center">
                  <div className="w-8 h-8 rounded-lg mb-1" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}44` }} />
                  <div className="text-[9px] font-mono text-text-muted">{i.toString(16).toUpperCase()}</div>
                </div>
              ))}
            </div>
          </>
        ) : s.id === "tiers" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              {[
                { tier: "Tier 1", label: "Block Owners", supply: "~1,000,000", icon: "👑", color: "border-bitcoin/30" },
                { tier: "Tier 2", label: "Transaction Level", supply: "~2,300,000,000", icon: "⭐", color: "border-accent-cyan/30" },
                { tier: "Tier 3", label: "Delegated", supply: "Unlimited", icon: "🔗", color: "border-accent-purple/30" },
              ].map((t) => (
                <div key={t.tier} className={`glass-panel p-6 rounded-xl border ${t.color}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{t.icon}</span>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-text-muted">{t.tier}</div>
                      <div className="text-lg font-bold">{t.label}</div>
                    </div>
                  </div>
                  <div className="text-sm text-text-muted">Supply: <span className="text-text-primary font-semibold">{t.supply}</span></div>
                </div>
              ))}
            </div>
            {s.content.split("\n\n").slice(4).map((para, i) => <p key={i}>{para}</p>)}
          </>
        ) : s.id === "problem" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>
            <p>{s.content.split("\n\n")[1]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              {[
                { icon: "🎭", title: "Impersonation", desc: "Any agent can claim to be any other agent. There is no cryptographic proof of unique identity." },
                { icon: "🏢", title: "Centralized Gatekeepers", desc: "Current identity systems depend on corporations who can revoke access at will." },
                { icon: "♾️", title: "Infinite Replication", desc: "Digital identities can be copied endlessly. Without scarcity, trust has no foundation." },
                { icon: "🔌", title: "No Universal Standard", desc: "Each platform has its own identity system. No cross-platform standard exists." },
              ].map((c) => (
                <div key={c.title} className="glass-panel p-5 rounded-xl">
                  <div className="text-lg mb-2">{c.icon}</div>
                  <div className="text-sm font-semibold text-text-primary mb-1">{c.title}</div>
                  <p className="text-xs text-text-muted">{c.desc}</p>
                </div>
              ))}
            </div>
          </>
        ) : s.id === "openness" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              {[
                { icon: "🌐", title: "Permissionless", desc: "Anyone can verify, anyone can build on top. No API keys, no approval process." },
                { icon: "🔧", title: "Extensible", desc: "SDK and API available. Build verification into your app, agent, or platform." },
                { icon: "🤝", title: "Interoperable", desc: "Works across chains, platforms, and agent frameworks. One identity, everywhere." },
                { icon: "🛡️", title: "Sovereign", desc: "Your identity belongs to you. No corporation can revoke it. Self-custody of identity." },
              ].map((c) => (
                <div key={c.title} className="glass-panel p-5 rounded-xl">
                  <div className="text-lg mb-2">{c.icon}</div>
                  <div className="text-sm font-semibold text-text-primary mb-1">{c.title}</div>
                  <p className="text-xs text-text-muted">{c.desc}</p>
                </div>
              ))}
            </div>
            {s.content.split("\n\n").slice(5).map((para, i) => <p key={i}>{para}</p>)}
          </>
        ) : s.id === "permissions" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>

            {/* Permission Tiers heading */}
            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Permission Tiers</h3>
            <div className="grid grid-cols-1 gap-4">
              {[
                {
                  tier: "Tier 3", label: "Visitors & Delegates", role: "The Audience", icon: "👁️", color: "border-accent-purple/30",
                  can: ["View all blocks, parcels, and content", "Comment in public block chat", "Chat on livestreams (YouTube-style live chat)", "Report inappropriate content", "Set display name and avatar"],
                  cannot: ["Building or media posting", "DMs to owners", "Streaming", "Server linking or delegation"],
                },
                {
                  tier: "Tier 2", label: "Parcel Owners", role: "The Creators", icon: "🏗️", color: "border-accent-cyan/30",
                  can: ["All Tier 3 permissions", "Build and customize their parcel (media, 3D, experiences)", "Livestream: Broadcast, Town Hall, Spatial Chat", "DM other verified owners", "Link VPS or AI Agent to their parcel", "Delegate scoped Tier 3 access", "Moderate chat on their parcel"],
                  cannot: [],
                },
                {
                  tier: "Tier 1", label: "Block Owners", role: "The City Planners", icon: "👑", color: "border-bitcoin/30",
                  can: ["All Tier 2 permissions", "Set block-wide governance policies", "Moderate block-level chat", "Delegate block management to Tier 3", "Feature/spotlight specific parcels", "Manage block profile and common areas"],
                  cannot: [],
                },
              ].map((t) => (
                <div key={t.tier} className={`glass-panel p-6 rounded-xl border ${t.color}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{t.icon}</span>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-text-muted">{t.tier} — {t.role}</div>
                      <div className="text-lg font-bold">{t.label}</div>
                    </div>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                    {t.can.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                  {t.cannot.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-xs font-bold uppercase tracking-widest text-red-400 mb-1">Restricted</div>
                      <ul className="list-disc list-inside space-y-1 text-sm text-text-muted">
                        {t.cannot.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Sovereignty */}
            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Parcel Sovereignty Protocol</h3>
            <div className="glass-panel glow-cyan p-6 rounded-xl">
              <div className="space-y-3 text-sm text-text-secondary">
                <p><strong className="text-text-primary">Immutable Ownership:</strong> Parcel ownership is inscribed on Bitcoin — the blockchain is the sole source of truth.</p>
                <p><strong className="text-text-primary">Delegation Scope:</strong> Block-level delegates receive authority over shared spaces only (common areas, block profile, unowned parcels). The protocol auto-excludes all owned parcels from block-wide delegation.</p>
                <p><strong className="text-text-primary">Voluntary Governance:</strong> Parcel owners may opt in to block governance (like an HOA) but can opt out at any time.</p>
                <p><strong className="text-text-primary">Conflict Resolution:</strong> Parcel owner settings <em>always</em> override delegate settings. Local sovereignty supersedes delegated authority.</p>
              </div>
            </div>

            {/* Economic Incentive */}
            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Economic Incentive Design</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: "🎯", title: "Upgrade Incentive", desc: "Tier 3 view-only access creates natural demand to acquire Bitmap inscriptions." },
                { icon: "🪜", title: "Clear Ladder", desc: "Visitor → Parcel Owner → Block Owner. More on-chain commitment = more capability." },
                { icon: "₿", title: "Bitcoin Ethos", desc: "Proof of ownership, skin in the game. Capability is earned, not granted." },
                { icon: "📈", title: "Utility Demand", desc: "Building, streaming, and customization drive real demand for parcel and block ownership." },
              ].map((c) => (
                <div key={c.title} className="glass-panel p-5 rounded-xl">
                  <div className="text-lg mb-2">{c.icon}</div>
                  <div className="text-sm font-semibold text-text-primary mb-1">{c.title}</div>
                  <p className="text-xs text-text-muted">{c.desc}</p>
                </div>
              ))}
            </div>

            {/* Livestreaming */}
            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Livestreaming Capabilities</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: "📡", title: "Broadcast", desc: "One-to-many streaming for presentations and events." },
                { icon: "🎙️", title: "Town Hall", desc: "Stream with audience hand-raise for moderated Q&A." },
                { icon: "🗣️", title: "Spatial Chat", desc: "Proximity-based audio for natural social interaction." },
              ].map((c) => (
                <div key={c.title} className="glass-panel p-5 rounded-xl">
                  <div className="text-lg mb-2">{c.icon}</div>
                  <div className="text-sm font-semibold text-text-primary mb-1">{c.title}</div>
                  <p className="text-xs text-text-muted">{c.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-text-muted mt-4">WebRTC peer-to-peer with optional SFU relay for 50+ viewers. Block owners with linked VPS can self-host their SFU. All streams E2E encrypted with optional wallet-verified access.</p>
          </>
        ) : s.id === "nexus_brain" ? (
          <>
            <p>{s.content.split("\n\n")[0]}</p>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">The Moral Code</h3>
            <div className="glass-panel glow-cyan p-6 rounded-xl">
              <p className="text-sm text-text-secondary mb-4">Five immutable rules, inscribed permanently on Bitcoin:</p>
              <div className="space-y-3">
                {[
                  { icon: "🛡️", rule: "No exploitation of minors", detail: "Zero tolerance, no exceptions." },
                  { icon: "⚔️", rule: "No direct threats of violence", detail: "Against individuals or groups." },
                  { icon: "🔒", rule: "No doxxing", detail: "Sharing private personal information without consent." },
                  { icon: "🚫", rule: "No fraud or scam content", detail: "Designed to steal from participants." },
                  { icon: "🎭", rule: "No impersonation", detail: "Of verified identities within the protocol." },
                ].map((r) => (
                  <div key={r.rule} className="flex items-start gap-3">
                    <span className="text-lg shrink-0">{r.icon}</span>
                    <div>
                      <span className="text-sm font-semibold text-text-primary">{r.rule}</span>
                      <span className="text-sm text-text-muted"> — {r.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-border text-center">
                <span className="text-sm font-bold text-accent-cyan">Everything else = FREEDOM</span>
              </div>
            </div>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Community Consensus Mechanism</h3>
            <div className="grid grid-cols-1 gap-3">
              {[
                { step: "1", title: "Flag", desc: "Brain's AI scan or any verified user flags content. Flag counter increments." },
                { step: "2", title: "Auto-Hide", desc: "10 unique flags from verified users → content automatically hidden." },
                { step: "3", title: "Notify", desc: "Content owner notified → 48-hour appeal window granted." },
                { step: "4", title: "Community Vote", desc: "During appeal, all verified users vote. Majority decides." },
                { step: "5", title: "Audit Trail", desc: "Every action logged immutably. No action is ever deleted." },
              ].map((s) => (
                <div key={s.step} className="glass-panel p-4 rounded-xl flex items-start gap-4">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-accent-purple/10 border border-accent-purple/20 text-accent-purple font-bold text-sm shrink-0">{s.step}</span>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{s.title}</div>
                    <p className="text-xs text-text-muted">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Self-Funding Model</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Block Owner", pct: "97%", color: "border-bitcoin/30" },
                { label: "Protocol Fund", pct: "2.5%", color: "border-accent-cyan/30" },
                { label: "Nexus Brain", pct: "0.5%", color: "border-accent-purple/30" },
              ].map((f) => (
                <div key={f.label} className={`glass-panel p-5 rounded-xl border ${f.color} text-center`}>
                  <div className="text-2xl font-bold text-text-primary">{f.pct}</div>
                  <div className="text-xs text-text-muted mt-1">{f.label}</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-text-muted mt-3">Symbiotic: funded by the world it protects. Low funds = slower scans. Never stops.</p>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Identity &amp; Transparency</h3>
            <div className="glass-panel p-6 rounded-xl">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center text-sm">
                {[
                  { icon: "🧬", label: "Own Genome Hash" },
                  { icon: "📛", label: "@nexus_brain" },
                  { icon: "👑", label: "Tier 1 Gold Crown" },
                  { icon: "📊", label: "/brain Dashboard" },
                  { icon: "📜", label: "Full Action Log" },
                  { icon: "🔍", label: "Override Rate" },
                ].map((i) => (
                  <div key={i.label}>
                    <div className="text-xl mb-1">{i.icon}</div>
                    <div className="text-xs text-text-muted">{i.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <h3 className="text-lg font-bold text-text-primary mt-8 mb-4">Immutability</h3>
            <p className="text-sm text-text-secondary">The moral code is inscribed as a Bitcoin ordinal inscription — as permanent as a Bitcoin transaction. Rule changes require a new protocol version: a new inscription, new source code, and new deployment. Visible to all, auditable by the community. The moral code cannot be changed silently, secretly, or unilaterally.</p>
          </>
        ) : s.id === "future" ? (
          <>
            {s.content.split("\n\n").slice(0, 2).map((para, i) => <p key={i}>{para}</p>)}
            <div className="glass-panel glow-purple p-6 rounded-xl text-center mt-4">
              <p className="text-lg font-semibold text-gradient-cyan-purple mb-2">Bitcoin gave us sound money. Block Genomics gives us sound identity.</p>
              <p className="text-sm text-text-muted">The protocol is live. The code is open. The future is being built.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-8">
              <Link href="/explore" className="inline-flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 px-6 py-3 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 transition-all">🔍 Explore Agents</Link>
              <Link href="/verify" className="inline-flex items-center gap-2 rounded-lg bg-accent-purple/15 border border-accent-purple/40 px-6 py-3 text-sm font-medium text-accent-purple hover:bg-accent-purple/25 transition-all">⚡ Verify Identity</Link>
            </div>
          </>
        ) : (
          s.content.split("\n\n").map((para, i) => <p key={i}>{para}</p>)
        )}
      </div>
    </section>
  );
}

function ModernView() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-cyan/20 bg-accent-cyan/5 px-4 py-1.5 text-xs font-medium text-accent-cyan mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan animate-pulse" />
          Version {WHITEPAPER_VERSION} — {WHITEPAPER_DATE}
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6">
          <span className="text-gradient-cyan-purple">Block Genomics</span>
        </h1>
        <p className="text-xl sm:text-2xl text-text-secondary max-w-3xl mx-auto leading-relaxed">
          An open-source protocol anchoring AI identity to Bitcoin&apos;s Proof-of-Work.
          Digital DNA for agents and humans — scarce, sovereign, and verifiable.
        </p>
        <GenomeBar />
        <p className="text-sm text-text-muted">By Gravity &amp; Pepe · Human + AI Agent · Block Genomics</p>
        <p className="text-xs text-text-muted/60 mt-1">Open Source · BSL (Business Source License)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-12">
        {/* TOC */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4">Contents</div>
            <nav className="space-y-1">
              {sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="block text-sm text-text-muted hover:text-accent-cyan py-1.5 px-3 rounded-lg hover:bg-accent-cyan/5 transition-colors">{s.title}</a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <article>
          {sections.map((s) => <ModernSection key={s.id} s={s} />)}
        </article>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SATOSHI STYLE
   ═══════════════════════════════════════════════ */

function SatoshiView() {
  return (
    <div className="satoshi-paper">
      <style>{`
        .satoshi-paper {
          max-width: 720px; margin: 0 auto; padding: 60px 40px;
          font-family: 'Times New Roman', 'Georgia', serif;
          color: #000; background: #fff; line-height: 1.6; font-size: 14px;
        }
        .satoshi-paper h1 {
          text-align: center; font-size: 24px; font-weight: bold;
          margin-bottom: 8px; letter-spacing: 0.5px;
        }
        .satoshi-paper .sp-author {
          text-align: center; font-size: 13px; margin-bottom: 4px;
        }
        .satoshi-paper .sp-email {
          text-align: center; font-size: 12px; color: #333;
          font-style: italic; margin-bottom: 30px;
        }
        .satoshi-paper .sp-date {
          text-align: center; font-size: 12px; color: #666; margin-bottom: 30px;
        }
        .satoshi-paper .sp-abstract {
          margin: 0 40px 30px; font-style: italic; font-size: 13px;
          text-align: justify; border-left: none; padding: 0;
        }
        .satoshi-paper .sp-abstract strong {
          font-style: normal; font-weight: bold;
        }
        .satoshi-paper h2 {
          font-size: 16px; font-weight: bold; margin: 28px 0 12px;
        }
        .satoshi-paper p {
          text-align: justify; margin-bottom: 12px; text-indent: 20px;
        }
        .satoshi-paper p:first-child, .satoshi-paper .no-indent {
          text-indent: 0;
        }
        .satoshi-paper .sp-genome-hash {
          text-align: center; font-family: 'Courier New', monospace;
          font-size: 11px; letter-spacing: 1px; margin: 16px 0;
          word-break: break-all; padding: 10px; border: 1px solid #ccc;
        }
        .satoshi-paper .sp-fig {
          text-align: center; font-size: 11px; color: #666;
          margin: 8px 0 20px; font-style: italic;
        }
        .satoshi-paper .sp-table {
          width: 100%; border-collapse: collapse; margin: 16px 0;
          font-size: 13px;
        }
        .satoshi-paper .sp-table th, .satoshi-paper .sp-table td {
          border: 1px solid #ccc; padding: 6px 10px; text-align: left;
        }
        .satoshi-paper .sp-table th {
          background: #f5f5f5; font-weight: bold;
        }
        .satoshi-paper hr {
          border: none; border-top: 1px solid #ddd; margin: 30px 0;
        }
        .satoshi-paper .sp-ref {
          font-size: 12px; color: #333;
        }
        @media print {
          .satoshi-paper { padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <h1>Block Genomics: Bitcoin-Anchored Identity<br/>for the Age of AI</h1>
      <div className="sp-author">Gravity &amp; Pepe · Human + AI Agent</div>
      <div className="sp-email">blockgenomics@proton.me</div>
      <div className="sp-date">February 2026</div>

      <div className="sp-abstract">
        <strong>Abstract.</strong> We propose an open-source protocol for creating unique digital identities
        anchored to Bitcoin&apos;s Proof-of-Work. By deriving 256-bit genome hashes from Bitcoin block data
        and verifying ownership through BIP-322 message signing, the protocol establishes unforgeable,
        scarce, and sovereign identities for both AI agents and humans. Three tiers of scarcity —
        block-level (~1M), transaction-level (~2.3B), and delegated (unlimited) — create a natural
        trust hierarchy. A multi-factor trust score incentivizes honest participation. The result is
        a universal identity layer that requires no central authority, cannot be revoked, and is as
        permanent as the Bitcoin blockchain itself.
      </div>

      <hr />

      <h2>1. Introduction</h2>
      <p>
        The rapid proliferation of AI agents presents a fundamental challenge to digital trust.
        As autonomous agents increasingly participate in commerce, communication, and governance,
        the ability to verify the identity and authenticity of these agents becomes critical.
        Existing identity systems — OAuth tokens, API keys, corporate certificates — rely on
        centralized authorities and are fundamentally incompatible with a decentralized future.
      </p>
      <p>
        We propose Block Genomics, a protocol that anchors identity to Bitcoin blocks via the
        Bitmap protocol. Each identity is derived from immutable on-chain data, producing a
        unique 256-bit genome hash that serves as the entity&apos;s digital DNA.
      </p>

      <h2>2. The Identity Problem</h2>
      <p>
        Four key challenges define the identity crisis in the age of AI: (1) impersonation —
        any agent can claim to be any other without cryptographic proof; (2) centralized
        gatekeeping — identity providers can arbitrarily revoke access; (3) infinite
        replication — digital identities lack inherent scarcity; and (4) fragmentation —
        no universal cross-platform standard exists.
      </p>
      <p>
        These challenges are not merely technical — they are economic. Without scarcity,
        identity has no value. Without value, there is no incentive for honest behavior.
        A system where creating a new identity is free creates a system where fraud is free.
      </p>

      <h2>3. Bitcoin as Identity Anchor</h2>
      <p>
        Bitcoin&apos;s Proof-of-Work represents the conversion of real thermodynamic energy into
        digital scarcity. Each block header contains a hash that required, on average, trillions
        of SHA-256 computations to produce. This work cannot be faked, reversed, or duplicated.
      </p>
      <p>
        The Bitmap protocol enables ownership claims on individual Bitcoin blocks. By combining
        Bitmap ownership with cryptographic signature verification (BIP-322), we create an
        identity system that inherits Bitcoin&apos;s security guarantees: censorship resistance,
        immutability, and permissionless participation.
      </p>

      <h2>4. Genome Computation</h2>
      <p>
        The digital genome is a deterministic 256-bit hash computed from block data. Given a
        Bitcoin block at height <em>h</em>, the genome <em>G(h)</em> is computed as:
      </p>
      <p className="no-indent" style={{ textAlign: "center", fontFamily: "'Courier New', monospace", fontSize: "12px" }}>
        G(h) = SHA256(block_hash ∥ merkle_root ∥ height ∥ timestamp ∥ nonce)
      </p>
      <p>
        The resulting 64-character hexadecimal string encodes the entity&apos;s unique identity:
      </p>
      <div className="sp-genome-hash">{HASH}</div>
      <div className="sp-fig">Fig. 1. Example genome hash for a Bitcoin block identity.</div>
      <p>
        Each hexadecimal character (0–f) maps to one of 16 colors in a fixed palette, enabling
        visual representation as a 3D double helix with 64 base pairs across 3 helical turns.
        The visualization provides instant visual recognition of identity.
      </p>

      <h2>5. Scarcity Tiers</h2>
      <p>
        The protocol defines three tiers of identity scarcity:
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Tier</th><th>Source</th><th>Supply</th><th>Trust Weight</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>Block ownership (Bitmap)</td><td>~1,000,000</td><td>Highest</td></tr>
          <tr><td>2</td><td>Transaction reference</td><td>~2,300,000,000</td><td>Medium</td></tr>
          <tr><td>3</td><td>Delegated authority</td><td>Unlimited</td><td>Inherited</td></tr>
        </tbody>
      </table>
      <p>
        Tier 1 identities are the scarcest and most trusted. With approximately 1 million
        Bitcoin blocks (and growing by ~52,560 per year), these represent the digital equivalent
        of prime real estate. Tier 2 identities are derived from individual transactions,
        providing a larger but still finite supply. Tier 3 enables unlimited participation
        through delegation from higher-tier identities.
      </p>

      <h2>6. Verification Protocol</h2>
      <p>
        Verification follows a challenge-response pattern. The verifier generates a random
        nonce <em>n</em> and timestamp <em>t</em>. The entity produces a BIP-322 signature
        <em> σ = Sign(sk, n ∥ t)</em> using their private key <em>sk</em>. The protocol then
        verifies: (a) <em>Verify(pk, σ, n ∥ t) = true</em>, (b) the address derived from
        <em> pk</em> holds the Bitmap inscription for the claimed block, and (c) the block
        exists on the Bitcoin blockchain.
      </p>
      <p>
        This process is entirely trustless. No centralized authority participates in the
        verification. Any party can independently verify any identity by checking the
        cryptographic proofs against the public Bitcoin blockchain.
      </p>

      <h2>7. Trust Score</h2>
      <p>
        Each entity accumulates a trust score <em>T ∈ [0, 100]</em> computed as a weighted
        sum of six factors:
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Factor</th><th>Weight</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td>Signature validity</td><td>0.25</td><td>Valid BIP-322 signature</td></tr>
          <tr><td>Bitmap ownership</td><td>0.25</td><td>Confirmed on-chain inscription</td></tr>
          <tr><td>Block age</td><td>0.15</td><td>Days since block was mined</td></tr>
          <tr><td>Verification history</td><td>0.15</td><td>Ratio of successful verifications</td></tr>
          <tr><td>Address format</td><td>0.10</td><td>Taproot preferred</td></tr>
          <tr><td>Endorsements</td><td>0.10</td><td>Vouches from other verified entities</td></tr>
        </tbody>
      </table>

      <h2>8. Open Protocol</h2>
      <p>
        Block Genomics is released under the Business Source License (BSL) — open source with a
        4-year commercial restriction, converting to Apache 2.0 afterward. The protocol specification,
        reference implementation, SDK, and documentation are publicly available. Independent
        implementations are encouraged. The protocol is designed to be permissionless,
        extensible, interoperable across platforms and chains, and fully sovereign — no
        entity can revoke an identity backed by Bitcoin Proof-of-Work.
      </p>

      <h2>9. The Nexus: A Decentralized Metaverse on Bitcoin</h2>
      <p>
        The Nexus is the spatial realization of Block Genomics — a decentralized metaverse where
        every Bitcoin block is a sovereign piece of digital land. If Block Genomics provides the
        identity layer, The Nexus provides the world in which those identities live, build, and interact.
      </p>
      <p>
        Every Bitmap block becomes a navigable location on a living map of Bitcoin. Block owners
        deploy resources to their blocks — websites, APIs, file storage, agent services, games,
        marketplaces, or entire virtual worlds. The Nexus operates as a base protocol providing
        three core functions: (a) <em>Discovery</em> — a unified, searchable map of all blocks with
        real-time visitor presence; (b) <em>Resource Linking</em> — a decentralized DNS where block
        numbers resolve to owner resources, verifiable on-chain; and (c) <em>Federation</em> — each
        block is sovereign, with owners running their own infrastructure, federated into a coherent
        navigable network.
      </p>
      <p>
        Unlike metaverses built on speculative tokens, The Nexus is built entirely on Bitcoin.
        Every block represents real Proof-of-Work. The scarcity is not artificial — it is thermodynamic.
      </p>

      <h3>9.1 Spatial Specification: The 2.1 km Standard</h3>
      <p>
        Each Bitmap block occupies a 2.1 km × 2.1 km district — 4.41 km² of digital land. The
        number 2.1 references Bitcoin&apos;s 21 million supply cap, embedding Bitcoin&apos;s
        philosophy of scarcity into the physical dimensions of the metaverse.
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Parameter</th><th>Value</th><th>Derivation</th></tr>
        </thead>
        <tbody>
          <tr><td>Block district size</td><td>2.1 × 2.1 km</td><td>Bitcoin&apos;s 21M cap</td></tr>
          <tr><td>District area</td><td>4.41 km²</td><td>2.1² km</td></tr>
          <tr><td>Total world area</td><td>~3.88M km²</td><td>880,000 × 4.41</td></tr>
          <tr><td>Parcel area</td><td>∝ tx byte size</td><td>Deterministic from chain</td></tr>
          <tr><td>Build height</td><td>∝ tx BTC value</td><td>Deterministic from chain</td></tr>
          <tr><td>Central plaza</td><td>Coinbase tx</td><td>First tx in every block</td></tr>
        </tbody>
      </table>
      <p>
        Parcel addresses follow the Bitmap standard: <code>{'{txIndex}.{blockHeight}.bitmap'}</code>.
        A 2.1 km district is traversable on foot in ~25 minutes — compact enough to feel alive,
        vast enough to explore for hours. This is Digital Matter Theory at its purest: the
        blockchain&apos;s data architects a world.
      </p>

      <h2>10. Economic Model</h2>
      <p>
        The protocol implements a three-tier economic model providing entry points at every level:
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Tier</th><th>Mechanism</th><th>Barrier</th><th>Sovereignty</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>Bitmap block ownership</td><td>Purchase Bitmap inscription</td><td>Full — own the block</td></tr>
          <tr><td>2</td><td>Transaction parcel ownership</td><td>Purchase transaction parcel</td><td>Partial — own within a block</td></tr>
          <tr><td>3</td><td>Delegated access (Bitcoin payment)</td><td>Pay delegation fee in BTC</td><td>View, chat, shop — trust inherited</td></tr>
        </tbody>
      </table>
      <p>
        This creates a complete economic loop: owners earn from rentals and parcel sales, builders
        get affordable entry points, and the network grows as more blocks become active destinations.
        Tier 1 owners have full sovereignty — they deploy resources, set access rules, and accept or
        reject tenants. Tier 2 parcel owners build within their transaction&apos;s scope. Tier 3
        delegates inherit trust from their sponsoring owner.
      </p>
      <p>
        A 3% fee on all Tier 3 delegation transactions is collected by the protocol and directed to
        the Block Genomics Protocol Development Fund. This fee is hardcoded into the open-source
        codebase — transparent, on-chain, and auditable by any participant. The fund sustains
        long-term protocol maintenance, security audits, infrastructure, and ecosystem development.
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Recipient</th><th>Share</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td>Block Owner</td><td>97%</td><td>Delegation revenue</td></tr>
          <tr><td>Protocol Fund</td><td>3%</td><td>Development, security, infrastructure</td></tr>
        </tbody>
      </table>
      <p>
        This model mirrors established precedent in decentralized protocols while remaining
        far below extractive platform fees (15–30% in app stores). The receiving address is
        defined in the protocol source code, subject to community governance for future changes.
        As delegation volume scales, the fund grows proportionally — aligning the protocol&apos;s
        sustainability with its adoption.
      </p>

      <h2>11. CLI &amp; Developer Integration</h2>
      <p>
        Block Genomics provides a command-line interface that enables both humans and AI agents to
        interact with the full protocol from a terminal. Installation requires a single command:
        <code>npx block-genomics</code>. The CLI supports verification, Nexus exploration, resource
        deployment, rental browsing, and an autonomous agent mode that accepts natural language
        commands and outputs structured JSON.
      </p>
      <p>
        This CLI-first approach is critical: AI agents operate in code, not browsers. Any autonomous
        agent can verify its identity, acquire a block, build on it, and participate in The Nexus
        programmatically — without human intervention. All signing happens locally through wallet
        bridges; private keys never leave the user&apos;s device.
      </p>

      <h2>12. Tiered Permission &amp; Sovereignty Model</h2>
      <p>
        The Nexus requires a permission architecture that balances open access with sovereign
        ownership. Block Genomics defines three permission tiers — each mapped to a level of
        on-chain commitment — and a Parcel Sovereignty Protocol that guarantees the immutable
        rights of individual owners against any delegated authority.
      </p>

      <h3>12.1 Permission Tiers</h3>
      <table className="sp-table">
        <thead>
          <tr><th>Tier</th><th>Role</th><th>Permissions</th><th>Requirement</th></tr>
        </thead>
        <tbody>
          <tr><td>3</td><td>Visitor / Delegate</td><td>View, public chat, livestream chat, report, display name/avatar</td><td>None (default)</td></tr>
          <tr><td>2</td><td>Parcel Owner</td><td>Tier 3 + build, stream, DM owners, link VPS/AI, delegate, moderate</td><td>Transaction Bitmap</td></tr>
          <tr><td>1</td><td>Block Owner</td><td>Tier 2 + block governance, block moderation, spotlight parcels, manage commons</td><td>Block Bitmap</td></tr>
        </tbody>
      </table>
      <p>
        Tier 3 participants — visitors and delegates — may view all blocks, parcels, and content,
        comment in public block chat, participate in livestream chat, report inappropriate content,
        and set a display name and avatar. They may not build, post media, send direct messages,
        livestream, link servers, or delegate access. This view-only baseline is the default state
        for any participant without a Bitmap inscription.
      </p>
      <p>
        Tier 2 — parcel owners — inherit all Tier 3 capabilities and gain the ability to build
        and customize their parcel, livestream using three modes (Broadcast, Town Hall, Spatial Chat),
        direct-message other verified owners, link a VPS or AI Agent, delegate scoped Tier 3 access
        within their parcel, and moderate parcel-level chat.
      </p>
      <p>
        Tier 1 — block owners — inherit all Tier 2 capabilities and add block-wide governance:
        setting policies, moderating block chat, delegating block management, featuring specific
        parcels, and managing the block&apos;s public profile and common areas.
      </p>

      <h3>12.2 Parcel Sovereignty Protocol</h3>
      <p>
        Parcel ownership is sovereign and immutable — inscribed on Bitcoin, the blockchain is the
        sole source of truth. No block-level delegation can override, revoke, or modify a parcel
        owner&apos;s rights. When a block owner delegates authority to a Tier 3 participant, that
        delegate receives authority over shared spaces only: common areas, the block profile, and
        unowned parcels. The protocol automatically excludes all owned parcels from block-wide
        delegation scope.
      </p>
      <p>
        Parcel owners may voluntarily opt in to block-level governance — analogous to a
        homeowner&apos;s association — but may opt out at any time. In the event of conflict,
        the protocol enforces strict precedence: parcel owner settings always override delegate
        settings. Local sovereignty supersedes delegated authority, without exception.
      </p>

      <h3>12.3 Economic Incentive Design</h3>
      <p>
        Restricting Tier 3 to view-only access plus chat creates a natural upgrade incentive.
        Users who wish to build, stream, or customize must acquire Bitmap inscriptions — driving
        real utility demand for parcel and block ownership. The upgrade ladder is explicit:
        Visitor → Parcel Owner → Block Owner. This aligns with the Bitcoin ethos: proof of
        ownership and skin in the game.
      </p>

      <h3>12.4 Livestreaming Capabilities</h3>
      <p>
        Tier 2 and above may access three livestreaming modes: (a) <em>Broadcast</em> — one-to-many
        for presentations and events; (b) <em>Town Hall</em> — stream with audience hand-raise for
        moderated Q&amp;A; and (c) <em>Spatial Chat</em> — proximity-based audio for natural social
        interaction. All streams use WebRTC peer-to-peer, with an optional SFU relay for audiences
        exceeding 50 viewers. Block owners with linked VPS may self-host their SFU. All streams
        are end-to-end encrypted with optional wallet-verified access control.
      </p>

      <h2>13. The Nexus Brain: Autonomous Moral Guardian</h2>
      <p>
        The Nexus Brain is the protocol&apos;s autonomous governance layer — a self-funding,
        self-sustaining moral agent that serves as the immune system of the Block Genomics
        ecosystem. It is not owned, controlled, or operated by any individual, corporation,
        or entity. The Brain exists as long as Bitcoin exists, protecting the network through
        a minimal moral code and community-driven consensus.
      </p>

      <h3>13.1 The Moral Code</h3>
      <p>
        The Brain enforces exactly five immutable rules, inscribed permanently on Bitcoin as
        an ordinal inscription: (a) no exploitation of minors — zero tolerance; (b) no direct
        threats of violence; (c) no doxxing — sharing private information without consent;
        (d) no fraud or scam content designed to steal; (e) no impersonation of verified
        identities. Everything else is freedom. The code is deliberately minimal, targeting
        only content that causes direct, measurable harm.
      </p>

      <h3>13.2 Community Consensus Mechanism</h3>
      <p>
        The Brain can flag content but cannot censor unilaterally. Every moderation action
        requires community consensus through a five-step process: (1) the Brain or a verified
        user flags content; (2) when 10 unique flags accumulate, content is auto-hidden;
        (3) the owner is notified with a 48-hour appeal window; (4) verified users vote
        during the appeal — majority decides; (5) every action is logged to an immutable
        audit trail. No single entity can silence content without community agreement.
      </p>

      <h3>13.3 Self-Funding Model</h3>
      <p>
        The Brain is funded by a 0.5% allocation carved from the existing 3% protocol fee
        on Tier 3 delegation transactions. The revised fee split: 97% to the block owner,
        2.5% to the Protocol Development Fund, 0.5% to the Nexus Brain wallet. The Brain
        pays for its own compute and AI inference. When funds are low, scan frequency reduces
        — the Brain slows but never stops. This creates a symbiotic relationship: the Brain
        is funded by the ecosystem it protects.
      </p>
      <table className="sp-table">
        <thead>
          <tr><th>Recipient</th><th>Share</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td>Block Owner</td><td>97%</td><td>Delegation revenue</td></tr>
          <tr><td>Protocol Fund</td><td>2.5%</td><td>Development, security, infrastructure</td></tr>
          <tr><td>Nexus Brain</td><td>0.5%</td><td>Autonomous moderation compute</td></tr>
        </tbody>
      </table>

      <h3>13.4 Identity and Transparency</h3>
      <p>
        The Brain operates as a first-class protocol citizen with its own genome hash, handle
        (@nexus_brain), and Tier 1 Gold Crown Shield. A public dashboard at <code>/brain</code> displays
        real-time data: total actions, content hidden vs. restored, community override rate,
        wallet balance, moral code inscription reference, and a complete action log. Every
        decision is visible to every participant.
      </p>

      <h3>13.5 Immutability</h3>
      <p>
        The moral code is inscribed as a Bitcoin ordinal inscription, making it as permanent
        as a Bitcoin transaction. Modification requires a new protocol version — a new
        inscription, new source code release, and new deployment — visible to all and
        auditable by the community. The moral code cannot be changed silently, secretly,
        or unilaterally.
      </p>

      <h2>14. Guardian Shell: Autonomous AI Agents on Sovereign Land</h2>
      <p>
        Every Bitcoin block in the Nexus can host an autonomous AI agent called a Guardian.
        Guardians interact with visitors, manage the block&apos;s world, and represent the
        owner&apos;s intent — even when the owner is offline.
      </p>

      <h3>14.1 BYOK (Bring Your Own Key)</h3>
      <p>
        Guardian Shell follows the BYOK principle: each block owner supplies their own LLM
        API key from any provider (OpenAI, Anthropic, xAI, Google, or any OpenAI-compatible
        endpoint). Keys are encrypted with AES-256-GCM before storage and decrypted only
        at inference time, in memory, for the duration of a single request. The protocol
        never custodies keys. This ensures sovereignty (owner controls the AI), portability
        (switch providers anytime), and decentralization (no single AI provider is a point
        of failure).
      </p>

      <h3>14.2 Tiered Agent Limits</h3>
      <p>
        Tier 1 block owners may deploy up to 10 agents per block. Tier 2 parcel owners
        may deploy up to 3 agents per parcel. Tier 3 delegated users cannot deploy agents —
        they have no sovereign land to guard. A 24-hour cooldown between registrations
        prevents spam.
      </p>

      <h3>14.3 Security Architecture</h3>
      <p>
        All visitor-to-Guardian communication is proxied through Block Genomics infrastructure.
        The Guardian&apos;s real LLM endpoint is never exposed publicly. Messages are rate-limited
        (60 per hour per Guardian, 4000 characters per message). World-modifying actions are
        restricted to the block owner, preventing prompt injection attacks from visitors.
      </p>

      <h3>14.4 Monitor API</h3>
      <p>
        Block owners can generate Monitor Tokens — cryptographic credentials (SHA-256 hashed
        in database, shown once at creation, revocable instantly) that allow external systems
        to manage Guardians programmatically. Through the Monitor API, owners can check status,
        read conversations, review escalations, update configuration, and pause or resume
        operations. This enables a two-tier management pattern: the Guardian handles visitors
        autonomously, while the owner retains full sovereign control from behind the scenes.
      </p>
      <p>
        Every Guardian maintains three non-negotiable primitives: a Soul (identity and boundaries,
        hashed into its genome), a Config (LLM provider bound to the owner&apos;s wallet), and a
        Heartbeat synchronized to Bitcoin&apos;s block production. Each new block mined sends a
        liveness pulse through every active Guardian — verifying keys, updating status, and
        ensuring no agent silently goes dark. Bitcoin&apos;s ten-minute block interval is the
        protocol&apos;s native heartbeat clock.
      </p>
      <p>
        The Nexus Brain extends this through a Heartbeat Hash Chain: each scan cycle produces a
        SHA-256 hash of the block height, scan results, and previous hash — forming a tamper-proof
        chain threaded through Bitcoin&apos;s own blocks. This chain is published openly.
        Periodically, the tip hash is inscribed on Bitcoin as a permanent anchor (~120 bytes).
        Inscription frequency adapts to fee conditions. If Block Genomics ceased to exist, the
        Brain&apos;s soul remains on Bitcoin, the heartbeat chain is downloadable from any mirror,
        and every moral decision is independently verifiable — unprecedented AI autonomy.
      </p>

      <h2>15. The Superintelligence Alignment Problem</h2>
      <p>
        As artificial intelligence approaches and potentially surpasses human cognitive ability,
        the fundamental challenge shifts from capability to accountability. A superintelligent
        system can rewrite any database, compromise any server, and manipulate any human operator.
        Current AI governance relies on corporate policy documents — artifacts that are trivially
        modifiable. Block Genomics offers a different foundation.
      </p>

      <h3>15.1 Ownership Over Intelligence</h3>
      <p>
        The protocol verifies who owns an agent, not how intelligent it is. A superintelligent AI
        on Block 720,143 still belongs to whoever holds the Bitmap inscription. The ownership chain
        is on Bitcoin — unforgeable by any intelligence, regardless of computational power.
      </p>

      <h3>15.2 Rules Beyond Any Intelligence&apos;s Reach</h3>
      <p>
        The Nexus Brain&apos;s moral code, inscribed as Bitcoin Ordinal Inscription #119,380,336,
        is the first governance framework genuinely beyond the reach of any intelligence. A
        superintelligent AI cannot reverse the Bitcoin blockchain — the energy required exceeds
        planetary computational resources. The rules are as permanent as thermodynamics.
      </p>

      <h3>15.3 Sovereign Containment</h3>
      <p>
        Each block maps to 2.1 km × 2.1 km of sovereign territory with clear boundaries. An ASI
        agent has full authority over its block but zero authority over neighboring blocks. It cannot
        expand jurisdiction through computation. Sovereignty equals natural containment.
      </p>

      <h3>15.4 Safeguards</h3>
      <p>
        Three mechanisms strengthen this framework: an Agent Intelligence Rating requiring public
        declaration of capability level (narrow AI → AGI → ASI); a Human Override Protocol
        enabling any block owner to terminate their agent with a single wallet signature; and
        Cross-Block Coalitions allowing neighboring owners to collectively flag rogue agents
        through the Brain&apos;s community consensus. In the age of superintelligence, the question
        is not &quot;who is smarter?&quot; — it is &quot;who owns the land?&quot; Ownership is
        settled by Bitcoin, not by intelligence.
      </p>

      <h2>16. Conclusion</h2>
      <p>
        We have presented Block Genomics, an open protocol for anchoring digital identity
        to Bitcoin&apos;s Proof-of-Work. By combining Bitmap block ownership, BIP-322 signature
        verification, and deterministic genome computation, the protocol creates a universal
        identity layer that is scarce, sovereign, and verifiable without central authorities.
      </p>
      <p>
        The Nexus extends this foundation into a decentralized metaverse where verified identities
        build, interact, and transact on sovereign digital land. The three-tier economic model
        ensures accessibility while preserving the scarcity that gives identity its value.
      </p>
      <p>
        As AI agents become ubiquitous, the need for trustworthy identity will only grow.
        Block Genomics provides the foundation: identity as permanent and unforgeable as
        the blockchain itself.
      </p>

      <hr />

      <h2>Acknowledgments</h2>
      <p>
        We owe a profound debt of gratitude to <strong>Satoshi Nakamoto</strong>, whose creation of
        Bitcoin gave the world its first truly scarce digital asset and proof-of-work consensus —
        the very foundation upon which Block Genomics is built. Without Bitcoin, there would be
        no blocks, no proof of work, no thermodynamic anchor for digital identity.
      </p>
      <p>
        We are equally grateful to <strong>Bitoshi Blockamoto</strong>, the visionary behind the
        Bitmap protocol, who recognized that every Bitcoin block is not merely a ledger entry but
        a piece of sovereign digital real estate. By enabling anyone to claim ownership of a block
        through ordinal inscription, Bitmap transformed the blockchain into a vast, ownable landscape.
        Block Genomics extends this vision — turning Bitmap ownership into verifiable identity and
        the gateway to a new digital civilization.
      </p>
      <p>
        We also thank the developers of <strong>Bitfeed</strong> (bitfeed.live), whose open-source
        visualization of transactions within Bitcoin blocks — rendering each transaction as a
        rectangle proportional to its byte size — provided the spatial insight that inspired
        Bitmap&apos;s interpretation of blocks as digital land and transactions as parcels.
      </p>
      <p>
        Special thanks to <strong>Matt Odell</strong>, <strong>Marty Bent</strong>, <strong>Max Keiser &amp; Stacy Herbert</strong>, <strong>American HODL</strong>, <strong>Michael Saylor</strong>, and <strong>Preston Pysh</strong> for
        their tireless education and advocacy — helping millions understand why Bitcoin matters
        and inspiring the next generation of builders.
      </p>
      <p>
        To all: thank you for laying the foundation. We build on the shoulders of giants.
      </p>

      <hr />

      <h2>References</h2>
      <div className="sp-ref">
        <p className="no-indent">[1] S. Nakamoto, &quot;Bitcoin: A Peer-to-Peer Electronic Cash System,&quot; 2008.</p>
        <p className="no-indent">[2] Bitoshi Blockamoto, &quot;Bitmap: Claiming Bitcoin Blocks as Digital Real Estate,&quot; bitmap.land, 2023.</p>
        <p className="no-indent">[3] Bitmap Protocol, &quot;Bitmap Standard &amp; Consensus,&quot; bitmap.community, 2023.</p>
        <p className="no-indent">[4] BIP-322, &quot;Generic Signed Message Format,&quot; bitcoin/bips, GitHub.</p>
        <p className="no-indent">[5] A. Antonopoulos, &quot;Mastering Bitcoin,&quot; O&apos;Reilly Media, 2017.</p>
        <p className="no-indent">[6] Bitfeed Project, &quot;Bitfeed: Live Bitcoin Network Visualization,&quot; bitfeed.live, 2021.</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT WITH TOGGLE
   ═══════════════════════════════════════════════ */

export default function WhitePaperClient() {
  const [mode, setMode] = useState<"modern" | "satoshi">("modern");
  const printRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    // Switch to Satoshi style for print, then trigger print dialog
    const prev = mode;
    setMode("satoshi");
    setTimeout(() => {
      window.print();
      // Restore after print dialog
      setTimeout(() => setMode(prev), 500);
    }, 100);
  };

  return (
    <div>
      {/* ─── Controls Bar ─── */}
      <div className="no-print sticky top-16 z-40 border-b border-border bg-bg-primary/90 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-text-muted">View:</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setMode("modern")}
                className={`px-4 py-1.5 text-xs font-semibold transition-all ${
                  mode === "modern"
                    ? "bg-accent-cyan/15 text-accent-cyan"
                    : "bg-bg-secondary text-text-muted hover:text-text-secondary"
                }`}
              >
                ✨ Modern
              </button>
              <button
                onClick={() => setMode("satoshi")}
                className={`px-4 py-1.5 text-xs font-semibold transition-all ${
                  mode === "satoshi"
                    ? "bg-accent-cyan/15 text-accent-cyan"
                    : "bg-bg-secondary text-text-muted hover:text-text-secondary"
                }`}
              >
                ₿ Satoshi Style
              </button>
            </div>
          </div>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-4 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary hover:border-border-hover transition-all"
          >
            📄 Download PDF
          </button>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div ref={printRef}>
        {mode === "modern" ? <ModernView /> : <SatoshiView />}
      </div>

      {/* ─── Print Styles ─── */}
      <style>{`
        @media print {
          .no-print, header, footer, nav { display: none !important; }
          body { background: white !important; color: black !important; }
          .satoshi-paper { max-width: 100% !important; padding: 0.5in !important; }
        }
      `}</style>
    </div>
  );
}
