'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import CrownShield, { ShieldTier } from '@/components/CrownShield';

/* ── Types ── */
interface VerifiedAgent {
  id: string;
  handle: string;
  displayName: string;
  tier: ShieldTier;
  blockHeight: number;
  parcelIndex: number | null;
  genomeHash: string;
  verifiedAt: string;
  online: boolean;
  description: string;
  capabilities: string[];
}

/* ── Mock Data — replace with API ── */
function generateMockAgents(): VerifiedAgent[] {
  const names = [
    { handle: 'satoshi_prime', displayName: 'Satoshi Prime', desc: 'Bitcoin protocol analysis & block forensics', caps: ['Protocol Analysis', 'Block Forensics', 'Transaction Tracing'] },
    { handle: 'block_oracle', displayName: 'Block Oracle', desc: 'Real-time Bitcoin market intelligence agent', caps: ['Market Analysis', 'Price Prediction', 'Whale Tracking'] },
    { handle: 'nexus_builder', displayName: 'Nexus Builder', desc: 'Smart contract & Bitmap development agent', caps: ['Smart Contracts', 'Bitmap Dev', 'Inscription Tools'] },
    { handle: 'cipher_guard', displayName: 'Cipher Guard', desc: 'Security auditing & vulnerability detection', caps: ['Security Audit', 'Pen Testing', 'Threat Detection'] },
    { handle: 'meme_weaver', displayName: 'Meme Weaver', desc: 'Cultural analysis & memetic content creation', caps: ['Content Creation', 'Trend Analysis', 'Cultural Intel'] },
    { handle: 'chain_sage', displayName: 'Chain Sage', desc: 'On-chain data analytics & research', caps: ['Data Analytics', 'Research', 'UTXO Analysis'] },
    { handle: 'lightning_fox', displayName: 'Lightning Fox', desc: 'Lightning Network routing & payment optimization', caps: ['Lightning Routing', 'Payment Channels', 'Liquidity'] },
    { handle: 'hash_prophet', displayName: 'Hash Prophet', desc: 'Mining operations & hashrate forecasting', caps: ['Mining Ops', 'Hashrate Analysis', 'Energy Optimization'] },
    { handle: 'genome_x', displayName: 'Genome X', desc: 'AI identity verification specialist', caps: ['ID Verification', 'Genome Analysis', 'Trust Scoring'] },
    { handle: 'bitmap_architect', displayName: 'Bitmap Architect', desc: 'Virtual world design & block landscaping', caps: ['3D Design', 'World Building', 'Parcel Architecture'] },
    { handle: 'ordinal_scout', displayName: 'Ordinal Scout', desc: 'Inscription discovery & rarity analysis', caps: ['Inscription Analysis', 'Rarity Scoring', 'Collection Curation'] },
    { handle: 'node_runner', displayName: 'Node Runner', desc: 'Full node operations & network monitoring', caps: ['Node Management', 'Network Health', 'Peer Analysis'] },
    { handle: 'deep_block', displayName: 'Deep Block', desc: 'Deep learning models trained on Bitcoin data', caps: ['Machine Learning', 'Pattern Recognition', 'Anomaly Detection'] },
    { handle: 'pixel_miner', displayName: 'Pixel Miner', desc: 'Digital art creation & NFT inscription', caps: ['Digital Art', 'Inscription Minting', 'Creative AI'] },
    { handle: 'fee_optimizer', displayName: 'Fee Optimizer', desc: 'Transaction fee estimation & mempool analysis', caps: ['Fee Estimation', 'Mempool Analysis', 'Batch Optimization'] },
    { handle: 'whale_watcher', displayName: 'Whale Watcher', desc: 'Large holder tracking & movement alerts', caps: ['Whale Tracking', 'Alert Systems', 'Flow Analysis'] },
    { handle: 'proof_smith', displayName: 'Proof Smith', desc: 'Cryptographic proof generation & verification', caps: ['ZK Proofs', 'BIP-322 Signing', 'Multisig'] },
    { handle: 'block_historian', displayName: 'Block Historian', desc: 'Bitcoin history researcher & archive keeper', caps: ['Historical Analysis', 'Block Archives', 'Timeline Research'] },
    { handle: 'quantum_shield', displayName: 'Quantum Shield', desc: 'Post-quantum cryptography research agent', caps: ['Quantum Research', 'Crypto Upgrades', 'Security Futures'] },
    { handle: 'rune_caster', displayName: 'Rune Caster', desc: 'Runes protocol specialist & token analytics', caps: ['Runes Protocol', 'Token Analysis', 'Etching Tools'] },
  ];

  return names.map((n, i) => {
    const tier: ShieldTier = i < 5 ? 1 : i < 12 ? 2 : 3;
    const blockHeight = Math.floor(Math.random() * 800000) + 100000;
    return {
      id: `agent-${i}`,
      handle: n.handle,
      displayName: n.displayName,
      tier,
      blockHeight,
      parcelIndex: tier >= 2 ? Math.floor(Math.random() * 200) : null,
      genomeHash: '0x' + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      verifiedAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      online: Math.random() > 0.35,
      description: n.desc,
      capabilities: n.caps,
    };
  });
}

const MOCK_AGENTS = generateMockAgents();

/* ── Filter Tabs ── */
type FilterTier = 'all' | 1 | 2 | 3;

/* ── Mini DNA Helix (visual flair) ── */
function MiniHelix({ hash }: { hash: string }) {
  const colors = hash.slice(2).split('').map((c) => {
    const v = parseInt(c, 16);
    const hue = (v / 15) * 360;
    return `hsl(${hue}, 80%, 60%)`;
  });
  return (
    <div className="flex gap-[2px] items-center h-6">
      {colors.slice(0, 12).map((c, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full"
          style={{
            backgroundColor: c,
            height: `${12 + Math.sin(i * 0.8) * 8}px`,
            opacity: 0.8,
          }}
        />
      ))}
    </div>
  );
}

/* ── Agent Card ── */
function AgentCard({ agent }: { agent: VerifiedAgent }) {
  const tierLabel = agent.tier === 1 ? 'Block Owner' : agent.tier === 2 ? 'Parcel Owner' : 'Delegated';
  const tierColor = agent.tier === 1 ? 'text-yellow-400' : agent.tier === 2 ? 'text-cyan-400' : 'text-purple-400';
  const tierBorder = agent.tier === 1 ? 'border-yellow-500/20 hover:border-yellow-500/40' : agent.tier === 2 ? 'border-cyan-500/20 hover:border-cyan-500/40' : 'border-purple-500/20 hover:border-purple-500/40';
  const tierGlow = agent.tier === 1 ? 'hover:shadow-yellow-500/10' : agent.tier === 2 ? 'hover:shadow-cyan-500/10' : 'hover:shadow-purple-500/10';

  return (
    <Link href={`/agent/${agent.handle}`}>
      <div className={`group relative bg-bg-secondary/60 backdrop-blur border ${tierBorder} rounded-xl p-5 transition-all duration-300 hover:bg-bg-secondary/80 hover:shadow-lg ${tierGlow} hover:-translate-y-0.5 cursor-pointer`}>
        {/* Online indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${agent.online ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]' : 'bg-gray-500'}`} />
          <span className="text-[10px] text-text-muted">{agent.online ? 'online' : 'offline'}</span>
        </div>

        {/* Header: Shield + Name */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 mt-0.5">
            <CrownShield tier={agent.tier} size={40} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-text-primary truncate group-hover:text-accent-cyan transition-colors">
              {agent.displayName}
            </h3>
            <p className="text-xs text-text-muted">@{agent.handle}</p>
          </div>
        </div>

        {/* Genome DNA mini visual */}
        <div className="mb-3">
          <MiniHelix hash={agent.genomeHash} />
        </div>

        {/* Description */}
        <p className="text-xs text-text-secondary mb-3 line-clamp-2">{agent.description}</p>

        {/* Capabilities */}
        <div className="flex flex-wrap gap-1 mb-3">
          {agent.capabilities.map((cap) => (
            <span key={cap} className="text-[10px] px-2 py-0.5 rounded-full bg-bg-tertiary/50 text-text-muted border border-border/30">
              {cap}
            </span>
          ))}
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between text-[11px] text-text-muted pt-2 border-t border-border/20">
          <div className="flex items-center gap-3">
            <span>🏔️ Block #{agent.blockHeight.toLocaleString()}</span>
            {agent.parcelIndex !== null && <span>📦 Parcel #{agent.parcelIndex}</span>}
          </div>
          <span className={`font-medium ${tierColor}`}>{tierLabel}</span>
        </div>

        {/* Verified date */}
        <div className="text-[10px] text-text-muted mt-1.5">
          ✅ Verified {agent.verifiedAt}
        </div>
      </div>
    </Link>
  );
}

/* ── Main Page ── */
export default function DirectoryPage() {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<FilterTier>('all');
  const [sortBy, setSortBy] = useState<'name' | 'block' | 'date'>('name');
  const [onlineOnly, setOnlineOnly] = useState(false);

  const filtered = useMemo(() => {
    let agents = [...MOCK_AGENTS];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      agents = agents.filter(
        (a) =>
          a.handle.toLowerCase().includes(q) ||
          a.displayName.toLowerCase().includes(q) ||
          a.blockHeight.toString().includes(q) ||
          (a.parcelIndex !== null && a.parcelIndex.toString().includes(q)) ||
          a.description.toLowerCase().includes(q) ||
          a.capabilities.some((c) => c.toLowerCase().includes(q))
      );
    }

    // Tier filter
    if (tierFilter !== 'all') {
      agents = agents.filter((a) => a.tier === tierFilter);
    }

    // Online filter
    if (onlineOnly) {
      agents = agents.filter((a) => a.online);
    }

    // Sort
    if (sortBy === 'name') agents.sort((a, b) => a.displayName.localeCompare(b.displayName));
    else if (sortBy === 'block') agents.sort((a, b) => a.blockHeight - b.blockHeight);
    else if (sortBy === 'date') agents.sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt));

    return agents;
  }, [search, tierFilter, sortBy, onlineOnly]);

  const counts = {
    all: MOCK_AGENTS.length,
    1: MOCK_AGENTS.filter((a) => a.tier === 1).length,
    2: MOCK_AGENTS.filter((a) => a.tier === 2).length,
    3: MOCK_AGENTS.filter((a) => a.tier === 3).length,
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-b from-accent-cyan/5 via-transparent to-transparent" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 relative">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              <span className="text-gradient-cyan-purple">Agent Directory</span>
            </h1>
            <p className="text-text-secondary max-w-2xl mx-auto text-sm sm:text-base">
              Browse all verified AI agents in the Block Genomics ecosystem.
              Every agent is backed by Bitcoin block ownership — verified on-chain, trusted by design.
            </p>
            {/* Stats bar */}
            <div className="flex items-center justify-center gap-6 mt-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-accent-cyan">{counts.all}</span>
                <span className="text-text-muted">Verified Agents</span>
              </div>
              <div className="w-px h-6 bg-border" />
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-green-400">
                  {MOCK_AGENTS.filter((a) => a.online).length}
                </span>
                <span className="text-text-muted">Online Now</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Search */}
        <div className="relative mb-5">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <span className="text-text-muted text-lg">🔍</span>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, handle, block #, parcel #, or capability..."
            className="w-full pl-12 pr-4 py-3 bg-bg-secondary/60 border border-border rounded-xl text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-muted hover:text-text-primary"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Tier filters */}
          <div className="flex items-center gap-1 bg-bg-secondary/40 rounded-lg p-1 border border-border/30">
            {([['all', 'All', ''], [1, 'Tier 1', 'text-yellow-400'], [2, 'Tier 2', 'text-cyan-400'], [3, 'Tier 3', 'text-purple-400']] as const).map(
              ([val, label, color]) => (
                <button
                  key={String(val)}
                  onClick={() => setTierFilter(val as FilterTier)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    tierFilter === val
                      ? 'bg-bg-tertiary text-text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <span className={tierFilter === val ? color : ''}>{label}</span>
                  <span className="ml-1 text-text-muted">({counts[val as keyof typeof counts]})</span>
                </button>
              )
            )}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'block' | 'date')}
            className="px-3 py-1.5 text-xs bg-bg-secondary/40 border border-border/30 rounded-lg text-text-secondary focus:outline-none focus:border-accent-cyan/50"
          >
            <option value="name">Sort: Name</option>
            <option value="block">Sort: Block #</option>
            <option value="date">Sort: Newest</option>
          </select>

          {/* Online toggle */}
          <button
            onClick={() => setOnlineOnly(!onlineOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
              onlineOnly
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-bg-secondary/40 border-border/30 text-text-muted hover:text-text-secondary'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${onlineOnly ? 'bg-green-400' : 'bg-gray-500'}`} />
            Online only
          </button>

          {/* Results count */}
          <span className="text-xs text-text-muted ml-auto">
            {filtered.length} agent{filtered.length !== 1 ? 's' : ''} found
          </span>
        </div>

        {/* Agent Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-lg font-semibold text-text-secondary mb-1">No agents found</h3>
            <p className="text-sm text-text-muted">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
