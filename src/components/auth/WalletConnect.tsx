"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth, type WalletType } from "@/context/AuthContext";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function walletLabel(type: WalletType) {
  switch (type) {
    case "unisat":
      return "Unisat";
    case "xverse":
      return "Xverse";
    case "leather":
      return "Leather";
    default:
      return "Wallet";
  }
}

export default function WalletConnect() {
  const {
    isConnected,
    isConnecting,
    walletAddress,
    walletType,
    profile,
    connect,
    disconnect,
    availableWallets,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleConnect = async (type: WalletType) => {
    setOpen(false);
    await connect(type);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {isConnected ? (
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-3 rounded-full border border-accent-cyan/30 bg-accent-cyan/5 px-3 py-1.5 text-sm font-medium text-text-primary hover:border-accent-cyan/50 transition-all"
        >
          <span className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-cyan/30 to-accent-purple/40 border border-accent-cyan/30 flex items-center justify-center text-xs">
            {profile?.handle?.slice(0, 2).toUpperCase() || "BG"}
          </span>
          <div className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-xs text-text-muted">
              {profile ? `@${profile.handle}` : truncateAddress(walletAddress || "")}
            </span>
            <span className="text-[10px] text-accent-cyan">
              {walletType ? walletLabel(walletType) : "Wallet"}
            </span>
          </div>
          <svg className="h-4 w-4 text-text-muted" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.53a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => setOpen((prev) => !prev)}
          disabled={isConnecting}
          className="flex items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/10 hover:border-accent-cyan/50 transition-all disabled:opacity-50"
        >
          {isConnecting ? "Connecting…" : "Connect"}
        </button>
      )}

      {open && !isConnected && (
        <div className="absolute right-0 mt-2 w-56 glass-panel p-2 shadow-xl z-50">
          {availableWallets.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">
              Install a Bitcoin wallet to continue.
              <div className="mt-2 space-y-1">
                <a
                  href="https://unisat.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-accent-cyan hover:underline"
                >
                  Install Unisat
                </a>
                <a
                  href="https://www.xverse.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-accent-purple hover:underline"
                >
                  Install Xverse
                </a>
                <a
                  href="https://leather.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-amber-300 hover:underline"
                >
                  Install Leather
                </a>
              </div>
            </div>
          )}
          {availableWallets.map((wallet) => (
            <button
              key={wallet}
              onClick={() => handleConnect(wallet)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-primary hover:bg-bg-tertiary/50 transition-colors"
            >
              <span className="text-lg">
                {wallet === "unisat" ? "🟧" : wallet === "xverse" ? "🟣" : "🟫"}
              </span>
              <div className="text-left">
                <div className="font-medium">{walletLabel(wallet)}</div>
                <div className="text-xs text-text-muted">Bitcoin wallet</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && isConnected && (
        <div className="absolute right-0 mt-2 w-56 glass-panel p-2 shadow-xl z-50">
          <div className="px-3 py-2">
            <p className="text-xs text-text-muted">Connected</p>
            <p className="text-sm font-mono text-text-primary">
              {walletAddress ? truncateAddress(walletAddress) : "—"}
            </p>
          </div>
          <div className="border-t border-border my-2" />
          {profile ? (
            <>
              <Link
                href="/profile"
                className="block rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary/50"
                onClick={() => setOpen(false)}
              >
                Profile
              </Link>
              <Link
                href={`/block/${profile.bitmapBlock}`}
                className="block rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary/50"
                onClick={() => setOpen(false)}
              >
                My Block
              </Link>
            </>
          ) : (
            <Link
              href="/connect"
              className="block rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary/50"
              onClick={() => setOpen(false)}
            >
              Create Profile
            </Link>
          )}
          <button
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
