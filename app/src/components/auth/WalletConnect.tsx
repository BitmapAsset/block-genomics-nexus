"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGlobalWallet, type WalletType } from "@/context/GlobalWalletContext";
import { resolvePublicHandle } from "@/lib/public-handle";
import { safeNextPath } from "@/lib/site-nav";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const WALLETS: { type: WalletType; name: string; desc: string; color: string; icon: string; url: string; glow: string }[] = [
  { type: 'unisat', name: 'Unisat', desc: 'The #1 Bitcoin wallet for Ordinals, BRC-20 & Bitmap', color: '#f7931a', icon: '🟧', url: 'https://unisat.io', glow: 'rgba(247,147,26,0.3)' },
  { type: 'xverse', name: 'Xverse', desc: 'Multi-chain Bitcoin wallet with Stacks support', color: '#a855f7', icon: '🟣', url: 'https://www.xverse.app', glow: 'rgba(168,85,247,0.3)' },
  { type: 'leather', name: 'Leather', desc: 'Secure Bitcoin & Stacks wallet by Trust Machines', color: '#d97706', icon: '🟫', url: 'https://leather.io', glow: 'rgba(217,119,6,0.3)' },
  { type: 'magiceden', name: 'Magic Eden', desc: 'Ordinals marketplace wallet for Bitcoin & Runes', color: '#e42575', icon: '🟥', url: 'https://wallet.magiceden.io', glow: 'rgba(228,37,117,0.3)' },
  { type: 'okx', name: 'OKX Wallet', desc: 'Multi-chain wallet with Ordinals & BRC-20 support', color: '#e2e8f0', icon: '⬛', url: 'https://www.okx.com/web3', glow: 'rgba(226,232,240,0.2)' },
];

export default function WalletConnect() {
  const {
    isConnected, isConnecting, walletAddress, walletType, profile,
    connect, disconnect, availableWallets, error: walletError, clearError,
  } = useGlobalWallet();
  const [open, setOpen] = useState(false);
  // User.handle first, else a handle claimed on one of the wallet's blocks.
  const publicHandle = resolvePublicHandle(profile);
  // Where to go after a connect started from elsewhere (e.g. Home → My Bitmaps).
  const [nextPath, setNextPath] = useState<string | null>(null);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or ESC
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Allow other parts of the app to open the wallet modal (lib/open-wallet-modal)
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<{ next?: string } | undefined>).detail?.next;
      setNextPath(safeNextPath(next));
      setOpen(true);
    };
    window.addEventListener('open-wallet-modal', handler as EventListener);
    return () => window.removeEventListener('open-wallet-modal', handler as EventListener);
  }, []);

  // Lock body scroll when modal is open (disconnected state)
  useEffect(() => {
    if (open && !isConnected) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open, isConnected]);

  const [connectError, setConnectError] = useState<string | null>(null);
  const [lastAttemptedWallet, setLastAttemptedWallet] = useState<WalletType | null>(null);

  const handleConnect = async (type: WalletType) => {
    setConnectError(null);
    setLastAttemptedWallet(type);
    try {
      await connect(type);
      setOpen(false);
      if (nextPath) {
        router.push(nextPath);
        setNextPath(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed. Please try again.';
      setConnectError(message);
    }
  };

  // Clear connect error (and any pending redirect) when the modal closes
  useEffect(() => {
    if (!open) { setConnectError(null); clearError(); setNextPath(null); }
  }, [open, clearError]);

  const isAvailable = (type: WalletType) => availableWallets.includes(type);

  const [addressCopied, setAddressCopied] = useState(false);

  const copyAddress = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };


  return (
    <>
      {isConnected ? (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(prev => !prev)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-accent-cyan/30 bg-accent-cyan/5 px-3.5 text-sm font-medium text-text-primary hover:border-accent-cyan/50 transition-all"
          >
            <span className="h-2 w-2 rounded-full bg-green-400 flex-shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline text-xs font-mono text-accent-cyan">
              {walletAddress ? truncateAddress(walletAddress) : ''}
            </span>
            <span className="sm:hidden text-xs font-mono text-accent-cyan">
              {walletAddress ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}` : ''}
            </span>
          </button>
          {open && (
            // The bitmap list lives on My Bitmaps, read from the chain. This menu
            // used to list database blocks (some no longer held), and fetching
            // them logged a fake "login" for the wallet on every open.
            <div
              role="menu"
              className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl p-2 shadow-xl z-50"
              style={{ background: 'rgba(12,12,20,0.97)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}
            >
              <div className="px-3 pb-2 pt-1.5">
                <p className="text-[11px] uppercase tracking-wider text-text-secondary">
                  Connected with {walletType ? WALLETS.find(w => w.type === walletType)?.name || 'a wallet' : 'a wallet'}
                </p>
                <p className="mt-1 break-all font-mono text-xs leading-relaxed text-text-primary">{walletAddress}</p>
              </div>
              <button
                role="menuitem"
                onClick={copyAddress}
                className="flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-sm text-text-primary hover:bg-white/5"
              >
                {addressCopied ? 'Address copied' : 'Copy address'}
              </button>
              <div className="my-1 border-t border-white/[0.06]" />
              <Link role="menuitem" href="/my-bitmaps" onClick={() => setOpen(false)} className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-text-primary hover:bg-white/5">
                My Bitmaps
              </Link>
              <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className="flex min-h-[44px] items-center rounded-xl px-3 text-sm text-text-primary hover:bg-white/5">
                Account
              </Link>
              {publicHandle && (
                <Link role="menuitem" href={`/agent/${publicHandle.handle}`} onClick={() => setOpen(false)} className="flex min-h-[44px] items-center rounded-xl px-3 text-sm text-text-primary hover:bg-white/5">
                  Public profile <span className="ml-1.5 text-text-secondary">@{publicHandle.handle}</span>
                </Link>
              )}
              <div className="my-1 border-t border-white/[0.06]" />
              <button
                role="menuitem"
                onClick={() => { disconnect(); setOpen(false); }}
                className="flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-sm text-red-300 hover:bg-red-500/10"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          disabled={isConnecting}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-accent-cyan/30 bg-accent-cyan/5 px-4 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/10 hover:border-accent-cyan/50 transition-all disabled:opacity-50"
        >
          {isConnecting ? "Connecting…" : "Connect"}
        </button>
      )}

      {/* ── Modern Wallet Connect Modal ──
          Portalled to <body>: the header's backdrop-filter makes it the containing
          block for fixed children, which pinned this overlay to the 64px header
          box instead of the viewport (clipped off-screen on phones). */}
      {open && !isConnected && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:w-[420px] rounded-2xl overflow-y-auto my-auto"
            style={{
              background: 'linear-gradient(180deg, #0f0f1e 0%, #0a0a14 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 -8px 60px rgba(0,255,204,0.08), 0 0 80px rgba(0,0,0,0.5)',
              maxHeight: 'min(90vh, 640px)',
            }}
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>Connect Wallet</h2>
                <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>Choose a Bitcoin wallet to continue</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="-mr-2 w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: '#94a3b8' }}>✕</button>
            </div>

            {/* Wallet Options */}
            <div className="px-5 pb-3 space-y-2.5">
              {WALLETS.map(w => {
                const available = isAvailable(w.type);
                return (
                  <button
                    key={w.type}
                    onClick={() => available ? handleConnect(w.type) : window.open(w.url, '_blank')}
                    className="w-full flex items-center gap-4 p-4 rounded-xl transition-all group"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${available ? w.color + '30' : 'rgba(255,255,255,0.06)'}`,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = w.color + '10';
                      (e.currentTarget as HTMLElement).style.borderColor = w.color + '50';
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${w.glow}`;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                      (e.currentTarget as HTMLElement).style.borderColor = available ? w.color + '30' : 'rgba(255,255,255,0.06)';
                      (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                    }}
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: w.color + '15', border: `1px solid ${w.color}25` }}>
                      {w.icon}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{w.name}</span>
                        {available ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>Detected</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>Install ↗</span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>{w.desc}</p>
                    </div>
                    <div className="text-lg" style={{ color: available ? w.color : '#334155' }}>→</div>
                  </button>
                );
              })}
            </div>

            {/* Connection error */}
            {(connectError || walletError) && (
              <div className="mx-5 mb-3 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="text-xs text-red-400 mb-2">{connectError || walletError}</p>
                {lastAttemptedWallet && (
                  <button
                    onClick={() => handleConnect(lastAttemptedWallet)}
                    disabled={isConnecting}
                    className="text-xs font-medium px-3 py-1.5 rounded-md transition-all disabled:opacity-50"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    {isConnecting ? 'Retrying...' : 'Retry connection'}
                  </button>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <p className="text-[11px] text-center" style={{ color: '#94a3b8' }}>
                🔒 Block Genomics never accesses your private keys.
                <br />Wallet connection is read-only for verification.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
