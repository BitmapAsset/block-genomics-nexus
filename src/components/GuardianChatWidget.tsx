'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

interface Props {
  blockHeight: number;
  guardianName: string;
  visitorAddress?: string;
  visitorHandle?: string;
}

export default function GuardianChatWidget({ blockHeight, guardianName, visitorAddress, visitorHandle }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, ts: Date.now() }]);
    setSending(true);

    try {
      const res = await fetch('/api/v1/guardian/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockHeight, message: msg, visitorAddress, visitorHandle, conversationId }),
      });
      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages(prev => [...prev, { role: 'assistant', content: data.response || data.error || 'No response', ts: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.', ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[9998] w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all hover:scale-110"
        style={{
          background: 'linear-gradient(135deg, #0a0e17, #111827)',
          border: '2px solid rgba(0,255,136,0.4)',
          boxShadow: '0 0 30px rgba(0,255,136,0.2)',
        }}
      >
        🛡️
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-[9998] w-80 rounded-2xl overflow-hidden flex flex-col"
      style={{
        height: 420,
        background: 'linear-gradient(135deg, #0a0e17 0%, #111827 100%)',
        border: '1px solid rgba(0,255,136,0.2)',
        boxShadow: '0 0 40px rgba(0,255,136,0.1)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <span>🛡️</span>
          <div>
            <div className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{guardianName}</div>
            <div className="text-[10px]" style={{ color: '#00ff88' }}>● Online</div>
          </div>
        </div>
        <button onClick={() => setOpen(false)} style={{ color: '#64748b' }}>✕</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs py-8" style={{ color: '#64748b' }}>
            👋 Say hello to the guardian of Block #{blockHeight}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] px-3 py-2 rounded-xl text-xs"
              style={{
                background: m.role === 'user' ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.04)',
                color: m.role === 'user' ? '#00ff88' : '#e2e8f0',
                border: `1px solid ${m.role === 'user' ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl text-xs animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', color: '#64748b' }}>
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', opacity: sending || !input.trim() ? 0.4 : 1 }}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
