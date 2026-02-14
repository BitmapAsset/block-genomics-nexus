"use client";

import { useState } from "react";
import Link from "next/link";
import WalletConnect from "@/components/auth/WalletConnect";

const navLinks = [
  { href: "/nexus", label: "Nexus" },
  { href: "/directory", label: "Directory" },
  { href: "/verify", label: "Verify" },
  { href: "/whitepaper", label: "White Paper" },
  { href: "/brain", label: "🧠 Brain" },
];

const nexusStyle = {
  color: '#00ffcc',
  background: 'rgba(0,255,204,0.08)',
  border: '1px solid rgba(0,255,204,0.25)',
  boxShadow: '0 0 15px rgba(0,255,204,0.2), inset 0 0 10px rgba(0,255,204,0.05)',
  textShadow: '0 0 10px rgba(0,255,204,0.6)',
  animation: 'nexusPulse 2s ease-in-out infinite',
};

function NavLink({ link }: { link: { href: string; label: string } }) {
  const isNexus = link.href === '/nexus';
  return (
    <Link
      href={link.href}
      className={`px-3 py-2 text-sm rounded-lg transition-all ${isNexus ? 'font-bold' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'}`}
      style={isNexus ? nexusStyle : undefined}
    >
      {isNexus ? '⚡ ' : ''}{link.label}
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
          <span className="text-lg font-semibold tracking-tight">
            <span className="text-gradient-cyan-purple">Block Genomics</span>
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
              className={`px-4 py-3 text-sm rounded-lg transition-all ${link.href === '/nexus' ? 'font-bold' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'}`}
              style={link.href === '/nexus' ? nexusStyle : undefined}
            >
              {link.href === '/nexus' ? '⚡ ' : ''}{link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
