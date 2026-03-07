'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BitmapBlocksBg from '@/components/BitmapBlocksBg';

interface LiveStream {
  blockHeight: number;
  streamUrl: string;
  streamType: string;
  startedAt: string;
  embedUrl: string;
  ownerHandle?: string;
  ownerAddress?: string;
  label?: string;
}

interface LiveGame {
  blockHeight: number;
  elementCount: number;
  playerCount: number;
  ownerHandle?: string;
  label?: string;
}

type Tab = 'streams' | 'games' | 'all';

export default function LivePage() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [games, setGames] = useState<LiveGame[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLive() {
      setLoading(true);
      try {
        const [streamsRes, gamesRes] = await Promise.all([
          fetch('/api/v1/livestream/active'),
          fetch('/api/v1/game/active'),
        ]);
        if (streamsRes.ok) {
          const data = await streamsRes.json();
          setStreams(data.streams || []);
        }
        if (gamesRes.ok) {
          const data = await gamesRes.json();
          setGames(data.games || []);
        }
      } catch { /* silent */ }
      setLoading(false);
    }
    fetchLive();
    const iv = setInterval(fetchLive, 30000);
    return () => clearInterval(iv);
  }, []);

  const filtered = search.trim().toLowerCase();
  const filteredStreams = streams.filter(s =>
    !filtered ||
    s.blockHeight.toString().includes(filtered) ||
    s.ownerHandle?.toLowerCase().includes(filtered) ||
    s.label?.toLowerCase().includes(filtered) ||
    s.streamType.toLowerCase().includes(filtered)
  );
  const filteredGames = games.filter(g =>
    !filtered ||
    g.blockHeight.toString().includes(filtered) ||
    g.ownerHandle?.toLowerCase().includes(filtered) ||
    g.label?.toLowerCase().includes(filtered)
  );

  const totalLive = streams.length + games.length;

  function timeSince(iso: string) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  }

  return (
    <div className="relative min-h-screen bg-[#0a0a12] text-white">
      <BitmapBlocksBg />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">

        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
            📺 <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">TimesSquare</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto mb-2">
            Live streams, games, and events happening across the Bitmap universe right now.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-red-400 font-mono font-bold">{totalLive} LIVE NOW</span>
          </div>
        </div>

        {/* Search + Tabs */}
        <div className="mb-8 max-w-2xl mx-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by block #, handle, or keyword..."
            className="w-full px-5 py-3 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-all mb-4"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <div className="flex gap-2 justify-center">
            {([
              { key: 'all', label: '🌐 All', count: totalLive },
              { key: 'streams', label: '📺 Streams', count: streams.length },
              { key: 'games', label: '🎮 Games', count: games.length },
            ] as { key: Tab; label: string; count: number }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: tab === t.key ? 'rgba(255,51,51,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tab === t.key ? 'rgba(255,51,51,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: tab === t.key ? '#ff6b6b' : '#64748b',
                }}
              >
                {t.label} <span className="ml-1 text-xs opacity-60">{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center text-gray-500 py-20">
            <div className="text-4xl mb-4 animate-pulse">📡</div>
            <p>Scanning the Bitmap universe...</p>
          </div>
        ) : totalLive === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-6">🌙</div>
            <h2 className="text-xl font-bold text-gray-300 mb-2">Nothing live right now</h2>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              The Bitmap universe is quiet. Be the first to go live — own a block, click TimesSquare, and start streaming.
            </p>
            <Link
              href="/verify"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all"
              style={{ background: 'rgba(255,51,51,0.15)', border: '1.5px solid rgba(255,51,51,0.4)', color: '#ff6b6b' }}
            >
              Get Verified → Go Live
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Streams */}
            {(tab === 'all' || tab === 'streams') && filteredStreams.map(stream => (
              <Link
                key={`stream-${stream.blockHeight}`}
                href={`/nexus/parcel/${stream.blockHeight}`}
                className="group rounded-xl overflow-hidden transition-all hover:scale-[1.02]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,51,51,0.2)' }}
              >
                {/* Embed preview */}
                <div className="relative aspect-video bg-black">
                  <iframe
                    src={stream.embedUrl}
                    width="100%"
                    height="100%"
                    allow="autoplay; encrypted-media"
                    style={{ border: 'none', pointerEvents: 'none' }}
                  />
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: 'rgba(255,51,51,0.9)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] font-bold text-white">LIVE</span>
                  </div>
                  <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.7)', color: '#94a3b8' }}>
                    {timeSince(stream.startedAt)}
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">
                      Block {stream.blockHeight.toLocaleString()}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,51,51,0.1)', color: '#ff6b6b' }}>
                      📺 {stream.streamType}
                    </span>
                  </div>
                  {stream.ownerHandle && (
                    <span className="text-[11px] text-gray-500">@{stream.ownerHandle}</span>
                  )}
                  {stream.label && (
                    <span className="text-[11px] text-gray-500 ml-2">{stream.label}</span>
                  )}
                </div>
              </Link>
            ))}

            {/* Games */}
            {(tab === 'all' || tab === 'games') && filteredGames.map(game => (
              <Link
                key={`game-${game.blockHeight}`}
                href={`/nexus/parcel/${game.blockHeight}`}
                className="group rounded-xl overflow-hidden transition-all hover:scale-[1.02]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,255,136,0.2)' }}
              >
                <div className="relative aspect-video flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a1628, #1a0a28)' }}>
                  <div className="text-6xl">🎮</div>
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: 'rgba(0,255,136,0.9)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] font-bold text-black">PLAYING</span>
                  </div>
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.7)', color: '#00ff88' }}>
                    {game.playerCount} player{game.playerCount !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white group-hover:text-green-400 transition-colors">
                      Block {game.blockHeight.toLocaleString()}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88' }}>
                      🎮 {game.elementCount} elements
                    </span>
                  </div>
                  {game.ownerHandle && (
                    <span className="text-[11px] text-gray-500">@{game.ownerHandle}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
