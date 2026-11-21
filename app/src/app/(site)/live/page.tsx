'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BitmapBlocksBg from '@/components/BitmapBlocksBg';
import StreamPlayer, { type StreamPlayerStatus } from '@/components/nexus/StreamPlayer';
import { keepPlayingCard, liveCardStatus, mergeLiveList, parseStreamRead, recheckDelay, streamIdentity } from '@/lib/stream-read';

interface LiveStream {
  blockHeight: number;
  streamUrl: string;
  streamType: string;
  startedAt: string;
  embedUrl: string;
  ownerHandle: string | null;
  ownerAddress?: string;
  label: string | null;
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
  const [checking, setChecking] = useState(0);
  const [listRound, setListRound] = useState(0);
  const [ended, setEnded] = useState<ReadonlySet<string>>(new Set());
  const [unsure, setUnsure] = useState<ReadonlySet<string>>(new Set());
  const playing = useRef<Set<string>>(new Set());
  const endedRef = useRef<Set<string>>(new Set());
  const inFlight = useRef<Set<string>>(new Set());
  const rechecks = useRef(0);
  const shown = useRef<LiveStream[]>([]);
  const recheckIds = useRef<string[]>([]);

  // Keyed by identity (embedUrl and the server's startedAt), never by height: an identity that ended stays ended in
  // this tab, and a playing card the list left out is asked about on its own, on the 30 s tick only, one request in
  // flight per identity (lib/stream-read.ts).
  const askAgain = useCallback(async (id: string, height: number) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    let read = null;
    try {
      const r = await fetch(`/api/v1/livestream?blockHeight=${height}`);
      read = r.ok ? parseStreamRead(await r.json()) : null;
    } catch { read = null; }
    inFlight.current.delete(id);
    if (!keepPlayingCard(read, id)) {
      playing.current.delete(id);
      endedRef.current.add(id);
      setEnded(new Set(endedRef.current));
    }
    setUnsure(prev => {
      const next = new Set(prev);
      if (read !== null && read.kind === 'hidden' && read.ended === 'unconfirmed') next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const fetchStreams = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/livestream/active');
      if (!res.ok) return;
      const data = await res.json();
      const incoming: LiveStream[] = Array.isArray(data.streams) ? data.streams : [];
      const merged = mergeLiveList(shown.current, incoming, playing.current, endedRef.current);
      shown.current = merged.cards;
      recheckIds.current = merged.recheck;
      setStreams(merged.cards);
      // A row the list returns is confirmed by it: no card it returns stays "being checked".
      setUnsure(prev => { const next = new Set(prev); for (const c of incoming) next.delete(streamIdentity(c)); return next; });
      const n = typeof data.checking === 'number' ? data.checking : 0;
      if (n === 0) rechecks.current = 0;
      setChecking(n);
      setListRound(r => r + 1);
    } catch { /* the cards on screen stay */ }
  }, []);

  // The single read for each kept card: on the 30 s tick only.
  const askKept = useCallback(() => {
    for (const id of recheckIds.current) {
      const card = shown.current.find(c => streamIdentity(c) === id);
      if (card) void askAgain(id, card.blockHeight);
    }
  }, [askAgain]);

  useEffect(() => {
    async function fetchGames() {
      try {
        const gamesRes = await fetch('/api/v1/game/active');
        if (gamesRes.ok) {
          const data = await gamesRes.json();
          setGames(data.games || []);
        }
      } catch { /* silent */ }
    }
    async function fetchLive() {
      await Promise.all([fetchStreams(), fetchGames()]);
      setLoading(false);
    }
    void fetchLive();
    // The 30 s tick: the list, the games and the kept cards' single reads; nothing while the tab is hidden. It never
    // starts the re-ask count again.
    const iv = setInterval(() => {
      if (document.hidden) return;
      void fetchLive();
      askKept();
    }, 30000);
    return () => clearInterval(iv);
  }, [fetchStreams, askKept]);

  // Rows the list could not confirm in time are counted in `checking`: ask the list again after 3, 6, 12 and 24 s,
  // then wait for the tick. The count starts again only when a list answers `checking` 0.
  useEffect(() => {
    if (checking <= 0) return;
    const delay = recheckDelay(rechecks.current);
    if (delay === null) return;
    const t = setTimeout(() => {
      if (document.hidden) return;
      rechecks.current += 1;
      void fetchStreams();
    }, delay);
    return () => clearTimeout(t);
  }, [checking, listRound, fetchStreams]);

  // The 12-hour rule on this clock: a card past its 12 hours reads ENDED (liveCardStatus); re-render once a minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 60_000);
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

  // A card that reads ENDED stays until a list leaves it out; it is not counted as live.
  const liveStreamCount = streams.filter(s => liveCardStatus(s, ended, unsure, now) !== 'ended').length;
  const totalLive = liveStreamCount + games.length;

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
            className="w-full px-5 py-3 rounded-xl text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-all mb-4"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <div className="flex gap-2 justify-center">
            {([
              { key: 'all', label: '🌐 All', count: totalLive },
              { key: 'streams', label: '📺 Streams', count: liveStreamCount },
              { key: 'games', label: '🎮 Games', count: games.length },
            ] as { key: Tab; label: string; count: number }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: tab === t.key ? 'rgba(255,51,51,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tab === t.key ? 'rgba(255,51,51,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: tab === t.key ? '#ff6b6b' : '#94a3b8',
                }}
              >
                {t.label} <span className="ml-1 text-xs">{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center text-gray-400 py-20">
            <div className="text-4xl mb-4 animate-pulse">📡</div>
            <p>Scanning the Bitmap universe...</p>
          </div>
        ) : streams.length + games.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-6">🌙</div>
            <h2 className="text-xl font-bold text-gray-300 mb-2">Nothing live right now</h2>
            <p className="text-gray-400 max-w-md mx-auto mb-6">
              The Bitmap universe is quiet. Be the first to go live — own a block, click TimesSquare, and start streaming.
            </p>
            <Link
              href="/my-bitmaps"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all"
              style={{ background: 'rgba(255,51,51,0.15)', border: '1.5px solid rgba(255,51,51,0.4)', color: '#ff6b6b' }}
            >
              Get Verified → Go Live
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {(tab === 'all' || tab === 'streams') && filteredStreams.length > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" data-testid="live-streams">
                {filteredStreams.map(stream => {
                  const id = streamIdentity(stream);
                  const status: StreamPlayerStatus = liveCardStatus(stream, ended, unsure, now);
                  return (
                    <div key={id} className="mx-auto w-full max-w-[720px] xl:max-w-none rounded-xl overflow-hidden p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,51,51,0.2)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: status === 'ended' ? 'rgba(100,116,139,0.9)' : 'rgba(255,51,51,0.9)' }}>
                          {status !== 'ended' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                          <span className="text-[10px] font-bold text-white">{status === 'ended' ? 'ENDED' : 'LIVE'}</span>
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: '#94a3b8' }}>{timeSince(stream.startedAt)}</span>
                      </div>
                      <StreamPlayer key={id} blockHeight={stream.blockHeight} streamUrl={stream.streamUrl} embedUrl={stream.embedUrl} status={status} onPlay={() => { playing.current.add(id); }} />
                      <div className="flex items-center justify-between mt-2">
                        <Link href={`/world/${stream.blockHeight}`} className="text-sm font-bold text-white hover:text-red-400 transition-colors">
                          Block {stream.blockHeight.toLocaleString()} →
                        </Link>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,51,51,0.1)', color: '#ff6b6b' }}>
                          📺 {stream.streamType}
                        </span>
                      </div>
                      {stream.ownerHandle && <span className="text-[11px] text-gray-400">@{stream.ownerHandle}</span>}
                      {stream.label && <span className="text-[11px] text-gray-400 ml-2">{stream.label}</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {(tab === 'all' || tab === 'games') && filteredGames.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredGames.map(game => (
                  <Link
                    key={`game-${game.blockHeight}`}
                    href={`/world/${game.blockHeight}`}
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
                        <span className="text-[11px] text-gray-400">@{game.ownerHandle}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
