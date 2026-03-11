'use client';

import type { Visitor } from './NexusSocial';

interface Props {
  visitor: Visitor;
  position: { x: number; y: number };
  onClose: () => void;
}

export default function UserProfilePopover({ visitor, position, onClose }: Props) {
  return (
    <div
      className="absolute z-50"
      style={{
        left: position.x + 12,
        top: position.y + 12,
      }}
    >
      <div
        className="w-64 rounded-2xl p-4"
        style={{
          background: 'rgba(12,12,20,0.92)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${visitor.color}55`,
          boxShadow: '0 15px 40px rgba(0,0,0,0.45)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-2xl">{visitor.avatar}</div>
            <div>
              <div className="text-sm font-mono" style={{ color: visitor.color }}>{visitor.username}</div>
              <div className="text-[10px] text-[#64748b]">Genome {visitor.genomeHash}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-[#64748b] hover:text-white">×</button>
        </div>
        <div className="mt-3 space-y-2 text-xs text-[#e2e8f0]">
          <div className="flex justify-between">
            <span className="text-[#64748b]">Blocks owned</span>
            <span>{visitor.blocksOwned}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#64748b]">Member since</span>
            <span>{visitor.memberSince}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#64748b]">Currently at</span>
            <span>#{visitor.blockHeight.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
