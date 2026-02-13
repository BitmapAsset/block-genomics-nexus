"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth, type WalletType } from "@/context/AuthContext";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const WALLETS: { type: WalletType; name: string; desc: string; color: string; icon: string; url: string; glow: string }[] = [
  { type: 'unisat', name: 'Unisat', desc: 'The #1 Bitcoin wallet for Ordinals, BRC-20 & Bitmap', color: '#f7931a', icon: '🟧', url: 'https://unisat.io', glow: 'rgba(247,147,26,0.3)' },
  { type: 'xverse', name: 'Xverse', desc: 'Multi-chain Bitcoin wallet with Stacks support', color: '#a855f7', icon: '🟣', url: 'https://www.xverse.app', glow: 'rgba(168,85,247,0.3)' },
  { type: 'leather', name: 'Leather', desc: 'Secure Bitcoin & Stacks wallet by Trust Machines', color: '#d97706', icon: '🟫', url: 'https://leather.io', glow: 'rgba(217,119,6,0.3)' },
];

export default function WalletConnect() {
  const {
    isConnected, isConnecting, walletAddress, walletType, profile,
    connect, disconnect, availableWallets,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleConnect = async (type: WalletType) => {
    setOpen(false);
    await connect(type);
  };

  const isAvailable = (type: WalletType) => availableWallets.includes(type);

  return (
    <>
      {isConnected ? (
        <div className="relative">
          <button
            onClick={() => setOpen(prev => !prev)}
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
                {walletType ? WALLETS.find(w => w.type === walletType)?.name || 'Wallet' : 'Wallet'}
              </span>
            </div>
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl p-2 shadow-xl z-50" style={{ background: 'rgba(12,12,20,0.95)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>
              <div className="px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>Connected</p>
                <p className="text-sm font-mono mt-0.5" style={{ color: '#e2e8f0' }}>
                  {walletAddress ? truncateAddress(walletAddress) : "—"}
                </p>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="my-1" />
              {profile ? (
                <>
                  <Link href="/profile" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors" style={{ color: '#e2e8f0' }} onClick={() => setOpen(false)}>👤 Profile</Link>
                  <Link href={`/block/${profile.bitmapBlock}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors" style={{ color: '#e2e8f0' }} onClick={() => setOpen(false)}>🗺️ My Block</Link>
                </>
              ) : (
                <Link href="/connect" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors" style={{ color: '#e2e8f0' }} onClick={() => setOpen(false)}>✨ Create Profile</Link>
              )}
              <button onClick={() => { disconnect(); setOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-red-500/10" style={{ color: '#f87171' }}>
                🔌 Disconnect
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          disabled={isConnecting}
          className="flex items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/10 hover:border-accent-cyan/50 transition-all disabled:opacity-50"
        >
          {isConnecting ? "Connecting…" : "Connect"}
        </button>
      )}

      {/* ── Modern Wallet Connect Modal ── */}
      {open && !isConnected && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setOpen(false)}>
          <div
            ref={modalRef}
            onClick={e => e.stopPropagation()}
            className="w-full sm:w-[420px] sm:rounded-2xl rounded-t-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #0f0f1e 0%, #0a0a14 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 -8px 60px rgba(0,255,204,0.08), 0 0 80px rgba(0,0,0,0.5)',
              maxHeight: '90vh',
            }}
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>Connect Wallet</h2>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Choose a Bitcoin wallet to continue</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: '#64748b' }}>✕</button>
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
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }}>Install ↗</span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>{w.desc}</p>
                    </div>
                    <div className="text-lg" style={{ color: available ? w.color : '#334155' }}>→</div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <p className="text-[10px] text-center" style={{ color: '#475569' }}>
                🔒 Block Genomics never accesses your private keys.
                <br />Wallet connection is read-only for verification.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
