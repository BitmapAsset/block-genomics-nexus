'use client';

import { useState, useCallback } from 'react';
import { TOTAL_BLOCKS } from './NexusBlockData';

interface Props {
  onSearch: (height: number) => void;
}

export default function NexusSearch({ onSearch }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 0 && n < TOTAL_BLOCKS) {
      onSearch(n);
    }
  }, [value, onSearch]);

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search block #..."
          className="w-44 px-3 py-1.5 text-xs font-mono rounded-lg outline-none"
          style={{
            background: 'rgba(18,18,26,0.8)',
            border: '1px solid rgba(102,204,255,0.15)',
            color: '#e2e8f0',
            backdropFilter: 'blur(8px)',
          }}
        />
      </div>
      <button
        type="submit"
        className="px-3 py-1.5 text-xs font-mono rounded-lg transition-all hover:scale-105"
        style={{
          background: 'rgba(102,204,255,0.15)',
          border: '1px solid rgba(102,204,255,0.25)',
          color: '#66ccff',
        }}
      >
        Go
      </button>
    </form>
  );
}
