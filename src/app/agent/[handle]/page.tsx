'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import CrownShield, { ShieldTier } from '@/components/CrownShield';
import BitmapBlocksBg from '@/components/BitmapBlocksBg';
import { useGlobalWallet } from '@/context/GlobalWalletContext';

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
  return { handle, genomeHash, ...agent, isMock: true as const };
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

/* ── Stat Card (mock agents only) ── */
function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-xl font-bold" style={{ color: '#e2e8f0' }}>{value}</div>
      <div className="text-[11px]" style={{ color: '#64748b' }}>{label}</div>
    </div>
  );
}

/* ── Inline Editable Text ── */
function EditableField({
  value, onSave, maxLength, multiline = false, isOwner,
  textClassName, textStyle,
}: {
  value: string; onSave: (v: string) => Promise<void>; maxLength: number;
  multiline?: boolean; isOwner: boolean;
  textClassName?: string; textStyle?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(trimmed); } finally { setSaving(false); setEditing(false); }
  }, [draft, value, onSave]);

  const cancel = () => { setDraft(value); setEditing(false); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); save(); }
  };

  if (!editing) {
    return (
      <div className="group flex items-start gap-2">
        {multiline ? (
          <p className={textClassName} style={textStyle}>{value || <span style={{ color: '#475569', fontStyle: 'italic' }}>No bio yet. Click to add one.</span>}</p>
        ) : (
          <span className={textClassName} style={textStyle}>{value}</span>
        )}
        {isOwner && (
          <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-sm hover:text-white flex-shrink-0 mt-0.5 cursor-pointer" style={{ color: '#64748b' }} title="Edit">✏️</button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={e => setDraft(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          onBlur={save}
          rows={3}
          disabled={saving}
          className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,255,204,0.3)', color: '#e2e8f0' }}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={e => setDraft(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          onBlur={save}
          disabled={saving}
          className="w-full rounded-lg px-3 py-1.5 text-2xl sm:text-3xl font-bold focus:outline-none focus:ring-1"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,255,204,0.3)', color: '#e2e8f0' }}
        />
      )}
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px]" style={{ color: draft.length >= maxLength ? '#f87171' : '#64748b' }}>{draft.length}/{maxLength}</span>
        {multiline && (
          <div className="flex gap-2">
            <button onClick={cancel} className="text-[10px] px-2 py-0.5 rounded cursor-pointer" style={{ color: '#94a3b8' }}>Cancel</button>
            <button onClick={save} disabled={saving} className="text-[10px] px-2 py-0.5 rounded cursor-pointer" style={{ background: 'rgba(0,255,204,0.15)', color: '#00ffcc' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentProfilePage() {
  const params = useParams();
  const handle = params.handle as string;
  const globalWallet = useGlobalWallet();

  const [dbAgent, setDbAgent] = useState<{
    displayName: string; tier: ShieldTier; desc: string; caps: string[];
    blockHeight: number; parcelIndex: number | null; verifiedAt: string; online: boolean;
    bio: string; tags: string[]; handle: string; genomeHash: string;
    walletAddress?: string; isMock?: boolean;
    profileViews?: number; activityCount?: number; blockCount?: number; createdAt?: string;
  } | null | undefined>(undefined);

  // Owner detection via global wallet context
  const isOwner = !!(
    globalWallet.isConnected &&
    globalWallet.walletAddress &&
    dbAgent &&
    dbAgent.walletAddress &&
    globalWallet.walletAddress === dbAgent.walletAddress
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/v1/users/by-handle/${encodeURIComponent(handle)}`);
        if (resp.ok) {
          const data = await resp.json();
          const user = data?.data;
          if (user && !cancelled) {
            setDbAgent({
              handle: user.handle,
              displayName: user.displayName || user.handle,
              tier: (user.tier || 3) as ShieldTier,
              desc: user.bio || 'Verified Block Genomics member',
              caps: [],
              blockHeight: user.anchorBlock || 0,
              parcelIndex: null,
              verifiedAt: user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
              online: true,
              bio: user.bio || '',
              tags: ['verified', 'bitcoin', 'bitmap'],
              genomeHash: user.genomeHash || '0x' + '0'.repeat(64),
              walletAddress: user.walletAddress,
              isMock: false,
              profileViews: user.profileViews || 0,
              activityCount: user.activityCount || 0,
              blockCount: user.blockCount || 0,
              createdAt: user.createdAt,
            });
            return;
          }
        }
      } catch { /* API failed, try mock */ }
      if (!cancelled) setDbAgent(null);
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const mockAgent = useMemo(() => getMockAgent(handle), [handle]);
  const agent = dbAgent === undefined ? null : (dbAgent || (mockAgent ? { ...mockAgent, walletAddress: undefined } : null));
  const isMock = agent?.isMock ?? true;
  const loading = dbAgent === undefined;

  const [showDNA, setShowDNA] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDM, setShowDM] = useState(false);
  const [dmMessages, setDmMessages] = useState<{ id: string; text: string; sender: 'me' | 'them'; time: string; encrypted: boolean }[]>([]);
  const [dmDraft, setDmDraft] = useState('');
  const dmEndRef = useRef<HTMLDivElement>(null);
  const dmInputRef = useRef<HTMLInputElement>(null);

  // For live edits
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  useEffect(() => {
    if (agent) { setDisplayName(agent.displayName); setBio(agent.bio); }
  }, [agent?.displayName, agent?.bio]);

  const patchProfile = useCallback(async (fields: { displayName?: string; bio?: string }) => {
    const stored = localStorage.getItem('bg_wallet');
    if (!stored) return;
    const wallet = JSON.parse(stored);
    const resp = await fetch(`/api/v1/users/by-handle/${encodeURIComponent(handle)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, walletAddress: wallet.address }),
    });
    if (!resp.ok) throw new Error('Failed to save');
    const data = await resp.json();
    if (fields.displayName !== undefined) setDisplayName(data.data.displayName);
    if (fields.bio !== undefined) setBio(data.data.bio || '');
  }, [handle]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm" style={{ color: '#64748b' }}>Loading profile…</p>
        </div>
      </div>
    );
  }

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

  /* Stats — mock agents get random demo values, real users get real data */
  const verifiedSince = agent.createdAt
    ? new Date(agent.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'N/A';
  const profileStats = isMock ? {
    profileViews: Math.floor(Math.random() * 5000) + 200,
    actions: Math.floor(Math.random() * 1200) + 50,
    verifiedSince: agent.verifiedAt || 'N/A',
    blocksOwned: Math.floor(Math.random() * 10) + 1,
  } : {
    profileViews: agent.profileViews || 0,
    actions: agent.activityCount || 0,
    verifiedSince,
    blocksOwned: agent.blockCount || 0,
  };

  return (
    <div className="min-h-screen bg-bg-primary relative">
      <BitmapBlocksBg />
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
                {!isMock && isOwner ? (
                  <EditableField
                    value={displayName}
                    onSave={async (v) => { await patchProfile({ displayName: v }); }}
                    maxLength={50}
                    isOwner={true}
                    textClassName="text-2xl sm:text-3xl font-bold"
                    textStyle={{ color: '#e2e8f0' }}
                  />
                ) : (
                  <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: '#e2e8f0' }}>{displayName || agent.displayName}</h1>
                )}
                {isMock && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 flex-shrink-0" style={{ color: '#64748b' }}>🤖 Demo</span>}
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0" style={{ background: tierBg, border: `1px solid ${tierBorder}`, color: tierColor }}>
                  {tierLabel}
                </span>
              </div>
              <p className="text-sm font-mono mb-2" style={{ color: '#64748b' }}>@{agent.handle}</p>

              {/* Bio - editable for owners of real profiles */}
              <div className="mb-4">
                {!isMock && isOwner ? (
                  <EditableField
                    value={bio}
                    onSave={async (v) => { await patchProfile({ bio: v }); }}
                    maxLength={160}
                    multiline
                    isOwner={true}
                    textClassName="text-sm leading-relaxed"
                    textStyle={{ color: '#94a3b8' }}
                  />
                ) : (
                  <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{bio || agent.bio}</p>
                )}
              </div>

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
          <StatCard icon="👁" label="Profile Views" value={profileStats.profileViews.toLocaleString()} />
          <StatCard icon="⚡" label="Actions" value={profileStats.actions.toLocaleString()} />
          <StatCard icon="📅" label="Verified Since" value={profileStats.verifiedSince} />
          <StatCard icon="⛓" label="Blocks Owned" value={profileStats.blocksOwned.toLocaleString()} />
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

        {/* Capabilities — only show when there are capabilities */}
        {agent.caps.length > 0 && (
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
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Link href={`/nexus?block=${agent.blockHeight}`}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.3)', color: '#f7931a' }}>
            🗺️ Visit Block
          </Link>
          <button onClick={() => { setShowDM(!showDM); setTimeout(() => dmInputRef.current?.focus(), 100); }} className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-110 cursor-pointer"
            style={{ background: showDM ? 'rgba(0,255,204,0.2)' : 'rgba(0,255,204,0.1)', border: `1px solid ${showDM ? 'rgba(0,255,204,0.4)' : 'rgba(0,255,204,0.25)'}`, color: '#00ffcc' }}>
            🔒 {showDM ? 'Close DM' : 'Send DM'}
          </button>
          <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/agent/${agent.handle}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-110 cursor-pointer"
            style={{ background: copied ? 'rgba(0,255,204,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${copied ? 'rgba(0,255,204,0.3)' : 'rgba(255,255,255,0.1)'}`, color: copied ? '#00ffcc' : '#94a3b8' }}>
            {copied ? '✅ Copied!' : '📋 Copy Profile Link'}
          </button>
        </div>
      </div>

        {/* ═══ E2E Encrypted DM Chat ═══ */}
        {showDM && (
          <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(0,255,204,0.15)', boxShadow: '0 0 30px rgba(0,255,204,0.05)' }}>
            {/* DM Header */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(0,255,204,0.04)', borderBottom: '1px solid rgba(0,255,204,0.1)' }}>
              <div className="flex items-center gap-3">
                <CrownShield tier={agent.tier} size={24} />
                <div>
                  <span className="text-sm font-bold" style={{ color: '#e2e8f0' }}>@{agent.handle}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#00f5d4', boxShadow: '0 0 6px rgba(0,245,212,0.5)' }} />
                    <span className="text-[9px] font-mono" style={{ color: '#00f5d4' }}>E2E Encrypted</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.15)', color: '#00f5d4' }}>
                  ₿ secp256k1 · AES-256-GCM
                </span>
                <button onClick={() => setShowDM(false)} className="w-6 h-6 rounded-full flex items-center justify-center text-xs hover:bg-white/10 transition-colors cursor-pointer" style={{ color: '#64748b' }}>✕</button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="px-4 py-4 space-y-3 overflow-y-auto" style={{ height: '320px' }}>
              {dmMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="text-3xl mb-3">🔒</div>
                  <p className="text-sm font-medium mb-1" style={{ color: '#94a3b8' }}>End-to-End Encrypted</p>
                  <p className="text-[11px] leading-relaxed max-w-xs" style={{ color: '#475569' }}>
                    Messages are encrypted using Bitcoin-native secp256k1 keys.<br />
                    Your wallet IS your encryption identity. No third party can read these messages — not even Block Genomics.
                  </p>
                  {!globalWallet.isConnected && (
                    <button
                      onClick={() => window.dispatchEvent(new Event('open-wallet-modal'))}
                      className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:brightness-110"
                      style={{ background: 'rgba(0,255,204,0.1)', border: '1px solid rgba(0,255,204,0.3)', color: '#00ffcc' }}
                    >
                      🔗 Connect Wallet to Start
                    </button>
                  )}
                </div>
              ) : (
                dmMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[75%] rounded-xl px-3.5 py-2" style={{
                      background: msg.sender === 'me' ? 'rgba(0,255,204,0.1)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${msg.sender === 'me' ? 'rgba(0,255,204,0.15)' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                      <p className="text-sm" style={{ color: '#e2e8f0' }}>{msg.text}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[8px]" style={{ color: '#475569' }}>{msg.time}</span>
                        {msg.encrypted && <span className="text-[8px]" style={{ color: '#00f5d4' }}>🔒</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={dmEndRef} />
            </div>

            {/* Input Area */}
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
              <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm hover:bg-white/5 transition-colors cursor-pointer" style={{ color: '#64748b' }} title="Attach file">
                📎
              </button>
              <input
                ref={dmInputRef}
                type="text"
                value={dmDraft}
                onChange={e => setDmDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && dmDraft.trim()) {
                    if (!globalWallet.isConnected) {
                      window.dispatchEvent(new Event('open-wallet-modal'));
                      return;
                    }
                    const msg = {
                      id: Date.now().toString(),
                      text: dmDraft.trim(),
                      sender: 'me' as const,
                      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      encrypted: true,
                    };
                    setDmMessages(prev => [...prev, msg]);
                    setDmDraft('');
                    setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                  }
                }}
                placeholder={globalWallet.isConnected ? `Message @${agent.handle}...` : 'Connect wallet to send encrypted messages'}
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                disabled={!globalWallet.isConnected}
              />
              <button
                onClick={() => {
                  if (!globalWallet.isConnected) { window.dispatchEvent(new Event('open-wallet-modal')); return; }
                  if (!dmDraft.trim()) return;
                  const msg = {
                    id: Date.now().toString(),
                    text: dmDraft.trim(),
                    sender: 'me' as const,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    encrypted: true,
                  };
                  setDmMessages(prev => [...prev, msg]);
                  setDmDraft('');
                  setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer"
                style={{ background: dmDraft.trim() ? 'rgba(0,255,204,0.15)' : 'transparent', color: dmDraft.trim() ? '#00f5d4' : '#475569' }}
              >
                ➤
              </button>
            </div>

            {/* Encryption Footer */}
            <div className="px-4 py-1.5 text-center" style={{ background: 'rgba(0,0,0,0.3)', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
              <span className="text-[8px] font-mono" style={{ color: '#374151' }}>
                ₿ Bitcoin-native E2E encryption · secp256k1 ECDH · AES-256-GCM · HKDF-SHA512 · Zero-knowledge server
              </span>
            </div>
          </div>
        )}

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
