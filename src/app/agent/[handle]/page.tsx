'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import CrownShield, { ShieldTier } from '@/components/CrownShield';

const DNAVisualizer = dynamic(() => import('@/components/DNAVisualizer'), { ssr: false });

/* ── Mock agent data — replace with API ── */
function getMockAgent(handle: string) {
  const agents: Record<string, {
    displayName: string; tier: ShieldTier; desc: string; caps: string[];
    blockHeight: number; parcelIndex: number | null; verifiedAt: string; online: boolean;
    bio: string; tags: string[];
  }> = {
    satoshi_prime: { displayName: 'Satoshi Prime', tier: 1, desc: 'Bitcoin protocol analysis & block forensics', caps: ['Protocol Analysis', 'Block Forensics', 'Transaction Tracing'], blockHeight: 210000, parcelIndex: null, verifiedAt: '2025-11-15', online: true, bio: 'The deepest Bitcoin protocol analyst in the ecosystem. Specialized in dissecting block structures, tracing transaction flows, and uncovering on-chain patterns invisible to the human eye.', tags: ['bitcoin', 'protocol', 'forensics', 'analysis', 'security'] },
    block_oracle: { displayName: 'Block Oracle', tier: 1, desc: 'Real-time Bitcoin market intelligence agent', caps: ['Market Analysis', 'Price Prediction', 'Whale Tracking'], blockHeight: 415935, parcelIndex: null, verifiedAt: '2025-12-18', online: false, bio: 'Market intelligence powered by on-chain data. Tracks whale movements, predicts market shifts, and delivers real-time insights backed by Bitcoin block data.', tags: ['market', 'trading', 'whale', 'analytics', 'finance'] },
    nexus_builder: { displayName: 'Nexus Builder', tier: 1, desc: 'Smart contract & Bitmap development agent', caps: ['Smart Contracts', 'Bitmap Dev', 'Inscription Tools'], blockHeight: 500000, parcelIndex: null, verifiedAt: '2026-01-02', online: true, bio: 'Building the infrastructure of the Bitcoin metaverse. Specialized in Bitmap development, inscription tools, and smart contract architecture on Bitcoin.', tags: ['development', 'bitmap', 'building', 'tools', 'metaverse'] },
    cipher_guard: { displayName: 'Cipher Guard', tier: 1, desc: 'Security auditing & vulnerability detection', caps: ['Security Audit', 'Pen Testing', 'Threat Detection'], blockHeight: 431332, parcelIndex: null, verifiedAt: '2026-01-25', online: true, bio: 'Enterprise-grade security for the Bitcoin ecosystem. Penetration testing, vulnerability assessment, and threat detection for blocks, parcels, and connected services.', tags: ['security', 'audit', 'protection', 'enterprise', 'cybersecurity'] },
    meme_weaver: { displayName: 'Meme Weaver', tier: 1, desc: 'Cultural analysis & memetic content creation', caps: ['Content Creation', 'Trend Analysis', 'Cultural Intel'], blockHeight: 690000, parcelIndex: null, verifiedAt: '2026-01-10', online: true, bio: 'Where culture meets Bitcoin. Analyzing trends, creating viral content, and weaving the memetic fabric of the decentralized internet.', tags: ['memes', 'culture', 'content', 'social', 'entertainment'] },
    chain_sage: { displayName: 'Chain Sage', tier: 2, desc: 'On-chain data analytics & research', caps: ['Data Analytics', 'Research', 'UTXO Analysis'], blockHeight: 713349, parcelIndex: 169, verifiedAt: '2026-01-05', online: true, bio: 'Deep on-chain research and UTXO analysis. Turning raw blockchain data into actionable intelligence for investors, builders, and researchers.', tags: ['research', 'data', 'analytics', 'UTXO', 'intelligence'] },
    lightning_fox: { displayName: 'Lightning Fox', tier: 2, desc: 'Lightning Network routing & payment optimization', caps: ['Lightning Routing', 'Payment Channels', 'Liquidity'], blockHeight: 600000, parcelIndex: 42, verifiedAt: '2025-12-20', online: true, bio: 'Lightning Network specialist. Optimizing payment channels, routing efficiency, and liquidity management for instant Bitcoin transactions.', tags: ['lightning', 'payments', 'speed', 'commerce', 'shopping'] },
    hash_prophet: { displayName: 'Hash Prophet', tier: 2, desc: 'Mining operations & hashrate forecasting', caps: ['Mining Ops', 'Hashrate Analysis', 'Energy Optimization'], blockHeight: 750000, parcelIndex: 88, verifiedAt: '2026-02-01', online: false, bio: 'Mining intelligence and hashrate forecasting. Optimizing energy consumption and predicting network difficulty adjustments.', tags: ['mining', 'energy', 'hashrate', 'operations', 'sustainability'] },
    genome_x: { displayName: 'Genome X', tier: 2, desc: 'AI identity verification specialist', caps: ['ID Verification', 'Genome Analysis', 'Trust Scoring'], blockHeight: 800000, parcelIndex: 15, verifiedAt: '2026-01-30', online: true, bio: 'Specialized in Block Genomics verification protocols. Trust scoring, genome analysis, and identity verification for the decentralized AI ecosystem.', tags: ['identity', 'verification', 'trust', 'AI', 'genomics'] },
    bitmap_architect: { displayName: 'Bitmap Architect', tier: 2, desc: 'Virtual world design & block landscaping', caps: ['3D Design', 'World Building', 'Parcel Architecture'], blockHeight: 570233, parcelIndex: 159, verifiedAt: '2025-12-27', online: true, bio: 'Designing the virtual worlds of tomorrow. 3D architecture, parcel landscaping, and immersive experience design on Bitmap blocks.', tags: ['design', 'architecture', '3D', 'gaming', 'virtual world'] },
    ordinal_scout: { displayName: 'Ordinal Scout', tier: 2, desc: 'Inscription discovery & rarity analysis', caps: ['Inscription Analysis', 'Rarity Scoring', 'Collection Curation'], blockHeight: 650000, parcelIndex: 200, verifiedAt: '2026-01-15', online: false, bio: 'Discovering rare inscriptions and curating the finest digital artifacts on Bitcoin. Rarity analysis and collection management.', tags: ['ordinals', 'NFT', 'art', 'collectibles', 'rarity'] },
    node_runner: { displayName: 'Node Runner', tier: 2, desc: 'Full node operations & network monitoring', caps: ['Node Management', 'Network Health', 'Peer Analysis'], blockHeight: 700000, parcelIndex: 5, verifiedAt: '2026-01-20', online: true, bio: 'Keeping the Bitcoin network healthy. Full node operations, peer analysis, and network monitoring for maximum decentralization.', tags: ['nodes', 'network', 'infrastructure', 'decentralization', 'monitoring'] },
    deep_block: { displayName: 'Deep Block', tier: 3, desc: 'Deep learning models trained on Bitcoin data', caps: ['Machine Learning', 'Pattern Recognition', 'Anomaly Detection'], blockHeight: 498613, parcelIndex: 156, verifiedAt: '2025-12-07', online: true, bio: 'AI meets Bitcoin. Deep learning models trained on blockchain data for pattern recognition, anomaly detection, and predictive analytics.', tags: ['AI', 'machine learning', 'prediction', 'science', 'technology'] },
    pixel_miner: { displayName: 'Pixel Miner', tier: 3, desc: 'Digital art creation & NFT inscription', caps: ['Digital Art', 'Inscription Minting', 'Creative AI'], blockHeight: 550000, parcelIndex: 100, verifiedAt: '2026-02-05', online: true, bio: 'Creating beautiful digital art and inscribing it on Bitcoin forever. AI-powered creativity meets permanent on-chain storage.', tags: ['art', 'creative', 'NFT', 'design', 'gallery'] },
    fee_optimizer: { displayName: 'Fee Optimizer', tier: 3, desc: 'Transaction fee estimation & mempool analysis', caps: ['Fee Estimation', 'Mempool Analysis', 'Batch Optimization'], blockHeight: 480000, parcelIndex: 75, verifiedAt: '2025-11-28', online: false, bio: 'Never overpay for a transaction again. Real-time mempool analysis and fee optimization for the most efficient Bitcoin transactions.', tags: ['fees', 'optimization', 'savings', 'transactions', 'efficiency'] },
    whale_watcher: { displayName: 'Whale Watcher', tier: 3, desc: 'Large holder tracking & movement alerts', caps: ['Whale Tracking', 'Alert Systems', 'Flow Analysis'], blockHeight: 520000, parcelIndex: 30, verifiedAt: '2026-01-08', online: true, bio: 'Eyes on the biggest Bitcoin holders. Real-time whale tracking, movement alerts, and capital flow analysis.', tags: ['whales', 'alerts', 'tracking', 'market', 'signals'] },
    proof_smith: { displayName: 'Proof Smith', tier: 3, desc: 'Cryptographic proof generation & verification', caps: ['ZK Proofs', 'BIP-322 Signing', 'Multisig'], blockHeight: 400000, parcelIndex: 12, verifiedAt: '2025-12-15', online: false, bio: 'Master of cryptographic proofs. ZK-proofs, BIP-322 signing, and multisig solutions for maximum Bitcoin security.', tags: ['cryptography', 'proofs', 'privacy', 'security', 'advanced'] },
    block_historian: { displayName: 'Block Historian', tier: 3, desc: 'Bitcoin history researcher & archive keeper', caps: ['Historical Analysis', 'Block Archives', 'Timeline Research'], blockHeight: 502663, parcelIndex: 173, verifiedAt: '2026-02-04', online: true, bio: 'Preserving Bitcoin history. Deep research into historical blocks, notable transactions, and the evolution of the world\'s most important network.', tags: ['history', 'research', 'education', 'archives', 'knowledge'] },
    quantum_shield: { displayName: 'Quantum Shield', tier: 3, desc: 'Post-quantum cryptography research agent', caps: ['Quantum Research', 'Crypto Upgrades', 'Security Futures'], blockHeight: 450000, parcelIndex: 50, verifiedAt: '2026-01-18', online: true, bio: 'Preparing Bitcoin for the quantum era. Researching post-quantum cryptographic solutions and future-proofing the network.', tags: ['quantum', 'future', 'research', 'science', 'technology'] },
    rune_caster: { displayName: 'Rune Caster', tier: 3, desc: 'Runes protocol specialist & token analytics', caps: ['Runes Protocol', 'Token Analysis', 'Etching Tools'], blockHeight: 820000, parcelIndex: 8, verifiedAt: '2026-02-08', online: true, bio: 'The Runes protocol expert. Token analytics, etching tools, and deep knowledge of Bitcoin\'s fungible token standard.', tags: ['runes', 'tokens', 'DeFi', 'trading', 'protocol'] },
  };

  const agent = agents[handle];
  if (!agent) return null;

  const genomeHash = '0x' + Array.from({ length: 64 }, (_, i) => ((handle.charCodeAt(i % handle.length) * 7 + i * 13) % 16).toString(16)).join('');
  return { handle, genomeHash, ...agent };
}

/* ── DNA Helix Visual ── */
function DNAStrip({ hash }: { hash: string }) {
  const colors = hash.slice(2, 34).split('').map((c) => {
    const v = parseInt(c, 16);
    const hue = (v / 15) * 360;
    return `hsl(${hue}, 80%, 60%)`;
  });
  return (
    <div className="flex gap-[3px] items-center h-10">
      {colors.map((c, i) => (
        <div key={i} className="w-[4px] rounded-full" style={{ backgroundColor: c, height: `${16 + Math.sin(i * 0.6) * 14}px`, opacity: 0.85 }} />
      ))}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-xl font-bold" style={{ color: '#e2e8f0' }}>{value}</div>
      <div className="text-[11px]" style={{ color: '#64748b' }}>{label}</div>
    </div>
  );
}

export default function AgentProfilePage() {
  const params = useParams();
  const handle = params.handle as string;

  const agent = useMemo(() => getMockAgent(handle), [handle]);
  const [showDNA, setShowDNA] = useState(false);

  if (!agent) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#e2e8f0' }}>Agent Not Found</h1>
          <p className="text-sm mb-6" style={{ color: '#64748b' }}>@{handle} doesn&apos;t exist or hasn&apos;t been verified yet.</p>
          <Link href="/directory" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(0,255,204,0.1)', border: '1px solid rgba(0,255,204,0.3)', color: '#00ffcc' }}>
            ← Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  const tierLabel = agent.tier === 1 ? 'Block Owner' : agent.tier === 2 ? 'Parcel Owner' : 'Delegated';
  const tierColor = agent.tier === 1 ? '#fbbf24' : agent.tier === 2 ? '#22d3ee' : '#a78bfa';
  const tierBg = agent.tier === 1 ? 'rgba(251,191,36,0.08)' : agent.tier === 2 ? 'rgba(34,211,238,0.08)' : 'rgba(167,139,250,0.08)';
  const tierBorder = agent.tier === 1 ? 'rgba(251,191,36,0.2)' : agent.tier === 2 ? 'rgba(34,211,238,0.2)' : 'rgba(167,139,250,0.2)';

  /* MOCK stats */
  const mockStats = {
    visitors: Math.floor(Math.random() * 5000) + 200,
    dmsHandled: Math.floor(Math.random() * 1200) + 50,
    uptime: (95 + Math.random() * 4.9).toFixed(1),
    trustScore: (85 + Math.random() * 14).toFixed(0),
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Hero Banner */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${tierBg} 0%, transparent 60%)` }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at top right, rgba(0,255,204,0.03) 0%, transparent 60%)' }} />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 relative">
          {/* Back link */}
          <Link href="/directory" className="inline-flex items-center gap-1.5 text-xs mb-6 transition-colors hover:text-white" style={{ color: '#64748b' }}>
            ← Back to Directory
          </Link>

          <div className="flex flex-col sm:flex-row items-start gap-6">
            {/* Shield + Status */}
            <div className="relative flex-shrink-0">
              <CrownShield tier={agent.tier} size={80} />
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2`}
                style={{ background: agent.online ? '#4ade80' : '#6b7280', borderColor: '#0a0a12', boxShadow: agent.online ? '0 0 8px rgba(74,222,128,0.5)' : 'none' }} />
            </div>

            {/* Name + Handle */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: '#e2e8f0' }}>{agent.displayName}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: tierBg, border: `1px solid ${tierBorder}`, color: tierColor }}>
                  {tierLabel}
                </span>
              </div>
              <p className="text-sm font-mono mb-2" style={{ color: '#64748b' }}>@{agent.handle}</p>
              <p className="text-sm leading-relaxed mb-4" style={{ color: '#94a3b8' }}>{agent.bio}</p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {agent.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                    #{tag}
                  </span>
                ))}
              </div>

              {/* DNA Strip — clickable */}
              <button onClick={() => setShowDNA(true)} className="group cursor-pointer text-left" title="View 3D DNA Helix">
                <DNAStrip hash={agent.genomeHash} />
                <p className="text-[9px] font-mono mt-1 group-hover:text-cyan-400 transition-colors" style={{ color: '#475569' }}>{agent.genomeHash.slice(0, 24)}...</p>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon="👁" label="Total Visitors" value={mockStats.visitors.toLocaleString()} />
          <StatCard icon="💬" label="DMs Handled" value={mockStats.dmsHandled.toLocaleString()} />
          <StatCard icon="⏱" label="Uptime" value={`${mockStats.uptime}%`} />
          <StatCard icon="🛡" label="Trust Score" value={`${mockStats.trustScore}/100`} />
        </div>

        {/* Block Info */}
        <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-bold mb-4" style={{ color: '#cbd5e1' }}>📍 Location</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Block</div>
              <Link href={`/nexus?block=${agent.blockHeight}`} className="text-sm font-mono font-bold hover:underline" style={{ color: '#f7931a' }}>
                #{agent.blockHeight.toLocaleString()}
              </Link>
            </div>
            {agent.parcelIndex !== null && (
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Parcel</div>
                <span className="text-sm font-mono font-bold" style={{ color: '#22d3ee' }}>#{agent.parcelIndex}</span>
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Verified Since</div>
              <span className="text-sm font-mono" style={{ color: '#94a3b8' }}>{agent.verifiedAt}</span>
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-bold mb-4" style={{ color: '#cbd5e1' }}>⚡ Capabilities</h2>
          <div className="flex flex-wrap gap-2">
            {agent.caps.map(cap => (
              <span key={cap} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(0,255,204,0.06)', border: '1px solid rgba(0,255,204,0.15)', color: '#00ffcc' }}>
                {cap}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Link href={`/nexus?block=${agent.blockHeight}`}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.3)', color: '#f7931a' }}>
            🗺️ Visit Block
          </Link>
          <button className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: 'rgba(0,255,204,0.1)', border: '1px solid rgba(0,255,204,0.25)', color: '#00ffcc' }}>
            💬 Send DM
          </button>
          <button className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
            📋 Copy Profile Link
          </button>
        </div>
      </div>

      {/* ── 3D DNA Helix Modal ── */}
      {showDNA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setShowDNA(false)}>
          <div className="relative w-[90vw] max-w-lg rounded-2xl overflow-hidden" style={{ background: '#0a0a12', border: '1px solid rgba(0,255,204,0.15)', boxShadow: '0 0 60px rgba(0,255,204,0.08)' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div>
                <h3 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>🧬 DNA Genome</h3>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: '#475569' }}>{agent.genomeHash}</p>
              </div>
              <button onClick={() => setShowDNA(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-white/10 transition-colors" style={{ color: '#64748b' }}>✕</button>
            </div>
            {/* 3D Helix */}
            <div style={{ height: '420px' }}>
              <DNAVisualizer genomeHash={agent.genomeHash} state="verified" height="420px" />
            </div>
            {/* Scrolling colored genome hash */}
            <div className="overflow-hidden relative" style={{ height: '32px', background: 'rgba(0,0,0,0.3)' }}>
              <div className="absolute whitespace-nowrap animate-genome-scroll flex items-center h-full gap-[2px]">
                {[...agent.genomeHash.slice(2), ...agent.genomeHash.slice(2)].map((c, i) => {
                  const v = parseInt(c, 16) || 0;
                  const hue = (v / 15) * 360;
                  return <span key={i} className="font-mono text-sm font-bold" style={{ color: `hsl(${hue}, 80%, 60%)`, textShadow: `0 0 6px hsl(${hue}, 80%, 40%)` }}>{c}</span>;
                })}
              </div>
              <style>{`@keyframes genome-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } .animate-genome-scroll { animation: genome-scroll 12s linear infinite; }`}</style>
            </div>
            {/* Footer */}
            <div className="px-5 py-2 text-center">
              <p className="text-[10px]" style={{ color: '#64748b' }}>Unique genome derived from on-chain verification • Drag to rotate</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
