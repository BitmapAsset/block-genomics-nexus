'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import CrownShield, { ShieldTier } from '@/components/CrownShield';

// ─── Types ─────────────────────────────────────────────────────────
export type ChatMode = 'block' | 'dm' | 'global';

interface ReactionMap {
  [emoji: string]: { count: number; wallets: string[] };
}

export interface ChatMsg {
  id: string;
  blockHeight: number;
  senderAddress: string;
  senderHandle: string;
  senderTier: number;
  senderVerified: boolean;
  text: string;
  type: string;
  mediaUrl?: string | null;
  replyToId?: string | null;
  channel: string;
  createdAt: string;
  reactions: ReactionMap;
}

interface ChatWindowProps {
  blockHeight: number;
  walletAddress: string | null;
  /** For signing messages */
  signMessage?: (msg: string) => Promise<{ signature: string; message: string }>;
  /** DM target address */
  dmTarget?: string | null;
  /** Initial mode */
  defaultMode?: ChatMode;
  /** Supabase realtime incoming messages (parent can push) */
  realtimeMessages?: ChatMsg[];
  className?: string;
}

const EMOJIS = ['❤️', '😂', '🔥', '👍', '👎', '🤯'];

// ─── Helpers ───────────────────────────────────────────────────────
function shortAddr(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Component ─────────────────────────────────────────────────────
export default function ChatWindow({
  blockHeight,
  walletAddress,
  signMessage,
  dmTarget,
  defaultMode = 'block',
  realtimeMessages,
  className = '',
}: ChatWindowProps) {
  const [mode, setMode] = useState<ChatMode>(defaultMode);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [oldestId, setOldestId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  // ── Fetch history ──────────────────────────────────────────────
  const fetchHistory = useCallback(
    async (before?: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (mode === 'dm' && dmTarget && walletAddress) {
          params.set('mode', 'dm');
          params.set('dmWith', dmTarget);
          params.set('wallet', walletAddress);
        } else if (mode === 'global') {
          params.set('mode', 'global');
        } else {
          params.set('mode', 'block');
          params.set('blockHeight', String(blockHeight));
        }
        if (before) params.set('before', before);

        const res = await fetch(`/api/v1/chat/history?${params}`);
        const json = await res.json();
        if (json.success) {
          const { messages: msgs, hasMore: more, oldestId: oid } = json.data;
          if (before) {
            setMessages((prev) => [...msgs, ...prev]);
          } else {
            setMessages(msgs);
          }
          setHasMore(more);
          setOldestId(oid);
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    },
    [mode, blockHeight, dmTarget, walletAddress]
  );

  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    setOldestId(null);
    fetchHistory();
  }, [fetchHistory]);

  // ── Realtime messages from parent ──────────────────────────────
  useEffect(() => {
    if (!realtimeMessages?.length) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const newMsgs = realtimeMessages.filter((m) => !ids.has(m.id));
      return newMsgs.length ? [...prev, ...newMsgs] : prev;
    });
  }, [realtimeMessages]);

  // ── Auto-scroll ────────────────────────────────────────────────
  useEffect(() => {
    if (isAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // ── Send message ───────────────────────────────────────────────
  const handleSend = async () => {
    if (!text.trim() || !walletAddress || !signMessage || sending) return;
    setSending(true);
    try {
      const { signature, message } = await signMessage(`chat:${Date.now()}`);
      const res = await fetch(`/api/v1/chat/${blockHeight}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderAddress: walletAddress,
          text: text.trim(),
          channel: mode,
          signature,
          message,
        }),
      });
      if (res.ok) {
        setText('');
        // Message will arrive via realtime or we add it optimistically
        const json = await res.json();
        if (json.data) {
          const optimistic: ChatMsg = {
            ...json.data,
            senderHandle: 'You',
            senderTier: 3,
            senderVerified: false,
            channel: mode,
            reactions: {},
          };
          setMessages((prev) => {
            if (prev.find((m) => m.id === optimistic.id)) return prev;
            return [...prev, optimistic];
          });
          isAtBottom.current = true;
        }
      }
    } catch {
      /* silent */
    } finally {
      setSending(false);
    }
  };

  // ── React to message ──────────────────────────────────────────
  const handleReact = async (messageId: string, emoji: string) => {
    if (!walletAddress || !signMessage) return;
    setPickerMsgId(null);
    try {
      const { signature, message } = await signMessage(`react:${Date.now()}`);
      const res = await fetch('/api/v1/chat/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji, walletAddress, signature, message }),
      });
      const json = await res.json();
      if (json.success) {
        // Optimistic update
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const reactions = { ...m.reactions };
            if (json.data.action === 'added') {
              if (!reactions[emoji]) reactions[emoji] = { count: 0, wallets: [] };
              reactions[emoji] = {
                count: reactions[emoji].count + 1,
                wallets: [...reactions[emoji].wallets, walletAddress],
              };
            } else {
              if (reactions[emoji]) {
                reactions[emoji] = {
                  count: reactions[emoji].count - 1,
                  wallets: reactions[emoji].wallets.filter((w) => w !== walletAddress),
                };
                if (reactions[emoji].count <= 0) delete reactions[emoji];
              }
            }
            return { ...m, reactions };
          })
        );
      }
    } catch {
      /* silent */
    }
  };

  const isOwn = (msg: ChatMsg) => walletAddress && msg.senderAddress === walletAddress;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col bg-[#0d1117] rounded-xl border border-gray-800 overflow-hidden ${className}`} style={{ height: '500px' }}>
      {/* Mode tabs */}
      <div className="flex border-b border-gray-800 bg-[#161b22]">
        {(['block', 'dm', 'global'] as ChatMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === m
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {m === 'block' ? '💬 Block Chat' : m === 'dm' ? '🔒 DMs' : '🌐 Global'}
          </button>
        ))}
      </div>

      {/* Messages area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scroll-smooth"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}
      >
        {/* Load more */}
        {hasMore && (
          <div className="text-center py-2">
            <button
              onClick={() => fetchHistory(oldestId)}
              disabled={loading}
              className="text-xs text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 transition-colors"
            >
              {loading ? '⏳ Loading...' : '↑ Load older messages'}
            </button>
          </div>
        )}

        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="text-center text-gray-600 text-sm py-12">No messages yet. Say something!</div>
        )}

        {messages.map((msg) => {
          const own = isOwn(msg);
          return (
            <div key={msg.id} className={`flex ${own ? 'justify-end' : 'justify-start'} group`}>
              <div className={`max-w-[80%] ${own ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Sender info (others only) */}
                {!own && (
                  <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                    <CrownShield tier={(msg.senderTier as ShieldTier) || 3} size={16} />
                    <span className="text-[11px] font-medium text-cyan-400/80">{msg.senderHandle}</span>
                    <span className="text-[10px] text-gray-600">{shortAddr(msg.senderAddress)}</span>
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={`relative px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                    own
                      ? 'bg-gradient-to-br from-cyan-600/30 to-blue-600/20 text-gray-100 rounded-br-md'
                      : 'bg-[#1c2333] text-gray-200 rounded-bl-md'
                  }`}
                >
                  <span>{msg.text}</span>
                  <span className={`text-[10px] text-gray-500 ml-2 float-right mt-1 ${own ? 'text-cyan-400/40' : ''}`}>
                    {fmtTime(msg.createdAt)}
                  </span>
                </div>

                {/* Reactions */}
                <div className="flex items-center gap-1 mt-0.5 ml-1 flex-wrap">
                  {Object.entries(msg.reactions).map(([emoji, data]) => {
                    const myReaction = walletAddress ? data.wallets.includes(walletAddress) : false;
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReact(msg.id, emoji)}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition-all ${
                          myReaction
                            ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                            : 'bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:bg-gray-700/50'
                        }`}
                      >
                        <span>{emoji}</span>
                        <span>{data.count}</span>
                      </button>
                    );
                  })}

                  {/* Reaction picker trigger (on hover) */}
                  <div className="relative">
                    <button
                      onClick={() => setPickerMsgId(pickerMsgId === msg.id ? null : msg.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-400 text-[11px] px-1 transition-opacity"
                    >
                      +😊
                    </button>
                    {pickerMsgId === msg.id && (
                      <div className="absolute bottom-6 left-0 z-50 flex gap-1 bg-[#1c2333] border border-gray-700 rounded-lg px-2 py-1.5 shadow-xl">
                        {EMOJIS.map((e) => (
                          <button
                            key={e}
                            onClick={() => handleReact(msg.id, e)}
                            className="text-base hover:scale-125 transition-transform"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-800 bg-[#161b22] px-3 py-2 flex items-end gap-2">
        <button className="text-gray-500 hover:text-gray-300 text-lg pb-1 transition-colors" title="Attach">
          📎
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={walletAddress ? 'Type a message...' : 'Connect wallet to chat'}
          disabled={!walletAddress}
          rows={1}
          className="flex-1 bg-[#0d1117] border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-cyan-500/50 disabled:opacity-40 transition-colors"
          style={{ maxHeight: '120px', minHeight: '36px' }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || !walletAddress || sending}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl px-3 py-2 text-sm font-semibold transition-colors"
        >
          {sending ? '...' : '➤'}
        </button>
      </div>
    </div>
  );
}
