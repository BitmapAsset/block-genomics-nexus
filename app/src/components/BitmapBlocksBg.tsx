'use client';

import React from 'react';

/**
 * Animated diagonal scrolling bitmap blocks background.
 * 4 rows of varying-size blocks, alternating right↗ / left↖ direction.
 * ~35% opacity so it doesn't overpower page content.
 */

const ROWS = [
  { y: '8%',  dir: 1,  speed: 55, blocks: [18,10,14,8,22,12,16,9,20,11,15,13,17,10,19,14,12,8,21,16,18,10,14,8,22,12,16,9,20,11,15,13,17,10,19,14,12,8,21,16] },
  { y: '32%', dir: -1, speed: 62, blocks: [12,20,8,16,14,10,22,13,18,9,15,11,19,17,8,14,21,10,13,16,12,20,8,16,14,10,22,13,18,9,15,11,19,17,8,14,21,10,13,16] },
  { y: '56%', dir: 1,  speed: 58, blocks: [16,9,21,12,18,14,8,20,11,15,13,10,17,22,9,16,12,19,14,8,16,9,21,12,18,14,8,20,11,15,13,10,17,22,9,16,12,19,14,8] },
  { y: '80%', dir: -1, speed: 65, blocks: [10,18,13,22,9,16,20,12,14,8,17,11,15,19,13,10,21,16,9,18,10,18,13,22,9,16,20,12,14,8,17,11,15,19,13,10,21,16,9,18] },
];

const COLORS = ['#f7931a', '#ffcc44', '#e8860f', '#cc7400', '#ffa940'];

export default function BitmapBlocksBg() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0, opacity: 0.5 }}>
      {ROWS.map((row, ri) => {
        const totalWidth = row.blocks.reduce((s, b) => s + b + 3, 0);
        const animName = `bitmapScroll${ri}`;
        const dur = row.speed;
        return (
          <div key={ri} className="absolute w-full" style={{ top: row.y, height: '14%' }}>
            <div
              className="flex items-center gap-[3px] absolute"
              style={{
                animation: `${animName} ${dur}s linear infinite`,
                transform: `skewX(${row.dir > 0 ? -8 : 8}deg)`,
              }}
            >
              {/* Duplicate blocks for seamless loop */}
              {[...row.blocks, ...row.blocks].map((size, bi) => {
                const h = size * 3.2 + 10;
                const w = size * 2.4 + 8;
                const color = COLORS[bi % COLORS.length];
                return (
                  <div
                    key={bi}
                    style={{
                      width: `${w}px`,
                      height: `${h}px`,
                      background: `linear-gradient(135deg, ${color}22, ${color}11)`,
                      border: `1px solid ${color}18`,
                      borderRadius: '3px',
                      flexShrink: 0,
                    }}
                  />
                );
              })}
            </div>
            <style>{`
              @keyframes ${animName} {
                0% { transform: translateX(${row.dir > 0 ? '-50%' : '0%'}) skewX(${row.dir > 0 ? -8 : 8}deg); }
                100% { transform: translateX(${row.dir > 0 ? '0%' : '-50%'}) skewX(${row.dir > 0 ? -8 : 8}deg); }
              }
            `}</style>
          </div>
        );
      })}
    </div>
  );
}
