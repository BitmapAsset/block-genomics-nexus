"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGlobalWallet, type WalletType } from "@/context/GlobalWalletContext";
import BitmapThumbnail from "@/components/BitmapThumbnail";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface BlockProfileInfo {
  id: string;
  blockHeight: number;
  handle: string;
  displayName?: string;
  tier?: number;
  verified?: boolean;
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
  } = useGlobalWallet();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Allow other parts of the app to open the wallet modal
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-wallet-modal', handler as EventListener);
    return () => window.removeEventListener('open-wallet-modal', handler as EventListener);
  }, []);

  // Lock body scroll when modal is open (disconnected state)
  useEffect(() => {
    if (open && !isConnected) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open, isConnected]);

  const handleConnect = async (type: WalletType) => {
    try {
      await connect(type);
      setOpen(false);
    } catch {
      // error is in context
    }
  };

  const isAvailable = (type: WalletType) => availableWallets.includes(type);

  const [addressCopied, setAddressCopied] = useState(false);
  const [blockProfiles, setBlockProfiles] = useState<BlockProfileInfo[]>([]);
  const [ownedBlocks, setOwnedBlocks] = useState<number[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  const copyAddress = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };

  const fetchWalletData = useCallback(async () => {
    if (!walletAddress) return;
    setLoadingProfiles(true);
    try {
      const resp = await fetch(`/api/v1/users/by-wallet/${walletAddress}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.data) {
          setBlockProfiles(data.data.blockProfiles || []);
          setOwnedBlocks(data.data.ownedBlocks || []);
        }
      }
    } catch { /* ignore */ }
    setLoadingProfiles(false);
  }, [walletAddress]);

  // Fetch block data when dropdown opens
  useEffect(() => {
    if (open && isConnected && walletAddress) {
      fetchWalletData();
    }
  }, [open, isConnected, walletAddress, fetchWalletData]);

  return (
    <>
      {isConnected ? (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(prev => !prev)}
            className="flex items-center gap-2 rounded-full border border-accent-cyan/30 bg-accent-cyan/5 px-3 py-1.5 text-sm font-medium text-text-primary hover:border-accent-cyan/50 transition-all"
          >
            {/* Green dot */}
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <span className="hidden sm:inline text-xs font-mono text-accent-cyan">
              {walletAddress ? truncateAddress(walletAddress) : ''}
            </span>
            <span className="sm:hidden text-xs font-mono text-accent-cyan">
              {walletAddress ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}` : ''}
            </span>
          </button>
          {open && (() => {
            // Blocks that have profiles
            const profiledBlocks = new Set(blockProfiles.map(bp => bp.blockHeight));
            // Blocks without profiles
            const unprofiledBlocks = ownedBlocks.filter(b => !profiledBlocks.has(b));
            // Primary profile's block profile (if any)
            const primaryBp = profile?.anchorBlock ? blockProfiles.find(bp => bp.blockHeight === profile.anchorBlock) : null;
            // Other block profiles (not the primary)
            const otherProfiles = blockProfiles.filter(bp => bp.blockHeight !== profile?.anchorBlock);

            return (
            <div className="absolute right-0 mt-2 w-80 rounded-xl p-2 shadow-xl z-50" style={{ background: 'rgba(12,12,20,0.95)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>
              {/* Wallet address - copyable */}
              <button onClick={copyAddress} className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/5 transition-colors group">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>
                  {addressCopied ? '✅ Copied!' : 'Wallet Address · Click to copy'}
                </p>
                <p className="text-xs font-mono mt-0.5 break-all leading-relaxed" style={{ color: '#e2e8f0' }}>
                  {walletAddress}
                </p>
                <p className="text-[10px] mt-1" style={{ color: '#475569' }}>
                  via {walletType ? WALLETS.find(w => w.type === walletType)?.name || 'Wallet' : 'Wallet'}
                </p>
              </button>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="my-1" />

              {/* Primary profile */}
              {profile?.handle && (
                <Link
                  href={`/agent/${profile.handle}`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/5 transition-colors"
                  style={{ color: '#e2e8f0' }}
                  onClick={() => setOpen(false)}
                >
                  <span className="text-base">👑</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate">@{profile.handle}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(250,204,21,0.1)', color: '#facc15', border: '1px solid rgba(250,204,21,0.2)' }}>Primary</span>
                    </div>
                    {profile.anchorBlock ? (
                      <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Block #{profile.anchorBlock.toLocaleString()}</p>
                    ) : null}
                  </div>
                  <span style={{ color: '#475569' }}>→</span>
                </Link>
              )}

              {/* Your Blocks section */}
              {(otherProfiles.length > 0 || unprofiledBlocks.length > 0) && (
                <>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="my-1" />
                  <p className="text-[9px] uppercase tracking-widest px-3 pt-2 pb-1" style={{ color: '#475569' }}>Your Blocks</p>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {/* Block profiles */}
                    {otherProfiles.map(bp => (
                      <Link
                        key={bp.id}
                        href={`/agent/${bp.handle}`}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-white/5 transition-colors"
                        style={{ color: '#e2e8f0' }}
                        onClick={() => setOpen(false)}
                      >
                        <BitmapThumbnail blockHeight={bp.blockHeight} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">Block #{bp.blockHeight.toLocaleString()}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px]" style={{ color: '#94a3b8' }}>@{bp.handle}</span>
                            {bp.tier != null && (
                              <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}>Tier {bp.tier}</span>
                            )}
                          </div>
                        </div>
                        <span style={{ color: '#475569' }}>→</span>
                      </Link>
                    ))}
                    {/* Unprofiled blocks */}
                    {unprofiledBlocks.map(blockHeight => (
                      <div key={blockHeight} className="flex items-center gap-2.5 rounded-lg px-3 py-2">
                        <BitmapThumbnail blockHeight={blockHeight} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium" style={{ color: '#e2e8f0' }}>Block #{blockHeight.toLocaleString()}</p>
                          <p className="text-[11px]" style={{ color: '#64748b' }}>No Profile</p>
                        </div>
                        <Link
                          href="/verify"
                          className="text-[10px] font-medium px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                          style={{ color: '#00ffc8', border: '1px solid rgba(0,255,200,0.2)' }}
                          onClick={() => setOpen(false)}
                        >
                          Create →
                        </Link>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {loadingProfiles && (
                <p className="text-[10px] text-center py-2" style={{ color: '#475569' }}>Loading blocks…</p>
              )}

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="my-1" />

              <Link
                href="/verify"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
                style={{ color: '#e2e8f0' }}
                onClick={() => setOpen(false)}
              >
                <span>{profile?.handle ? '⚙️' : '✨'}</span>
                {profile?.handle ? 'Verify / Settings' : 'Verify / Create Profile'}
              </Link>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="my-1" />

              {/* Disconnect */}
              <button
                onClick={() => { disconnect(); setOpen(false); }}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-red-500/10"
                style={{ color: '#f87171' }}
              >
                <span>🔌</span> Disconnect
              </button>
            </div>
            );
          })()}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:w-[420px] rounded-2xl overflow-y-auto my-auto"
            style={{
              background: 'linear-gradient(180deg, #0f0f1e 0%, #0a0a14 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 -8px 60px rgba(0,255,204,0.08), 0 0 80px rgba(0,0,0,0.5)',
              maxHeight: 'min(90vh, 500px)',
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
