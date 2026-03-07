'use client';

import { useState } from 'react';
import type { ChatMessage } from './NexusSocial';

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export default function BlockChat({ messages, onSend }: Props) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && (
          <div className="text-xs text-[#64748b]">No messages yet. Start the conversation.</div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="rounded-lg px-3 py-2" style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(102,204,255,0.08)' }}>
            <div className="flex items-center justify-between text-[10px] text-[#64748b]">
              <span className="font-mono" style={{ color: msg.username === 'You' ? '#66ccff' : '#94a3b8' }}>{msg.username}</span>
              <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="text-sm text-[#e2e8f0] mt-1">{msg.text}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder="Send a message..."
          className="flex-1 px-3 py-2 rounded-lg text-sm bg-transparent border border-[#1f2a3a] text-[#e2e8f0] focus:outline-none focus:border-[#66ccff]"
        />
        <button
          onClick={handleSend}
          className="px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'rgba(102,204,255,0.2)', color: '#66ccff', border: '1px solid rgba(102,204,255,0.3)' }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
