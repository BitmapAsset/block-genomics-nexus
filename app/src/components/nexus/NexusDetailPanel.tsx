'use client';

import { useEffect, useState, useCallback } from 'react';
import { generateBlock, getEpochColor, type BlockData } from './NexusBlockData';
import BlockChat from './BlockChat';
import type { ChatMessage } from './NexusSocial';
import { buildBlockShareUrl } from '@/lib/blockDeepLink';

/* ─── Share helpers ─── */
const SITE_URL = 'https://blockgenomics.io';

function getBlockUrl(height: number) {
  // Prefer the live origin so a link copied from a preview deploy or localhost
  // points back at the environment the user is actually looking at.
  const origin = typeof window === 'undefined' ? SITE_URL : window.location.origin;
  return buildBlockShareUrl(height, origin);
}

function getShareText(height: number, block: BlockData) {
  return `🧬 Block #${height.toLocaleString()} on The Nexus — ${block.txCount.toLocaleString()} parcels, Epoch ${block.epoch}${block.claimed ? ', Claimed ✅' : ''}. Explore Bitcoin's decentralized metaverse 🌐`;
}

function shareToX(height: number, block: BlockData) {
  const text = encodeURIComponent(getShareText(height, block));
  const url = encodeURIComponent(getBlockUrl(height));
  window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}

function shareToTelegram(height: number, block: BlockData) {
  const text = encodeURIComponent(getShareText(height, block));
  const url = encodeURIComponent(getBlockUrl(height));
  window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank');
}

function shareToWhatsApp(height: number, block: BlockData) {
  const text = encodeURIComponent(getShareText(height, block) + '\n' + getBlockUrl(height));
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

function shareToTikTok(height: number) {
  // TikTok doesn't have a direct share URL, copy link instead
  navigator.clipboard.writeText(getBlockUrl(height));
}

function shareToInstagram(height: number) {
  // Instagram doesn't support URL sharing — copy link for bio/story
  navigator.clipboard.writeText(getBlockUrl(height));
}

function copyLink(height: number) {
  navigator.clipboard.writeText(getBlockUrl(height));
}

const EPOCH_NAMES = ['Genesis Era', 'First Halving', 'Second Halving', 'Third Halving', 'Fourth Halving'];

interface Props {
  height: number | null;
  onClose: () => void;
  visitorCount?: number;
  messages?: ChatMessage[];
  onSendMessage?: (text: string) => void;
  onEnterBlock?: (height: number) => void;
}

export default function NexusDetailPanel({ height, onClose, visitorCount = 0, messages = [], onSendMessage, onEnterBlock }: Props) {
  const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');

  useEffect(() => {
    setActiveTab('details');
  }, [height]);

  if (height === null) return null;

  const block: BlockData = generateBlock(height);
  const epochColor = getEpochColor(block.epoch);
  const date = new Date(block.timestamp * 1000);

  return (
    <div
      className="fixed top-0 right-0 h-full w-full sm:w-80 z-50 flex flex-col overflow-y-auto transition-transform duration-300"
      style={{
        background: 'rgba(12,12,20,0.92)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(102,204,255,0.12)',
        transform: 'translateX(0)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(102,204,255,0.1)' }}>
        <h2 className="text-lg font-mono font-bold" style={{ color: epochColor }}>
          Block #{height.toLocaleString()}
        </h2>
        <div className="flex items-center gap-3">
          <CopyLinkButton height={height} />
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-xl leading-none">&times;</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('details')}
            className="px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest"
            style={{
              background: activeTab === 'details' ? 'rgba(102,204,255,0.2)' : 'transparent',
              color: activeTab === 'details' ? '#66ccff' : '#64748b',
              border: '1px solid rgba(102,204,255,0.2)',
            }}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className="px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest"
            style={{
              background: activeTab === 'chat' ? 'rgba(168,85,247,0.2)' : 'transparent',
              color: activeTab === 'chat' ? '#a855f7' : '#64748b',
              border: '1px solid rgba(168,85,247,0.2)',
            }}
          >
            Chat
          </button>
          <span className="ml-auto text-[10px] text-[#64748b]">{visitorCount} visitors</span>
        </div>

        {activeTab === 'details' && (
          <>
            {/* Epoch badge */}
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded text-xs font-mono font-semibold"
                style={{ background: epochColor + '22', color: epochColor, border: `1px solid ${epochColor}44` }}
              >
                Epoch {block.epoch}
              </span>
              <span className="text-xs text-[#94a3b8]">{EPOCH_NAMES[block.epoch] ?? `Epoch ${block.epoch}`}</span>
            </div>

            {block.isSpecial && (
              <div className="px-3 py-2 rounded-lg text-xs font-mono" style={{ background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.3)', color: '#f7931a' }}>
                ⚡ Special Block: {block.specialType === 'genesis' ? 'Genesis Block' : block.specialType === 'halving' ? 'Halving Block' : 'Milestone'}
              </div>
            )}

            {/* Details */}
            <div className="space-y-3">
              <DetailRow label="Hash" value={block.hash.slice(0, 16) + '...' + block.hash.slice(-8)} mono />
              <DetailRow label="Timestamp" value={date.toLocaleString()} />
              <DetailRow label="Parcels / Txs" value={block.txCount.toLocaleString()} />
              <DetailRow label="Size" value={`${(block.size / 1_000_000).toFixed(2)} MB`} />
              <DetailRow label="Fees" value={`${block.fees} BTC`} />
              <DetailRow label="Genome Hash" value={block.genomeHash.slice(0, 20) + '...'} mono />
            </div>

            {/* Ownership */}
            <div className="p-3 rounded-lg" style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(102,204,255,0.08)' }}>
              <div className="text-xs text-[#64748b] mb-1">Bitmap Status</div>
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: block.claimed ? '#22c55e' : '#64748b' }}
                />
                <span className="text-sm font-mono" style={{ color: block.claimed ? '#22c55e' : '#94a3b8' }}>
                  {block.claimed ? 'Claimed' : 'Unclaimed'}
                </span>
              </div>
            </div>

            {/* Bitmap Address */}
            <div className="p-3 rounded-lg" style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(247,147,26,0.08)' }}>
              <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">Bitmap Address</div>
              <div className="text-sm font-mono" style={{ color: '#f7931a' }}>
                {height.toLocaleString()}.bitmap
              </div>
              <div className="text-[10px] mt-1" style={{ color: '#64748b' }}>
                Parcels: 0.{height}.bitmap — {(block.txCount - 1).toLocaleString()}.{height}.bitmap
              </div>
            </div>

            {/* Spatial Dimensions */}
            <div className="p-3 rounded-lg" style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(102,204,255,0.08)' }}>
              <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">District Dimensions</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono" style={{ color: '#66ccff' }}>2.1 km × 2.1 km</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(247,147,26,0.1)', color: '#f7931a', border: '1px solid rgba(247,147,26,0.2)' }}>₿21</span>
              </div>
              <div className="text-[10px] mt-1" style={{ color: '#64748b' }}>
                4.41 km² · {block.txCount.toLocaleString()} parcels
              </div>
            </div>

            {/* Share buttons */}
            <ShareButtons height={height} block={block} />

            {/* Enter Block button */}
            <button
              onClick={() => height !== null && onEnterBlock?.(height)}
              className="w-full py-3 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, rgba(102,204,255,0.2), rgba(168,85,247,0.2))',
                border: '1px solid rgba(102,204,255,0.25)',
                color: '#66ccff',
              }}
            >
              Enter Block →
            </button>
          </>
        )}

        {activeTab === 'chat' && (
          <BlockChat
            messages={messages}
            onSend={(text) => onSendMessage?.(text)}
          />
        )}
      </div>
    </div>
  );
}

function CopyLinkButton({ height }: { height: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copyLink(height);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [height]);

  return (
    <button
      onClick={handleCopy}
      title={`Copy link to block ${height}`}
      className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors"
      style={{
        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(102,204,255,0.08)',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(102,204,255,0.25)'}`,
        color: copied ? '#22c55e' : '#66ccff',
      }}
    >
      {copied ? '✓ Copied' : '🔗 Copy link'}
    </button>
  );
}

function ShareButtons({ height, block }: { height: number; block: BlockData }) {
  const [copied, setCopied] = useState(false);
  const [igCopied, setIgCopied] = useState(false);
  const [ttCopied, setTtCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copyLink(height);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [height]);

  const handleIg = useCallback(() => {
    shareToInstagram(height);
    setIgCopied(true);
    setTimeout(() => setIgCopied(false), 2000);
  }, [height]);

  const handleTt = useCallback(() => {
    shareToTikTok(height);
    setTtCopied(true);
    setTimeout(() => setTtCopied(false), 2000);
  }, [height]);

  const btnStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: '6px 0',
    fontSize: 11,
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
    transition: 'all 0.2s',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-[#64748b] uppercase tracking-wider">Share This Block</div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => shareToX(height, block)}
          style={{ ...btnStyle, color: '#e2e8f0' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(29,155,240,0.15)'; e.currentTarget.style.borderColor = 'rgba(29,155,240,0.3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = btnStyle.background; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          𝕏
        </button>
        <button
          onClick={() => shareToTelegram(height, block)}
          style={{ ...btnStyle, color: '#26A5E4' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(38,165,228,0.15)'; e.currentTarget.style.borderColor = 'rgba(38,165,228,0.3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = btnStyle.background; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          ✈️ TG
        </button>
        <button
          onClick={() => shareToWhatsApp(height, block)}
          style={{ ...btnStyle, color: '#25D366' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37,211,102,0.15)'; e.currentTarget.style.borderColor = 'rgba(37,211,102,0.3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = btnStyle.background; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          💬 WA
        </button>
        <button
          onClick={handleIg}
          style={{ ...btnStyle, color: '#E4405F' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(228,64,95,0.15)'; e.currentTarget.style.borderColor = 'rgba(228,64,95,0.3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = btnStyle.background; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          {igCopied ? '✅' : '📸 IG'}
        </button>
        <button
          onClick={handleTt}
          style={{ ...btnStyle, color: '#e2e8f0' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,0,80,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,0,80,0.3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = btnStyle.background; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          {ttCopied ? '✅' : '🎵 TT'}
        </button>
        <button
          onClick={handleCopy}
          style={{ ...btnStyle, color: '#66ccff' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(102,204,255,0.15)'; e.currentTarget.style.borderColor = 'rgba(102,204,255,0.3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = btnStyle.background; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          {copied ? '✅' : '🔗 Link'}
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm text-[#e2e8f0] ${mono ? 'font-mono' : ''}`} style={{ wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}
