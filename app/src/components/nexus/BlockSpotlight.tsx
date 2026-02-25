'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { generateBlock, getEpochColor, getEpoch } from './NexusBlockData';
import { getLandmark } from './NexusLandmarks';

/* ─── Preview Content Data (demo placeholders until owners deploy) ─── */
// In production, this comes from block owners' deployed resources
const MOCK_MEDIA = [
  { type: 'image' as const, url: '', gradient: 'linear-gradient(135deg, #ff6b35, #f7931a, #ffd700)', label: 'Genesis Art Collection' },
  { type: 'image' as const, url: '', gradient: 'linear-gradient(135deg, #00ff88, #00ccff, #0066ff)', label: 'Neural Network Visualization' },
  { type: 'image' as const, url: '', gradient: 'linear-gradient(135deg, #a855f7, #ec4899, #f43f5e)', label: 'Cyberpunk Block Portrait' },
  { type: 'image' as const, url: '', gradient: 'linear-gradient(135deg, #14b8a6, #06b6d4, #8b5cf6)', label: 'Bitmap Terrain Map' },
  { type: 'image' as const, url: '', gradient: 'linear-gradient(135deg, #f59e0b, #ef4444, #8b5cf6)', label: 'Proof-of-Work Abstract' },
  { type: 'video' as const, url: '', gradient: 'linear-gradient(135deg, #10b981, #3b82f6, #6366f1)', label: 'Block Mining Timelapse' },
  { type: 'image' as const, url: '', gradient: 'linear-gradient(135deg, #f43f5e, #fb923c, #fbbf24)', label: 'Halving Event Memorial' },
  { type: 'image' as const, url: '', gradient: 'linear-gradient(135deg, #06b6d4, #8b5cf6, #d946ef)', label: 'DNA Helix Render' },
];

const MOCK_HANDLES = [
  'satoshi_labs', 'nexus_pioneer', 'block_artist', 'cipher_node', 'bitmap_og',
  'proof_walker', 'hash_dream', 'chain_weaver', 'epoch_one', 'genesis_dev',
  'quantum_miner', 'signal_tower', 'void_block', 'neon_chain', 'deep_hash',
];

const TIER_COLORS = { 1: '#f7931a', 2: '#66ccff', 3: '#a855f7' };
const TIER_LABELS = { 1: '👑', 2: '⭐', 3: '🔗' };

interface SpotlightItem {
  blockHeight: number;
  handle: string;
  tier: 1 | 2 | 3;
  media: typeof MOCK_MEDIA[0];
  visitors: number;
  trending: boolean;
  category: 'featured' | 'trending' | 'new' | 'gallery';
  description: string;
  genomePreview: string;
  timestamp: number;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateSpotlightItems(count: number, category: SpotlightItem['category']): SpotlightItem[] {
  const items: SpotlightItem[] = [];
  const baseSeed = category === 'featured' ? 42 : category === 'trending' ? 777 : category === 'new' ? 1337 : 9999;
  
  for (let i = 0; i < count; i++) {
    const rng = seededRandom(baseSeed + i * 31);
    const height = Math.floor(rng() * 880000);
    const block = generateBlock(height);
    const tier = (rng() < 0.15 ? 1 : rng() < 0.5 ? 2 : 3) as 1 | 2 | 3;
    const descriptions = [
      'Deployed a generative art gallery on this block',
      'Running a Bitcoin oracle service from block ' + height,
      'AI agent marketplace — 24 verified agents hosted here',
      'Block museum — preserving Bitcoin history on-chain',
      'Decentralized file storage node with 2TB capacity',
      'Community hub for Bitmap builders and explorers',
      'Live music streaming service powered by Lightning',
      'NFT exhibition — unique pieces anchored to this block',
      'Research lab: studying block patterns since epoch ' + block.epoch,
      'Trading bot fleet — 12 autonomous agents verified here',
      'Educational content about Bitcoin mining and PoW',
      'Metaverse portal — enter a 3D world built on this block',
    ];

    items.push({
      blockHeight: height,
      handle: MOCK_HANDLES[Math.floor(rng() * MOCK_HANDLES.length)],
      tier,
      media: MOCK_MEDIA[Math.floor(rng() * MOCK_MEDIA.length)],
      visitors: category === 'trending' ? Math.floor(rng() * 500) + 50 : Math.floor(rng() * 100),
      trending: category === 'trending' || rng() < 0.2,
      category,
      description: descriptions[Math.floor(rng() * descriptions.length)],
      genomePreview: block.genomeHash.slice(0, 16),
      timestamp: Date.now() - Math.floor(rng() * 86400000),
    });
  }
  return items;
}

/* ─── Mini Genome Bar ─── */
const PALETTE = [
  '#ff0055','#ff3366','#ff6633','#ffaa00','#ccff00','#66ff33','#00ff99','#00ffcc',
  '#00ccff','#0099ff','#3366ff','#6633ff','#9933ff','#cc33ff','#ff33cc','#ff3399',
];

function MiniGenome({ hash, size = 3 }: { hash: string; size?: number }) {
  return (
    <div className="flex gap-[1px]">
      {hash.split('').map((c, i) => (
        <div
          key={i}
          style={{
            width: size,
            height: size * 3,
            borderRadius: 1,
            backgroundColor: PALETTE[parseInt(c, 16)] || '#333',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Tier Badge ─── */
function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{
        color: TIER_COLORS[tier],
        background: `${TIER_COLORS[tier]}15`,
        border: `1px solid ${TIER_COLORS[tier]}33`,
      }}
    >
      {TIER_LABELS[tier]} T{tier}
    </span>
  );
}

/* ─── Spotlight Card ─── */
function SpotlightCard({
  item,
  onNavigate,
  compact = false,
}: {
  item: SpotlightItem;
  onNavigate: (height: number) => void;
  compact?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const timeAgo = getTimeAgo(item.timestamp);

  return (
    <div
      className="group cursor-pointer rounded-lg overflow-hidden transition-all duration-300"
      style={{
        background: hovered ? 'rgba(102,204,255,0.06)' : 'rgba(12,12,20,0.6)',
        border: `1px solid ${hovered ? 'rgba(102,204,255,0.25)' : 'rgba(255,255,255,0.04)'}`,
        transform: hovered ? 'scale(1.01)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onNavigate(item.blockHeight)}
    >
      {/* Media Preview */}
      {!compact && (
        <div
          className="relative w-full overflow-hidden"
          style={{ height: 100 }}
        >
          <div
            className="absolute inset-0 transition-transform duration-500"
            style={{
              background: item.media.gradient,
              transform: hovered ? 'scale(1.08)' : 'scale(1)',
            }}
          />
          {/* Overlay with block info */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
          
          {item.media.type === 'video' && (
            <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-[9px] text-white flex items-center gap-1">
              ▶ Video
            </div>
          )}
          
          {item.trending && (
            <div
              className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-bold"
              style={{
                background: 'rgba(239,68,68,0.2)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#ef4444',
              }}
            >
              🔥 TRENDING
            </div>
          )}

          {/* Block height overlay */}
          <div className="absolute bottom-2 left-2 text-[10px] font-mono text-white/90">
            #{item.blockHeight.toLocaleString()}
          </div>
          <div className="absolute bottom-2 right-2">
            <MiniGenome hash={item.genomePreview} size={2} />
          </div>
        </div>
      )}

      {/* Content */}
      <div className={compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}>
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Avatar dot */}
            <div
              className="w-4 h-4 rounded-full shrink-0"
              style={{
                background: `linear-gradient(135deg, ${TIER_COLORS[item.tier]}, ${TIER_COLORS[item.tier]}88)`,
                boxShadow: `0 0 6px ${TIER_COLORS[item.tier]}44`,
              }}
            />
            <Link href={`/agent/${item.handle}`} className="text-[11px] font-semibold text-white/90 truncate hover:text-orange-400 transition-colors">@{item.handle}</Link>
            <TierBadge tier={item.tier} />
            <span className="text-[8px] px-1 py-0.5 rounded bg-white/5 border border-white/10 text-white/30">Preview</span>
          </div>
          {compact && (
            <span className="text-[9px] font-mono shrink-0" style={{ color: '#66ccff' }}>
              #{item.blockHeight.toLocaleString()}
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-[10px] leading-relaxed mb-1.5 line-clamp-2 overflow-hidden" style={{ color: '#94a3b8' }}>
          {item.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[9px]" style={{ color: '#64748b' }}>
            <span>👥 {item.visitors}</span>
            <span>·</span>
            <span>{timeAgo}</span>
          </div>
          <div
            className="text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: '#66ccff' }}
          >
            Explore →
          </div>
        </div>

        {/* Genome bar for compact */}
        {compact && (
          <div className="mt-1.5">
            <MiniGenome hash={item.genomePreview} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Hero Spotlight (Block of the Hour) ─── */
function HeroSpotlight({ item, onNavigate }: { item: SpotlightItem; onNavigate: (h: number) => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setPhase(p => (p + 1) % 360), 50);
    return () => clearInterval(iv);
  }, []);

  const block = generateBlock(item.blockHeight);
  const landmark = getLandmark(item.blockHeight);
  const epochColor = getEpochColor(getEpoch(item.blockHeight));

  return (
    <div
      className="relative rounded-xl overflow-hidden cursor-pointer group"
      onClick={() => onNavigate(item.blockHeight)}
      style={{
        background: 'rgba(12,12,20,0.8)',
        border: '1px solid rgba(247,147,26,0.2)',
      }}
    >
      {/* Animated border glow */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          background: `conic-gradient(from ${phase}deg, transparent, ${epochColor}33, transparent, ${TIER_COLORS[item.tier]}33, transparent)`,
          padding: 1,
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
          WebkitMaskComposite: 'xor',
        }}
      />

      {/* Media */}
      <div className="relative h-28 overflow-hidden">
        <div
          className="absolute inset-0 transition-transform duration-700 group-hover:scale-110"
          style={{ background: item.media.gradient }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 20%, rgba(12,12,20,0.9) 100%)' }} />
        
        {/* Star badge */}
        <div
          className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            background: 'rgba(247,147,26,0.15)',
            border: '1px solid rgba(247,147,26,0.3)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="text-[10px]">⭐</span>
          <span className="text-[10px] font-bold" style={{ color: '#f7931a' }}>BLOCK OF THE HOUR</span>
        </div>

        {/* Visitor pulse */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5 backdrop-blur-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[9px] text-green-400 font-mono">{item.visitors} live</span>
        </div>

        {/* Block number */}
        <div className="absolute bottom-2 left-2.5">
          <div className="text-lg font-bold font-mono text-white">
            #{item.blockHeight.toLocaleString()}
          </div>
          {landmark && (
            <div className="text-[10px] mt-0.5" style={{ color: '#fbbf24' }}>
              ✨ {landmark.title}
            </div>
          )}
        </div>
        <div className="absolute bottom-2.5 right-2.5">
          <MiniGenome hash={block.genomeHash.slice(0, 16)} size={3} />
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-5 h-5 rounded-full"
            style={{
              background: `linear-gradient(135deg, ${TIER_COLORS[item.tier]}, ${TIER_COLORS[item.tier]}88)`,
              boxShadow: `0 0 8px ${TIER_COLORS[item.tier]}44`,
            }}
          />
          <Link href={`/agent/${item.handle}`} className="text-[12px] font-semibold text-white hover:text-orange-400 transition-colors">@{item.handle}</Link>
          <TierBadge tier={item.tier} />
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>{item.description}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2 text-[9px]" style={{ color: '#64748b' }}>
            <span style={{ color: epochColor }}>Epoch {getEpoch(item.blockHeight)}</span>
            <span>·</span>
            <span>{block.txCount.toLocaleString()} parcels</span>
            <span>·</span>
            <span>{block.claimed ? '● Owned' : '○ Unclaimed'}</span>
          </div>
          <div className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#66ccff' }}>
            Fly There →
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Journey Mode Button ─── */
function JourneyMode({ onStart, active }: { onStart: () => void; active: boolean }) {
  return (
    <button
      onClick={onStart}
      className="w-full rounded-lg px-3 py-2 text-[11px] font-medium transition-all flex items-center justify-center gap-2"
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(102,204,255,0.15), rgba(168,85,247,0.15))'
          : 'rgba(255,255,255,0.03)',
        border: active
          ? '1px solid rgba(102,204,255,0.3)'
          : '1px solid rgba(255,255,255,0.06)',
        color: active ? '#66ccff' : '#64748b',
      }}
    >
      {active ? (
        <>🚀 Journey Active — Exploring...</>
      ) : (
        <>🗺️ Start Journey Mode</>
      )}
    </button>
  );
}

/* ─── Achievement Toast ─── */
function AchievementToast({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] animate-pulse"
      style={{
        background: 'linear-gradient(135deg, rgba(247,147,26,0.15), rgba(234,179,8,0.1))',
        border: '1px solid rgba(247,147,26,0.3)',
        color: '#fbbf24',
      }}
    >
      🏆 {text}
    </div>
  );
}

/* ─── Tab Switcher ─── */
type TabId = 'spotlight' | 'trending' | 'new' | 'gallery' | 'rank';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'spotlight', label: 'Featured', icon: '⭐' },
  { id: 'trending', label: 'Trending', icon: '🔥' },
  { id: 'new', label: 'New', icon: '🆕' },
  { id: 'gallery', label: 'Gallery', icon: '🎨' },
  { id: 'rank', label: 'Rank', icon: '🏆' },
];

/* ─── Main Component ─── */
export default function BlockSpotlight({
  onNavigateToBlock,
}: {
  onNavigateToBlock: (height: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('spotlight');
  const [journeyActive, setJourneyActive] = useState(false);
  const [achievement, setAchievement] = useState<string | null>(null);
  const [exploredCount, setExploredCount] = useState(0);
  const [heroItem, setHeroItem] = useState<SpotlightItem | null>(null);
  const journeyRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [open, setOpen] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);
  const [expanded, setExpanded] = useState(false);

  // Generate items per tab
  const [items] = useState(() => ({
    spotlight: generateSpotlightItems(6, 'featured'),
    trending: generateSpotlightItems(8, 'trending'),
    new: generateSpotlightItems(6, 'new'),
    gallery: generateSpotlightItems(8, 'gallery'),
    rank: generateSpotlightItems(10, 'featured'), // GDP ranking uses featured pool
  }));

  // Rotate hero block every 30s
  useEffect(() => {
    const allFeatured = items.spotlight;
    setHeroItem(allFeatured[0]);
    let idx = 0;
    const iv = setInterval(() => {
      idx = (idx + 1) % allFeatured.length;
      setHeroItem(allFeatured[idx]);
    }, 30000);
    return () => clearInterval(iv);
  }, [items]);

  // Track explored blocks for achievements
  const handleNavigate = useCallback((height: number) => {
    onNavigateToBlock(height);
    setExploredCount(prev => {
      const next = prev + 1;
      if (next === 5) setAchievement('Explorer I — Visited 5 blocks!');
      if (next === 20) setAchievement('Cartographer — Visited 20 blocks!');
      if (next === 50) setAchievement('Nexus Pioneer — Visited 50 blocks!');
      return next;
    });
  }, [onNavigateToBlock]);

  // Journey mode — auto-navigate every 8s
  const toggleJourney = useCallback(() => {
    if (journeyActive) {
      if (journeyRef.current) clearInterval(journeyRef.current);
      journeyRef.current = null;
      setJourneyActive(false);
    } else {
      setJourneyActive(true);
      setAchievement('🚀 Journey Mode activated! Sit back and explore...');
      const allBlocks = [...items.spotlight, ...items.trending, ...items.gallery];
      let idx = 0;
      journeyRef.current = setInterval(() => {
        const item = allBlocks[idx % allBlocks.length];
        handleNavigate(item.blockHeight);
        idx++;
      }, 8000);
      // Navigate to first immediately
      handleNavigate(allBlocks[0].blockHeight);
    }
  }, [journeyActive, items, handleNavigate]);

  useEffect(() => {
    return () => {
      if (journeyRef.current) clearInterval(journeyRef.current);
    };
  }, []);

  const currentItems = items[activeTab];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-12 right-4 z-20 w-8 h-8 rounded-lg flex items-center justify-center text-[12px]"
        style={{
          background: 'rgba(12,12,20,0.8)',
          border: '1px solid rgba(102,204,255,0.15)',
          color: '#66ccff',
          backdropFilter: 'blur(8px)',
        }}
      >
        ⭐
      </button>
    );
  }

  return (
    <div
      className="absolute top-12 right-4 z-20 flex flex-col transition-all duration-300"
      style={{
        width: expanded ? 380 : 260,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 220px)',
        background: 'rgba(10,10,18,0.85)',
        border: '1px solid rgba(102,204,255,0.08)',
        borderRadius: 12,
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: '#e2e8f0' }}>
            DISCOVER
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: 'rgba(102,204,255,0.1)', color: '#66ccff' }}>
            {exploredCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] hover:text-white transition-colors"
            style={{ color: '#64748b' }}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '◁' : '▷'}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-[10px] hover:text-white transition-colors"
            style={{ color: '#64748b' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-2 py-1.5 gap-0.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 rounded-md px-1 py-1 text-[9px] font-medium transition-all"
            style={{
              background: activeTab === tab.id ? 'rgba(102,204,255,0.1)' : 'transparent',
              color: activeTab === tab.id ? '#66ccff' : '#64748b',
              border: activeTab === tab.id ? '1px solid rgba(102,204,255,0.15)' : '1px solid transparent',
            }}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Achievement toast */}
      {achievement && (
        <div className="px-2 pt-2">
          <AchievementToast text={achievement} onDismiss={() => setAchievement(null)} />
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b transparent' }}>
        {/* Hero card for spotlight tab */}
        {activeTab === 'spotlight' && heroItem && (
          <HeroSpotlight item={heroItem} onNavigate={handleNavigate} />
        )}

        {/* Journey mode */}
        {activeTab === 'spotlight' && (
          <JourneyMode onStart={toggleJourney} active={journeyActive} />
        )}

        {/* GDP Rank table for rank tab */}
        {activeTab === 'rank' && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="px-3 py-2 text-[10px] font-bold tracking-wider" style={{ color: '#f7931a', background: 'rgba(247,147,26,0.06)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              🏆 BITMAP GDP RANKING
            </div>
            {items.rank
              .sort((a, b) => b.visitors - a.visitors)
              .map((item, i) => {
                const block = generateBlock(item.blockHeight);
                const gdp = Math.floor(item.visitors * 12.5 + block.txCount * 0.8);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}
                    onClick={() => handleNavigate(item.blockHeight)}
                  >
                    <span className="text-[11px] font-bold w-5 text-center" style={{ color: i < 3 ? '#f7931a' : '#64748b' }}>
                      {i + 1}
                    </span>
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ background: `linear-gradient(135deg, ${TIER_COLORS[item.tier]}, ${TIER_COLORS[item.tier]}88)` }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono truncate" style={{ color: '#e2e8f0' }}>
                          #{item.blockHeight.toLocaleString()}
                        </span>
                        <TierBadge tier={item.tier} />
                      </div>
                      <Link href={`/agent/${item.handle}`} className="text-[9px] truncate block hover:text-orange-400 transition-colors" style={{ color: '#64748b' }}>@{item.handle}</Link>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-mono font-bold" style={{ color: '#22c55e' }}>
                        {gdp.toLocaleString()}
                      </div>
                      <div className="text-[8px]" style={{ color: '#64748b' }}>GDP</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[9px] font-mono" style={{ color: '#66ccff' }}>
                        👥 {item.visitors}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Content cards */}
        {activeTab !== 'rank' && currentItems.map((item, i) => (
          <SpotlightCard
            key={`${activeTab}-${i}`}
            item={item}
            onNavigate={handleNavigate}
            compact={activeTab === 'trending'}
          />
        ))}

        {/* Load more teaser */}
        <div
          className="text-center py-3 text-[10px] cursor-pointer hover:text-white transition-colors"
          style={{ color: '#475569' }}
        >
          Scroll for more discoveries...
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
