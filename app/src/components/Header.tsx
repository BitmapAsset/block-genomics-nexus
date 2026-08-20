"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const WalletConnect = dynamic(() => import("@/components/auth/WalletConnect"), {
  ssr: false,
  loading: () => (
    <button className="flex items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-2 text-sm font-medium text-accent-cyan">
      Connect
    </button>
  ),
});

const GlobalSearch = dynamic(() => import("@/components/GlobalSearch"), {
  ssr: false,
  loading: () => <div className="w-[180px] sm:w-[260px] lg:w-[320px] h-[34px]" />,
});

const NotificationBell = dynamic(() => import("@/components/NotificationBell"), {
  ssr: false,
  loading: () => <div className="w-9 h-9" />,
});

const ThemeToggle = dynamic(() => import("@/components/ThemeToggle"), {
  ssr: false,
  loading: () => <div className="w-9 h-9" />,
});

interface NavLinkItem {
  href: string;
  label: string;
  isBrain?: boolean;
  isLive?: boolean;
  isRuneBolt?: boolean;
}

const navLinks: NavLinkItem[] = [
  { href: "/nexus", label: "Nexus" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/directory", label: "Directory" },
  { href: "/live", label: "TimesSquare", isLive: true },
  { href: "/rentals", label: "Rentals" },
  { href: "/history", label: "History" },
  { href: "/runebolt", label: "RuneBolt", isRuneBolt: true },
  { href: "/verify", label: "Verify" },
  { href: "/docs", label: "Docs" },
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

const runeBoltStyle = {
  color: '#F7931A',
  background: 'linear-gradient(135deg, rgba(247,147,26,0.15) 0%, rgba(255,215,0,0.08) 100%)',
  border: '1px solid rgba(247,147,26,0.35)',
  boxShadow: '0 0 15px rgba(247,147,26,0.25), inset 0 0 10px rgba(247,147,26,0.05)',
  textShadow: '0 0 8px rgba(247,147,26,0.5)',
  fontWeight: 700,
};

const NavLink = React.memo(function NavLink({ link }: { link: NavLinkItem }) {
  const isNexus = link.href === '/nexus';
  const isBrain = !!link.isBrain;
  const isLive = !!link.isLive;
  const isRuneBolt = !!link.isRuneBolt;
  const liveStyle: React.CSSProperties = { color: '#ff6b6b', textShadow: '0 0 8px rgba(255,51,51,0.3)' };
  return (
    <Link
      href={link.href}
      className={`px-3 py-2 text-sm rounded-lg transition-all ${isNexus ? 'font-bold' : isBrain ? 'font-semibold' : isLive ? 'font-semibold' : isRuneBolt ? 'font-bold' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'}`}
      style={isNexus ? nexusStyle : isBrain ? brainStyle : isLive ? liveStyle : isRuneBolt ? runeBoltStyle : undefined}
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
      ) : isRuneBolt ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#F7931A] to-[#FFD700] flex items-center justify-center">
            <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </span>
          <span className="font-bold" style={{ background: 'linear-gradient(135deg, #F7931A, #FFD700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{link.label}</span>
        </span>
      ) : link.label}
    </Link>
  );
});

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const inNexus = pathname === '/nexus' || pathname.startsWith('/nexus/');

  // Close mobile menu on route change (handles browser back/forward)
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-xl transition-all duration-500"
      style={inNexus ? {
        background: 'rgba(2,2,8,0.92)',
        borderColor: 'rgba(0,255,204,0.15)',
        boxShadow: '0 1px 30px rgba(0,255,204,0.08), inset 0 -1px 0 rgba(0,255,204,0.1)',
      } : {
        background: 'rgba(var(--bg-primary), 0.8)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Nexus neon scanline */}
      {inNexus && (
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{
          background: 'linear-gradient(90deg, transparent 0%, #00ffcc 20%, #a855f7 50%, #f7931a 80%, transparent 100%)',
          opacity: 0.6,
          animation: 'nexusScanline 3s ease-in-out infinite',
        }} />
      )}
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

        <div className="flex items-center gap-1.5">
          <GlobalSearch />
          <NotificationBell />
          <ThemeToggle />
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
          <div className="pb-2">
            <GlobalSearch />
          </div>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`px-4 py-3 text-sm rounded-lg transition-all ${link.href === '/nexus' ? 'font-bold' : link.isBrain ? 'font-semibold' : link.isRuneBolt ? 'font-bold' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'}`}
              style={link.href === '/nexus' ? nexusStyle : link.isBrain ? brainStyle : link.isRuneBolt ? runeBoltStyle : undefined}
            >
              {link.href === '/nexus' ? '⚡ ' : ''}
              {link.isBrain ? (
                <span className="inline-flex items-center gap-1.5">
                  🧠
                  <span>{link.label}</span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                </span>
              ) : link.isRuneBolt ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#F7931A] to-[#FFD700] flex items-center justify-center">
                    <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                  </span>
                  <span className="font-bold" style={{ background: 'linear-gradient(135deg, #F7931A, #FFD700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{link.label}</span>
                </span>
              ) : link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
