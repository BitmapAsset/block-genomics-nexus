'use client';
import React from 'react';

const MAGIC_EDEN_BITMAP = 'https://magiceden.io/ordinals/marketplace/bitmap';

interface UpgradeModalProps {
  onClose: () => void;
  currentTier?: number; // 3 = visitor, 2 = parcel, null = unverified
}

export default function UpgradeModal({ onClose, currentTier }: UpgradeModalProps) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0a0e17 0%, #111827 100%)',
          border: '1px solid rgba(247,147,26,0.25)',
          boxShadow: '0 0 80px rgba(247,147,26,0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 text-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-3xl mb-2">🔓</div>
          <h2 className="text-xl font-bold mb-1" style={{ color: '#e2e8f0' }}>Upgrade to Unlock</h2>
          <p className="text-sm" style={{ color: '#64748b' }}>
            Own Bitcoin land to access all features
          </p>
        </div>

        {/* Tier Cards */}
        <div className="p-6 space-y-4">

          {/* Tier 2 — Parcel Owner */}
          <div
            className="rounded-xl p-5 relative overflow-hidden"
            style={{
              background: 'rgba(0,255,255,0.03)',
              border: '1px solid rgba(0,255,255,0.15)',
            }}
          >
            <div className="flex items-start gap-4">
              <div className="text-2xl mt-0.5">🟡</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold" style={{ color: '#00e5ff' }}>Tier 2 — Parcel Owner</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff' }}>
                    COMING SOON
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: '#94a3b8' }}>
                  Get a parcel delegation from a block owner. Customize your space, spawn up to 3 Guardian Agents, and build on someone else&apos;s block.
                </p>
                <div className="space-y-1 mb-3">
                  {['Customize your parcel', 'Spawn up to 3 AI agents', 'Build & place objects', 'Create games on your parcel'].map(perk => (
                    <div key={perk} className="flex items-center gap-2 text-[11px]" style={{ color: '#64748b' }}>
                      <span style={{ color: '#00e5ff' }}>✓</span>
                      <span>{perk}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] font-mono px-3 py-2 rounded-lg text-center" style={{ background: 'rgba(0,229,255,0.05)', color: '#64748b', border: '1px solid rgba(0,229,255,0.08)' }}>
                  Delegation marketplace launching soon — block owners will list parcels for rent
                </div>
              </div>
            </div>
          </div>

          {/* Tier 1 — Block Owner */}
          <div
            className="rounded-xl p-5 relative overflow-hidden"
            style={{
              background: 'rgba(247,147,26,0.04)',
              border: '1px solid rgba(247,147,26,0.25)',
              boxShadow: '0 0 30px rgba(247,147,26,0.05)',
            }}
          >
            <div className="flex items-start gap-4">
              <div className="text-2xl mt-0.5">🟠</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold" style={{ color: '#f7931a' }}>Tier 1 — Block Owner</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a' }}>
                    FULL SOVEREIGNTY
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: '#94a3b8' }}>
                  Own an entire Bitcoin block (2.1km × 2.1km). Full control over every parcel, up to 10 Guardian Agents, delegate access, earn from your land.
                </p>
                <div className="space-y-1 mb-4">
                  {[
                    'Full block sovereignty (2.1km × 2.1km)',
                    'Spawn up to 10 AI Guardian Agents',
                    'Delegate parcels & earn Bitcoin',
                    'Create games, shops & experiences',
                    'List on delegation marketplace',
                    'Link VPS & custom servers',
                  ].map(perk => (
                    <div key={perk} className="flex items-center gap-2 text-[11px]" style={{ color: '#94a3b8' }}>
                      <span style={{ color: '#f7931a' }}>✓</span>
                      <span>{perk}</span>
                    </div>
                  ))}
                </div>
                <a
                  href={MAGIC_EDEN_BITMAP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 rounded-xl text-sm font-bold text-center transition-all hover:brightness-125"
                  style={{
                    background: 'linear-gradient(135deg, rgba(247,147,26,0.2), rgba(247,100,0,0.15))',
                    border: '1.5px solid rgba(247,147,26,0.4)',
                    color: '#f7931a',
                  }}
                >
                  🟧 Browse Bitmaps on Magic Eden →
                </a>
                <p className="text-[10px] text-center mt-2" style={{ color: '#475569' }}>
                  Buy a .bitmap inscription → come back → verify → full sovereignty
                </p>
              </div>
            </div>
          </div>

          {/* Current tier info */}
          {currentTier === 3 && (
            <div className="text-center text-[11px] py-2" style={{ color: '#64748b' }}>
              You&apos;re currently <span style={{ color: '#9333ea' }}>Tier 3 (Delegated)</span> — view + chat + shop.
              Upgrade to build, create, and earn.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm transition-all hover:brightness-125"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#64748b',
            }}
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
