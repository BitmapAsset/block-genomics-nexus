"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useWallet, type WalletType } from "@/context/WalletContext";

const navLinks = [
  { href: "/explore", label: "Explore" },
  { href: "/verify", label: "Verify" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function Header() {
  const { isConnected, isConnecting, address, walletType, connect, disconnect } =
    useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleConnect = async (type: WalletType) => {
    setShowDropdown(false);
    await connect(type);
  };

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
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-tertiary/50 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Wallet Button */}
        <div className="relative" ref={dropdownRef}>
          {isConnected ? (
            <button
              onClick={disconnect}
              className="flex items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/10 hover:border-accent-cyan/50 transition-all"
            >
              <span className="h-2 w-2 rounded-full bg-success" />
              <span className="hidden sm:inline text-xs text-text-muted mr-1">
                {walletType === "unisat" ? "🟧" : "🟣"}
              </span>
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </button>
          ) : (
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              disabled={isConnecting}
              className="flex items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/10 hover:border-accent-cyan/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-accent-cyan animate-pulse" />
                  Connecting…
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3"
                    />
                  </svg>
                  Connect Wallet
                </>
              )}
            </button>
          )}

          {/* Wallet selector dropdown */}
          {showDropdown && !isConnected && (
            <div className="absolute right-0 mt-2 w-56 glass-panel p-2 shadow-xl z-50">
              <button
                onClick={() => handleConnect("unisat")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-primary hover:bg-bg-tertiary/50 transition-colors"
              >
                <span className="text-lg">🟧</span>
                <div className="text-left">
                  <div className="font-medium">Unisat</div>
                  <div className="text-xs text-text-muted">BRC-20 & Ordinals</div>
                </div>
              </button>
              <button
                onClick={() => handleConnect("xverse")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-primary hover:bg-bg-tertiary/50 transition-colors"
              >
                <span className="text-lg">🟣</span>
                <div className="text-left">
                  <div className="font-medium">Xverse</div>
                  <div className="text-xs text-text-muted">Bitcoin Web3</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
