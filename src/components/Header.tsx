"use client";

import Link from "next/link";
import WalletConnect from "@/components/auth/WalletConnect";

const navLinks = [
  { href: "/explore", label: "Explore" },
  { href: "/verify", label: "Verify" },
  { href: "/nexus", label: "Nexus" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/whitepaper", label: "White Paper" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-primary/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 group-hover:border-accent-cyan/40 transition-colors">
            <span className="text-accent-cyan font-bold text-sm">BG</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">
            <span className="text-gradient-cyan-purple">Block Genomics</span>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isNexus = link.href === '/nexus';
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 text-sm rounded-lg transition-all ${isNexus ? 'font-bold' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'}`}
                style={isNexus ? {
                  color: '#00ffcc',
                  background: 'rgba(0,255,204,0.08)',
                  border: '1px solid rgba(0,255,204,0.25)',
                  boxShadow: '0 0 15px rgba(0,255,204,0.2), inset 0 0 10px rgba(0,255,204,0.05)',
                  textShadow: '0 0 10px rgba(0,255,204,0.6)',
                  animation: 'nexusPulse 2s ease-in-out infinite',
                } : undefined}
              >
                {isNexus ? '⚡ ' : ''}{link.label}
              </Link>
            );
          })}
        </nav>

        <WalletConnect />
      </div>
    </header>
  );
}
