'use client';
import React, { useState } from 'react';

type WipeOption = 'full' | 'selective' | 'none';

interface TransferPrepModalProps {
  onClose: () => void;
  blockHeight: number;
  guardianCount: number;
  walletSign: (msg: string) => Promise<string>;
  walletAddress: string;
}

const WIPE_OPTIONS: { value: WipeOption; icon: string; title: string; desc: string; badge?: string; badgeColor?: string }[] = [
  {
    value: 'full',
    icon: '🧹',
    title: 'Full Memory Wipe',
    desc: 'Clear all conversations, learned preferences, and personal data. Agent keeps its personality (SOUL.md) and skills but forgets everything personal. Clean slate for the new owner.',
    badge: 'RECOMMENDED',
    badgeColor: '#22c55e',
  },
  {
    value: 'selective',
    icon: '✂️',
    title: 'Selective Wipe',
    desc: 'You\'ve already cleaned up the agent\'s memory manually. This just marks the block as prepped for transfer. Make sure you removed any personal details first.',
  },
  {
    value: 'none',
    icon: '🔓',
    title: 'Transfer As-Is',
    desc: 'Everything passes to the new owner — full memory, conversations, learned behavior. The agent is "fully trained" which may command a higher sale price. Ensure no private data is stored.',
    badge: 'PREMIUM',
    badgeColor: '#f7931a',
  },
];

export default function TransferPrepModal({ onClose, blockHeight, guardianCount, walletSign, walletAddress }: TransferPrepModalProps) {
  const [selected, setSelected] = useState<WipeOption>('full');
  const [status, setStatus] = useState<'idle' | 'signing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<{ guardiansWiped: number; message: string } | null>(null);

  const handlePrep = async () => {
    setStatus('signing');
    setErrorMsg('');
    try {
      const message = `prep-transfer:${blockHeight}:${walletAddress}:${Date.now()}`;
      const signature = await walletSign(message);

      const res = await fetch('/api/v1/ownership/prep-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockHeight, walletAddress, signature, message, wipeOption: selected }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to prep');

      setResult(data.data || data);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to prep transfer');
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
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
        <div className="p-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>🔄 Prepare for Transfer</h2>
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                Block #{blockHeight.toLocaleString()} · {guardianCount} Guardian{guardianCount !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={onClose} className="text-lg" style={{ color: '#64748b' }}>✕</button>
          </div>
        </div>

        {status === 'done' ? (
          /* Success state */
          <div className="p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-lg font-bold mb-2" style={{ color: '#22c55e' }}>Block Prepped for Transfer</h3>
            <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>{result?.message}</p>
            <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)' }}>
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                You can now transfer your .bitmap inscription via your wallet or list it on a marketplace.
                When the new owner claims this block, they&apos;ll find:
              </p>
              <div className="mt-2 space-y-1 text-[11px]" style={{ color: '#64748b' }}>
                <div>🏗️ All buildings & customizations — <span style={{ color: '#22c55e' }}>preserved</span></div>
                <div>🎮 Games, quests & leaderboards — <span style={{ color: '#22c55e' }}>preserved</span></div>
                <div>🛡️ Guardian Agents — <span style={{ color: '#f7931a' }}>paused, awaiting new owner</span></div>
                <div>🧠 Agent memories — <span style={{ color: selected === 'none' ? '#22c55e' : '#ef4444' }}>
                  {selected === 'none' ? 'preserved (as-is)' : selected === 'full' ? 'wiped clean' : 'selectively cleaned'}
                </span></div>
                <div>🏷️ Active delegations — <span style={{ color: '#ef4444' }}>cancelled on transfer</span></div>
              </div>
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold" style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8',
            }}>Done</button>
          </div>
        ) : (
          <>
            {/* Info banner */}
            <div className="px-6 pt-4">
              <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.12)', color: '#94a3b8' }}>
                Preparing your block before selling protects your privacy. Choose how to handle your Guardian Agent&apos;s memories and conversation history.
              </div>
            </div>

            {/* Options */}
            <div className="p-6 space-y-3">
              {WIPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSelected(opt.value)}
                  className="w-full text-left rounded-xl p-4 transition-all"
                  style={{
                    background: selected === opt.value ? 'rgba(247,147,26,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1.5px solid ${selected === opt.value ? 'rgba(247,147,26,0.35)' : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: selected === opt.value ? '0 0 20px rgba(247,147,26,0.05)' : 'none',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{opt.icon}</span>
                    <span className="text-sm font-bold" style={{ color: selected === opt.value ? '#f7931a' : '#e2e8f0' }}>
                      {opt.title}
                    </span>
                    {opt.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: `${opt.badgeColor}20`, color: opt.badgeColor }}>
                        {opt.badge}
                      </span>
                    )}
                    <div className="ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{
                      borderColor: selected === opt.value ? '#f7931a' : 'rgba(255,255,255,0.15)',
                    }}>
                      {selected === opt.value && <div className="w-2 h-2 rounded-full" style={{ background: '#f7931a' }} />}
                    </div>
                  </div>
                  <p className="text-[11px] ml-7" style={{ color: '#64748b' }}>{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="px-6 pb-2">
                <div className="rounded-lg p-2 text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                  ⚠️ {errorMsg}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="p-6 pt-2 flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm" style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b',
              }}>Cancel</button>
              <button
                onClick={handlePrep}
                disabled={status === 'signing'}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:brightness-125"
                style={{
                  background: 'linear-gradient(135deg, rgba(247,147,26,0.2), rgba(247,100,0,0.15))',
                  border: '1.5px solid rgba(247,147,26,0.4)',
                  color: '#f7931a',
                  opacity: status === 'signing' ? 0.6 : 1,
                }}
              >
                {status === 'signing' ? '🔐 Signing...' : '🔄 Prep for Transfer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
