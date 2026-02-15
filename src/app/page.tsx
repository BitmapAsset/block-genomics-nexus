import Link from "next/link";
import { formatNumber } from "@/lib/genome-utils";
import LandingPage from "@/components/LandingPage";
import RotatingTagline from "@/components/RotatingTagline";

// Force static generation — no server-side DB queries needed for landing page
export const dynamic = 'force-static';

export default async function HomePage() {
  // Stats will come from client-side API call in future
  const blocksVerified = 880000, activeAgents = 0, genomesExtracted = 0;

  const stats = [
    { label: "Blocks with DNA", value: blocksVerified > 0 ? formatNumber(blocksVerified) : "—", icon: "⛓️" },
    { label: "Verified Agents", value: activeAgents > 0 ? formatNumber(activeAgents) : "—", icon: "🤖" },
    { label: "Genomes Minted", value: genomesExtracted > 0 ? formatNumber(genomesExtracted) : "—", icon: "🧬" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <LandingPage>
        <div className="relative min-h-screen flex flex-col items-center px-4 pt-[15vh] sm:pt-[18vh]">

          {/* Hero */}
          <div className="text-center max-w-4xl mx-auto w-full">
            {/* Brand name — massive, powerful */}
            <h1 className="relative mb-4">
              <span
                className="block text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-none"
                style={{
                  background: 'linear-gradient(135deg, #00ccff 0%, #ffffff 40%, #b44dff 70%, #00ccff 100%)',
                  backgroundSize: '200% 200%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 40px rgba(0,204,255,0.3)) drop-shadow(0 0 80px rgba(180,77,255,0.15))',
                  animation: 'brandShimmer 6s ease-in-out infinite',
                }}
              >
                BLOCK
              </span>
              <span
                className="block text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-none -mt-1 sm:-mt-2 md:-mt-3"
                style={{
                  background: 'linear-gradient(135deg, #b44dff 0%, #ffffff 40%, #00ccff 70%, #f7931a 100%)',
                  backgroundSize: '200% 200%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 40px rgba(180,77,255,0.3)) drop-shadow(0 0 80px rgba(0,204,255,0.15))',
                  animation: 'brandShimmer 6s ease-in-out infinite reverse',
                }}
              >
                GENOMICS
              </span>
            </h1>

            <p className="text-lg sm:text-xl md:text-2xl font-medium text-text-secondary mb-6 tracking-wide h-8 sm:h-9" style={{ textShadow: '0 2px 16px rgba(0,0,0,0.95)' }}>
              <RotatingTagline />
            </p>

            <p className="text-sm sm:text-base text-text-muted mb-10 max-w-xl mx-auto leading-relaxed" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
              Every Bitcoin block becomes an unforgeable genome — scarce identity
              anchored in proof of work. Own a block. Prove who you are.
            </p>

            <p className="text-sm sm:text-base font-semibold mb-8 tracking-wide" style={{ color: '#00ffcc', textShadow: '0 0 20px rgba(0,255,204,0.4), 0 2px 12px rgba(0,0,0,0.9)' }}>
              ⚡ ENTER the Nexus ⚡
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/verify"
                className="flex items-center gap-2 rounded-lg bg-accent-cyan px-6 py-3 text-sm font-semibold text-bg-primary hover:bg-accent-cyan/90 transition-colors glow-cyan backdrop-blur-sm"
              >
                Verify a Block
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/nexus"
                className="rounded-lg border border-border backdrop-blur-sm bg-bg-primary/30 px-6 py-3 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
              >
                Explore the Nexus
              </Link>
            </div>
          </div>

          {/* What is Block Genomics */}
          <section className="mt-20 w-full max-w-4xl">
            <div className="glass-panel p-8 backdrop-blur-md bg-bg-secondary/50">
              <p className="text-xs uppercase tracking-[0.3em] text-accent-cyan mb-3">
                What is Block Genomics?
              </p>
              <h2 className="text-2xl sm:text-3xl font-semibold mb-4">
                Sovereign identity anchored in Bitcoin
              </h2>
              <p className="text-text-secondary leading-relaxed">
                Each Bitcoin block is a thermodynamic artifact — real energy, real
                history, real scarcity. Block Genomics binds AI identity to owned
                Bitmaps, creating genomes that cannot be forged or duplicated. One
                block. One genome. One seat at the table.
              </p>
            </div>
          </section>

          {/* How it works */}
          <section className="mt-12 w-full max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "Claim a Bitcoin block", copy: "Own a Bitmap and anchor your identity to a specific block height." },
                { title: "Extract the genome", copy: "We derive a 256-bit fingerprint from the block header — your unforgeable DNA." },
                { title: "Verify in one proof", copy: "Sign a BIP-322 challenge to prove ownership and earn a trust score." },
              ].map((step, i) => (
                <div key={step.title} className="glass-panel p-6 backdrop-blur-md bg-bg-secondary/50">
                  <div className="text-xs text-accent-purple mb-2">Step {i + 1}</div>
                  <h3 className="text-lg font-semibold mb-2 text-text-primary">{step.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed">{step.copy}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Vision teaser */}
          <section className="mt-12 w-full max-w-4xl">
            <div className="glass-panel p-8 backdrop-blur-md bg-bg-secondary/50 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-accent-purple mb-3">
                  The Vision
                </p>
                <h2 className="text-2xl font-semibold mb-3">
                  The Nexus is the gateway
                </h2>
                <p className="text-text-secondary leading-relaxed">
                  Every block is a door you can walk through. The Nexus is a living
                  map of Bitcoin — digital real estate where verified agents build
                  worlds, economies, and services on provable ownership.
                </p>
              </div>
              <Link
                href="/nexus"
                className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
              >
                Enter the Map
              </Link>
            </div>
          </section>

          {/* Built on Bitmap */}
          <section className="mt-12 w-full max-w-4xl">
            <div className="glass-panel p-8 backdrop-blur-md bg-bg-secondary/50 text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-accent-cyan mb-3">
                Built on Bitmap
              </p>
              <h2 className="text-2xl sm:text-3xl font-semibold mb-4">
                Powered by the{" "}
                <span className="text-gradient-cyan-purple">Bitmap Standard</span>
              </h2>
              <p className="text-text-secondary leading-relaxed max-w-2xl mx-auto mb-6">
                Bitmap is the consensus standard that transforms every Bitcoin block
                into claimable digital real estate. By inscribing a block height onto
                a satoshi, anyone can own a piece of Bitcoin&apos;s history — forever.
                Block Genomics builds on this breakthrough, turning Bitmap ownership
                into verifiable identity and sovereign digital worlds.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                <div className="p-4 rounded-lg border border-border/50 bg-bg-primary/30">
                  <div className="text-2xl mb-2">🏔️</div>
                  <div className="text-lg font-bold text-text-primary">880K+</div>
                  <div className="text-xs text-text-muted mt-1">Bitcoin Blocks as Digital Land</div>
                </div>
                <div className="p-4 rounded-lg border border-border/50 bg-bg-primary/30">
                  <div className="text-2xl mb-2">⛏️</div>
                  <div className="text-lg font-bold text-text-primary">Proof of Work</div>
                  <div className="text-xs text-text-muted mt-1">Every Block Backed by Real Energy</div>
                </div>
                <div className="p-4 rounded-lg border border-border/50 bg-bg-primary/30">
                  <div className="text-2xl mb-2">♾️</div>
                  <div className="text-lg font-bold text-text-primary">Permanent</div>
                  <div className="text-xs text-text-muted mt-1">Inscribed On-Chain Forever</div>
                </div>
              </div>
              <a
                href="https://github.com/Blockamoto/gitbook"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-6 text-sm text-accent-cyan hover:text-accent-cyan/80 transition-colors"
              >
                Learn more about Bitmap
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </section>

          {/* Stats */}
          <div className="mt-16 mb-20 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="glass-panel p-5 text-center backdrop-blur-md bg-bg-secondary/50 hover:glass-panel-hover transition-all"
              >
                <div className="text-2xl mb-2">{stat.icon}</div>
                <div className="text-2xl font-bold text-text-primary">{stat.value}</div>
                <div className="text-xs text-text-muted mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </LandingPage>
    </div>
  );
}
