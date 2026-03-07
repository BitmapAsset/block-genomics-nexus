'use client';

import { useEffect, useRef } from 'react';
import type { ActivityEvent } from './NexusSocial';

interface Props {
  open: boolean;
  events: ActivityEvent[];
  onToggle: () => void;
}

export default function ActivityFeed({ open, events, onToggle }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, open]);

  return (
    <div
      className="fixed bottom-4 right-4 z-40 transition-transform duration-300"
      style={{
        transform: open ? 'translateX(0)' : 'translateX(90%)',
      }}
    >
      <div
        className="w-80 max-w-[90vw] rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(12,12,20,0.92)',
          backdropFilter: 'blur(18px)',
          border: '1px solid rgba(102,204,255,0.18)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
        }}
      >
        <button
          onClick={onToggle}
          className="w-full px-4 py-3 flex items-center justify-between text-xs font-mono uppercase tracking-widest"
          style={{ color: '#66ccff', background: 'rgba(10,10,15,0.7)' }}
        >
          <span>Activity Feed</span>
          <span className="text-[#94a3b8]">{open ? 'Hide' : 'Show'}</span>
        </button>
        <div ref={scrollRef} className="max-h-64 overflow-y-auto px-4 py-3 space-y-2">
          {events.length === 0 && (
            <div className="text-xs text-[#64748b]">No activity yet...</div>
          )}
          {events.map((event) => (
            <div key={event.id} className="text-xs text-[#e2e8f0]">
              <div className="text-[10px] text-[#64748b]">
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
              <div>{event.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
