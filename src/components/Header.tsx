"use client";

import { useState } from "react";
import Link from "next/link";
import WalletConnect from "@/components/auth/WalletConnect";

const navLinks = [
  { href: "/nexus", label: "Nexus" },
  { href: "/directory", label: "Directory" },
  { href: "/live", label: "TimesSquare", isLive: true },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/verify", label: "Verify" },
  { href: "/whitepaper", label: "White Paper" },
  { href: "/brain", label: "Brain", isBrain: true },
];

const nexusStyle = {
  color: '#00ffcc',
  background: 'rgba(0,255,204,0.08)',
  border: '1px solid rgba(0,255,204,0.25)',
  boxShadow: '0 0 15px rgba(0,255,204,0.2), inset 0 0 10px rgba(0,255,204,0.05)',
  textShadow: '0 0 10px rgba(0,255,204,0.6)',
  animation: 'nexusPulse 2s ease-in-out infinite',
};

const brainStyle = {
  color: '#a78bfa',
  background: 'rgba(167,139,250,0.08)',
  border: '1px solid rgba(167,139,250,0.2)',
  boxShadow: '0 0 12px rgba(167,139,250,0.15)',
};

function NavLink({ link }: { link: { href: string; label: string; isBrain?: boolean; isLive?: boolean } }) {
  const isNexus = link.href === '/nexus';
  const isBrain = !!(link as any).isBrain;
  const isLive = !!(link as any).isLive;
  const liveStyle: React.CSSProperties = { color: '#ff6b6b', textShadow: '0 0 8px rgba(255,51,51,0.3)' };
  return (
    <Link
      href={link.href}
      className={`px-3 py-2 text-sm rounded-lg transition-all ${isNexus ? 'font-bold' : isBrain ? 'font-semibold' : isLive ? 'font-semibold' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'}`}
      style={isNexus ? nexusStyle : isBrain ? brainStyle : isLive ? liveStyle : undefined}
    >
      {isNexus ? '⚡ ' : ''}
      {isLive ? (
        <span className="inline-flex items-center gap-1.5">
          📺
          <span>{link.label}</span>
        </span>
      ) : isBrain ? (
        <span className="inline-flex items-center gap-1.5">
          🧠
          <span>{link.label}</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </span>
      ) : link.label}
    </Link>
  );
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-primary/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center group">
          <span
            className="text-xl sm:text-2xl font-black tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #00ffcc 0%, #ffffff 30%, #aa44ff 60%, #ff8800 100%)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'brandShimmer 4s ease-in-out infinite',
              filter: 'drop-shadow(0 0 12px rgba(0,255,204,0.3))',
            }}
          >
            Block Genomics
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => <NavLink key={link.href} link={link} />)}
        </nav>

        <div className="flex items-center gap-2">
          <WalletConnect />
          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex flex-col gap-[5px] p-2 rounded-lg hover:bg-bg-tertiary/50 transition-colors"
            aria-label="Toggle menu"
          >
            <span className={`block w-5 h-[2px] bg-text-secondary transition-all ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-5 h-[2px] bg-text-secondary transition-all ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-[2px] bg-text-secondary transition-all ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <nav className="md:hidden border-t border-border bg-bg-primary/95 backdrop-blur-xl px-4 py-3 flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-sm rounded-lg transition-all ${link.href === '/nexus' ? 'font-bold' : (link as any).isBrain ? 'font-semibold' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'}`}
              style={link.href === '/nexus' ? nexusStyle : (link as any).isBrain ? brainStyle : undefined}
            >
              {link.href === '/nexus' ? '⚡ ' : ''}
              {(link as any).isBrain ? (
                <span className="inline-flex items-center gap-1.5">
                  🧠
                  <span>{link.label}</span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                </span>
              ) : link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
