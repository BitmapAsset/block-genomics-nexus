'use client';

import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { generateBlock, getEpochColor, getEpoch } from './NexusBlockData';
import { fetchRealBlock, type RealBlockData } from '@/lib/blockchainApi';
import Helix from '../dna/Helix';
import CrownShield from '../CrownShield';
import { useGlobalWallet } from '@/context/GlobalWalletContext';
import { getStoredAddress, getStoredType } from '@/lib/wallet-utils';
import { useShowcaseBuildings, ShowcaseCityRenderer, isFeaturedBlock } from './ShowcaseCity';
import { useRealtimeChat, usePresence, type RealtimeChatMessage } from '@/hooks/useRealtimeChat';
import GuardianConfigPanel from '../GuardianConfigPanel';
import GuardianChatWidget from '../GuardianChatWidget';
import WorldBuilderPanel, { type WorldObject, type TerrainSettings } from './WorldBuilderPanel';
import WorldObjects, { useWorldObjects } from './WorldObjects';
import GameObjects3D from './GameObjects3D';
import GameHUD from './GameHUD';
import type { GameElement } from './GameElementsPanel';
import UpgradeModal from './UpgradeModal';
import TransferPrepModal from './TransferPrepModal';

/* ─── Types ─── */
interface ParcelData {
  txIndex: number;
  bytes: number;
  value: number;
  isCoinbase: boolean;
  // Treemap layout (proportional to vbytes)
  x: number;      // world x position
  z: number;      // world z position
  width: number;  // parcel width in world units
  depth: number;  // parcel depth in world units
  areaSqMeters: number;
  heightMeters: number;
  buildHeight: number; // normalized 0-1
  color: string;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  type: 'text' | 'image' | 'gif' | 'link' | 'encrypted';
  isOwner?: boolean;
  ownerData?: OwnerData;
  isDemo?: boolean; // true for mock/seed messages
  createdAt?: string; // ISO timestamp from DB
}

interface OwnerData {
  handle: string;
  tier: 1 | 2 | 3;
  verified: boolean;
  avatar?: string;
}

interface FlyTarget {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  closeUp?: boolean;
}

/* ─── Land Customization Types ─── */
interface ParcelCustomization {
  color?: string;           // hex color override
  pattern?: PatternType;    // pattern preset
  imageUrl?: string;        // uploaded image URL (data: or blob:)
  opacity?: number;         // pattern/image opacity 0-1
  rotation?: number;        // image rotation in degrees (0, 90, 180, 270, or free)
  facing?: 'top' | 'front' | 'back' | 'left' | 'right'; // which face to show image on
  emissive?: boolean;       // glow effect
}

interface BlockCustomization {
  groundColor?: string;     // block ground plane color
  skyColor?: string;        // ambient sky tint
  label?: string;           // floating block label
}

type PatternType = 'none' | 'stripes' | 'checkerboard' | 'dots' | 'circuit' | 'diamond' | 'gradient-radial' | 'bitcoin' | 'waves' | 'hex';

const PATTERN_PRESETS: { key: PatternType; label: string; icon: string }[] = [
  { key: 'none', label: 'None', icon: '⬜' },
  { key: 'stripes', label: 'Stripes', icon: '▤' },
  { key: 'checkerboard', label: 'Checker', icon: '▦' },
  { key: 'dots', label: 'Dots', icon: '⚬' },
  { key: 'circuit', label: 'Circuit', icon: '⌬' },
  { key: 'diamond', label: 'Diamond', icon: '◇' },
  { key: 'gradient-radial', label: 'Radial', icon: '◎' },
  { key: 'bitcoin', label: 'Bitcoin', icon: '₿' },
  { key: 'waves', label: 'Waves', icon: '〰' },
  { key: 'hex', label: 'Hex', icon: '⬡' },
];

const COLOR_PALETTE = [
  '#f7931a', '#ff6b35', '#ff3366', '#cc33ff', '#6633ff',
  '#3366ff', '#00ccff', '#00ff88', '#88ff00', '#ffcc00',
  '#ff9999', '#cc6600', '#663300', '#333333', '#666666',
  '#999999', '#ffffff', '#1a1a2e', '#16213e', '#0f3460',
];

interface Props {
  blockHeight: number;
  onBack: () => void;
}

type ViewMode = 'flat' | 'isometric' | 'heights' | 'dna' | 'street' | 'standard' | 'flyover';
type RightTab = 'properties' | 'chat' | 'rank' | 'gaming';
type PanelSize = 'compact' | 'quarter' | 'third' | 'half' | 'hidden';
const PANEL_WIDTHS: Record<PanelSize, string> = { compact: 'w-80', quarter: 'w-96', third: 'w-[33vw]', half: 'w-[50vw]', hidden: 'w-0' };

/* ─── Deterministic RNG ─── */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ═══════════════════════════════════════════
   SQUARIFIED TREEMAP ALGORITHM
   ═══════════════════════════════════════════ */

interface TreemapItem {
  index: number;
  weight: number;
}

interface TreemapRect {
  index: number;
  x: number;
  z: number;
  width: number;
  depth: number;
}

/**
 * Bitfeed-standard Mondrian square packing layout.
 * Each tx becomes a SQUARE with side = ceil(sqrt(vbytes / 256)).
 * Squares are packed into a grid using slot-based bin packing.
 * This produces the distinctive bitmap look seen on Bitfeed.live and Bitmap.Community.
 */
function txSquareSize(vbytes: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(vbytes / 256)));
}

function mondrianLayout(
  items: TreemapItem[],
  originX: number,
  originZ: number,
  blockSize: number,
  gap: number
): TreemapRect[] {
  // Calculate grid sizes for each tx
  const squares = items.map(it => ({
    index: it.index,
    gridSize: txSquareSize(it.weight),
  }));

  // Natural transaction order (as they appear in the block) — matches Bitfeed/Magic Eden standard
  // Bitfeed places txs in arrival order, NOT sorted by size

  // Calculate total grid area to determine grid dimensions
  const totalGridArea = squares.reduce((s, sq) => s + sq.gridSize * sq.gridSize, 0);
  const gridWidth = Math.ceil(Math.sqrt(totalGridArea));

  // Scale factor: map grid units to world units
  const scale = blockSize / gridWidth;

  // Standard bitmap images use thin gaps (~2-3% of cell)
  // Bitfeed's 50% padding is only for the animated live view, not the standard bitmap
  const cellGap = Math.max(scale * 0.06, blockSize * 0.002);

  // 2D occupancy grid for packing
  const gridH = gridWidth + 50; // extra rows for overflow
  const occupied: boolean[][] = [];
  for (let r = 0; r < gridH; r++) {
    occupied.push(new Array(gridWidth).fill(false));
  }

  const results: TreemapRect[] = [];

  for (const sq of squares) {
    const size = sq.gridSize;
    let placed = false;

    // Scan grid for first available position (top-left to bottom-right)
    for (let row = 0; row < gridH - size + 1 && !placed; row++) {
      for (let col = 0; col <= gridWidth - size && !placed; col++) {
        // Check if this area is free
        let fits = true;
        for (let dr = 0; dr < size && fits; dr++) {
          for (let dc = 0; dc < size && fits; dc++) {
            if (occupied[row + dr][col + dc]) fits = false;
          }
        }
        if (fits) {
          // Mark occupied
          for (let dr = 0; dr < size; dr++) {
            for (let dc = 0; dc < size; dc++) {
              occupied[row + dr][col + dc] = true;
            }
          }
          // Convert grid coords to world coords with proportional gaps
          const halfGap = cellGap / 2;
          results.push({
            index: sq.index,
            x: originX + col * scale + halfGap,
            z: originZ + row * scale + halfGap,
            width: Math.max(0.01, size * scale - cellGap),
            depth: Math.max(0.01, size * scale - cellGap),
          });
          placed = true;
        }
      }
    }

    // Failsafe: if somehow not placed, put at end
    if (!placed) {
      results.push({
        index: sq.index,
        x: originX + cellGap / 2,
        z: originZ + (gridH - size) * scale + cellGap / 2,
        width: Math.max(0.01, size * scale - cellGap),
        depth: Math.max(0.01, size * scale - cellGap),
      });
    }
  }

  return results;
}

/* ═══════════════════════════════════════════
   MOCK DATA LAYER
   ═══════════════════════════════════════════ */

/* MOCK — replace with API */
const MOCK_HANDLES = [
  'satoshi_hodler', 'bitmap_maxi', 'block_builder', 'nexus_dev', 'anon_miner',
  'crypto_whale', 'pixel_punk', 'chain_surfer', 'hash_hunter', 'node_runner',
  'btc_stacker', 'digital_nomad', 'rune_crafter', 'ordinal_og', 'taproot_fan',
  'mempool_watcher', 'utxo_king', 'genesis_block', 'lightning_lord', 'sig_hash',
];

const MOCK_AVATARS = ['⚡', '🔥', '💎', '🏴‍☠️', '🐋', '🧬', '🪐', '🎯', '🦊', '👾'];

/* MOCK — replace with API */
interface Estate {
  id: string;
  name: string;
  ownerHandle: string;
  ownerTier: 1 | 2;
  parcelIndices: number[]; // txIndex array of merged parcels
  color?: string; // custom color
  glowColor: string; // neon glow color
  created: number;
}

const ESTATE_NAMES = ['Bitcoin Citadel', 'Satoshi Plaza', 'The Nexus Hub', 'Hash Tower Complex', 'Lightning District', 'Genesis Gardens'];
const NEON_COLORS = ['#00ffff', '#ff00ff', '#00ff88', '#ffcc00', '#aa44ff', '#ff4444'];

/* MOCK — replace with API */
function generateMockEstates(blockHeight: number, parcels: ParcelData[]): Estate[] {
  if (parcels.length < 6) return [];
  const rng = seededRandom(blockHeight * 13337);
  const estateCount = 1 + Math.floor(rng() * 2); // 1-2 estates (reduced to avoid collisions)
  const used = new Set<number>();
  const estates: Estate[] = [];

  // Helper: check if two parcels are spatially adjacent (bounding boxes touch/overlap)
  const isAdjacent = (a: ParcelData, b: ParcelData): boolean => {
    const margin = TREEMAP_GAP * 2;
    const aLeft = a.x - a.width / 2, aRight = a.x + a.width / 2;
    const aTop = a.z - a.depth / 2, aBottom = a.z + a.depth / 2;
    const bLeft = b.x - b.width / 2, bRight = b.x + b.width / 2;
    const bTop = b.z - b.depth / 2, bBottom = b.z + b.depth / 2;
    // Check they overlap on one axis and touch on the other
    const overlapX = aLeft < bRight + margin && aRight > bLeft - margin;
    const overlapZ = aTop < bBottom + margin && aBottom > bTop - margin;
    const touchX = Math.abs(aRight - bLeft) < margin * 3 || Math.abs(bRight - aLeft) < margin * 3;
    const touchZ = Math.abs(aBottom - bTop) < margin * 3 || Math.abs(bBottom - aTop) < margin * 3;
    return (overlapX && touchZ) || (overlapZ && touchX);
  };

  for (let e = 0; e < estateCount; e++) {
    const size = 2 + Math.floor(rng() * 3); // 2-4 parcels (smaller to ensure adjacency)
    let start = 1 + Math.floor(rng() * (parcels.length - 1));
    let attempts = 0;
    while (used.has(start) && attempts < 50) { start = 1 + Math.floor(rng() * (parcels.length - 1)); attempts++; }
    if (used.has(start)) continue;

    const indices: number[] = [start];
    used.add(start);

    // Grow by finding spatially adjacent parcels in the treemap
    for (let s = 1; s < size; s++) {
      let found = false;
      for (let candidate = 0; candidate < parcels.length; candidate++) {
        if (used.has(candidate) || candidate === 0) continue;
        // Check if candidate is adjacent to ANY parcel already in estate
        const adj = indices.some(idx => isAdjacent(parcels[idx], parcels[candidate]));
        if (adj) {
          indices.push(candidate);
          used.add(candidate);
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    if (indices.length < 2) continue;

    const nameIdx = e % ESTATE_NAMES.length;
    const ownerIdx = Math.floor(rng() * MOCK_HANDLES.length);
    estates.push({
      id: `estate-${blockHeight}-${e}`,
      name: ESTATE_NAMES[nameIdx],
      ownerHandle: MOCK_HANDLES[ownerIdx],
      ownerTier: rng() < 0.4 ? 1 : 2,
      parcelIndices: indices,
      glowColor: NEON_COLORS[e % NEON_COLORS.length],
      created: blockHeight - Math.floor(rng() * 1000),
    });
  }

  return estates;
}

/* MOCK — replace with API */
function generateMockOwner(blockHeight: number, txIndex: number): OwnerData {
  const rng = seededRandom(blockHeight * 9973 + txIndex * 6991);
  const handleIdx = Math.floor(rng() * MOCK_HANDLES.length);
  const tierRoll = rng();
  const tier: 1 | 2 | 3 = tierRoll < 0.15 ? 1 : tierRoll < 0.45 ? 2 : 3;
  const avatarIdx = Math.floor(rng() * MOCK_AVATARS.length);
  return {
    handle: MOCK_HANDLES[handleIdx],
    tier,
    verified: tier === 1 || rng() > 0.5,
    avatar: MOCK_AVATARS[avatarIdx],
  };
}

/* MOCK — replace with API */
function generateMockVisitors(blockHeight: number): number {
  const rng = seededRandom(blockHeight * 4217);
  return 1 + Math.floor(rng() * 50);
}

/* ─── Block size constant ─── */
const BLOCK_SIZE = 20; // 20×20 world units = 2.1km × 2.1km conceptually
const TREEMAP_GAP = 0.15; // Base gap — actual gap is proportional to cell scale (see mondrianLayout)
const METERS_PER_UNIT = 2100 / BLOCK_SIZE; // 105 meters per world unit

/* ─── Generate parcels with treemap layout ─── */
/* Uses real blockchain data when available, falls back to mock */
function generateParcels(blockHeight: number, realBlock?: RealBlockData | null): ParcelData[] {
  const block = generateBlock(blockHeight);
  const rng = seededRandom(blockHeight * 7919);
  const rawParcels: { txIndex: number; bytes: number; value: number; isCoinbase: boolean }[] = [];

  if (realBlock && realBlock.txs.length > 0) {
    // ═══ REAL BLOCKCHAIN DATA ═══
    for (const tx of realBlock.txs) {
      const value = tx.isCoinbase
        ? 3.125 + (tx.fee / 100_000_000)
        : tx.fee / 100_000_000 || 0.0001 + rng() * 0.1;
      rawParcels.push({
        txIndex: tx.txIndex,
        bytes: tx.size,
        value,
        isCoinbase: tx.isCoinbase,
      });
    }
  } else {
    // ═══ MOCK FALLBACK ═══
    for (let i = 0; i < block.txCount; i++) {
      const isCoinbase = i === 0;
      let bytes: number;
      if (isCoinbase) {
        bytes = 200 + Math.floor(rng() * 400);
      } else {
        // Realistic Bitcoin tx size distribution matching real blocks
        // ~60% small (140-256 vbytes), ~25% medium (257-800), ~10% large (801-3000), ~5% very large (3000-65000)
        const u = rng();
        if (u < 0.60) {
          bytes = 140 + Math.floor(rng() * 116); // 140-256
        } else if (u < 0.85) {
          bytes = 257 + Math.floor(rng() * 543); // 257-800
        } else if (u < 0.95) {
          bytes = 801 + Math.floor(rng() * 2199); // 801-3000
        } else if (u < 0.99) {
          bytes = 3001 + Math.floor(rng() * 12000); // 3001-15000
        } else {
          bytes = 15001 + Math.floor(rng() * 50000); // 15001-65000 (rare large txs)
        }
      }
      const value = isCoinbase
        ? 3.125 + rng() * 2
        : rng() < 0.02 ? 1 + rng() * 50
        : rng() < 0.1 ? 0.1 + rng() * 1
        : 0.0001 + rng() * 0.1;

      rawParcels.push({ txIndex: i, bytes, value, isCoinbase });
    }
  }

  const maxValue = Math.max(...rawParcels.map(p => p.value));

  // Bitfeed-standard Mondrian square packing layout
  const halfSize = BLOCK_SIZE / 2;
  const treemapItems: TreemapItem[] = rawParcels.map(p => ({ index: p.txIndex, weight: p.bytes }));
  const rects = mondrianLayout(treemapItems, -halfSize, -halfSize, BLOCK_SIZE, TREEMAP_GAP);

  // Build lookup from txIndex to rect
  const rectMap = new Map<number, TreemapRect>();
  for (const r of rects) rectMap.set(r.index, r);

  const parcels: ParcelData[] = rawParcels.map(raw => {
    const rect = rectMap.get(raw.txIndex);
    const buildHeight = Math.min(1, raw.value / Math.max(maxValue * 0.3, 0.001));
    const w = rect ? rect.width : 0.5;
    const d = rect ? rect.depth : 0.5;

    let color: string;
    if (raw.isCoinbase) {
      color = '#f7931a'; // coinbase = standard Bitcoin orange
    } else {
      // Standard bitmap orange with slight brightness variation based on tx size
      // Matches Magic Eden / Bitmap.Community / Bitfeed standard
      const rngC = seededRandom(blockHeight * 1000 + raw.txIndex);
      const light = 40 + buildHeight * 20 + rngC() * 8;
      color = `hsl(28, 90%, ${light}%)`;
    }

    return {
      txIndex: raw.txIndex,
      bytes: raw.bytes,
      value: raw.value,
      isCoinbase: raw.isCoinbase,
      x: rect ? rect.x + rect.width / 2 : 0,  // center x
      z: rect ? rect.z + rect.depth / 2 : 0,   // center z
      width: w,
      depth: d,
      areaSqMeters: Math.round(w * d * METERS_PER_UNIT * METERS_PER_UNIT),
      heightMeters: Math.max(5, buildHeight * 500),
      buildHeight,
      color,
    };
  });

  return parcels;
}

/* ─── Color helpers ─── */
function parseColor(color: string): THREE.Color {
  if (color.startsWith('#')) return new THREE.Color(color);
  if (color.startsWith('hsl')) {
    const m = color.match(/hsl\(([^,]+),\s*([^,]+)%,\s*([^)]+)%\)/);
    if (m) return new THREE.Color().setHSL(parseFloat(m[1]) / 360, parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
  }
  return new THREE.Color(color);
}

/* ═══════════════════════════════════════════
   PATTERN TEXTURE GENERATOR
   ═══════════════════════════════════════════ */

function generatePatternTexture(pattern: PatternType, color: string, size = 128): THREE.CanvasTexture | null {
  if (pattern === 'none') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = new THREE.Color(color);
  const hex = '#' + c.getHexString();
  const dark = '#' + c.clone().multiplyScalar(0.3).getHexString();
  const light = '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.3).getHexString();

  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, size, size);

  switch (pattern) {
    case 'stripes':
      ctx.strokeStyle = hex;
      ctx.lineWidth = 6;
      for (let i = -size; i < size * 2; i += 16) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
      }
      break;
    case 'checkerboard': {
      const s = size / 8;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? hex : dark;
        ctx.fillRect(x * s, y * s, s, s);
      }
      break;
    }
    case 'dots':
      ctx.fillStyle = hex;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        ctx.beginPath();
        ctx.arc(x * (size / 8) + size / 16, y * (size / 8) + size / 16, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'circuit':
      ctx.strokeStyle = hex;
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const x1 = (i * 17) % size, y1 = (i * 23) % size;
        const x2 = (x1 + 20 + (i * 7) % 40) % size, y2 = y1;
        const y3 = (y1 + 15 + (i * 11) % 30) % size;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y3); ctx.stroke();
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.arc(x2, y3, 3, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'diamond':
      ctx.fillStyle = hex;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * (size / 4) + size / 8, cy = y * (size / 4) + size / 8;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx - 12, cy);
        ctx.closePath(); ctx.fill();
      }
      break;
    case 'gradient-radial': {
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, light); grad.addColorStop(1, dark);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
      break;
    }
    case 'bitcoin':
      ctx.fillStyle = hex;
      ctx.font = `bold ${size / 3}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('₿', size / 2, size / 2);
      ctx.font = `${size / 6}px monospace`;
      ctx.fillStyle = light;
      ctx.fillText('₿', size / 4, size / 4);
      ctx.fillText('₿', size * 3 / 4, size * 3 / 4);
      break;
    case 'waves':
      ctx.strokeStyle = hex;
      ctx.lineWidth = 3;
      for (let row = 0; row < 6; row++) {
        ctx.beginPath();
        for (let x = 0; x <= size; x += 2) {
          ctx.lineTo(x, row * (size / 6) + size / 12 + Math.sin(x / 10) * 8);
        }
        ctx.stroke();
      }
      break;
    case 'hex':
      ctx.strokeStyle = hex; ctx.lineWidth = 2;
      const r = size / 8;
      for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
        const cx = col * r * 1.8 + (row % 2) * r * 0.9 + r;
        const cy = row * r * 1.6 + r;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i - Math.PI / 6;
          const method = i === 0 ? 'moveTo' : 'lineTo';
          ctx[method](cx + r * 0.8 * Math.cos(a), cy + r * 0.8 * Math.sin(a));
        }
        ctx.closePath(); ctx.stroke();
      }
      break;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/* ═══════════════════════════════════════════
   LAND CUSTOMIZATION PANEL COMPONENT
   ═══════════════════════════════════════════ */

/* MOCK — replace with API */
const CustomizeLandPanel = memo(function CustomizeLandPanel({
  parcel, customization, onChange, onImageUpload, onClose, onSave, isSaving,
}: {
  parcel: ParcelData;
  customization: ParcelCustomization;
  onChange: (c: ParcelCustomization) => void;
  onImageUpload: (file: File) => void;
  onClose: () => void;
  onSave?: () => void;
  isSaving?: boolean;
}) {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState<'color' | 'pattern' | 'image'>('color');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: '#f7931a' }}>🎨 CUSTOMIZE PARCEL {parcel.txIndex}</span>
        <button onClick={onClose} className="text-[#64748b] hover:text-white text-sm">✕</button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1">
        {(['color', 'pattern', 'image'] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            className="flex-1 py-1.5 rounded-md text-[10px] font-mono font-bold uppercase transition-all"
            style={{
              background: activeSection === s ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.03)',
              color: activeSection === s ? '#f7931a' : '#64748b',
              border: activeSection === s ? '1px solid rgba(247,147,26,0.4)' : '1px solid rgba(255,255,255,0.05)',
            }}>
            {s === 'color' ? '🎨' : s === 'pattern' ? '▦' : '🖼'} {s}
          </button>
        ))}
      </div>

      {/* Color section */}
      {activeSection === 'color' && (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-1.5">
            {COLOR_PALETTE.map(c => (
              <button key={c} onClick={() => onChange({ ...customization, color: c })}
                className="w-full aspect-square rounded-md transition-all hover:scale-110 active:scale-95"
                style={{
                  background: c,
                  border: customization.color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: customization.color === c ? `0 0 10px ${c}88` : 'none',
                }} />
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <input type="color" value={customization.color || '#f7931a'}
              onChange={e => onChange({ ...customization, color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border-0" style={{ background: 'none' }} />
            <input type="text" value={customization.color || ''} placeholder="#f7931a"
              onChange={e => onChange({ ...customization, color: e.target.value })}
              className="flex-1 bg-transparent text-[11px] font-mono px-2 py-1.5 rounded-md outline-none"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={customization.emissive ?? false}
              onChange={e => onChange({ ...customization, emissive: e.target.checked })}
              className="accent-[#f7931a]" />
            <span className="text-[10px]" style={{ color: '#94a3b8' }}>✨ Glow / Emissive</span>
          </label>
        </div>
      )}

      {/* Pattern section */}
      {activeSection === 'pattern' && (
        <div className="grid grid-cols-5 gap-1.5">
          {PATTERN_PRESETS.map(p => (
            <button key={p.key} onClick={() => onChange({ ...customization, pattern: p.key })}
              className="flex flex-col items-center gap-0.5 py-2 rounded-md transition-all hover:brightness-130"
              style={{
                background: customization.pattern === p.key ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.03)',
                border: customization.pattern === p.key ? '1px solid rgba(247,147,26,0.5)' : '1px solid rgba(255,255,255,0.05)',
              }}>
              <span className="text-lg">{p.icon}</span>
              <span className="text-[8px] font-mono" style={{ color: '#94a3b8' }}>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Image section */}
      {activeSection === 'image' && (
        <div className="space-y-2">
          <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onImageUpload(f); }} />
          <button onClick={() => imgInputRef.current?.click()}
            className="w-full py-4 rounded-xl text-[12px] font-mono transition-all hover:brightness-130 active:scale-[0.97] flex flex-col items-center gap-1"
            style={{
              background: 'rgba(247,147,26,0.08)',
              border: '1.5px dashed rgba(247,147,26,0.3)',
              color: '#f7931a',
            }}>
            <span className="text-2xl">🖼</span>
            <span>Upload Image / Art</span>
            <span className="text-[9px]" style={{ color: '#64748b' }}>PNG, JPG, GIF, WebP</span>
          </button>
          {customization.imageUrl && (
            <div className="relative rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={customization.imageUrl} alt="Parcel art" className="w-full h-24 object-cover" />
              <button onClick={() => onChange({ ...customization, imageUrl: undefined })}
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#ff4444' }}>✕</button>
            </div>
          )}
          {customization.imageUrl && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: '#64748b' }}>Opacity</span>
                <input type="range" min="0.1" max="1" step="0.05" value={customization.opacity ?? 1}
                  onChange={e => onChange({ ...customization, opacity: parseFloat(e.target.value) })}
                  className="flex-1 accent-[#f7931a]" />
                <span className="text-[10px] font-mono w-8 text-right" style={{ color: '#94a3b8' }}>
                  {Math.round((customization.opacity ?? 1) * 100)}%
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: '#64748b' }}>Rotation</span>
                  <span className="text-[10px] font-mono" style={{ color: '#94a3b8' }}>{customization.rotation ?? 0}°</span>
                </div>
                <div className="flex gap-1">
                  {[0, 90, 180, 270].map(deg => (
                    <button key={deg} onClick={() => onChange({ ...customization, rotation: deg })}
                      className="flex-1 py-1.5 rounded-md text-[10px] font-mono font-bold transition-all"
                      style={{
                        background: (customization.rotation ?? 0) === deg ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.03)',
                        color: (customization.rotation ?? 0) === deg ? '#f7931a' : '#64748b',
                        border: (customization.rotation ?? 0) === deg ? '1px solid rgba(247,147,26,0.4)' : '1px solid rgba(255,255,255,0.05)',
                      }}>
                      {deg === 0 ? '0°' : deg === 90 ? '90°↻' : deg === 180 ? '180°' : '270°↺'}
                    </button>
                  ))}
                </div>
                <input type="range" min="0" max="359" step="1" value={customization.rotation ?? 0}
                  onChange={e => onChange({ ...customization, rotation: parseInt(e.target.value) })}
                  className="w-full accent-[#f7931a]" />
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px]" style={{ color: '#64748b' }}>Place On Face</span>
                <div className="grid grid-cols-5 gap-1">
                  {([
                    { key: 'top', label: 'Top', icon: '▣' },
                    { key: 'front', label: 'South', icon: '▼' },
                    { key: 'back', label: 'North', icon: '▲' },
                    { key: 'left', label: 'West', icon: '◀' },
                    { key: 'right', label: 'East', icon: '▶' },
                  ] as const).map(f => (
                    <button key={f.key} onClick={() => onChange({ ...customization, facing: f.key })}
                      className="py-1.5 rounded-md text-[9px] font-mono font-bold transition-all flex flex-col items-center gap-0.5"
                      style={{
                        background: (customization.facing ?? 'top') === f.key ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.03)',
                        color: (customization.facing ?? 'top') === f.key ? '#f7931a' : '#64748b',
                        border: (customization.facing ?? 'top') === f.key ? '1px solid rgba(247,147,26,0.4)' : '1px solid rgba(255,255,255,0.05)',
                      }}>
                      <span className="text-sm">{f.icon}</span>
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {(customization.facing ?? 'top') === 'top' && (
                <div className="space-y-1.5">
                  <span className="text-[10px]" style={{ color: '#64748b' }}>Image Faces Toward</span>
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      { deg: 0, label: 'North', icon: '⬆' },
                      { deg: 90, label: 'East', icon: '➡' },
                      { deg: 180, label: 'South', icon: '⬇' },
                      { deg: 270, label: 'West', icon: '⬅' },
                    ]).map(d => (
                      <button key={d.deg} onClick={() => onChange({ ...customization, rotation: d.deg })}
                        className="py-1.5 rounded-md text-[9px] font-mono font-bold transition-all flex flex-col items-center gap-0.5"
                        style={{
                          background: (customization.rotation ?? 0) === d.deg ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.03)',
                          color: (customization.rotation ?? 0) === d.deg ? '#f7931a' : '#64748b',
                          border: (customization.rotation ?? 0) === d.deg ? '1px solid rgba(247,147,26,0.4)' : '1px solid rgba(255,255,255,0.05)',
                        }}>
                        <span className="text-sm">{d.icon}</span>
                        <span>{d.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Save & Reset buttons */}
      {(customization.color || customization.pattern || customization.imageUrl || customization.emissive) && (
        <div className="flex gap-2">
          {onSave && (
            <button onClick={onSave} disabled={isSaving}
              className="flex-1 py-2 rounded-lg text-[10px] font-mono font-bold transition-all hover:brightness-130 disabled:opacity-50"
              style={{ background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.4)', color: '#f7931a' }}>
              {isSaving ? '⏳ Saving...' : '💾 Save to Chain'}
            </button>
          )}
          <button onClick={() => onChange({})}
            className={`${onSave ? 'flex-1' : 'w-full'} py-2 rounded-lg text-[10px] font-mono transition-all hover:brightness-130`}
            style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)', color: '#ff4444' }}>
            🗑 Reset
          </button>
        </div>
      )}
    </div>
  );
});

/* ═══════════════════════════════════════════
   3D Scene Components
   ═══════════════════════════════════════════ */

/* ─── Ambient Particles (throttled to every 3rd frame) ─── */
function AmbientParticles({ count = 200, spread = 20 }: { count?: number; spread?: number }) {
  const ref = useRef<THREE.Points>(null);
  const frameCounter = useRef(0);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * spread;
      arr[i * 3 + 1] = Math.random() * 12 + 1;
      arr[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    return arr;
  }, [count, spread]);

  useFrame((state) => {
    frameCounter.current++;
    if (frameCounter.current % 3 !== 0) return;
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += Math.sin(t * 0.5 + i) * 0.006;
      pos[i * 3] += Math.sin(t * 0.2 + i * 0.7) * 0.003;
      pos[i * 3 + 2] += Math.cos(t * 0.15 + i * 0.3) * 0.003;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f7931a" size={0.05} transparent opacity={0.6} sizeAttenuation blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ─── Energy Beams (throttled to every 2nd frame) ─── */
function EnergyBeams({ parcels }: { parcels: ParcelData[] }) {
  const beamParcels = useMemo(() => parcels.filter(p => p.isCoinbase || p.value > 5).slice(0, 8), [parcels]);
  const ref = useRef<THREE.Group>(null);
  const frameCounter = useRef(0);

  useFrame((state) => {
    frameCounter.current++;
    if (frameCounter.current % 2 !== 0) return;
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.children.forEach((child, i) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.06 + Math.sin(t * 2 + i * 1.5) * 0.04;
      child.scale.y = 1 + Math.sin(t * 1.5 + i) * 0.2;
    });
  });

  return (
    <group ref={ref}>
      {beamParcels.map((p) => {
        const h = Math.max(0.15, p.buildHeight * 4);
        return (
          <mesh key={p.txIndex} position={[p.x, h + 4, p.z]}>
            <cylinderGeometry args={[0.02, 0.15, 8, 8]} />
            <meshBasicMaterial color={p.isCoinbase ? '#f7931a' : '#ff6622'} transparent opacity={0.08} blending={THREE.AdditiveBlending} />
          </mesh>
        );
      })}
    </group>
  );
}

/* ─── Pulsing Ground Glow (throttled to every 3rd frame) ─── */
function GroundGlow() {
  const ref = useRef<THREE.Mesh>(null);
  const frameCounter = useRef(0);
  useFrame((state) => {
    frameCounter.current++;
    if (frameCounter.current % 3 !== 0) return;
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.03 + Math.sin(state.clock.elapsedTime * 0.8) * 0.015;
  });
  const size = BLOCK_SIZE + 4;
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial color="#f7931a" transparent opacity={0.03} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/* ─── Ground + Grid ─── */
type RoadRect = { x: number; z: number; w: number; d: number };

function GroundPlane({ parcels, viewMode }: { parcels?: ParcelData[]; viewMode?: string }) {
  const size = BLOCK_SIZE + 2;
  const halfBlock = BLOCK_SIZE / 2;
  const isStreet = viewMode === 'street';

  // Road and park surfaces rendered in the gaps between parcels
  const surfaces = useMemo(() => {
    if (!parcels || parcels.length === 0) return { roads: [] as RoadRect[], parks: [] as RoadRect[] };

    const resolution = 100;
    const cellSize = BLOCK_SIZE / resolution;
    const occupied: boolean[][] = [];
    for (let r = 0; r < resolution; r++) occupied.push(new Array(resolution).fill(false));

    for (const p of parcels) {
      const c0 = Math.max(0, Math.floor((p.x + halfBlock) / cellSize));
      const r0 = Math.max(0, Math.floor((p.z + halfBlock) / cellSize));
      const c1 = Math.min(resolution - 1, Math.floor((p.x + p.width + halfBlock) / cellSize));
      const r1 = Math.min(resolution - 1, Math.floor((p.z + p.depth + halfBlock) / cellSize));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          occupied[r][c] = true;
    }

    const roads: RoadRect[] = [];
    const parks: RoadRect[] = [];
    const visited: boolean[][] = [];
    for (let r = 0; r < resolution; r++) visited.push(new Array(resolution).fill(false));

    for (let r = 0; r < resolution; r++) {
      for (let c = 0; c < resolution; c++) {
        if (occupied[r][c] || visited[r][c]) continue;
        let maxC = c;
        while (maxC < resolution && !occupied[r][maxC] && !visited[r][maxC]) maxC++;
        const w = maxC - c;
        let maxR = r;
        let valid = true;
        while (maxR < resolution && valid) {
          for (let cc = c; cc < c + w; cc++) {
            if (occupied[maxR][cc] || visited[maxR][cc]) { valid = false; break; }
          }
          if (valid) maxR++;
        }
        const h = maxR - r;
        for (let rr = r; rr < r + h; rr++)
          for (let cc = c; cc < c + w; cc++)
            visited[rr][cc] = true;

        const worldX = c * cellSize - halfBlock;
        const worldZ = r * cellSize - halfBlock;
        const worldW = w * cellSize;
        const worldD = h * cellSize;
        const area = worldW * worldD;

        if (area > 1.0) {
          parks.push({ x: worldX + worldW / 2, z: worldZ + worldD / 2, w: worldW, d: worldD });
        } else if (area > 0.005) {
          roads.push({ x: worldX + worldW / 2, z: worldZ + worldD / 2, w: worldW, d: worldD });
        }
      }
    }
    return { roads, parks };
  }, [parcels, halfBlock]);

  // Asphalt grid shader for ground plane
  const groundMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(isStreet ? '#2a2a2a' : '#181825') },
        uGridColor: { value: new THREE.Color(isStreet ? '#3a3a3a' : '#252535') },
        uGridScale: { value: isStreet ? 2.0 : 2.0 },
        uOpacity: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uGridColor;
        uniform float uGridScale;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vec2 grid = abs(fract(vWorldPos.xz / uGridScale - 0.5) - 0.5);
          float line = min(grid.x, grid.y);
          float gridAlpha = 1.0 - smoothstep(0.0, 0.03, line);
          vec3 col = mix(uColor, uGridColor, gridAlpha * 0.6);
          gl_FragColor = vec4(col, uOpacity);
        }
      `,
    });
  }, [isStreet]);

  // Dashed lane markings for street view — instanced
  const laneMarkings = useMemo(() => {
    const bigRoads = surfaces.roads.filter(r => r.w > 0.15 || r.d > 0.15);
    const matrices: THREE.Matrix4[] = [];
    const dashLen = 0.06;
    const dashGap = 0.04;
    const dashWidth = 0.008;

    for (const r of bigRoads) {
      const isHorizontal = r.w > r.d;
      const length = isHorizontal ? r.w : r.d;
      const numDashes = Math.floor(length / (dashLen + dashGap));
      if (numDashes < 1) continue;

      for (let d = 0; d < Math.min(numDashes, 15); d++) {
        const t = (d + 0.5) / numDashes;
        const m = new THREE.Matrix4();
        if (isHorizontal) {
          const dx = r.x - r.w / 2 + t * r.w;
          m.compose(
            new THREE.Vector3(dx, 0.003, r.z),
            new THREE.Quaternion(),
            new THREE.Vector3(dashLen, 1, dashWidth)
          );
        } else {
          const dz = r.z - r.d / 2 + t * r.d;
          m.compose(
            new THREE.Vector3(r.x, 0.003, dz),
            new THREE.Quaternion(),
            new THREE.Vector3(dashWidth, 1, dashLen)
          );
        }
        matrices.push(m);
        if (matrices.length >= 600) break;
      }
      if (matrices.length >= 600) break;
    }

    const arr = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => m.toArray(arr, i * 16));
    return { matrices: arr, count: matrices.length };
  }, [isStreet, surfaces.roads]);

  // Sidewalk edges — slightly raised along parcel borders (street view only)
  const sidewalks = useMemo(() => {
    if (!parcels || parcels.length === 0) return { matrices: new Float32Array(0), count: 0 };
    const matrices: THREE.Matrix4[] = [];
    const sw = 0.012; // sidewalk width in world units
    const sh = 0.004; // sidewalk height

    for (const p of parcels) {
      // 4 edges per parcel
      const edges = [
        { x: p.x + p.width / 2, z: p.z - sw / 2, sx: p.width, sz: sw },           // front
        { x: p.x + p.width / 2, z: p.z + p.depth + sw / 2, sx: p.width, sz: sw }, // back
        { x: p.x - sw / 2, z: p.z + p.depth / 2, sx: sw, sz: p.depth },           // left
        { x: p.x + p.width + sw / 2, z: p.z + p.depth / 2, sx: sw, sz: p.depth }, // right
      ];
      for (const e of edges) {
        const m = new THREE.Matrix4();
        m.compose(
          new THREE.Vector3(e.x, sh / 2, e.z),
          new THREE.Quaternion(),
          new THREE.Vector3(e.sx, sh, e.sz)
        );
        matrices.push(m);
        if (matrices.length >= 2000) break;
      }
      if (matrices.length >= 2000) break;
    }

    const arr = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => m.toArray(arr, i * 16));
    return { matrices: arr, count: matrices.length };
  }, [isStreet, parcels]);

  // Road surface instanced meshes
  const roadInstances = useMemo(() => {
    const show = true;
    if (!show) return { matrices: new Float32Array(0), count: 0 };
    const matrices: THREE.Matrix4[] = [];
    for (const r of surfaces.roads) {
      const m = new THREE.Matrix4();
      m.compose(
        new THREE.Vector3(r.x, 0.001, r.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
        new THREE.Vector3(r.w, r.d, 1)
      );
      matrices.push(m);
    }
    const arr = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => m.toArray(arr, i * 16));
    return { matrices: arr, count: matrices.length };
  }, [isStreet, viewMode, surfaces.roads]);

  const parkInstances = useMemo(() => {
    const show = true;
    if (!show) return { matrices: new Float32Array(0), count: 0 };
    const matrices: THREE.Matrix4[] = [];
    for (const p of surfaces.parks) {
      const m = new THREE.Matrix4();
      m.compose(
        new THREE.Vector3(p.x, 0.001, p.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
        new THREE.Vector3(p.w, p.d, 1)
      );
      matrices.push(m);
    }
    const arr = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => m.toArray(arr, i * 16));
    return { matrices: arr, count: matrices.length };
  }, [isStreet, viewMode, surfaces.parks]);

  // Refs for instanced meshes
  const roadRef = useRef<THREE.InstancedMesh>(null);
  const parkRef = useRef<THREE.InstancedMesh>(null);
  const dashRef = useRef<THREE.InstancedMesh>(null);
  const swRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (roadRef.current && roadInstances.count > 0) {
      for (let i = 0; i < roadInstances.count; i++) {
        const m = new THREE.Matrix4();
        m.fromArray(roadInstances.matrices, i * 16);
        roadRef.current.setMatrixAt(i, m);
      }
      roadRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [roadInstances]);

  useEffect(() => {
    if (parkRef.current && parkInstances.count > 0) {
      for (let i = 0; i < parkInstances.count; i++) {
        const m = new THREE.Matrix4();
        m.fromArray(parkInstances.matrices, i * 16);
        parkRef.current.setMatrixAt(i, m);
      }
      parkRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [parkInstances]);

  useEffect(() => {
    if (dashRef.current && laneMarkings.count > 0) {
      for (let i = 0; i < laneMarkings.count; i++) {
        const m = new THREE.Matrix4();
        m.fromArray(laneMarkings.matrices, i * 16);
        dashRef.current.setMatrixAt(i, m);
      }
      dashRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [laneMarkings]);

  useEffect(() => {
    if (swRef.current && sidewalks.count > 0) {
      for (let i = 0; i < sidewalks.count; i++) {
        const m = new THREE.Matrix4();
        m.fromArray(sidewalks.matrices, i * 16);
        swRef.current.setMatrixAt(i, m);
      }
      swRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [sidewalks]);

  return (
    <group>
      {/* Base ground — textured asphalt with grid pattern */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow material={groundMaterial}>
        <planeGeometry args={[size, size]} />
      </mesh>

      {/* Roads — instanced */}
      {roadInstances.count > 0 && (
        <instancedMesh ref={roadRef} args={[undefined, undefined, roadInstances.count]}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color="#3d3d4a" roughness={0.8} metalness={0.05} />
        </instancedMesh>
      )}

      {/* Parks — instanced */}
      {parkInstances.count > 0 && (
        <instancedMesh ref={parkRef} args={[undefined, undefined, parkInstances.count]}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color="#1e4a1e" roughness={0.85} metalness={0} />
        </instancedMesh>
      )}

      {/* Dashed lane markings — instanced (street view) */}
      {laneMarkings.count > 0 && (
        <instancedMesh ref={dashRef} args={[undefined, undefined, laneMarkings.count]}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color="#ffcc00" transparent opacity={0.6} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </instancedMesh>
      )}

      {/* Sidewalk edges — instanced (street view) */}
      {sidewalks.count > 0 && (
        <instancedMesh ref={swRef} args={[undefined, undefined, sidewalks.count]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#4a4a55" roughness={0.9} metalness={0} />
        </instancedMesh>
      )}
    </group>
  );
}

/* ─── Street Signs at Intersections ─── */
function StreetSigns({ parcels, viewMode }: { parcels: ParcelData[]; viewMode: string }) {
  const isStreet = viewMode === 'street';
  const signHeight = 3 / METERS_PER_UNIT; // ~3m in world units

  // Find intersection points (corners of parcels where gaps meet)
  const signs = useMemo(() => {
    if (!isStreet || !parcels || parcels.length === 0) return [];

    // Collect unique parcel corner points that are NOT inside another parcel
    const halfBlock = BLOCK_SIZE / 2;
    const corners: { x: number; z: number; label: string }[] = [];

    for (const p of parcels) {
      const pts = [
        { x: p.x, z: p.z },
        { x: p.x + p.width, z: p.z },
        { x: p.x, z: p.z + p.depth },
        { x: p.x + p.width, z: p.z + p.depth },
      ];
      for (const pt of pts) {
        // Check this corner is in a gap (not inside another parcel)
        let inParcel = false;
        for (const q of parcels) {
          if (q === p) continue;
          if (pt.x > q.x + 0.001 && pt.x < q.x + q.width - 0.001 &&
              pt.z > q.z + 0.001 && pt.z < q.z + q.depth - 0.001) {
            inParcel = true; break;
          }
        }
        if (!inParcel && pt.x > -halfBlock && pt.x < halfBlock && pt.z > -halfBlock && pt.z < halfBlock) {
          corners.push({ x: pt.x, z: pt.z, label: `Parcel ${p.txIndex}` });
        }
      }
    }

    // Deduplicate by proximity and limit to 25
    const unique: typeof corners = [];
    for (const c of corners) {
      const tooClose = unique.some(u => Math.abs(u.x - c.x) < 0.3 && Math.abs(u.z - c.z) < 0.3);
      if (!tooClose) unique.push(c);
      if (unique.length >= 25) break;
    }
    return unique;
  }, [isStreet, parcels]);

  if (!isStreet || signs.length === 0) return null;

  return (
    <group>
      {signs.map((s, i) => (
        <group key={`sign-${i}`} position={[s.x, signHeight, s.z]}>
          {/* Sign pole */}
          <mesh position={[0, -signHeight / 2, 0]}>
            <cylinderGeometry args={[0.002, 0.002, signHeight, 4]} />
            <meshStandardMaterial color="#333" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Holographic sign panel */}
          <Html center distanceFactor={1.5} style={{ pointerEvents: 'none' }}>
            <div style={{
              background: 'rgba(0,255,200,0.12)',
              border: '1px solid rgba(0,255,200,0.4)',
              borderRadius: '4px',
              padding: '2px 8px',
              fontFamily: 'monospace',
              fontSize: '10px',
              color: '#00ffc8',
              textShadow: '0 0 8px rgba(0,255,200,0.6)',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
            }}>
              {s.label} Ave
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/* ─── Direction Indicators ─── */
function DirectionIndicators({ parcels, viewMode }: { parcels: ParcelData[]; viewMode: string }) {
  const isStreet = viewMode === 'street';

  const indicators = useMemo(() => {
    if (!isStreet || !parcels || parcels.length === 0) return [];

    const coinbase = parcels.find(p => p.isCoinbase || p.txIndex === 0);
    const largest = parcels.reduce((a, b) => (b.bytes > a.bytes ? b : a), parcels[0]);

    const result: { x: number; z: number; label: string; targetX: number; targetZ: number }[] = [];
    const signY = 2.5 / METERS_PER_UNIT;

    // Place indicators at a few road intersections near center
    const spots = [
      { x: 0, z: 0 },
      { x: -3, z: -3 },
      { x: 3, z: 3 },
    ];

    for (const spot of spots) {
      if (coinbase) {
        result.push({
          x: spot.x, z: spot.z,
          label: '← Coinbase',
          targetX: coinbase.x + coinbase.width / 2,
          targetZ: coinbase.z + coinbase.depth / 2,
        });
      }
      if (largest && largest !== coinbase) {
        result.push({
          x: spot.x + 0.05, z: spot.z,
          label: '→ Largest TX',
          targetX: largest.x + largest.width / 2,
          targetZ: largest.z + largest.depth / 2,
        });
      }
    }
    return result;
  }, [isStreet, parcels]);

  if (!isStreet || indicators.length === 0) return null;

  const arrowHeight = 2.5 / METERS_PER_UNIT;

  return (
    <group>
      {indicators.map((ind, i) => {
        const angle = Math.atan2(ind.targetX - ind.x, ind.targetZ - ind.z);
        return (
          <group key={`dir-${i}`} position={[ind.x, arrowHeight, ind.z]} rotation={[0, angle, 0]}>
            <Html center distanceFactor={2} style={{ pointerEvents: 'none' }}>
              <div style={{
                background: 'rgba(247,147,26,0.15)',
                border: '1px solid rgba(247,147,26,0.4)',
                borderRadius: '4px',
                padding: '2px 8px',
                fontFamily: 'monospace',
                fontSize: '9px',
                color: '#f7931a',
                textShadow: '0 0 6px rgba(247,147,26,0.5)',
                whiteSpace: 'nowrap',
              }}>
                {ind.label}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/* ─── Mini-map HUD ─── */
function MiniMap({ parcels, viewMode }: { parcels: ParcelData[]; viewMode: string }) {
  const { camera } = useThree();
  const [pos, setPos] = useState({ x: 0, z: 0 });
  const isStreet = viewMode === 'street';

  useFrame(() => {
    if (!isStreet) return;
    setPos({ x: camera.position.x, z: camera.position.z });
  });

  if (!isStreet || !parcels || parcels.length === 0) return null;

  const mapSize = 140;
  const half = BLOCK_SIZE / 2;
  const scale = mapSize / BLOCK_SIZE;

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'fixed',
        bottom: '80px',
        right: '16px',
        width: `${mapSize}px`,
        height: `${mapSize}px`,
        background: 'rgba(10,10,15,0.85)',
        border: '1px solid rgba(0,255,200,0.3)',
        borderRadius: '8px',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        <svg width={mapSize} height={mapSize} viewBox={`0 0 ${mapSize} ${mapSize}`}>
          {parcels.map((p, i) => (
            <rect
              key={i}
              x={(p.x + half) * scale}
              y={(p.z + half) * scale}
              width={Math.max(1, p.width * scale)}
              height={Math.max(1, p.depth * scale)}
              fill={p.isCoinbase ? '#f7931a' : '#334'}
              stroke="#444"
              strokeWidth={0.3}
            />
          ))}
          {/* Player dot */}
          <circle
            cx={(pos.x + half) * scale}
            cy={(pos.z + half) * scale}
            r={3}
            fill="#00ffc8"
            stroke="#fff"
            strokeWidth={1}
          />
        </svg>
        <div style={{
          position: 'absolute',
          bottom: '2px',
          left: '4px',
          fontSize: '8px',
          fontFamily: 'monospace',
          color: '#00ffc8',
          opacity: 0.7,
        }}>
          MINIMAP
        </div>
      </div>
    </Html>
  );
}

function GridLines() {
  const lines = useMemo(() => {
    const pts: [number, number, number][][] = [];
    const half = BLOCK_SIZE / 2;
    const step = 2; // grid lines every 2 world units
    for (let i = -half; i <= half; i += step) {
      pts.push([[i, 0.005, -half], [i, 0.005, half]]);
      pts.push([[-half, 0.005, i], [half, 0.005, i]]);
    }
    return pts;
  }, []);

  return (
    <group>
      {lines.map((pair, i) => {
        const geo = new THREE.BufferGeometry().setFromPoints(pair.map(p => new THREE.Vector3(...p)));
        return (
          <lineSegments key={i} geometry={geo}>
            <lineBasicMaterial color="#f7931a" transparent opacity={0.05} />
          </lineSegments>
        );
      })}
    </group>
  );
}

/* ─── DNA Helix View ─── */
function DNAHelixView({ blockHeight }: { blockHeight: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const genomeHash = useMemo(() => {
    let hash = '';
    const rng = seededRandom(blockHeight * 31337);
    for (let i = 0; i < 64; i++) hash += Math.floor(rng() * 16).toString(16);
    return hash;
  }, [blockHeight]);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.3;
  });

  return (
    <group ref={groupRef}>
      <Helix genomeHash={genomeHash} state="idle" />
      <pointLight color="#0066ff" intensity={2} distance={30} position={[-10, 5, 5]} />
      <pointLight color="#ff0066" intensity={2} distance={30} position={[10, -5, 5]} />
    </group>
  );
}

/* ─── Instanced Parcels (treemap layout) ─── */
function InstancedParcels({
  parcels, viewMode, hoveredIndex, selectedIndex, onHover, onClick, onDoubleClick, customizations,
}: {
  parcels: ParcelData[]; viewMode: ViewMode;
  hoveredIndex: number; selectedIndex: number;
  onHover: (p: ParcelData | null) => void;
  onClick: (p: ParcelData) => void;
  onDoubleClick: (p: ParcelData) => void;
  customizations?: Map<number, ParcelCustomization>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = parcels.length;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const custom = customizations?.get(parcels[i].txIndex);
      const c = custom?.color ? parseColor(custom.color) : parseColor(parcels[i].color);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    return arr;
  }, [parcels, count, customizations]);

  const targetHeights = useMemo(() => {
    // Street view: heights scaled to human proportions
    // 1 world unit = 105m, a 10-story building ≈ 30m = 0.286 world units
    // buildHeight range ~0.1-1.0 → map to ~0.03-0.5 world units (3m-52m real)
    return parcels.map(p =>
      viewMode === 'flat' ? 0.08
      : viewMode === 'heights' ? Math.max(0.1, p.buildHeight * 6)
      : viewMode === 'street' ? Math.max(0.03, p.buildHeight * 0.5)
      : Math.max(0.15, p.buildHeight * 4)
    );
  }, [parcels, viewMode]);

  const currentHeights = useRef<Float32Array>(new Float32Array(count).fill(0.08));
  // Resize currentHeights when parcel count changes (e.g. mock → real data)
  if (currentHeights.current.length !== count) {
    const old = currentHeights.current;
    const next = new Float32Array(count).fill(0.08);
    next.set(old.subarray(0, Math.min(old.length, count)));
    currentHeights.current = next;
  }

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      const p = parcels[i];
      currentHeights.current[i] += (targetHeights[i] - currentHeights.current[i]) * Math.min(delta * 4, 1);
      const h = currentHeights.current[i];

      dummy.position.set(p.x, h / 2, p.z);
      dummy.scale.set(p.width, h, p.depth);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      const col = new THREE.Color();
      if (i === hoveredIndex) {
        col.setRGB(1, 1, 1);
      } else if (i === selectedIndex) {
        col.set('#00ff88');
      } else {
        col.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
        const custom = customizations?.get(parcels[i].txIndex);
        const breathe = 1 + Math.sin(t * 1.5 + i * 0.1) * (custom?.emissive ? 0.15 : 0.05);
        col.multiplyScalar(custom?.emissive ? 1.3 : 1);
        col.multiplyScalar(breathe);
      }
      meshRef.current.setColorAt(i, col);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id !== undefined && id < parcels.length) {
      onHover(parcels[id]);
    }
  }, [parcels, onHover]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id !== undefined && id < parcels.length) {
      onClick(parcels[id]);
    }
  }, [parcels, onClick]);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id !== undefined && id < parcels.length) {
      onDoubleClick(parcels[id]);
    }
  }, [parcels, onDoubleClick]);

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, count]}
        castShadow receiveShadow
        onPointerOver={handlePointerMove}
        onPointerOut={() => onHover(null)}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial roughness={0.4} metalness={0.3} clearcoat={0.1} clearcoatRoughness={0.4} envMapIntensity={0.8} />
      </instancedMesh>

      {parcels[0]?.isCoinbase && (() => {
        const p = parcels[0];
        return <CoinbaseOrb x={p.x} z={p.z} height={targetHeights[0]} />;
      })()}

      {selectedIndex >= 0 && selectedIndex < parcels.length && (() => {
        const p = parcels[selectedIndex];
        const ringSize = Math.max(p.width, p.depth) * 0.7;
        return (
          <mesh position={[p.x, 0.02, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[ringSize, ringSize * 1.12, 4]} />
            <meshBasicMaterial color="#00ff88" transparent opacity={0.7} blending={THREE.AdditiveBlending} />
          </mesh>
        );
      })()}
    </>
  );
}

/* ─── Estate Overlay (3D) — Html name tags only when camera is close ─── */
function EstateOverlay({ estates, parcels, hoveredEstateId, onHoverEstate, onClickEstate }: {
  estates: Estate[]; parcels: ParcelData[];
  hoveredEstateId: string | null;
  onHoverEstate: (id: string | null) => void;
  onClickEstate: (estate: Estate) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [closeEstates, setCloseEstates] = useState<Set<string>>(new Set());
  const frameCounter = useRef(0);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    // Check distance every 30 frames for Html name tag rendering
    frameCounter.current++;
    if (frameCounter.current % 30 === 0) {
      const newClose = new Set<string>();
      estates.forEach(estate => {
        // Compute estate center
        let cx = 0, cz = 0, count = 0;
        estate.parcelIndices.forEach(idx => {
          const p = parcels[idx];
          if (p) { cx += p.x; cz += p.z; count++; }
        });
        if (count > 0) {
          cx /= count; cz /= count;
          const dist = camera.position.distanceTo(new THREE.Vector3(cx, 0, cz));
          if (dist < 25) newClose.add(estate.id);
        }
      });
      setCloseEstates(newClose);
    }

    // Animate glow opacity (breathing)
    groupRef.current.children.forEach((child, _i) => {
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material;
          if (mat && 'opacity' in mat && (mat as THREE.MeshBasicMaterial).blending === THREE.AdditiveBlending) {
            (mat as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 2 + _i * 1.5) * 0.15;
          }
        }
        if ((obj as THREE.LineSegments).isLineSegments) {
          const mat = (obj as THREE.LineSegments).material as THREE.LineBasicMaterial;
          if (mat && 'opacity' in mat) {
            mat.opacity = 0.5 + Math.sin(t * 2.5 + _i * 1.2) * 0.3;
          }
        }
      });
    });
  });

  return (
    <group ref={groupRef}>
      {estates.map((estate) => {
        // Compute bounding box from treemap positions
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        let maxHeight = 0;
        estate.parcelIndices.forEach(idx => {
          const p = parcels[idx];
          if (!p) return;
          minX = Math.min(minX, p.x - p.width / 2);
          maxX = Math.max(maxX, p.x + p.width / 2);
          minZ = Math.min(minZ, p.z - p.depth / 2);
          maxZ = Math.max(maxZ, p.z + p.depth / 2);
          maxHeight = Math.max(maxHeight, Math.max(0.15, p.buildHeight * 4));
        });

        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const w = maxX - minX;
        const d = maxZ - minZ;
        const h = maxHeight + 0.5;
        const isHovered = hoveredEstateId === estate.id;
        const glowColor = new THREE.Color(estate.glowColor);

        const boxGeo = new THREE.BoxGeometry(w, h, d);
        const edgesGeo = new THREE.EdgesGeometry(boxGeo);

        const groundPts = [
          new THREE.Vector3(minX, 0.04, minZ),
          new THREE.Vector3(maxX, 0.04, minZ),
          new THREE.Vector3(maxX, 0.04, maxZ),
          new THREE.Vector3(minX, 0.04, maxZ),
          new THREE.Vector3(minX, 0.04, minZ),
        ];
        const groundGeo = new THREE.BufferGeometry().setFromPoints(groundPts);

        return (
          <group key={estate.id}>
            <mesh
              position={[cx, h / 2, cz]}
              onPointerOver={(e) => { e.stopPropagation(); onHoverEstate(estate.id); }}
              onPointerOut={() => onHoverEstate(null)}
              onClick={(e) => { e.stopPropagation(); onClickEstate(estate); }}
            >
              <boxGeometry args={[w, h, d]} />
              <meshBasicMaterial
                color={estate.glowColor}
                transparent
                opacity={isHovered ? 0.08 : 0.03}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            <lineSegments geometry={edgesGeo} position={[cx, h / 2, cz]}>
              <lineBasicMaterial color={glowColor} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
            </lineSegments>

            {(() => {
              const groundLine = new THREE.Line(groundGeo, new THREE.LineBasicMaterial({ color: glowColor, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending }));
              return <primitive object={groundLine} />;
            })()}

            {/* Only render Html name tag when camera is close */}
            {closeEstates.has(estate.id) && (
              <Html position={[cx, h + 0.8, cz]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                <div style={{
                  background: 'rgba(10,10,15,0.9)',
                  border: `1px solid ${estate.glowColor}55`,
                  borderRadius: '8px',
                  padding: '4px 10px',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                  textAlign: 'center',
                }}>
                  <div style={{
                    color: estate.glowColor,
                    fontSize: '11px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    textShadow: `0 0 8px ${estate.glowColor}, 0 0 16px ${estate.glowColor}66`,
                  }}>
                    🏰 {estate.name}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '9px', fontFamily: 'monospace' }}>
                    @{estate.ownerHandle} · {estate.parcelIndices.length} parcels
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ─── Estate Creation Modal ─── */
function EstateModal({ onClose, blockHeight, parcels }: { onClose: () => void; blockHeight: number; parcels: ParcelData[] }) {
  const [estateName, setEstateName] = useState('');
  const [selectedParcels, setSelectedParcels] = useState<Set<number>>(new Set());
  const [selectedColor, setSelectedColor] = useState(NEON_COLORS[0]);
  const [created, setCreated] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(blockHeight);

  const mockOwnedBlocks = useMemo(() => {
    const rng = seededRandom(blockHeight * 4201);
    const blocks = [{ height: blockHeight, parcelCount: 12 + Math.floor(rng() * 40) }];
    if (rng() > 0.4) blocks.push({ height: blockHeight + 1, parcelCount: 5 + Math.floor(rng() * 20) });
    if (rng() > 0.6) blocks.push({ height: blockHeight - 1, parcelCount: 3 + Math.floor(rng() * 15) });
    return blocks;
  }, [blockHeight]);

  const ownerParcels = useMemo(() => {
    const block = mockOwnedBlocks.find(b => b.height === selectedBlock);
    if (!block) return [];
    const rng = seededRandom(selectedBlock * 7777);
    const allParcels = selectedBlock === blockHeight ? parcels : generateParcels(selectedBlock);
    const owned: ParcelData[] = [];
    for (let i = 0; i < allParcels.length && owned.length < block.parcelCount; i++) {
      if (!allParcels[i].isCoinbase && rng() > 0.5) owned.push(allParcels[i]);
    }
    return owned;
  }, [selectedBlock, blockHeight, parcels, mockOwnedBlocks]);

  const cols = Math.min(8, Math.ceil(Math.sqrt(ownerParcels.length)));

  const handleConnect = () => {
    setConnecting(true);
    setTimeout(() => { setConnecting(false); setWalletConnected(true); }, 1500);
  };

  const toggleParcel = (idx: number) => {
    setSelectedParcels(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const handleCreate = () => {
    if (!estateName.trim() || selectedParcels.size < 2) return;
    console.log('[Estate] Created:', { name: estateName, parcels: [...selectedParcels], color: selectedColor });
    setCreated(true);
    setTimeout(() => { setCreated(false); onClose(); }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-[460px] rounded-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ background: '#0f0f18', border: `1px solid ${selectedColor}44` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: selectedColor, textShadow: `0 0 10px ${selectedColor}66` }}>🏰 Create Estate</h3>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-lg">✕</button>
        </div>

        <div className="space-y-4">
          {!walletConnected ? (
            <div className="flex flex-col items-center py-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.25)' }}>
                <span className="text-2xl">🔗</span>
              </div>
              <div className="text-[13px] font-bold mb-1" style={{ color: '#e2e8f0' }}>Connect Wallet to View Ownership</div>
              <div className="text-[10px] text-center mb-4" style={{ color: '#64748b', maxWidth: 280 }}>
                We&apos;ll scan the blockchain to find all blocks and parcels you own, then show them here for merging.
              </div>
              <button onClick={handleConnect} disabled={connecting}
                className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:brightness-130 active:scale-95"
                style={{ background: 'rgba(247,147,26,0.2)', border: '1.5px solid rgba(247,147,26,0.4)', color: '#f7931a' }}>
                {connecting ? '⏳ Scanning blockchain...' : '🔐 Connect Wallet (BIP-322)'}
              </button>
              <div className="text-[9px] mt-3" style={{ color: '#334155' }}>🛡️ Read-only scan — no transaction required</div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)' }}>
                <span className="text-[10px]" style={{ color: '#22c55e' }}>✅ Wallet verified — {mockOwnedBlocks.reduce((s, b) => s + b.parcelCount, 0)} parcels across {mockOwnedBlocks.length} block{mockOwnedBlocks.length > 1 ? 's' : ''}</span>
              </div>

              {mockOwnedBlocks.length > 1 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider block mb-1.5" style={{ color: '#64748b' }}>Select Block</label>
                  <div className="flex gap-2 flex-wrap">
                    {mockOwnedBlocks.map(b => (
                      <button key={b.height} onClick={() => { setSelectedBlock(b.height); setSelectedParcels(new Set()); }}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all active:scale-95"
                        style={{
                          background: selectedBlock === b.height ? `${selectedColor}22` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${selectedBlock === b.height ? selectedColor : 'rgba(255,255,255,0.08)'}`,
                          color: selectedBlock === b.height ? selectedColor : '#64748b',
                        }}>
                        Block {b.height.toLocaleString()} ({b.parcelCount})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#64748b' }}>Estate Name</label>
                <input type="text" value={estateName} onChange={(e) => setEstateName(e.target.value)}
                  placeholder="My Bitcoin Citadel"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${selectedColor}33`, color: '#e2e8f0' }} />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-2" style={{ color: '#64748b' }}>
                  Your Parcels in Block {selectedBlock.toLocaleString()} ({selectedParcels.size} selected)
                </label>
                <div className="max-h-[240px] overflow-y-auto rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                    {ownerParcels.map((p) => {
                      const isSel = selectedParcels.has(p.txIndex);
                      return (
                        <button key={p.txIndex} onClick={() => toggleParcel(p.txIndex)}
                          className="aspect-square rounded text-[8px] font-mono transition-all"
                          style={{
                            background: isSel ? `${selectedColor}33` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isSel ? selectedColor : 'rgba(255,255,255,0.08)'}`,
                            color: isSel ? selectedColor : '#64748b',
                            boxShadow: isSel ? `0 0 8px ${selectedColor}44` : 'none',
                          }}>
                          {p.txIndex}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="text-[9px] mt-1" style={{ color: '#475569' }}>⚠️ Adjacent parcels only — must share an edge</div>
              </div>
              <div>
            <label className="text-[10px] uppercase tracking-wider block mb-2" style={{ color: '#64748b' }}>Neon Glow Color</label>
            <div className="flex gap-2">
              {NEON_COLORS.map(c => (
                <button key={c} onClick={() => setSelectedColor(c)}
                  className="w-8 h-8 rounded-lg transition-all"
                  style={{
                    background: c,
                    border: selectedColor === c ? '2px solid #fff' : '2px solid transparent',
                    boxShadow: selectedColor === c ? `0 0 12px ${c}` : `0 0 4px ${c}44`,
                    opacity: selectedColor === c ? 1 : 0.6,
                  }} />
              ))}
            </div>
              </div>

              <button onClick={handleCreate} disabled={!estateName.trim() || selectedParcels.size < 2}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all"
            style={{
              background: created ? 'rgba(0,255,136,0.2)' : `${selectedColor}22`,
              border: `1.5px solid ${created ? '#00ff88' : selectedColor}`,
              color: created ? '#00ff88' : selectedColor,
              opacity: (!estateName.trim() || selectedParcels.size < 2) ? 0.4 : 1,
              boxShadow: `0 0 20px ${selectedColor}33`,
            }}>
              {created ? '✅ Estate Created!' : '🏰 Create Estate'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Coinbase floating orb ─── */
function CoinbaseOrb({ x, z, height }: { x: number; z: number; height: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = height + 0.5 + Math.sin(t * 2) * 0.15;
    const pulse = 1 + Math.sin(t * 3) * 0.2;
    ref.current.scale.set(pulse, pulse, pulse);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(t * 3) * 0.08;
  });
  return (
    <mesh ref={ref} position={[x, height + 0.5, z]}>
      <octahedronGeometry args={[0.2, 2]} />
      <meshBasicMaterial color="#f7931a" transparent opacity={0.15} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/* ─── Parcel Texture Overlays (images/patterns on customized parcels) ─── */
const ParcelTextureOverlay = memo(function ParcelTextureOverlay({
  parcels, customizations, viewMode,
}: {
  parcels: ParcelData[];
  customizations: Map<number, ParcelCustomization>;
  viewMode: ViewMode;
}) {
  const textureCache = useRef(new Map<string, THREE.Texture>());

  // Load image textures
  useEffect(() => {
    customizations.forEach((custom, txIndex) => {
      if (custom.imageUrl && !textureCache.current.has(custom.imageUrl)) {
        const loader = new THREE.TextureLoader();
        loader.load(custom.imageUrl, (tex) => {
          tex.minFilter = THREE.LinearFilter;
          textureCache.current.set(custom.imageUrl!, tex);
        });
      }
    });
  }, [customizations]);

  const overlays: React.ReactElement[] = [];
  customizations.forEach((custom, txIndex) => {
    const parcel = parcels.find(p => p.txIndex === txIndex);
    if (!parcel) return;
    if (!custom.imageUrl && !custom.pattern) return;
    if (custom.pattern === 'none' && !custom.imageUrl) return;

    const h = viewMode === 'flat' ? 0.09
      : viewMode === 'street' ? Math.max(0.04, parcel.buildHeight * 0.5) + 0.005
      : Math.max(0.16, parcel.buildHeight * (viewMode === 'heights' ? 6 : 4)) + 0.01;

    if (custom.imageUrl) {
      const tex = textureCache.current.get(custom.imageUrl);
      if (tex) {
        const rot = ((custom.rotation ?? 0) * Math.PI) / 180;
        const facing = custom.facing ?? 'top';
        const opacity = custom.opacity ?? 0.85;

        if (facing === 'top') {
          overlays.push(
            <mesh key={`img-${txIndex}`} position={[parcel.x, h, parcel.z]} rotation={[-Math.PI / 2, rot, 0]}>
              <planeGeometry args={[parcel.width * 0.95, parcel.depth * 0.95]} />
              <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} />
            </mesh>
          );
        } else {
          // Side faces — position on the edge of the parcel, rotated to face outward
          const halfW = parcel.width / 2;
          const halfD = parcel.depth / 2;
          const sideH = h * 0.9; // image height = parcel height
          let pos: [number, number, number];
          let faceRot: [number, number, number];
          let dims: [number, number];

          switch (facing) {
            case 'front': // +Z face
              pos = [parcel.x, h / 2, parcel.z + halfD];
              faceRot = [0, rot, 0];
              dims = [parcel.width * 0.95, sideH];
              break;
            case 'back': // -Z face
              pos = [parcel.x, h / 2, parcel.z - halfD];
              faceRot = [0, Math.PI + rot, 0];
              dims = [parcel.width * 0.95, sideH];
              break;
            case 'left': // -X face
              pos = [parcel.x - halfW, h / 2, parcel.z];
              faceRot = [0, -Math.PI / 2 + rot, 0];
              dims = [parcel.depth * 0.95, sideH];
              break;
            case 'right': // +X face
              pos = [parcel.x + halfW, h / 2, parcel.z];
              faceRot = [0, Math.PI / 2 + rot, 0];
              dims = [parcel.depth * 0.95, sideH];
              break;
            default:
              pos = [parcel.x, h, parcel.z];
              faceRot = [-Math.PI / 2, rot, 0];
              dims = [parcel.width * 0.95, parcel.depth * 0.95];
          }

          overlays.push(
            <mesh key={`img-${txIndex}`} position={pos} rotation={faceRot}>
              <planeGeometry args={dims} />
              <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          );
        }
      }
    } else if (custom.pattern && custom.pattern !== 'none') {
      const patternTex = generatePatternTexture(custom.pattern, custom.color || '#f7931a');
      if (patternTex) {
        overlays.push(
          <mesh key={`pat-${txIndex}`} position={[parcel.x, h, parcel.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[parcel.width * 0.95, parcel.depth * 0.95]} />
            <meshBasicMaterial map={patternTex} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        );
      }
    }
  });

  return <>{overlays}</>;
});

/* ─── Cinematic Fly-To Camera ─── */
function FlyToCamera({ flyTarget, onComplete }: { flyTarget: FlyTarget | null; onComplete: () => void }) {
  const { camera } = useThree();
  const startPos = useRef(new THREE.Vector3());
  const startLookAt = useRef(new THREE.Vector3());
  const progress = useRef(0);
  const active = useRef(false);
  const duration = useRef(1.5);
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (flyTarget) {
      startPos.current.copy(camera.position);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      startLookAt.current.copy(camera.position).add(dir.multiplyScalar(10));
      currentLookAt.current.copy(startLookAt.current);
      progress.current = 0;
      active.current = true;
      duration.current = flyTarget.closeUp ? 2.0 : 1.5;
    }
  }, [flyTarget, camera]);

  useFrame((_, delta) => {
    if (!active.current || !flyTarget) return;

    progress.current += delta / duration.current;
    if (progress.current >= 1) {
      progress.current = 1;
      active.current = false;
      onComplete();
    }

    const t = progress.current;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(startPos.current, flyTarget.position, ease);
    currentLookAt.current.lerpVectors(startLookAt.current, flyTarget.lookAt, ease);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}

/* ─── Camera Position Manager ─── */
/* ═══════════════════════════════════════════
   First-Person Street Walker
   Real-world speeds anchored to protocol spatial dimensions:
   BLOCK_SIZE=20 world units = 2100m → 1 world unit = 105m
   Walking: 1.4 m/s | Running: 3.5 m/s | Eye height: 1.7m
   ═══════════════════════════════════════════ */
const WALK_SPEED = 3.0 / METERS_PER_UNIT;  // ~3 m/s brisk walk (was 1.4 — too slow)
const RUN_SPEED = 8.0 / METERS_PER_UNIT;  // ~8 m/s fast run (was 3.5)
const EYE_HEIGHT = 1.7 / METERS_PER_UNIT;

// ─── Flyover Mode Constants ───
const FLY_HEIGHT = 100 / METERS_PER_UNIT;
const FLY_SPEED = 27.8 / METERS_PER_UNIT;       // 100 km/h
const FLY_BOOST_SPEED = 55.6 / METERS_PER_UNIT; // 200 km/h
const FLY_MOUSE_SENSITIVITY = 0.003;
const FLY_MIN_HEIGHT = 20 / METERS_PER_UNIT;
const FLY_MAX_HEIGHT = 300 / METERS_PER_UNIT;
const AUTO_TOUR_SPEED = 20 / METERS_PER_UNIT;   // 72 km/h
const MOUSE_SENSITIVITY = 0.004;
const BLOCK_HALF = BLOCK_SIZE / 2;

function StreetWalker({ active, parcels, teleportTo }: { active: boolean; parcels: ParcelData[]; teleportTo: ParcelData | null }) {
  const { camera, gl } = useThree();
  const keys = useRef<Set<string>>(new Set());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const rightDown = useRef(false);
  const initialized = useRef(false);
  // Warp animation state
  const warping = useRef(false);
  const warpStart = useRef(new THREE.Vector3());
  const warpEnd = useRef(new THREE.Vector3());
  const warpProgress = useRef(0);
  const warpYawTarget = useRef(0);

  // Build collision map from parcel bounding boxes
  const parcelBoxes = useMemo(() =>
    parcels.map(p => ({
      minX: p.x, maxX: p.x + p.width,
      minZ: p.z, maxZ: p.z + p.depth,
    })), [parcels]);

  const collides = useCallback((x: number, z: number, margin: number) => {
    for (const box of parcelBoxes) {
      if (x + margin > box.minX && x - margin < box.maxX &&
          z + margin > box.minZ && z - margin < box.maxZ) {
        return true;
      }
    }
    return false;
  }, [parcelBoxes]);

  // Spawn next to coinbase parcel (txIndex 0) — the "entrance" of every block
  const findSpawnPos = useCallback((): [number, number] => {
    const coinbase = parcels.find(p => p.txIndex === 0);
    if (coinbase) {
      // Spawn just in front of coinbase (negative Z side = "south" edge)
      const x = coinbase.x + coinbase.width / 2;
      const z = coinbase.z - 0.03;
      if (!collides(x, z, 0.3 / METERS_PER_UNIT)) return [x, z];
      // Try other sides
      const z2 = coinbase.z + coinbase.depth + 0.03;
      if (!collides(x, z2, 0.3 / METERS_PER_UNIT)) return [x, z2];
      const x2 = coinbase.x - 0.03;
      if (!collides(x2, coinbase.z + coinbase.depth / 2, 0.3 / METERS_PER_UNIT)) return [x2, coinbase.z + coinbase.depth / 2];
    }
    return [-BLOCK_HALF - 0.03, -BLOCK_HALF - 0.03];
  }, [parcels, collides]);

  // Set initial position when entering street view
  useEffect(() => {
    if (!active) {
      initialized.current = false;
      return;
    }
    if (!initialized.current) {
      const [sx, sz] = findSpawnPos();
      camera.position.set(sx, EYE_HEIGHT, sz);
      yaw.current = Math.PI * 0.25;
      pitch.current = 0;
      initialized.current = true;
    }
  }, [active, camera, findSpawnPos]);

  // Teleport warp to clicked parcel
  const lastTeleportId = useRef<number>(-1);
  useEffect(() => {
    if (!active || !teleportTo || teleportTo.txIndex === lastTeleportId.current) return;
    lastTeleportId.current = teleportTo.txIndex;
    const targetX = teleportTo.x + teleportTo.width / 2;
    const targetZ = teleportTo.z - 0.03; // just in front
    warpStart.current.copy(camera.position);
    warpEnd.current.set(targetX, EYE_HEIGHT, targetZ);
    warpProgress.current = 0;
    // Face toward the parcel center
    warpYawTarget.current = Math.atan2(-(teleportTo.x + teleportTo.width / 2 - targetX), -(teleportTo.z + teleportTo.depth / 2 - targetZ));
    warping.current = true;
  }, [active, teleportTo, camera]);

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);

    // Click+drag to look — must drag >3px to activate (avoids conflict with parcel click)
    let mouseStartX = 0, mouseStartY = 0;
    const dragThreshold = 3;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 || e.button === 2) {
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;
        rightDown.current = false; // don't activate until drag threshold met
      }
    };
    const onMouseUp = () => {
      rightDown.current = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (e.buttons === 0) { rightDown.current = false; return; }
      // Activate mouselook after drag threshold
      if (!rightDown.current) {
        const dx = e.clientX - mouseStartX;
        const dy = e.clientY - mouseStartY;
        if (Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
          rightDown.current = true;
        } else {
          return;
        }
      }
      yaw.current -= e.movementX * MOUSE_SENSITIVITY;
      pitch.current -= e.movementY * MOUSE_SENSITIVITY;
      pitch.current = Math.max(-Math.PI * 0.4, Math.min(Math.PI * 0.4, pitch.current));
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const el = gl.domElement;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    el.addEventListener('contextmenu', onContextMenu);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('contextmenu', onContextMenu);
      keys.current.clear();
      rightDown.current = false;
    };
  }, [active, gl]);

  useFrame((_, delta) => {
    if (!active) return;

    // Warp animation (fast travel to parcel)
    if (warping.current) {
      warpProgress.current += delta * 2.5; // ~0.4s warp
      const t = Math.min(1, warpProgress.current);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      // Rise up, fly over, land
      const midY = EYE_HEIGHT + 0.3; // brief lift
      const curveY = t < 0.5 ? EYE_HEIGHT + (midY - EYE_HEIGHT) * (ease * 2) : midY + (EYE_HEIGHT - midY) * ((ease - 0.5) * 2);
      camera.position.lerpVectors(warpStart.current, warpEnd.current, ease);
      camera.position.y = curveY;
      // Smoothly rotate yaw toward target
      yaw.current += (warpYawTarget.current - yaw.current) * ease;
      pitch.current *= (1 - ease); // level out
      if (t >= 1) {
        warping.current = false;
        camera.position.y = EYE_HEIGHT;
      }
      // Apply look during warp
      const lookDir = new THREE.Vector3(
        -Math.sin(yaw.current) * Math.cos(pitch.current),
        Math.sin(pitch.current),
        -Math.cos(yaw.current) * Math.cos(pitch.current)
      );
      camera.lookAt(camera.position.clone().add(lookDir));
      return; // skip walking during warp
    }

    const k = keys.current;
    const running = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = (running ? RUN_SPEED : WALK_SPEED) * delta;

    // Movement direction relative to camera yaw
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    const move = new THREE.Vector3(0, 0, 0);
    if (k.has('KeyW') || k.has('ArrowUp'))    move.add(forward);
    if (k.has('KeyS') || k.has('ArrowDown'))  move.sub(forward);
    if (k.has('KeyD') || k.has('ArrowRight')) move.add(right);
    if (k.has('KeyA') || k.has('ArrowLeft'))  move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);

      let newX = camera.position.x + move.x;
      let newZ = camera.position.z + move.z;
      const bodyRadius = 0.3 / METERS_PER_UNIT;

      // Slide along walls: try full move, then axis-by-axis
      if (!collides(newX, newZ, bodyRadius)) {
        camera.position.x = newX;
        camera.position.z = newZ;
      } else if (!collides(newX, camera.position.z, bodyRadius)) {
        camera.position.x = newX;
      } else if (!collides(camera.position.x, newZ, bodyRadius)) {
        camera.position.z = newZ;
      }
    }

    // Clamp to block bounds (can't walk off into void)
    const margin = BLOCK_HALF + 0.5;
    camera.position.x = Math.max(-margin, Math.min(margin, camera.position.x));
    camera.position.z = Math.max(-margin, Math.min(margin, camera.position.z));

    // Lock Y to eye height
    camera.position.y = EYE_HEIGHT;

    // Apply look rotation from yaw/pitch
    const lookDir = new THREE.Vector3(
      -Math.sin(yaw.current) * Math.cos(pitch.current),
      Math.sin(pitch.current),
      -Math.cos(yaw.current) * Math.cos(pitch.current)
    );
    camera.lookAt(camera.position.clone().add(lookDir));
  });

  return null;
}

// ═══════════════════════════════════════════
// FlyoverController — Drone/Helicopter Camera
// ═══════════════════════════════════════════

function FlyoverController({ active, parcels, autoTour, onExitAutoTour }: {
  active: boolean; parcels: ParcelData[]; autoTour: boolean; onExitAutoTour: () => void;
}) {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(-Math.PI / 4); // -45° default
  const targetHeight = useRef(FLY_HEIGHT);
  const keys = useRef<Set<string>>(new Set());
  const dragging = useRef(false);
  const initialized = useRef(false);
  const tourProgress = useRef(0);
  const speed = useRef(0);

  // Precompute auto-tour path (figure-8 around block)
  const tourPath = useMemo(() => {
    const r = BLOCK_SIZE * 0.6;
    const points: THREE.Vector3[] = [];
    const segments = 200;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      // Figure-8 (lemniscate)
      const scale = 1 / (1 + Math.sin(t) * Math.sin(t) * 0.3);
      const x = r * Math.sin(t) * scale;
      const z = r * Math.sin(t) * Math.cos(t) * scale;
      points.push(new THREE.Vector3(x, FLY_HEIGHT, z));
    }
    return points;
  }, []);

  useEffect(() => {
    if (!active) { initialized.current = false; return; }

    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      // Any WASD exits auto tour
      if (autoTour && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        onExitAutoTour();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onMouseDown = (e: MouseEvent) => { if (e.button === 0) dragging.current = true; };
    const onMouseUp = () => { dragging.current = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      yaw.current -= e.movementX * FLY_MOUSE_SENSITIVITY;
      pitch.current = Math.max(-80 * Math.PI / 180, Math.min(20 * Math.PI / 180,
        pitch.current - e.movementY * FLY_MOUSE_SENSITIVITY));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      keys.current.clear();
    };
  }, [active, autoTour, onExitAutoTour]);

  useFrame((_, delta) => {
    if (!active) return;
    const dt = Math.min(delta, 0.05);

    if (!initialized.current) {
      camera.position.set(0, FLY_HEIGHT, 0);
      yaw.current = 0;
      pitch.current = -Math.PI / 4;
      targetHeight.current = FLY_HEIGHT;
      velocity.current.set(0, 0, 0);
      tourProgress.current = 0;
      initialized.current = true;
    }

    if (autoTour) {
      // Auto tour: follow precomputed path
      tourProgress.current += (AUTO_TOUR_SPEED * dt) / (BLOCK_SIZE * 0.6 * Math.PI * 2) * tourPath.length;
      if (tourProgress.current >= tourPath.length) tourProgress.current -= tourPath.length;

      const idx = Math.floor(tourProgress.current) % tourPath.length;
      const nextIdx = (idx + 1) % tourPath.length;
      const frac = tourProgress.current - Math.floor(tourProgress.current);
      const target = tourPath[idx].clone().lerp(tourPath[nextIdx], frac);

      camera.position.lerp(target, dt * 3);

      // Look toward center with slight bank
      const toCenter = new THREE.Vector3(0, FLY_HEIGHT * 0.5, 0).sub(camera.position).normalize();
      const lookTarget = camera.position.clone().add(toCenter);
      camera.lookAt(lookTarget);

      // Subtle banking
      const dir = tourPath[nextIdx].clone().sub(tourPath[idx]).normalize();
      const cross = new THREE.Vector3(0, 1, 0).cross(dir);
      camera.rotateZ(-cross.length() * 0.08);

      speed.current = AUTO_TOUR_SPEED * METERS_PER_UNIT;
    } else {
      // Free fly mode
      const k = keys.current;
      const boost = k.has('ShiftLeft') || k.has('ShiftRight');
      const moveSpeed = boost ? FLY_BOOST_SPEED : FLY_SPEED;

      // Movement input
      const input = new THREE.Vector3();
      if (k.has('KeyW') || k.has('ArrowUp')) input.z -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) input.z += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) input.x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) input.x += 1;

      // Height
      if (k.has('Space')) targetHeight.current = Math.min(targetHeight.current + dt * moveSpeed, FLY_MAX_HEIGHT);
      if (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC'))
        targetHeight.current = Math.max(targetHeight.current - dt * moveSpeed, FLY_MIN_HEIGHT);

      // Rotate input by yaw
      if (input.length() > 0) {
        input.normalize();
        const cosY = Math.cos(yaw.current), sinY = Math.sin(yaw.current);
        const rx = input.x * cosY + input.z * sinY;
        const rz = -input.x * sinY + input.z * cosY;
        velocity.current.x += rx * moveSpeed * dt * 4;
        velocity.current.z += rz * moveSpeed * dt * 4;
      }

      // Dampening
      velocity.current.multiplyScalar(Math.pow(0.05, dt));

      // Clamp velocity
      const maxV = boost ? FLY_BOOST_SPEED : FLY_SPEED;
      if (velocity.current.length() > maxV) velocity.current.setLength(maxV);

      // Apply
      camera.position.x += velocity.current.x * dt;
      camera.position.z += velocity.current.z * dt;
      camera.position.y += (targetHeight.current - camera.position.y) * dt * 5;

      // Camera rotation from yaw/pitch
      const euler = new THREE.Euler(pitch.current, yaw.current, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);

      // Subtle bank based on lateral velocity
      const lateralSpeed = Math.sqrt(velocity.current.x ** 2 + velocity.current.z ** 2);
      const bankAngle = Math.atan2(
        velocity.current.x * Math.cos(yaw.current) - velocity.current.z * Math.sin(yaw.current),
        1
      ) * 0.05;
      camera.rotateZ(-bankAngle);

      speed.current = lateralSpeed * METERS_PER_UNIT;
    }
  });

  return null;
}

function CameraManager({ viewMode }: { viewMode: ViewMode }) {
  const { camera } = useThree();
  const animating = useRef(false);
  const targetPos = useRef(new THREE.Vector3());
  const frameCount = useRef(0);
  const prevMode = useRef(viewMode);

  useEffect(() => {
    if (prevMode.current !== viewMode) {
      prevMode.current = viewMode;
      // Street/flyover views are handled by their own controllers
      if (viewMode !== 'street' && viewMode !== 'flyover') {
        animating.current = true;
        frameCount.current = 0;
      } else {
        animating.current = false;
      }
    }

    const dist = BLOCK_SIZE * 0.7;
    switch (viewMode) {
      case 'flat': targetPos.current.set(0, dist * 1.8, 0.01); break;
      case 'isometric': targetPos.current.set(dist * 0.8, dist * 0.9, dist * 0.8); break;
      case 'heights': targetPos.current.set(dist * 0.6, dist * 1.2, dist * 0.6); break;
      case 'dna': targetPos.current.set(8, 2, 8); break;
      case 'street': break; // StreetWalker handles positioning
      case 'flyover': break; // FlyoverController handles positioning
    }
  }, [viewMode]);

  useFrame((_, delta) => {
    if (!animating.current) return;
    camera.position.lerp(targetPos.current, delta * 3);
    frameCount.current++;
    const dist = camera.position.distanceTo(targetPos.current);
    if (dist < 0.1 || frameCount.current > 120) {
      animating.current = false;
    }
  });

  return null;
}

/* ═══════════════════════════════════════════
   Mock Chat Data
   ═══════════════════════════════════════════ */

function generateMockChat(blockHeight: number): ChatMessage[] {
  const rng = seededRandom(blockHeight * 3331);
  const names = ['satoshi_fan', 'bitmap_maxi', 'block_builder', 'nexus_explorer', 'anon_42'];
  const messages = [
    { text: 'Anyone building on this block? 🏗️', type: 'text' as const },
    { text: 'Just claimed parcel 42, let\'s go!', type: 'text' as const },
    { text: 'The coinbase on this one is wild', type: 'text' as const },
    { text: 'https://bitmap.community/block/' + blockHeight, type: 'link' as const },
    { text: 'Check out my build 🔥', type: 'image' as const },
    { text: 'This block has great energy beams', type: 'text' as const },
    { text: 'GM from The Nexus ☀️', type: 'text' as const },
    { text: 'pepe.gif', type: 'gif' as const },
  ];

  return messages.slice(0, 4 + Math.floor(rng() * 4)).map((m, i) => {
    const senderIdx = Math.floor(rng() * names.length);
    const owner = generateMockOwner(blockHeight, i);
    return {
      id: `msg-${i}`,
      sender: names[senderIdx],
      text: m.text,
      time: `${Math.floor(rng() * 12 + 1)}:${String(Math.floor(rng() * 60)).padStart(2, '0')} ${rng() > 0.5 ? 'AM' : 'PM'}`,
      type: m.type,
      isOwner: i === 0 && rng() > 0.7,
      ownerData: owner,
    };
  });
}

/* ═══════════════════════════════════════════
   Media Preview Components
   ═══════════════════════════════════════════ */

function MediaPreviewImage({ msgId }: { msgId: string }) {
  const rng = seededRandom(parseInt(msgId.replace(/\D/g, '') || '0') * 1777);
  const hue1 = Math.floor(rng() * 360);
  const hue2 = (hue1 + 40 + Math.floor(rng() * 80)) % 360;
  return (
    <div
      className="w-full h-20 rounded-lg flex items-center justify-center cursor-pointer relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, hsl(${hue1},70%,30%), hsl(${hue2},80%,20%))`, border: '1px solid rgba(247,147,26,0.15)' }}
      onClick={() => console.log('[MediaPreview] Expand image:', msgId)}
    >
      <span className="text-xl opacity-70">▶</span>
      <div className="absolute bottom-1 right-2 text-[8px] font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>IMG</div>
    </div>
  );
}

function MediaPreviewGif({ msgId }: { msgId: string }) {
  const rng = seededRandom(parseInt(msgId.replace(/\D/g, '') || '0') * 2333);
  const hue = Math.floor(rng() * 360);
  return (
    <div
      className="w-full h-20 rounded-lg flex items-center justify-center cursor-pointer relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, hsl(${hue},60%,25%), hsl(${(hue + 60) % 360},70%,18%))`, border: '1px solid rgba(247,147,26,0.15)' }}
      onClick={() => console.log('[MediaPreview] Expand GIF:', msgId)}
    >
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
        animation: 'shimmer 1.5s infinite',
      }} />
      <span className="text-sm font-bold opacity-70 z-10">GIF</span>
      <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
    </div>
  );
}

function MediaPreviewLink({ text }: { text: string }) {
  let domain = 'link';
  try {
    const url = text.startsWith('http') ? text : `https://${text}`;
    domain = new URL(url).hostname.replace('www.', '');
  } catch { /* ignore */ }
  return (
    <div
      className="w-full rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer"
      style={{ background: 'rgba(102,204,255,0.06)', border: '1px solid rgba(102,204,255,0.15)' }}
      onClick={() => console.log('[MediaPreview] Open link:', text)}
    >
      <div className="w-5 h-5 rounded flex items-center justify-center text-[10px]"
        style={{ background: 'rgba(102,204,255,0.15)', color: '#66ccff' }}>🔗</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono truncate" style={{ color: '#66ccff' }}>{domain}</div>
        <div className="text-[9px] truncate" style={{ color: '#475569' }}>{text}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Modals
   ═══════════════════════════════════════════ */

function VPSLinkModal({ onClose, blockHeight, parcelIndex }: { onClose: () => void; blockHeight: number; parcelIndex: number }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'linked'>('idle');
  const [linkTarget, setLinkTarget] = useState<'block' | 'parcel'>('parcel');

  const [error, setError] = useState('');
  const [connType, setConnType] = useState('https');

  const handleLink = async () => {
    if (!url) return;
    setStatus('verifying');
    setError('');
    try {
      const walletAddress = getStoredAddress();
      const challenge = `vps-link:${blockHeight}:${parcelIndex}:${Date.now()}`;
      const signature = typeof window !== 'undefined' && (window as any).unisat
        ? await (window as any).unisat.signMessage(challenge) : '';
      const res = await fetch('/api/v1/vps/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          blockHeight,
          parcelIndex: linkTarget === 'parcel' ? parcelIndex : null,
          serverUrl: url,
          connectionType: connType,
          signature,
          challenge,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link VPS');
      setStatus('linked');
    } catch (e: any) {
      setError(e.message);
      setStatus('idle');
    }
  };

  const targetAddress = linkTarget === 'block' ? `${blockHeight}.bitmap` : `${parcelIndex}.${blockHeight}.bitmap`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-[420px] rounded-2xl p-6" onClick={(e) => e.stopPropagation()} style={{ background: '#0f0f18', border: '1px solid rgba(247,147,26,0.2)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: '#f7931a' }}>🔗 Link VPS / Server</h3>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-lg">✕</button>
        </div>
        {/* Link target toggle */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => { setLinkTarget('block'); setStatus('idle'); }}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold transition-all"
            style={{
              background: linkTarget === 'block' ? 'rgba(247,147,26,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${linkTarget === 'block' ? 'rgba(247,147,26,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: linkTarget === 'block' ? '#f7931a' : '#64748b',
            }}>
            ⛓️ Entire Block
          </button>
          <button onClick={() => { setLinkTarget('parcel'); setStatus('idle'); }}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold transition-all"
            style={{
              background: linkTarget === 'parcel' ? 'rgba(247,147,26,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${linkTarget === 'parcel' ? 'rgba(247,147,26,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: linkTarget === 'parcel' ? '#f7931a' : '#64748b',
            }}>
            📦 Single Parcel
          </button>
        </div>
        <p className="text-[11px] mb-4" style={{ color: '#94a3b8' }}>
          Connect your server to {linkTarget === 'block' ? 'block' : 'parcel'} <span style={{ color: '#f7931a' }}>{targetAddress}</span>.
          {linkTarget === 'block'
            ? ' As block owner, you have full authority over every parcel in this block. All visitors will be redirected to your hosted experience.'
            : ' Visitors who click into your parcel will be redirected to your hosted experience.'}
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#64748b' }}>Server URL</label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-server.com or IP:port"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#64748b' }}>Connection Type</label>
            <div className="flex gap-2">
              {[{ label: 'HTTPS', value: 'https' }, { label: 'WebSocket', value: 'websocket' }, { label: 'WebRTC', value: 'webrtc' }].map(t => (
                <button key={t.value} onClick={() => setConnType(t.value)} className="px-3 py-1.5 rounded text-[10px] font-mono"
                  style={{
                    background: connType === t.value ? 'rgba(247,147,26,0.2)' : 'rgba(247,147,26,0.05)',
                    border: `1px solid ${connType === t.value ? 'rgba(247,147,26,0.4)' : 'rgba(247,147,26,0.15)'}`,
                    color: '#f7931a',
                  }}>{t.label}</button>
              ))}
            </div>
          </div>
          <div className="pt-2 space-y-2">
            <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}><span>🔐</span><span>Connection verified via BIP-322 signature from your wallet</span></div>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}><span>🛡️</span><span>All traffic encrypted end-to-end (TLS 1.3 + cert pinning)</span></div>
          </div>
          {error && <div className="text-[11px] px-3 py-2 rounded-lg" style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', color: '#ff6b6b' }}>⚠️ {error}</div>}
          <button onClick={handleLink} disabled={!url || status === 'verifying'}
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all"
            style={{
              background: status === 'linked' ? 'rgba(0,255,136,0.2)' : 'rgba(247,147,26,0.2)',
              border: `1px solid ${status === 'linked' ? '#00ff88' : '#f7931a'}`,
              color: status === 'linked' ? '#00ff88' : '#f7931a',
              opacity: !url ? 0.4 : 1,
            }}>
            {status === 'idle' ? '🔗 Verify & Link Server' : status === 'verifying' ? '⏳ Verifying ownership...' : '✅ Server Linked!'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Livestream Modal ─── */
type StreamType = 'broadcast' | 'townhall' | 'spatial';

function LivestreamModal({ onClose, blockHeight, parcelIndex, isStreaming, onStartStream, onEndStream, walletAddress }: {
  onClose: () => void; blockHeight: number; parcelIndex: number;
  isStreaming: boolean; onStartStream: (type: StreamType, url: string) => void; onEndStream: () => void;
  walletAddress: string | null;
}) {
  const [streamType, setStreamType] = useState<StreamType>('broadcast');
  const [streamUrl, setStreamUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamElapsed, setStreamElapsed] = useState(0);

  useEffect(() => {
    if (!isStreaming) { setStreamElapsed(0); return; }
    const timer = setInterval(() => setStreamElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const streamTypes: { key: StreamType; icon: string; label: string; desc: string }[] = [
    { key: 'broadcast', icon: '📺', label: 'Broadcast', desc: 'You stream on YouTube/Twitch, visitors watch here' },
    { key: 'townhall', icon: '🎤', label: 'Town Hall', desc: 'Stream + block chat for live Q&A' },
    { key: 'spatial', icon: '🗣️', label: 'Spatial Chat', desc: 'Proximity-based audio (coming soon)' },
  ];

  const handleStart = async () => {
    if (!streamUrl.trim()) { setError('Paste your stream URL'); return; }
    if (!walletAddress) { setError('Connect wallet first'); return; }

    // Quick client-side URL validation
    try {
      const u = new URL(streamUrl);
      const valid = u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be') ||
                    u.hostname.includes('twitch.tv') || u.hostname.includes('kick.com');
      if (!valid) { setError('Use a YouTube, Twitch, or Kick URL'); return; }
    } catch { setError('Invalid URL'); return; }

    setLoading(true);
    setError('');
    onStartStream(streamType, streamUrl);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-[460px] rounded-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ background: '#0f0f18', border: '1px solid rgba(255,51,51,0.25)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: '#ff3333' }}>📺 TimesSquare</h3>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-lg">✕</button>
        </div>
        <p className="text-[11px] mb-4 -mt-2" style={{ color: '#64748b' }}>Go live on your block — broadcast to every visitor on {blockHeight}.bitmap</p>

        {isStreaming && (
          <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(255,51,51,0.1)', border: '1px solid rgba(255,51,51,0.3)' }}>
            <style>{`@keyframes live-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
            <div className="w-3 h-3 rounded-full" style={{ background: '#ff3333', animation: 'live-pulse 1s ease-in-out infinite', boxShadow: '0 0 8px #ff3333' }} />
            <span className="text-sm font-mono font-bold" style={{ color: '#ff3333' }}>LIVE</span>
            <span className="text-sm font-mono" style={{ color: '#e2e8f0' }}>{fmtTime(streamElapsed)}</span>
          </div>
        )}

        {!isStreaming && (
          <>
            <div className="mb-4">
              <label className="text-[10px] uppercase tracking-wider block mb-2" style={{ color: '#64748b' }}>Stream Type</label>
              <div className="space-y-2">
                {streamTypes.map(st => (
                  <button key={st.key} onClick={() => setStreamType(st.key)}
                    className="w-full px-4 py-3 rounded-xl text-left transition-all flex items-center gap-3"
                    style={{
                      background: streamType === st.key ? 'rgba(255,51,51,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${streamType === st.key ? 'rgba(255,51,51,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    <span className="text-xl">{st.icon}</span>
                    <div>
                      <div className="text-[12px] font-bold" style={{ color: streamType === st.key ? '#ff3333' : '#e2e8f0' }}>{st.label}</div>
                      <div className="text-[10px]" style={{ color: '#64748b' }}>{st.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-[10px] uppercase tracking-wider block mb-2" style={{ color: '#64748b' }}>Stream URL</label>
              <input
                type="url"
                value={streamUrl}
                onChange={(e) => { setStreamUrl(e.target.value); setError(''); }}
                placeholder="https://youtube.com/live/... or twitch.tv/..."
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <div className="mt-2 flex gap-2">
                {['YouTube', 'Twitch', 'Kick'].map(p => (
                  <span key={p} className="text-[9px] px-2 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}>
                    {p === 'YouTube' ? '📺' : p === 'Twitch' ? '💜' : '💚'} {p}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="mb-3 text-xs text-red-400 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,0,0,0.1)' }}>
            {error}
          </div>
        )}

        <button
          onClick={() => isStreaming ? onEndStream() : handleStart()}
          disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          style={{
            background: isStreaming ? 'rgba(255,51,51,0.2)' : 'rgba(0,255,136,0.15)',
            border: `1.5px solid ${isStreaming ? '#ff3333' : '#00ff88'}`,
            color: isStreaming ? '#ff3333' : '#00ff88',
            boxShadow: isStreaming ? '0 0 20px rgba(255,51,51,0.2)' : '0 0 20px rgba(0,255,136,0.15)',
          }}>
          {loading ? '⏳ Connecting...' : isStreaming ? '⏹️ End Stream' : '📺 TimesSquare'}
        </button>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}><span>📺</span><span>Paste your YouTube, Twitch, or Kick URL — broadcast on your Times Square</span></div>
          <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}><span>🔐</span><span>Stream live on your block — your own Times Square — verified via BIP-322</span></div>
        </div>
      </div>
    </div>
  );
}

function AgentLinkModal({ onClose, blockHeight, parcelIndex }: { onClose: () => void; blockHeight: number; parcelIndex: number }) {
  const [agentUrl, setAgentUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'linked'>('idle');
  const [linkTarget, setLinkTarget] = useState<'block' | 'parcel'>('parcel');
  const [permissions, setPermissions] = useState({
    readDMs: true, sendDMs: true, manageContent: true,
    buildDecorate: false, handleOffers: false, fullAutonomy: false,
  });

  const [error, setError] = useState('');

  const handleLink = async () => {
    if (!agentUrl) return;
    setStatus('connecting');
    setError('');
    try {
      const walletAddress = getStoredAddress();
      const challenge = `agent-register:${blockHeight}:${parcelIndex}:${Date.now()}`;
      const signature = typeof window !== 'undefined' && (window as any).unisat
        ? await (window as any).unisat.signMessage(challenge) : '';

      // Map permission keys to AgentPermission enum values
      const permMap: Record<string, string> = {
        readDMs: 'READ_DMS', sendDMs: 'SEND_DMS', manageContent: 'MANAGE_CONTENT',
        buildDecorate: 'BUILD_DECORATE', handleOffers: 'HANDLE_OFFERS', fullAutonomy: 'FULL_AUTONOMY',
      };
      const permList = Object.entries(permissions).filter(([, v]) => v).map(([k]) => permMap[k]);

      const res = await fetch('/api/v1/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          endpointUrl: agentUrl,
          blockHeight,
          parcelIndex: linkTarget === 'parcel' ? parcelIndex : null,
          tier: 1,
          permissions: permList,
          signature,
          challenge,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register agent');
      setStatus('linked');
    } catch (e: any) {
      setError(e.message);
      setStatus('idle');
    }
  };

  const targetAddress = linkTarget === 'block' ? `${blockHeight}.bitmap` : `${parcelIndex}.${blockHeight}.bitmap`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-[440px] rounded-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ background: '#0f0f18', border: '1px solid rgba(0,255,136,0.2)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: '#00ff88' }}>🤖 Link AI Agent</h3>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-lg">✕</button>
        </div>
        {/* Link target toggle */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => { setLinkTarget('block'); setStatus('idle'); }}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold transition-all"
            style={{
              background: linkTarget === 'block' ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${linkTarget === 'block' ? 'rgba(0,255,136,0.35)' : 'rgba(255,255,255,0.08)'}`,
              color: linkTarget === 'block' ? '#00ff88' : '#64748b',
            }}>
            ⛓️ Entire Block
          </button>
          <button onClick={() => { setLinkTarget('parcel'); setStatus('idle'); }}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold transition-all"
            style={{
              background: linkTarget === 'parcel' ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${linkTarget === 'parcel' ? 'rgba(0,255,136,0.35)' : 'rgba(255,255,255,0.08)'}`,
              color: linkTarget === 'parcel' ? '#00ff88' : '#64748b',
            }}>
            📦 Single Parcel
          </button>
        </div>
        <p className="text-[11px] mb-4" style={{ color: '#94a3b8' }}>
          Connect an AI agent to manage <span style={{ color: '#f7931a' }}>{targetAddress}</span>.
          {linkTarget === 'block'
            ? ' As block owner, your agent gains full authority over every parcel — managing visitors, content, builds, and automation across the entire block.'
            : ' Your agent becomes the digital landlord — handling visitors, content, and automation for this parcel.'}
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: '#64748b' }}>Agent Endpoint</label>
            <input type="text" value={agentUrl} onChange={(e) => setAgentUrl(e.target.value)}
              placeholder="https://agent.example.com or OpenClaw gateway URL"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-2" style={{ color: '#64748b' }}>Permissions</label>
            <div className="space-y-2">
              {Object.entries(permissions).map(([key, val]) => {
                const labels: Record<string, string> = {
                  readDMs: '📨 Read incoming DMs', sendDMs: '💬 Reply to DMs', manageContent: '📝 Post & manage content',
                  buildDecorate: '🏗️ Build & decorate parcel', handleOffers: '💰 Handle offers & transactions', fullAutonomy: '🧠 Full autonomy (handle everything)',
                };
                return (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={val}
                      onChange={() => setPermissions(p => ({ ...p, [key]: !p[key as keyof typeof p] }))}
                      className="accent-emerald-500" />
                    <span className="text-[11px]" style={{ color: val ? '#e2e8f0' : '#64748b' }}>{labels[key]}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="pt-2 space-y-2">
            <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}><span>🔐</span><span>Agent authenticated via BIP-322 signed challenge</span></div>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}><span>🛡️</span><span>All agent communications secured · E2E encryption coming soon</span></div>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}><span>⚡</span><span>Revoke access anytime from your wallet</span></div>
          </div>
          {error && <div className="text-[11px] px-3 py-2 rounded-lg" style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', color: '#ff6b6b' }}>⚠️ {error}</div>}
          <button onClick={handleLink} disabled={!agentUrl || status === 'connecting'}
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all"
            style={{
              background: status === 'linked' ? 'rgba(0,255,136,0.2)' : 'rgba(0,255,136,0.1)',
              border: `1px solid ${status === 'linked' ? '#00ff88' : 'rgba(0,255,136,0.3)'}`,
              color: '#00ff88', opacity: !agentUrl ? 0.4 : 1,
            }}>
            {status === 'idle' ? '🤖 Connect Agent' : status === 'connecting' ? '⏳ Authenticating agent...' : '✅ Agent Connected!'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SEND BITCOIN MODAL
   ═══════════════════════════════════════════ */

function SendBitcoinModal({ onClose, blockHeight, recipientOwner }: {
  onClose: () => void; blockHeight: number; recipientOwner: OwnerData;
}) {
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'sats' | 'btc'>('sats');
  const [memo, setMemo] = useState('');
  const [status, setStatus] = useState<'idle' | 'signing' | 'sent' | 'error'>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  /* MOCK address fallback — real address would come from recipient's profile */
  const mockAddress = `bc1q${blockHeight.toString(16).padStart(8, '0')}${recipientOwner.handle.slice(0, 20).replace(/[^a-z0-9]/g, '')}`.slice(0, 42);

  const handleSend = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setStatus('signing');
    setErrorMsg('');

    const sats = unit === 'btc' ? Math.round(parseFloat(amount) * 1e8) : parseInt(amount);
    if (sats <= 0 || isNaN(sats)) { setStatus('idle'); setErrorMsg('Invalid amount'); return; }

    try {
      const walletType = getStoredType() || '';
      const toAddress = mockAddress; // TODO: replace with real recipient address from profile

      if (walletType === 'unisat' && window.unisat) {
        const result = await window.unisat.sendBitcoin(toAddress, sats);
        setTxId(typeof result === 'string' ? result : (result as any)?.txid || null);
        setStatus('sent');
      } else if (walletType === 'xverse' && window.BitcoinProvider) {
        // Xverse uses a different API for sending
        const resp = await window.BitcoinProvider!.request!('sendTransfer', {
          recipients: [{ address: toAddress, amount: sats }],
        });
        setTxId((resp as any)?.result?.txid || null);
        setStatus('sent');
      } else if (window.unisat) {
        // Fallback to unisat if available
        const result = await window.unisat.sendBitcoin(toAddress, sats);
        setTxId(typeof result === 'string' ? result : (result as any)?.txid || null);
        setStatus('sent');
      } else {
        throw new Error('No compatible wallet detected. Please connect Unisat or Xverse.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Transaction failed';
      if (msg.includes('User rejected') || msg.includes('cancel') || msg.includes('denied')) {
        setErrorMsg('Transaction cancelled by user');
      } else if (msg.includes('Insufficient') || msg.includes('insufficient') || msg.includes('not enough')) {
        setErrorMsg('Insufficient balance');
      } else {
        setErrorMsg(msg);
      }
      setStatus('error');
    }
  };

  const satsAmount = unit === 'btc' ? Math.round(parseFloat(amount || '0') * 1e8) : parseInt(amount || '0');
  const btcAmount = unit === 'sats' ? (parseInt(amount || '0') / 1e8).toFixed(8) : amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl p-6 w-[380px] max-h-[85vh] overflow-y-auto space-y-4"
        style={{ background: 'linear-gradient(135deg, #0f1419 0%, #1a1a2e 100%)', border: '1.5px solid rgba(247,147,26,0.3)', boxShadow: '0 0 40px rgba(247,147,26,0.15)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: '#f7931a' }}>⚡ Send Bitcoin</h3>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-lg">✕</button>
        </div>

        {/* Recipient */}
        <div className="rounded-xl p-3" style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>Sending to</div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a' }}>{recipientOwner.avatar}</div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-mono font-bold" style={{ color: '#e2e8f0' }}>@{recipientOwner.handle}</span>
                <CrownShield tier={recipientOwner.tier} size={12} />
              </div>
              <div className="text-[9px] font-mono" style={{ color: '#64748b' }}>{mockAddress.slice(0, 12)}...{mockAddress.slice(-6)}</div>
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-wider" style={{ color: '#64748b' }}>Amount</div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder={unit === 'sats' ? '10,000' : '0.0001'}
                className="w-full bg-transparent text-lg font-mono font-bold px-3 py-2.5 rounded-xl outline-none"
                style={{ border: '1.5px solid rgba(247,147,26,0.3)', color: '#f7931a' }} />
            </div>
            <div className="flex flex-col gap-1">
              {(['sats', 'btc'] as const).map(u => (
                <button key={u} onClick={() => setUnit(u)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all"
                  style={{
                    background: unit === u ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.03)',
                    color: unit === u ? '#f7931a' : '#64748b',
                    border: unit === u ? '1px solid rgba(247,147,26,0.4)' : '1px solid rgba(255,255,255,0.05)',
                  }}>{u.toUpperCase()}</button>
              ))}
            </div>
          </div>
          {amount && (
            <div className="text-[10px] font-mono" style={{ color: '#64748b' }}>
              {unit === 'sats' ? `= ₿ ${btcAmount}` : `= ${satsAmount.toLocaleString()} sats`}
            </div>
          )}
        </div>

        {/* Quick amounts */}
        <div className="flex gap-1.5">
          {[1000, 5000, 10000, 50000, 100000].map(s => (
            <button key={s} onClick={() => { setAmount(s.toString()); setUnit('sats'); }}
              className="flex-1 py-1.5 rounded-lg text-[9px] font-mono transition-all hover:brightness-130"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
              {s >= 1000 ? `${s / 1000}k` : s}
            </button>
          ))}
        </div>

        {/* Memo */}
        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-wider" style={{ color: '#64748b' }}>Memo (optional)</div>
          <input type="text" value={memo} onChange={e => setMemo(e.target.value)}
            placeholder="Thanks for the awesome block! 🔥"
            className="w-full bg-transparent text-[11px] font-mono px-3 py-2 rounded-lg outline-none"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
        </div>

        {/* Lightning option (future) */}
        <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(255,204,0,0.05)', border: '1px solid rgba(255,204,0,0.1)' }}>
          <span className="text-lg">⚡</span>
          <div>
            <div className="text-[10px] font-bold" style={{ color: '#ffcc00' }}>Lightning Network</div>
            <div className="text-[9px]" style={{ color: '#64748b' }}>Instant payments — coming soon</div>
          </div>
          <div className="ml-auto px-2 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(255,204,0,0.15)', color: '#ffcc00' }}>SOON</div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', color: '#ff6b6b' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Send button */}
        <button onClick={handleSend} disabled={!amount || parseFloat(amount) <= 0 || status === 'signing'}
          className="w-full py-3 rounded-xl text-sm font-mono font-bold transition-all active:scale-[0.97]"
          style={{
            background: status === 'sent' ? 'rgba(0,255,136,0.2)' : status === 'error' ? 'rgba(255,50,50,0.15)' : 'rgba(247,147,26,0.15)',
            border: `1.5px solid ${status === 'sent' ? '#00ff88' : status === 'error' ? 'rgba(255,50,50,0.4)' : 'rgba(247,147,26,0.4)'}`,
            color: status === 'sent' ? '#00ff88' : status === 'error' ? '#ff6b6b' : '#f7931a',
            opacity: (!amount || parseFloat(amount) <= 0) ? 0.4 : 1,
            boxShadow: status === 'sent' ? '0 0 20px rgba(0,255,136,0.2)' : '0 0 20px rgba(247,147,26,0.15)',
          }}>
          {status === 'idle' ? `⚡ Send ${satsAmount > 0 ? satsAmount.toLocaleString() + ' sats' : 'Bitcoin'}` : status === 'signing' ? '🔐 Waiting for wallet...' : status === 'sent' ? '✅ Sent!' : '🔄 Try Again'}
        </button>

        {/* Tx confirmation */}
        {status === 'sent' && txId && (
          <div className="rounded-lg px-3 py-2 text-center" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)' }}>
            <div className="text-[10px] font-bold mb-1" style={{ color: '#00ff88' }}>Transaction Broadcast ✓</div>
            <a href={`https://mempool.space/tx/${txId}`} target="_blank" rel="noopener noreferrer"
              className="text-[9px] font-mono hover:underline" style={{ color: '#f7931a' }}>
              {txId.slice(0, 16)}...{txId.slice(-8)} ↗
            </a>
          </div>
        )}

        <div className="text-[9px] text-center" style={{ color: '#475569' }}>
          Transaction signed with your connected wallet · On-chain BTC
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   QR PROFILE MODAL
   ═══════════════════════════════════════════ */

function QrProfileModal({ onClose, owner, blockHeight }: {
  onClose: () => void; owner: OwnerData; blockHeight: number;
}) {
  /* MOCK — replace with real address from wallet verification */
  const mockAddress = `bc1q${blockHeight.toString(16).padStart(8, '0')}${owner.handle.slice(0, 20).replace(/[^a-z0-9]/g, '')}`.slice(0, 42);

  // Generate QR code as SVG (simple visual representation)
  const qrSize = 200;
  const qrModules = useMemo(() => {
    const rng = seededRandom(blockHeight * 3571 + owner.handle.length * 7);
    const size = 25;
    const grid: boolean[][] = [];
    for (let y = 0; y < size; y++) {
      grid[y] = [];
      for (let x = 0; x < size; x++) {
        // QR-like pattern: corners have finder patterns, rest is pseudo-random
        const isCorner = (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
        const isBorder = isCorner && (x === 0 || y === 0 || x === 6 || y === 6 || x === size - 1 || y === size - 1 || x === size - 7 || y === size - 7);
        const isInner = isCorner && x >= 2 && x <= 4 && y >= 2 && y <= 4;
        const isInnerR = isCorner && x >= size - 5 && x <= size - 3 && y >= 2 && y <= 4;
        const isInnerB = isCorner && x >= 2 && x <= 4 && y >= size - 5 && y <= size - 3;
        grid[y][x] = isBorder || isInner || isInnerR || isInnerB || (!isCorner && rng() > 0.5);
      }
    }
    return grid;
  }, [blockHeight, owner.handle]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl p-6 w-[340px] space-y-4 text-center"
        style={{ background: 'linear-gradient(135deg, #0f1419 0%, #1a1a2e 100%)', border: '1.5px solid rgba(247,147,26,0.3)', boxShadow: '0 0 40px rgba(247,147,26,0.15)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: '#f7931a' }}>₿ Receive Bitcoin</h3>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-lg">✕</button>
        </div>

        {/* Owner info */}
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a' }}>{owner.avatar}</div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-mono font-bold" style={{ color: '#e2e8f0' }}>@{owner.handle}</span>
              <CrownShield tier={owner.tier} size={14} />
            </div>
            <span className="text-[9px] font-mono" style={{ color: '#64748b' }}>Block #{blockHeight.toLocaleString()}.bitmap</span>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="p-3 rounded-xl" style={{ background: '#ffffff' }}>
            <svg width={qrSize} height={qrSize} viewBox={`0 0 ${qrModules.length} ${qrModules.length}`}>
              {qrModules.map((row, y) => row.map((cell, x) =>
                cell ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#1a1a2e" /> : null
              ))}
              {/* Bitcoin logo in center */}
              <rect x={qrModules.length / 2 - 2.5} y={qrModules.length / 2 - 2.5} width={5} height={5} fill="#ffffff" rx={0.5} />
              <text x={qrModules.length / 2} y={qrModules.length / 2 + 1.5} textAnchor="middle" fill="#f7931a" fontSize="4" fontWeight="bold">₿</text>
            </svg>
          </div>
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <div className="text-[9px] uppercase tracking-wider" style={{ color: '#64748b' }}>Bitcoin Address</div>
          <div className="px-3 py-2 rounded-lg font-mono text-[10px] break-all cursor-pointer hover:brightness-130 transition-all"
            onClick={() => { navigator.clipboard.writeText(mockAddress); }}
            title="Click to copy"
            style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)', color: '#f7931a' }}>
            {mockAddress}
          </div>
          <div className="text-[9px]" style={{ color: '#475569' }}>Tap address to copy · Scan QR to send sats</div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(mockAddress); }}
            className="flex-1 py-2 rounded-lg text-[11px] font-mono font-bold transition-all hover:brightness-130"
            style={{ background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.25)', color: '#f7931a' }}>
            📋 Copy Address
          </button>
          <button onClick={() => { onClose(); }}
            className="flex-1 py-2 rounded-lg text-[11px] font-mono font-bold transition-all hover:brightness-130"
            style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88' }}>
            ⚡ Send Sats
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   DELEGATION LISTING MODAL (Owner sets prices)
   ═══════════════════════════════════════════ */

function DelegationListingModal({ onClose, blockHeight, parcelIndex, owner }: {
  onClose: () => void; blockHeight: number; parcelIndex: number; owner: OwnerData;
}) {
  const [monthlyPrice, setMonthlyPrice] = useState('10000');
  const [yearlyPrice, setYearlyPrice] = useState('100000');
  const [maxSpots, setMaxSpots] = useState('10');
  const [unlimited, setUnlimited] = useState(false);
  const [welcome, setWelcome] = useState('');
  const [status, setStatus] = useState<'idle' | 'publishing' | 'live'>('idle');
  const [scopeBlock, setScopeBlock] = useState(parcelIndex < 0);

  const isBlock = scopeBlock;
  const address = isBlock ? `${blockHeight}.bitmap` : `${parcelIndex}.${blockHeight}.bitmap`;
  const protocolFeeMonthly = Math.ceil(parseInt(monthlyPrice || '0') * 3 / 100);
  const protocolFeeYearly = Math.ceil(parseInt(yearlyPrice || '0') * 3 / 100);

  const [errorMsg, setErrorMsg] = useState('');

  const handlePublish = async () => {
    setErrorMsg('');
    setStatus('publishing');
    try {
      const walletAddress = getStoredAddress();
      const walletType = getStoredType() || '';
      if (!walletAddress) {
        window.dispatchEvent(new Event('open-wallet-modal'));
        setStatus('idle');
        return;
      }

      // Request real wallet signature
      const message = `List delegation for block ${blockHeight} on Block Genomics`;
      let signature = '';
      try {
        if (walletType === 'unisat' && window.unisat) {
          signature = await window.unisat.signMessage(message);
        } else if (walletType === 'xverse' && window.BitcoinProvider) {
          const resp = await window.BitcoinProvider.signMessage(message, { network: 'Mainnet' });
          signature = typeof resp === 'string' ? resp : (resp as any)?.signature || '';
        } else if (walletType === 'leather' && window.LeatherProvider) {
          const resp = await window.LeatherProvider.request('signMessage', { message, paymentType: 'p2tr' });
          signature = (resp as any)?.result?.signature || '';
        } else {
          // Fallback — try unisat
          if (window.unisat) {
            signature = await window.unisat.signMessage(message);
          } else {
            throw new Error('No wallet detected');
          }
        }
      } catch (signErr: any) {
        if (signErr?.message?.includes('User rejected') || signErr?.message?.includes('cancel')) {
          setErrorMsg('Signing cancelled');
        } else {
          setErrorMsg(signErr?.message || 'Wallet signing failed');
        }
        setStatus('idle');
        return;
      }

      if (!signature) {
        setErrorMsg('No signature received from wallet');
        setStatus('idle');
        return;
      }

      const res = await fetch('/api/v1/delegations/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          signature,
          message,
          blockHeight,
          parcelTxIndex: isBlock ? null : parcelIndex,
          tier: 3,
          spotsTotal: unlimited ? -1 : parseInt(maxSpots || '10'),
          price30d: parseInt(monthlyPrice || '0'),
          price365d: parseInt(yearlyPrice || '0'),
          welcomeMessage: welcome,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish');
      setStatus('live');
      // Log activity
      try {
        await fetch('/api/v1/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            action: 'delegation_list',
            metadata: { blockHeight, price30d: parseInt(monthlyPrice || '0'), price365d: parseInt(yearlyPrice || '0') },
          }),
        });
      } catch {}
    } catch (e: any) {
      console.error('Publish listing failed:', e);
      setErrorMsg(e?.message || 'Failed to publish listing');
      setStatus('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl p-6 w-[400px] max-h-[90vh] overflow-y-auto space-y-4"
        style={{ background: 'linear-gradient(135deg, #0f1419 0%, #1a1a2e 100%)', border: '1.5px solid rgba(170,68,255,0.3)', boxShadow: '0 0 40px rgba(170,68,255,0.15)' }}>
        
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: '#aa44ff' }}>🏷️ List for Delegation</h3>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-lg">✕</button>
        </div>

        {/* What you're listing */}
        <div className="rounded-xl p-3" style={{ background: 'rgba(170,68,255,0.06)', border: '1px solid rgba(170,68,255,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a' }}>{owner.avatar}</div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-mono font-bold" style={{ color: '#e2e8f0' }}>@{owner.handle}</span>
                <CrownShield tier={owner.tier} size={12} />
              </div>
              <div className="text-[10px] font-mono" style={{ color: '#f7931a' }}>{address}</div>
            </div>
          </div>
        </div>

        {/* Scope toggle: Entire Block vs Single Parcel */}
        <div className="flex gap-2">
          <button onClick={() => setScopeBlock(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all"
            style={isBlock ? { background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.5)', color: '#f7931a' } : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>
            ⛓️ Entire Block
          </button>
          <button onClick={() => setScopeBlock(false)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all"
            style={!isBlock ? { background: 'rgba(0,255,204,0.1)', border: '1px solid rgba(0,255,204,0.4)', color: '#00ffcc' } : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>
            📦 Single Parcel
          </button>
        </div>
        {isBlock && <p className="text-[10px]" style={{ color: '#94a3b8' }}>Full authority over every parcel in this block</p>}
        {!isBlock && <p className="text-[10px]" style={{ color: '#94a3b8' }}>Delegate access to parcel #{parcelIndex} only</p>}

        {/* Pricing — simple 2 options */}
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#94a3b8' }}>Set Your Prices</div>
          
          {/* Monthly */}
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold" style={{ color: '#e2e8f0' }}>📅 1 Month</span>
              <span className="text-[9px]" style={{ color: '#64748b' }}>30 days access</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" value={monthlyPrice} onChange={e => setMonthlyPrice(e.target.value)}
                className="flex-1 bg-transparent text-lg font-mono font-bold px-3 py-2 rounded-lg outline-none"
                style={{ border: '1.5px solid rgba(247,147,26,0.3)', color: '#f7931a' }}
                placeholder="10,000" />
              <span className="text-[11px] font-mono font-bold" style={{ color: '#94a3b8' }}>sats</span>
            </div>
            <div className="flex justify-between text-[9px]" style={{ color: '#475569' }}>
              <span>You receive: {(parseInt(monthlyPrice || '0') - protocolFeeMonthly).toLocaleString()} sats (97%)</span>
              <span>Fee: {protocolFeeMonthly.toLocaleString()} sats (3%)</span>
            </div>
          </div>

          {/* Yearly */}
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold" style={{ color: '#e2e8f0' }}>📅 1 Year</span>
              <div className="flex items-center gap-1">
                <span className="text-[9px]" style={{ color: '#64748b' }}>365 days access</span>
                {parseInt(yearlyPrice || '0') < parseInt(monthlyPrice || '0') * 12 && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88' }}>
                    SAVE {Math.round((1 - parseInt(yearlyPrice || '0') / (parseInt(monthlyPrice || '1') * 12)) * 100)}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" value={yearlyPrice} onChange={e => setYearlyPrice(e.target.value)}
                className="flex-1 bg-transparent text-lg font-mono font-bold px-3 py-2 rounded-lg outline-none"
                style={{ border: '1.5px solid rgba(247,147,26,0.3)', color: '#f7931a' }}
                placeholder="100,000" />
              <span className="text-[11px] font-mono font-bold" style={{ color: '#94a3b8' }}>sats</span>
            </div>
            <div className="flex justify-between text-[9px]" style={{ color: '#475569' }}>
              <span>You receive: {(parseInt(yearlyPrice || '0') - protocolFeeYearly).toLocaleString()} sats (97%)</span>
              <span>Fee: {protocolFeeYearly.toLocaleString()} sats (3%)</span>
            </div>
          </div>
        </div>

        {/* Available spots */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#94a3b8' }}>Available Spots</div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} className="accent-[#aa44ff]" />
              <span className="text-[11px]" style={{ color: '#e2e8f0' }}>Unlimited</span>
            </label>
            {!unlimited && (
              <input type="number" value={maxSpots} onChange={e => setMaxSpots(e.target.value)}
                className="w-20 bg-transparent text-sm font-mono font-bold px-2 py-1.5 rounded-lg outline-none text-center"
                style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#e2e8f0' }}
                min="1" max="1000" />
            )}
            {!unlimited && <span className="text-[10px]" style={{ color: '#64748b' }}>people max</span>}
          </div>
        </div>

        {/* Welcome message */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#94a3b8' }}>Welcome Message <span className="font-normal">(optional)</span></div>
          <input type="text" value={welcome} onChange={e => setWelcome(e.target.value)}
            placeholder="Welcome to my block! Enjoy exploring 🎮"
            className="w-full bg-transparent text-[11px] font-mono px-3 py-2 rounded-lg outline-none"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
        </div>

        {/* Summary */}
        <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(170,68,255,0.06)', border: '1px solid rgba(170,68,255,0.12)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#aa44ff' }}>Listing Summary</div>
          <div className="flex justify-between text-[10px]"><span style={{ color: '#94a3b8' }}>Location</span><span style={{ color: '#f7931a' }}>{address}</span></div>
          <div className="flex justify-between text-[10px]"><span style={{ color: '#94a3b8' }}>Monthly</span><span style={{ color: '#e2e8f0' }}>{parseInt(monthlyPrice || '0').toLocaleString()} sats</span></div>
          <div className="flex justify-between text-[10px]"><span style={{ color: '#94a3b8' }}>Yearly</span><span style={{ color: '#e2e8f0' }}>{parseInt(yearlyPrice || '0').toLocaleString()} sats</span></div>
          <div className="flex justify-between text-[10px]"><span style={{ color: '#94a3b8' }}>Spots</span><span style={{ color: '#e2e8f0' }}>{unlimited ? '∞ Unlimited' : maxSpots}</span></div>
          <div className="flex justify-between text-[10px]"><span style={{ color: '#94a3b8' }}>Your share</span><span style={{ color: '#00ff88' }}>97%</span></div>
          <div className="flex justify-between text-[10px]"><span style={{ color: '#94a3b8' }}>Protocol fee</span><span style={{ color: '#64748b' }}>3%</span></div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', color: '#ff6b6b' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Publish */}
        <button onClick={handlePublish} disabled={status === 'publishing' || !monthlyPrice || !yearlyPrice}
          className="w-full py-3 rounded-xl text-sm font-mono font-bold transition-all active:scale-[0.97]"
          style={{
            background: status === 'live' ? 'rgba(0,255,136,0.2)' : 'rgba(170,68,255,0.15)',
            border: `1.5px solid ${status === 'live' ? '#00ff88' : 'rgba(170,68,255,0.4)'}`,
            color: status === 'live' ? '#00ff88' : '#aa44ff',
            opacity: (!monthlyPrice || !yearlyPrice) ? 0.4 : 1,
            boxShadow: `0 0 20px ${status === 'live' ? 'rgba(0,255,136,0.2)' : 'rgba(170,68,255,0.15)'}`,
          }}>
          {status === 'idle' ? '🏷️ Publish Listing' : status === 'publishing' ? '🔐 Signing with wallet...' : '✅ Listed! Visitors can now apply'}
        </button>

        <div className="text-[9px] text-center" style={{ color: '#475569' }}>
          Listing is signed with your wallet · You can update or remove anytime
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   GET ACCESS MODAL (Visitor applies for Tier 3)
   ═══════════════════════════════════════════ */

function GetAccessModal({ onClose, blockHeight, parcelIndex, owner }: {
  onClose: () => void; blockHeight: number; parcelIndex: number; owner: OwnerData;
}) {
  const [selectedDuration, setSelectedDuration] = useState<30 | 365>(30);
  const [status, setStatus] = useState<'idle' | 'signing' | 'confirmed'>('idle');
  const [listing, setListing] = useState<any>(null);
  const [loadingListing, setLoadingListing] = useState(true);

  const isBlock = parcelIndex < 0;
  const address = isBlock ? `${blockHeight}.bitmap` : `${parcelIndex}.${blockHeight}.bitmap`;

  // Fetch real listing data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/delegations/listings?blockHeight=${blockHeight}&active=true`);
        const data = await res.json();
        if (data.data?.listings?.length > 0) {
          // Find matching listing (block-level or parcel-level)
          const match = data.data.listings.find((l: any) =>
            isBlock ? l.parcelTxIndex === null : l.parcelTxIndex === parcelIndex
          ) || data.data.listings[0];
          setListing(match);
        }
      } catch (e) {
        console.error('Failed to fetch listing:', e);
      } finally {
        setLoadingListing(false);
      }
    })();
  }, [blockHeight, parcelIndex, isBlock]);

  const monthlyPrice = listing?.price30d ?? 10000;
  const yearlyPrice = listing?.price365d ?? 100000;
  const price = selectedDuration === 30 ? monthlyPrice : yearlyPrice;
  const protocolFee = Math.ceil(price * 3 / 100);
  const ownerShare = price - protocolFee;
  const spotsLeft = listing ? (listing.spotsTotal === -1 ? 999 : Math.max(0, listing.spotsTotal - listing.spotsUsed)) : 0;

  const handlePay = async () => {
    setStatus('signing');
    try {
      const buyerAddress = getStoredAddress();
      const res = await fetch('/api/v1/delegations/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: buyerAddress,
          signature: 'mock-sig',
          message: 'Purchase delegation',
          listingId: listing?.id,
          durationDays: selectedDuration,
          txId: `mock-tx-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purchase failed');
      setStatus('confirmed');
    } catch (e: any) {
      console.error('Purchase failed:', e);
      setStatus('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl p-6 w-[380px] max-h-[85vh] overflow-y-auto space-y-4"
        style={{ background: 'linear-gradient(135deg, #0f1419 0%, #1a1a2e 100%)', border: '1.5px solid rgba(170,68,255,0.3)', boxShadow: '0 0 40px rgba(170,68,255,0.15)' }}>
        
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: '#aa44ff' }}>🎫 Get Access</h3>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-lg">✕</button>
        </div>

        {/* What you're accessing */}
        <div className="rounded-xl p-3" style={{ background: 'rgba(170,68,255,0.06)', border: '1px solid rgba(170,68,255,0.15)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a' }}>{owner.avatar}</div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-mono font-bold" style={{ color: '#e2e8f0' }}>@{owner.handle}</span>
                <CrownShield tier={owner.tier} size={12} />
              </div>
              <div className="text-[10px] font-mono" style={{ color: '#f7931a' }}>{address}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px]" style={{ color: '#22c55e' }}>🟢 {spotsLeft} spots left</div>
            </div>
          </div>
        </div>

        {/* Duration picker — just 2 big buttons */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#94a3b8' }}>Choose Duration</div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { days: 30 as const, label: '1 Month', price: monthlyPrice },
              { days: 365 as const, label: '1 Year', price: yearlyPrice },
            ]).map(opt => (
              <button key={opt.days} onClick={() => setSelectedDuration(opt.days)}
                className="rounded-xl p-4 text-center transition-all active:scale-95"
                style={{
                  background: selectedDuration === opt.days ? 'rgba(170,68,255,0.15)' : 'rgba(255,255,255,0.02)',
                  border: `1.5px solid ${selectedDuration === opt.days ? 'rgba(170,68,255,0.5)' : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: selectedDuration === opt.days ? '0 0 15px rgba(170,68,255,0.2)' : 'none',
                }}>
                <div className="text-[13px] font-bold mb-1" style={{ color: selectedDuration === opt.days ? '#aa44ff' : '#94a3b8' }}>
                  {opt.label}
                </div>
                <div className="text-lg font-mono font-bold" style={{ color: '#f7931a' }}>
                  {opt.price.toLocaleString()}
                </div>
                <div className="text-[10px]" style={{ color: '#64748b' }}>sats</div>
                {opt.days === 365 && yearlyPrice < monthlyPrice * 12 && (
                  <div className="mt-1 px-2 py-0.5 rounded text-[8px] font-bold inline-block" style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88' }}>
                    SAVE {Math.round((1 - yearlyPrice / (monthlyPrice * 12)) * 100)}%
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* What you get */}
        <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-1 font-bold" style={{ color: '#94a3b8' }}>What You Get</div>
          {['👁 Explore the Nexus & view all blocks', '💬 Chat in public block spaces', '🛒 Shop & transact on published experiences', '😎 Custom display name & avatar'].map((item, i) => (
            <div key={i} className="text-[10px] flex items-center gap-1.5" style={{ color: '#e2e8f0' }}>
              <span>{item}</span>
            </div>
          ))}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="text-[9px]" style={{ color: '#aa44ff' }}>🟣 Tier 3 — Purple Badge</div>
          </div>
        </div>

        {/* Pay button */}
        <button onClick={handlePay} disabled={status === 'signing'}
          className="w-full py-3.5 rounded-xl text-sm font-mono font-bold transition-all active:scale-[0.97]"
          style={{
            background: status === 'confirmed' ? 'rgba(0,255,136,0.2)' : 'rgba(247,147,26,0.15)',
            border: `1.5px solid ${status === 'confirmed' ? '#00ff88' : 'rgba(247,147,26,0.4)'}`,
            color: status === 'confirmed' ? '#00ff88' : '#f7931a',
            boxShadow: `0 0 20px ${status === 'confirmed' ? 'rgba(0,255,136,0.2)' : 'rgba(247,147,26,0.15)'}`,
          }}>
          {status === 'idle' ? `⚡ Pay ${price.toLocaleString()} sats` : status === 'signing' ? '🔐 Sign with wallet...' : '✅ Access Granted! Welcome 🎉'}
        </button>

        <div className="text-[9px] text-center space-y-0.5" style={{ color: '#475569' }}>
          <div>97% goes to the {isBlock ? 'block' : 'parcel'} owner · 3% protocol fee</div>
          <div>On-chain Bitcoin transaction · Signed with your wallet</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Visitor Counter Overlay
   ═══════════════════════════════════════════ */

function VisitorOverlay({ count }: { count: number }) {
  return (
    <div className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: 'rgba(10,10,15,0.85)', border: '1px solid rgba(247,147,26,0.15)', backdropFilter: 'blur(8px)' }}>
      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.3); } }`}</style>
      <div className="w-2 h-2 rounded-full" style={{ background: '#22c55e', animation: 'pulse-dot 2s ease-in-out infinite', boxShadow: '0 0 6px #22c55e' }} />
      <span className="text-[11px] font-mono" style={{ color: '#94a3b8' }}>
        👁 <span style={{ color: '#e2e8f0' }}>{count}</span> viewing
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SPATIAL SOCIAL LAYER — Mock Data
   ═══════════════════════════════════════════ */

const SPATIAL_EMOJIS = ['🔥', '👍', '⚡', '❤️', '🎮', '💎'];

interface SpatialAvatar {
  id: number;
  name: string;
  color: string;
  parcelIndex: number;
  active: boolean;
}

function generateMockAvatars(blockHeight: number, parcelCount: number): SpatialAvatar[] {
  const rng = seededRandom(blockHeight * 5501);
  const count = 5 + Math.floor(rng() * 11); // 5-15
  const avatars: SpatialAvatar[] = [];
  const names = MOCK_HANDLES;
  for (let i = 0; i < count; i++) {
    const hue = 20 + rng() * 30;
    avatars.push({
      id: i,
      name: names[Math.floor(rng() * names.length)],
      color: `hsl(${hue}, 80%, ${50 + rng() * 20}%)`,
      parcelIndex: Math.floor(rng() * parcelCount),
      active: rng() > 0.5,
    });
  }
  return avatars;
}

const MOCK_SPATIAL_MESSAGES = [
  'This block is amazing! 🔥',
  'GM from the Nexus ☀️',
  'Anyone building here?',
  'Love this coinbase parcel',
  'Just exploring around',
  'Bitcoin is beautiful 💎',
  'The energy beams are wild',
  'Wagmi 🚀',
];

function generateMockActivities(blockHeight: number): string[] {
  const rng = seededRandom(blockHeight * 8837);
  const activities = [
    `⚡ satoshi_fan claimed parcel ${Math.floor(rng() * 100)}.${blockHeight}.bitmap`,
    `👁 bitmap_whale is exploring block ${blockHeight.toLocaleString()}`,
    `🏗️ nexus_dev deployed a new experience`,
    `🔥 ${1 + Math.floor(rng() * 5)} reactions on the coinbase parcel`,
    `💬 anon_42: This block has amazing energy`,
    `💎 block_builder minted a rare inscription`,
    `🎮 pixel_punk launched a game on parcel ${Math.floor(rng() * 50)}`,
    `⚡ lightning_lord zapped 1000 sats to the block`,
    `👁 ${2 + Math.floor(rng() * 20)} visitors on block ${blockHeight.toLocaleString()}`,
    `🏗️ hash_hunter is building on parcel ${Math.floor(rng() * 80)}`,
    `💬 crypto_whale: Who wants to collab?`,
    `🔥 ordinal_og inscribed on this block`,
  ];
  return activities;
}

/* ═══════════════════════════════════════════
   Spatial Social Components (3D)
   — Limited to max 8 avatars, 2 speech bubbles, 3 reactions
   ═══════════════════════════════════════════ */

function SpatialAvatars({ avatars, parcels }: { avatars: SpatialAvatar[]; parcels: ParcelData[] }) {
  // Limit to max 8 avatars for performance
  const visibleAvatars = useMemo(() => avatars.slice(0, 8), [avatars]);
  const groupRef = useRef<THREE.Group>(null);
  const avatarRefs = useRef<(THREE.Group | null)[]>([]);
  const wanderTargets = useRef<{ x: number; z: number }[]>([]);

  useEffect(() => {
    wanderTargets.current = visibleAvatars.map(a => {
      const p = parcels[Math.min(a.parcelIndex, parcels.length - 1)];
      return { x: p.x, z: p.z };
    });
  }, [visibleAvatars, parcels]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    avatarRefs.current.forEach((ref, i) => {
      if (!ref || i >= visibleAvatars.length) return;
      const a = visibleAvatars[i];
      const target = wanderTargets.current[i];
      if (!target) return;

      if (Math.sin(t * 0.1 + i * 3.7) > 0.98) {
        const rng = seededRandom(Math.floor(t * 10) + i * 777);
        const newIdx = Math.min(Math.max(0, a.parcelIndex + Math.floor(rng() * 5) - 2), parcels.length - 1);
        const np = parcels[newIdx];
        target.x = np.x;
        target.z = np.z;
      }

      ref.position.x += (target.x - ref.position.x) * 0.01;
      ref.position.z += (target.z - ref.position.z) * 0.01;
      ref.position.y = 0.35 + Math.sin(t * 2 + i * 1.3) * 0.05;
    });
  });

  return (
    <group ref={groupRef}>
      {visibleAvatars.map((a, i) => {
        const p = parcels[Math.min(a.parcelIndex, parcels.length - 1)];
        const color = new THREE.Color(a.color);
        const emissiveIntensity = a.active ? 0.6 : 0.15;

        return (
          <group key={a.id} ref={(el) => { avatarRefs.current[i] = el; }} position={[p.x, 0.35, p.z]}>
            <mesh position={[0, 0, 0]}>
              <cylinderGeometry args={[0.06, 0.08, 0.2, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} />
            </mesh>
            <mesh position={[0, 0.16, 0]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} />
            </mesh>
            <Html position={[0, 0.35, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
              <div style={{
                background: 'rgba(10,10,15,0.85)',
                color: a.active ? '#f7931a' : '#64748b',
                fontSize: '8px',
                fontFamily: 'monospace',
                padding: '1px 4px',
                borderRadius: '3px',
                border: `1px solid ${a.active ? 'rgba(247,147,26,0.3)' : 'rgba(255,255,255,0.1)'}`,
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}>
                🤖 {a.name}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function SpatialMessages({ avatars, parcels }: { avatars: SpatialAvatar[]; parcels: ParcelData[] }) {
  const [visibleMessages, setVisibleMessages] = useState<{ avatarIdx: number; text: string; opacity: number; id: number }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleMessages(prev => {
        const filtered = prev.filter(m => m.opacity > 0);
        if (filtered.length >= 2) return filtered; // max 2 (was 4)
        const avatarIdx = Math.floor(Math.random() * Math.min(avatars.length, 8));
        const text = MOCK_SPATIAL_MESSAGES[Math.floor(Math.random() * MOCK_SPATIAL_MESSAGES.length)];
        return [...filtered, { avatarIdx, text, opacity: 1, id: nextId.current++ }];
      });
    }, 3500);

    const fadeInterval = setInterval(() => {
      setVisibleMessages(prev => prev.map(m => ({ ...m, opacity: m.opacity - 0.02 })).filter(m => m.opacity > 0));
    }, 100);

    return () => { clearInterval(interval); clearInterval(fadeInterval); };
  }, [avatars.length]);

  return (
    <group>
      {visibleMessages.map(m => {
        if (m.avatarIdx >= avatars.length) return null;
        const a = avatars[m.avatarIdx];
        const p = parcels[Math.min(a.parcelIndex, parcels.length - 1)];

        return (
          <Html key={m.id} position={[p.x, 0.7, p.z]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div style={{
              background: 'rgba(10,10,15,0.88)',
              color: '#e2e8f0',
              fontSize: '11px',
              fontFamily: 'monospace',
              padding: '4px 8px',
              borderRadius: '8px',
              border: '1px solid rgba(247,147,26,0.2)',
              maxWidth: '120px',
              opacity: Math.min(m.opacity, 1),
              transition: 'opacity 0.3s',
              userSelect: 'none',
              position: 'relative',
            }}>
              {m.text}
              <div style={{
                position: 'absolute',
                bottom: '-5px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '5px solid rgba(10,10,15,0.88)',
              }} />
            </div>
          </Html>
        );
      })}
    </group>
  );
}

function SpatialReactions({ parcels, reactions }: { parcels: ParcelData[]; reactions: { id: number; parcelIndex: number; emoji: string; y: number; opacity: number }[] }) {
  // Limit to max 3 visible reactions (was 6)
  const visibleReactions = useMemo(() => reactions.slice(0, 3), [reactions]);

  return (
    <group>
      {visibleReactions.map(r => {
        const p = parcels[Math.min(r.parcelIndex, parcels.length - 1)];

        return (
          <Html key={r.id} position={[p.x, r.y, p.z]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
            <div style={{ fontSize: '16px', opacity: r.opacity, userSelect: 'none', transition: 'opacity 0.2s' }}>
              {r.emoji}
            </div>
          </Html>
        );
      })}
    </group>
  );
}

/* ─── Live Activity Ticker (overlay) — memoized to prevent re-renders ─── */
const LiveActivityTicker = memo(function LiveActivityTicker({ activities }: { activities: string[] }) {
  const text = activities.join('    ·    ');
  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      background: 'rgba(10,10,15,0.85)',
      borderTop: '1px solid rgba(247,147,26,0.15)',
      overflow: 'hidden',
      height: '28px',
      display: 'flex',
      alignItems: 'center',
    }}>
      <style>{`@keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
      <div style={{
        display: 'flex',
        whiteSpace: 'nowrap',
        animation: 'ticker-scroll 40s linear infinite',
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#c8a050',
      }}>
        <span style={{ paddingRight: '60px' }}>{text}</span>
        <span style={{ paddingRight: '60px' }}>{text}</span>
      </div>
    </div>
  );
});

/* ─── Livestream 3D Overlay ─── */
function LivestreamOverlay3D({ parcel, ownerData, viewerCount }: { parcel: ParcelData; ownerData: OwnerData; viewerCount: number }) {
  const h = Math.max(0.15, parcel.buildHeight * 4);

  return (
    <group>
      <Html position={[parcel.x, h + 2.5, parcel.z]} center distanceFactor={6} style={{ pointerEvents: 'none' }}>
        <div style={{
          width: 200, background: 'rgba(10,10,15,0.92)', borderRadius: 12,
          border: '1px solid rgba(255,51,51,0.3)', overflow: 'hidden', userSelect: 'none',
          boxShadow: '0 0 30px rgba(255,51,51,0.15)',
        }}>
          <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, background: '#ff3333', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8, fontFamily: 'monospace' }}>
            🔴 LIVE
          </div>
          <div style={{ width: '100%', height: 110, background: 'linear-gradient(135deg, #6b21a8, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28, opacity: 0.7 }}>▶</span>
          </div>
          <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#e2e8f0', fontFamily: 'monospace' }}>@{ownerData.handle}</span>
            <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginLeft: 'auto' }}>👁 {viewerCount} watching</span>
          </div>
          <div style={{ padding: '0 10px 6px', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 10 }}>🔊</span>
            {[3,5,2,4,3].map((h2,i) => (
              <div key={i} style={{
                width: 2, height: h2, background: '#ff3333', borderRadius: 1,
                animation: `audio-bar-${i} 0.5s ease-in-out infinite alternate`,
              }} />
            ))}
            <style>{`
              @keyframes audio-bar-0 { to { height: 6px; } }
              @keyframes audio-bar-1 { to { height: 3px; } }
              @keyframes audio-bar-2 { to { height: 7px; } }
              @keyframes audio-bar-3 { to { height: 2px; } }
              @keyframes audio-bar-4 { to { height: 5px; } }
            `}</style>
          </div>
        </div>
      </Html>
    </group>
  );
}

function LivestreamPulseRing({ parcel }: { parcel: ParcelData }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const scale = 1 + Math.sin(t * 3) * 0.15;
    ref.current.scale.set(scale, scale, 1);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 3) * 0.3;
  });

  const ringSize = Math.max(parcel.width, parcel.depth) * 0.6;
  return (
    <mesh ref={ref} position={[parcel.x, 0.03, parcel.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[ringSize, ringSize * 1.18, 4]} />
      <meshBasicMaterial color="#ff3333" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

function LivestreamBeam({ parcel }: { parcel: ParcelData }) {
  const ref = useRef<THREE.Mesh>(null);
  const h = Math.max(0.15, parcel.buildHeight * 4);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(t * 2) * 0.04;
    ref.current.scale.y = 1 + Math.sin(t * 1.5) * 0.2;
  });

  return (
    <mesh ref={ref} position={[parcel.x, h + 4, parcel.z]}>
      <cylinderGeometry args={[0.02, 0.15, 8, 8]} />
      <meshBasicMaterial color="#ff3333" transparent opacity={0.08} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/* ─── Emoji Reaction Bar (overlay) ─── */
function EmojiReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 36,
      left: 16,
      zIndex: 30,
      display: 'flex',
      gap: '4px',
      background: 'rgba(10,10,15,0.9)',
      border: '1px solid rgba(247,147,26,0.2)',
      borderRadius: '20px',
      padding: '4px 8px',
      backdropFilter: 'blur(8px)',
    }}>
      {SPATIAL_EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          style={{
            fontSize: '18px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: '6px',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.3)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Standard Bitmap Canvas (2D Bitfeed-style rendering)
   ═══════════════════════════════════════════ */

function StandardBitmapCanvas({ blockHeight, parcels }: { blockHeight: number; parcels: ParcelData[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [magicEdenUrl, setMagicEdenUrl] = useState<string | null>(null);
  const [showME, setShowME] = useState(false);

  // Try to fetch Magic Eden image for comparison
  useEffect(() => {
    fetch(`/api/v1/bitmap-image/${blockHeight}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.imageUrl) setMagicEdenUrl(json.data.imageUrl);
      })
      .catch(() => {});
  }, [blockHeight]);

  // Render bitmap on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || parcels.length === 0) return;

    const SIZE = 576; // Match Magic Eden's 576×576
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White background (matches Magic Eden / Bitmap.Community standard)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Calculate grid sizes (Bitfeed formula)
    const squares = parcels.map((p, i) => ({
      index: i,
      gridSize: Math.max(1, Math.ceil(Math.sqrt(p.bytes / 256))),
      vbytes: p.bytes,
      isCoinbase: p.isCoinbase,
    }));

    // Grid dimensions from total area
    const totalArea = squares.reduce((s, sq) => s + sq.gridSize * sq.gridSize, 0);
    const gridW = Math.ceil(Math.sqrt(totalArea));
    const pxPerGrid = SIZE / gridW;

    // Thin gaps (~1-2px) matching Magic Eden standard bitmap images
    const padding = Math.max(pxPerGrid * 0.03, 0.5);

    // Occupancy grid
    const gridH = gridW + 50;
    const occupied: boolean[][] = [];
    for (let r = 0; r < gridH; r++) occupied.push(new Array(gridW).fill(false));

    // Uniform orange with slight brightness variation (standard bitmap color)
    const baseHue = 28;
    const baseSat = 90;

    for (const sq of squares) {
      const size = sq.gridSize;
      let placed = false;

      for (let row = 0; row < gridH - size + 1 && !placed; row++) {
        for (let col = 0; col <= gridW - size && !placed; col++) {
          let fits = true;
          for (let dr = 0; dr < size && fits; dr++) {
            for (let dc = 0; dc < size && fits; dc++) {
              if (occupied[row + dr]?.[col + dc]) fits = false;
            }
          }
          if (fits) {
            for (let dr = 0; dr < size; dr++) {
              for (let dc = 0; dc < size; dc++) {
                if (occupied[row + dr]) occupied[row + dr][col + dc] = true;
              }
            }

            // Draw the parcel square
            const x = col * pxPerGrid + padding;
            const y = row * pxPerGrid + padding;
            const w = size * pxPerGrid - padding * 2;
            const h = size * pxPerGrid - padding * 2;

            // Color: uniform orange with slight brightness variation
            const lightness = sq.isCoinbase ? 65 : 45 + (sq.vbytes % 20);
            ctx.fillStyle = `hsl(${baseHue}, ${baseSat}%, ${lightness}%)`;
            ctx.fillRect(x, y, Math.max(0.5, w), Math.max(0.5, h));

            placed = true;
          }
        }
      }
    }
  }, [parcels, blockHeight]);

  return (
    <div className="relative flex flex-col items-center gap-4">
      <div className="relative">
        {/* Our rendering */}
        <canvas
          ref={canvasRef}
          className="rounded-lg shadow-2xl"
          style={{
            border: '2px solid rgba(247,147,26,0.4)',
            borderRadius: '8px',
            imageRendering: 'pixelated',
            width: 'min(70vh, 576px)',
            height: 'min(70vh, 576px)',
            display: showME ? 'none' : 'block',
          }}
        />
        {/* Magic Eden image (when available and toggled) */}
        {showME && magicEdenUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={magicEdenUrl}
            alt={`${blockHeight}.bitmap`}
            className="rounded-lg shadow-2xl"
            style={{
              border: '2px solid rgba(0,245,212,0.3)',
              imageRendering: 'pixelated',
              width: 'min(70vh, 576px)',
              height: 'min(70vh, 576px)',
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="text-[10px] font-mono" style={{ color: '#64748b' }}>
          {showME ? '🟦 Magic Eden Official' : '🟧 Block Genomics Render'} · {blockHeight.toLocaleString()}.bitmap · {parcels.length} transactions
        </div>
        {magicEdenUrl && (
          <button
            onClick={() => setShowME(!showME)}
            className="px-3 py-1 rounded-md text-[10px] font-mono transition-all hover:brightness-125"
            style={{
              background: showME ? 'rgba(0,245,212,0.15)' : 'rgba(247,147,26,0.15)',
              border: `1px solid ${showME ? 'rgba(0,245,212,0.3)' : 'rgba(247,147,26,0.3)'}`,
              color: showME ? '#00f5d4' : '#f7931a',
            }}
          >
            {showME ? '← Our Render' : 'Compare Magic Eden →'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════ */

export default function ParcelView({ blockHeight, onBack }: Props) {
  const { walletAddress, isConnected, profile, e2eReady, e2eSetup, e2eEncrypt, e2eDecrypt } = useGlobalWallet();
  const isVerified = !!(isConnected && walletAddress && profile);
  const isWalletConnected = !!(isConnected && walletAddress);
  const ownerLock = !isWalletConnected ? 'connect' : (!isVerified ? 'verify' : null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showTransferPrep, setShowTransferPrep] = useState(false);
  const openWalletModal = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('open-wallet-modal'));
    }
  };
  const handleOwnerAction = (fn: () => void) => {
    if (!isWalletConnected) {
      openWalletModal();
      return;
    }
    if (!isVerified) {
      // Connected but not verified — show upgrade path
      setShowUpgradeModal(true);
      return;
    }
    fn();
  };
  const [viewMode, setViewMode] = useState<ViewMode>('isometric');
  const [autoTour, setAutoTour] = useState(true);
  const [streetTeleport, setStreetTeleport] = useState<ParcelData | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>('properties');
  const [panelSize, setPanelSize] = useState<PanelSize>('quarter');
  const [hoveredParcel, setHoveredParcel] = useState<ParcelData | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelData | null>(null);
  const [parcelNavIndex, setParcelNavIndex] = useState(0);
  const [showVPSModal, setShowVPSModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showWorldBuilder, setShowWorldBuilder] = useState(false);
  const [worldToolMode, setWorldToolMode] = useState<'select' | 'move' | 'rotate' | 'scale'>('select');
  const [selectedWorldObjectId, setSelectedWorldObjectId] = useState<string | null>(null);
  const worldData = useWorldObjects(blockHeight);
  const [guardianStatus, setGuardianStatus] = useState<'active' | 'paused' | 'none'>('none');

  // Game logic state
  const [gameElements, setGameElements] = useState<GameElement[]>([]);
  const [gameState, setGameState] = useState<{ score: number; xp: number; level: number; coins: number; collected?: string | null; questProgress?: string | null; achievements?: string | null; inventory?: string | null } | null>(null);
  const [gameQuests, setGameQuests] = useState<{ id: string; name: string; icon?: string; steps: { type: string; target: string; count: number }[] }[]>([]);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);

  // Load game elements
  useEffect(() => {
    fetch(`/api/v1/game/elements?blockHeight=${blockHeight}`)
      .then(r => r.json())
      .then(d => { if (d.elements) setGameElements(d.elements); })
      .catch(() => {});
  }, [blockHeight]);

  // Load game state when wallet connected
  useEffect(() => {
    if (!walletAddress) return;
    fetch(`/api/v1/game/state?blockHeight=${blockHeight}&wallet=${walletAddress}`)
      .then(r => r.json())
      .then(d => { if (d.state) setGameState(d.state); })
      .catch(() => {});
    fetch(`/api/v1/game/quests?blockHeight=${blockHeight}`)
      .then(r => r.json())
      .then(d => { if (d.quests) setGameQuests(d.quests.map((q: { steps: string; [key: string]: unknown }) => ({ ...q, steps: JSON.parse(q.steps) }))); })
      .catch(() => {});
  }, [blockHeight, walletAddress]);

  const handleGameClaim = useCallback(async (elementId: string) => {
    if (!walletAddress) return;
    try {
      const res = await fetch('/api/v1/game/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId, walletAddress, blockHeight }),
      });
      const data = await res.json();
      if (data.success) {
        setGameState(data.newState);
        if (data.achievements?.length > 0) setNewAchievements(data.achievements);
      }
    } catch (err) {
      console.error('[GameClaim]', err);
    }
  }, [walletAddress, blockHeight]);
  const [guardianName, setGuardianName] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatMode, setChatMode] = useState<'block' | 'dm' | 'global'>('block');
  const [e2eStatus, setE2eStatus] = useState<'idle' | 'setting-up' | 'ready' | 'failed'>('idle');

  // Auto-setup E2E encryption when switching to DM tab
  useEffect(() => {
    if (chatMode === 'dm' && isConnected && !e2eReady && e2eStatus === 'idle') {
      setE2eStatus('setting-up');
      e2eSetup().then(ok => setE2eStatus(ok ? 'ready' : 'failed')).catch(() => setE2eStatus('failed'));
    } else if (chatMode === 'dm' && e2eReady) {
      setE2eStatus('ready');
    }
  }, [chatMode, isConnected, e2eReady, e2eSetup, e2eStatus]);

  // ═══ Supabase Realtime Chat ═══
  const userHandle = profile?.handle || walletAddress?.slice(0, 8) || '';
  useRealtimeChat({
    blockHeight,
    channel: chatMode,
    enabled: true,
    onMessage: useCallback(async (msg: RealtimeChatMessage) => {
      // Skip messages sent by this user (already added optimistically)
      if (msg.senderAddress === walletAddress) return;
      
      const chatMsg: ChatMessage = {
        id: msg.id,
        sender: msg.senderHandle || msg.senderAddress.slice(0, 8),
        text: msg.text,
        time: new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        type: msg.type as ChatMessage['type'],
        createdAt: msg.createdAt,
      };

      // Decrypt encrypted DM messages
      if (msg.type === 'encrypted' && e2eReady) {
        try {
          const encPayload = JSON.parse(msg.text);
          const decrypted = await e2eDecrypt(encPayload);
          if (decrypted) {
            chatMsg.text = decrypted.text;
            chatMsg.type = 'text';
          }
        } catch {
          chatMsg.text = '🔒 Encrypted message (unable to decrypt)';
          chatMsg.type = 'text';
        }
      }

      setChatMessages(prev => {
        // Deduplicate by id
        if (prev.some(m => m.id === chatMsg.id)) return prev;
        // Remove demo messages
        const real = prev.filter(m => !m.isDemo);
        return [...real, chatMsg];
      });
    }, [walletAddress, e2eReady, e2eDecrypt]),
  });

  // ═══ Presence (viewers + typing) ═══
  const { viewers: realtimeViewers, typingUsers, sendTyping, viewerCount: realtimeViewerCount } = usePresence({
    blockHeight,
    channel: chatMode,
    userHandle,
    userAddress: walletAddress || undefined,
    enabled: !!(walletAddress),
  });

  // Debounced typing indicator
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTyping = useCallback(() => {
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => sendTyping(), 300);
  }, [sendTyping]);

  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<any>(null);
  const [spatialReactions, setSpatialReactions] = useState<{ id: number; parcelIndex: number; emoji: string; y: number; opacity: number }[]>([]);
  const reactionIdRef = useRef(0);

  const [showEstateModal, setShowEstateModal] = useState(false);
  const [hoveredEstateId, setHoveredEstateId] = useState<string | null>(null);
  const [showSendBtcModal, setShowSendBtcModal] = useState(false);
  const [showQrProfile, setShowQrProfile] = useState(false);
  const [showDelegationListing, setShowDelegationListing] = useState(false);
  const [activeListing, setActiveListing] = useState<any>(null);

  // Fetch active delegation listing for this block
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/delegations/listings?blockHeight=${blockHeight}&active=true`);
        const data = await res.json();
        if (data.data?.listings?.length > 0) setActiveListing(data.data.listings[0]);
      } catch {}
    })();
  }, [blockHeight]);
  const [showGetAccess, setShowGetAccess] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const prevPanelSize = useRef<PanelSize>('quarter');
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
      prevPanelSize.current = panelSize;
      setPanelSize('hidden'); // auto-hide panel for immersion
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
      setPanelSize(prevPanelSize.current); // restore panel
    }
  }, [panelSize]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* ─── Land Customization State ─── */
  const [parcelCustomizations, setParcelCustomizations] = useState<Map<number, ParcelCustomization>>(new Map());
  const [blockCustomization, setBlockCustomization] = useState<BlockCustomization>({});
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);

  const handleParcelCustomize = useCallback((txIndex: number, custom: ParcelCustomization) => {
    setParcelCustomizations(prev => {
      const next = new Map(prev);
      if (!custom.color && !custom.pattern && !custom.imageUrl && !custom.emissive) {
        next.delete(txIndex);
      } else {
        next.set(txIndex, custom);
      }
      return next;
    });
  }, []);

  const handleImageUpload = useCallback((txIndex: number, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setParcelCustomizations(prev => {
        const next = new Map(prev);
        const existing = next.get(txIndex) || {};
        next.set(txIndex, { ...existing, imageUrl: url });
        return next;
      });
    };
    reader.readAsDataURL(file);
  }, []);

  const [isSavingCustomization, setIsSavingCustomization] = useState(false);
  const [customizeSaveMsg, setCustomizeSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load saved customizations from DB on block load
  useEffect(() => {
    if (!blockHeight) return;
    (async () => {
      try {
        const res = await fetch(`/api/v1/blocks/${blockHeight}/parcels`);
        if (!res.ok) return;
        const data = await res.json();
        const parcelsArr = data.data || data;
        const loaded = new Map<number, ParcelCustomization>();
        for (const p of parcelsArr) {
          if (p.customColor || p.pattern || p.imageUrl || p.emissive) {
            loaded.set(p.txIndex, {
              color: p.customColor || undefined,
              pattern: p.pattern || undefined,
              imageUrl: p.imageUrl || undefined,
              rotation: p.rotation ?? 0,
              facing: p.facing || 'north',
              emissive: p.emissive || false,
            });
          }
        }
        if (loaded.size > 0) setParcelCustomizations(loaded);
      } catch { /* silent */ }
    })();
  }, [blockHeight]);

  const handleSaveCustomization = useCallback(async (txIndex: number) => {
    if (!walletAddress || isSavingCustomization) return;
    const custom = parcelCustomizations.get(txIndex);
    if (!custom) return;

    setIsSavingCustomization(true);
    setCustomizeSaveMsg(null);

    try {
      // Sign message with wallet
      const message = `Customize parcel ${txIndex} on block ${blockHeight} at ${Date.now()}`;
      let signature = '';

      const walletType = getStoredType();
      if (walletType === 'unisat' && (window as any).unisat?.signMessage) {
        signature = await (window as any).unisat.signMessage(message);
      } else if (walletType === 'xverse' && (window as any).XverseProviders?.signMessage) {
        const resp = await (window as any).XverseProviders.signMessage({ message, address: walletAddress });
        signature = resp?.signature || resp;
      } else if ((window as any).unisat?.signMessage) {
        signature = await (window as any).unisat.signMessage(message);
      } else {
        // Fallback: use a mock signature for development
        signature = 'dev-sig-' + Date.now();
      }

      const res = await fetch(`/api/v1/blocks/${blockHeight}/parcels/${txIndex}/customize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          signature,
          message,
          customColor: custom.color || null,
          pattern: custom.pattern || null,
          imageUrl: custom.imageUrl || null,
          rotation: custom.rotation ?? 0,
          facing: custom.facing || 'north',
          emissive: custom.emissive || false,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(err.error || 'Save failed');
      }

      setCustomizeSaveMsg({ type: 'success', text: '✅ Customization saved!' });
      setTimeout(() => setCustomizeSaveMsg(null), 3000);
    } catch (e: any) {
      setCustomizeSaveMsg({ type: 'error', text: `❌ ${e.message || 'Save failed'}` });
      setTimeout(() => setCustomizeSaveMsg(null), 5000);
    } finally {
      setIsSavingCustomization(false);
    }
  }, [walletAddress, blockHeight, parcelCustomizations, isSavingCustomization]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [activeStreamType, setActiveStreamType] = useState<StreamType>('broadcast');
  const [streamStartTime, setStreamStartTime] = useState<number | null>(null);
  const [showLivestreamModal, setShowLivestreamModal] = useState(false);
  const [streamElapsed, setStreamElapsed] = useState(0);
  const [streamViewerCount] = useState(0);
  const [streamEmbedUrl, setStreamEmbedUrl] = useState<string | null>(null);

  // Check for active stream on load
  useEffect(() => {
    fetch(`/api/v1/livestream?blockHeight=${blockHeight}`)
      .then(r => r.json())
      .then(data => {
        if (data.live) {
          setIsStreaming(true);
          setStreamEmbedUrl(data.embedUrl);
          setActiveStreamType(data.streamType || 'broadcast');
          setStreamStartTime(data.startedAt ? new Date(data.startedAt).getTime() : Date.now());
        }
      })
      .catch(() => {});
  }, [blockHeight]);

  useEffect(() => {
    if (!isStreaming || !streamStartTime) { setStreamElapsed(0); return; }
    const timer = setInterval(() => setStreamElapsed(Math.floor((Date.now() - streamStartTime) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isStreaming, streamStartTime]);

  const handleStartStream = useCallback(async (type: StreamType, url: string) => {
    if (!walletAddress) return;
    try {
      const message = `Go Live on block ${blockHeight} at ${Date.now()}`;
      const walletType = getStoredType();
      let signature = '';
      if (walletType === 'unisat' && window.unisat) {
        signature = await window.unisat.signMessage(message);
      } else if (walletType === 'xverse' && window.BitcoinProvider) {
        const res = await window.BitcoinProvider.signMessage(message, { network: "Mainnet" });
        signature = typeof res === 'string' ? res : (res as { signature?: string })?.signature || '';
      }
      
      const resp = await fetch('/api/v1/livestream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockHeight, streamUrl: url, streamType: type, walletAddress, signature, message }),
      });
      const data = await resp.json();
      if (data.ok) {
        setActiveStreamType(type);
        setIsStreaming(true);
        setStreamStartTime(Date.now());
        setStreamEmbedUrl(data.embedUrl);
      }
    } catch (e) {
      console.error('Failed to start stream:', e);
    }
  }, [walletAddress, blockHeight]);

  const handleEndStream = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const message = `End stream on block ${blockHeight} at ${Date.now()}`;
      const walletType = getStoredType();
      let signature = '';
      if (walletType === 'unisat' && window.unisat) {
        signature = await window.unisat.signMessage(message);
      } else if (walletType === 'xverse' && window.BitcoinProvider) {
        const res = await window.BitcoinProvider.signMessage(message, { network: "Mainnet" });
        signature = typeof res === 'string' ? res : (res as { signature?: string })?.signature || '';
      }

      await fetch('/api/v1/livestream', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockHeight, walletAddress, signature, message }),
      });
    } catch (e) {
      console.error('Failed to end stream:', e);
    }
    setIsStreaming(false);
    setStreamStartTime(null);
    setStreamEmbedUrl(null);
  }, [walletAddress, blockHeight]);

  // Fetch real blockchain data, fall back to mock
  const [realBlock, setRealBlock] = useState<RealBlockData | null>(null);
  const [dataSource, setDataSource] = useState<'loading' | 'real' | 'mock'>('loading');
  
  // (Standard bitmap rendering handled by StandardBitmapCanvas component)

  useEffect(() => {
    let cancelled = false;
    setDataSource('loading');
    setRealBlock(null);
    fetchRealBlock(blockHeight).then(data => {
      if (cancelled) return;
      setRealBlock(data);
      setDataSource(data ? 'real' : 'mock');
    });
    return () => { cancelled = true; };
  }, [blockHeight]);

  // Only generate parcels once we know if we have real data or not
  const parcels = useMemo(() => {
    return generateParcels(blockHeight, realBlock);
  
  }, [blockHeight, realBlock, dataSource]);
  // Showcase city buildings for featured blocks
  const showcaseInput = useMemo(() =>
    parcels.map(p => ({ txIndex: p.txIndex, x: p.x, z: p.z, width: p.width, depth: p.depth, bytes: p.bytes, isCoinbase: p.isCoinbase })),
    [parcels]
  );
  const showcaseBuildings = useShowcaseBuildings(blockHeight, showcaseInput);

  const cols = Math.ceil(Math.sqrt(parcels.length)); // kept for rough reference
  const rows = Math.ceil(parcels.length / cols);
  const block = generateBlock(blockHeight);
  // Override block stats with real data when available
  const blockStats = useMemo(() => ({
    txCount: realBlock?.txCount ?? block.txCount,
    size: realBlock?.size ?? block.size,
    weight: realBlock?.weight ?? (block.size * 4),
    hash: realBlock?.hash ?? block.hash,
    vbytes: realBlock ? realBlock.txs.reduce((s, t) => s + t.size, 0) : undefined,
  }), [realBlock, block]);

  /* Fetch real block owner from DB, fallback to mock */
  const [realBlockOwner, setRealBlockOwner] = useState<OwnerData | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/v1/blocks/${blockHeight}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const owner = data?.data?.owner;
        if (owner?.handle && !cancelled) {
          setRealBlockOwner({
            handle: owner.handle,
            avatar: '₿',
            tier: (owner.tier || 1) as 1 | 2 | 3,
            verified: true,
          });
        }
      } catch { /* fallback to mock */ }
    })();
    return () => { cancelled = true; };
  }, [blockHeight]);
  const blockOwner = realBlockOwner || generateMockOwner(blockHeight, -1);
  // Check if current wallet user is the block owner
  const isBlockOwner = false; // TODO: compare walletAddress against on-chain ownership — for now, owner actions are gated on wallet connection
  // Fetch guardian status
  useEffect(() => {
    fetch(`/api/v1/guardian?blockHeight=${blockHeight}`)
      .then(r => r.json())
      .then(data => {
        const g = data.guardians?.[0];
        if (g && g.status === 'active') {
          setGuardianStatus('active');
          setGuardianName(g.name || `Guardian #${blockHeight}`);
        } else if (g && g.status === 'paused') {
          setGuardianStatus('paused');
          setGuardianName(g.name || `Guardian #${blockHeight}`);
        } else {
          setGuardianStatus('none');
        }
      })
      .catch(() => setGuardianStatus('none'));
  }, [blockHeight]);

  const visitorCount = useMemo(() => generateMockVisitors(blockHeight), [blockHeight]);
  const spatialAvatars = useMemo(() => generateMockAvatars(blockHeight, parcels.length), [blockHeight, parcels.length]);
  const mockActivities = useMemo(() => generateMockActivities(blockHeight), [blockHeight]);
  const estates = useMemo(() => generateMockEstates(blockHeight, parcels), [blockHeight, parcels]);
  const estateByParcel = useMemo(() => {
    const map = new Map<number, Estate>();
    estates.forEach(e => e.parcelIndices.forEach(idx => map.set(idx, e)));
    return map;
  }, [estates]);
  const hoveredEstate = useMemo(() => hoveredEstateId ? estates.find(e => e.id === hoveredEstateId) ?? null : null, [estates, hoveredEstateId]);

  // Animate spatial reactions (rising + fading)
  useEffect(() => {
    const interval = setInterval(() => {
      setSpatialReactions(prev => {
        let next = prev.map(r => ({ ...r, y: r.y + 0.02, opacity: r.opacity - 0.008 })).filter(r => r.opacity > 0);
        if (next.length < 3 && Math.random() > 0.6) { // max 3 (was 4)
          const rng = seededRandom(Date.now());
          next.push({
            id: reactionIdRef.current++,
            parcelIndex: Math.floor(rng() * parcels.length),
            emoji: SPATIAL_EMOJIS[Math.floor(rng() * SPATIAL_EMOJIS.length)],
            y: 0.5,
            opacity: 1,
          });
        }
        return next;
      });
    }, 80);
    return () => clearInterval(interval);
  }, [parcels.length]);

  const handleEmojiReact = useCallback((emoji: string) => {
    const parcelIdx = selectedParcel?.txIndex ?? 0;
    setSpatialReactions(prev => [...prev, {
      id: reactionIdRef.current++,
      parcelIndex: parcelIdx,
      emoji,
      y: 0.5,
      opacity: 1,
    }]);
  }, [selectedParcel]);

  const totalBytes = parcels.reduce((s, p) => s + p.bytes, 0);
  const totalValue = parcels.reduce((s, p) => s + p.value, 0);
  const displayParcel = selectedParcel || (parcelNavIndex < parcels.length ? parcels[parcelNavIndex] : null);
  const displayParcelOwner = useMemo(() => {
    if (!displayParcel) return null;
    // Use real block owner if available (don't show mock names for owned blocks)
    if (realBlockOwner) return realBlockOwner;
    return generateMockOwner(blockHeight, displayParcel.txIndex);
  }, [blockHeight, displayParcel, realBlockOwner]);

  // Real chat: fetch messages from API + poll every 3s
  const lastMessageTime = useRef<string | null>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChatMessages = useCallback(async (afterTime?: string | null, channel?: string) => {
    try {
      const ch = channel || 'block';
      const params = new URLSearchParams({ channel: ch });
      if (afterTime) params.set('after', afterTime);
      const url = `/api/v1/chat/${blockHeight}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const rawMsgs = (json.data || []).map((m: { id: string; senderHandle?: string; senderAddress: string; text: string; type: string; createdAt: string; senderTier?: number; senderVerified?: boolean }) => ({
        id: m.id,
        sender: m.senderHandle || m.senderAddress.slice(0, 8),
        text: m.text,
        time: new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        type: m.type as ChatMessage['type'],
        createdAt: m.createdAt,
        ownerData: m.senderTier ? { handle: m.senderHandle || m.senderAddress.slice(0, 8), tier: m.senderTier as 1 | 2 | 3 } : undefined,
        isOwner: m.senderTier === 1,
      }));

      // Decrypt encrypted DM messages client-side
      const msgs: ChatMessage[] = await Promise.all(rawMsgs.map(async (m: ChatMessage) => {
        if (m.type === 'encrypted' && e2eReady) {
          try {
            const encPayload = JSON.parse(m.text);
            const decrypted = await e2eDecrypt(encPayload);
            if (decrypted) {
              return { ...m, text: decrypted.text, type: 'text' as const, encrypted: true };
            }
          } catch { /* decryption failed — show as locked */ }
          return { ...m, text: '🔒 Encrypted message (unable to decrypt)', type: 'text' as const };
        }
        return m;
      }));
      if (msgs.length > 0) {
        lastMessageTime.current = msgs[msgs.length - 1].createdAt || null;
        if (afterTime) {
          setChatMessages(prev => [...prev, ...msgs]);
        } else {
          // Initial load: show real messages, or mock as demo if none
          if (msgs.length === 0) {
            setChatMessages(generateMockChat(blockHeight).map(m => ({ ...m, isDemo: true })));
          } else {
            setChatMessages(msgs);
          }
        }
      } else if (!afterTime) {
        // No real messages — show mock as demo
        setChatMessages(generateMockChat(blockHeight).map(m => ({ ...m, isDemo: true })));
      }
    } catch {
      // On error, show demo messages
      if (!afterTime) {
        setChatMessages(generateMockChat(blockHeight).map(m => ({ ...m, isDemo: true })));
      }
    }
  }, [blockHeight, e2eReady, e2eDecrypt]);

  useEffect(() => {
    lastMessageTime.current = null;
    fetchChatMessages(null, chatMode);
    chatPollRef.current = setInterval(() => {
      fetchChatMessages(lastMessageTime.current, chatMode);
    }, 3000);
    return () => {
      if (chatPollRef.current) clearInterval(chatPollRef.current);
    };
  }, [blockHeight, chatMode, fetchChatMessages]);

  const navigateParcel = (delta: number) => {
    const newIdx = Math.max(0, Math.min(parcels.length - 1, parcelNavIndex + delta));
    setParcelNavIndex(newIdx);
    setSelectedParcel(parcels[newIdx]);
  };

  const computeFlyTarget = useCallback((p: ParcelData, closeUp: boolean): FlyTarget => {
    const h = Math.max(0.15, p.buildHeight * 4);
    const dist = closeUp ? 1.5 : 3.5;
    return {
      position: new THREE.Vector3(p.x + dist * 0.6, h + dist * 0.8, p.z + dist * 0.6),
      lookAt: new THREE.Vector3(p.x, h / 2, p.z),
      closeUp,
    };
  }, []);

  const handleParcelClick = useCallback((p: ParcelData) => {
    setSelectedParcel(p);
    setParcelNavIndex(p.txIndex);
    if (viewMode === 'street' || viewMode === 'flyover') {
      // Teleport warp in street/flyover view
      if (viewMode === 'street') setStreetTeleport({ ...p }); // new ref to trigger effect
    } else {
      const target = computeFlyTarget(p, false);
      setFlyTarget(target);
      if (controlsRef.current) controlsRef.current.enabled = false;
    }
  }, [computeFlyTarget, viewMode]);

  const handleParcelDoubleClick = useCallback((p: ParcelData) => {
    setSelectedParcel(p);
    setParcelNavIndex(p.txIndex);
    const target = computeFlyTarget(p, true);
    setFlyTarget(target);
    if (controlsRef.current) controlsRef.current.enabled = false;
  }, [computeFlyTarget]);

  const handleFlyComplete = useCallback(() => {
    setFlyTarget(null);
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
      if (flyTarget) {
        controlsRef.current.target.copy(flyTarget.lookAt);
      }
    }
  }, [flyTarget]);

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    if (!isVerified) return; // Security: require verified wallet to send
    const text = chatInput;
    setChatInput('');

    // Get wallet from localStorage
    let senderAddress = getStoredAddress() || 'anonymous';
    let senderHandle = senderAddress !== 'anonymous' ? senderAddress.slice(0, 8) : 'You';
    try {
      const walletData = localStorage.getItem('bg_wallet');
      if (walletData) {
        const parsed = JSON.parse(walletData);
        senderHandle = parsed.handle || parsed.name || senderAddress.slice(0, 8);
      }
    } catch { /* use defaults */ }

    // Optimistic local add
    const optimisticMsg: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      sender: senderHandle,
      text,
      time: 'now',
      type: text.startsWith('http') ? 'link' : 'text',
    };
    setChatMessages(prev => {
      // Remove demo messages once a real message is sent
      const real = prev.filter(m => !m.isDemo);
      return [...real, optimisticMsg];
    });

    try {
      // E2E encrypt DMs — server stores only ciphertext
      let msgText = text;
      let msgType = text.startsWith('http') ? 'link' : 'text';
      if (chatMode === 'dm' && e2eReady && realBlockOwner?.handle) {
        const encrypted = await e2eEncrypt(text, realBlockOwner.handle);
        if (encrypted) {
          msgText = JSON.stringify(encrypted);
          msgType = 'encrypted';
        }
      }

      const res = await fetch(`/api/v1/chat/${blockHeight}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderAddress,
          senderHandle,
          text: msgText,
          type: msgType,
          channel: chatMode,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const m = json.data;
        // Replace optimistic with real
        setChatMessages(prev => prev.map(msg =>
          msg.id === optimisticMsg.id ? {
            ...msg,
            id: m.id,
            time: new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            createdAt: m.createdAt,
          } : msg
        ));
        lastMessageTime.current = m.createdAt;
      }
    } catch { /* optimistic message stays */ }
  };

  const viewModes: { mode: ViewMode; icon: string; label: string }[] = [
    { mode: 'standard', icon: '🟧', label: 'Standard Bitmap' },
    { mode: 'flat', icon: '▦', label: 'Grid View' },
    { mode: 'isometric', icon: '◇', label: 'Isometric' },
    { mode: 'heights', icon: '▥', label: 'Heights' },
    { mode: 'dna', icon: '🧬', label: 'Genome' },
    { mode: 'street', icon: '🚶', label: 'Street View' },
    { mode: 'flyover', icon: '🦅', label: 'Flyover' },
  ];

  // Dimension display helpers
  const fmtDim = (worldUnits: number) => Math.round(worldUnits * METERS_PER_UNIT);

  return (
    <div ref={containerRef} className="relative w-full h-full flex" style={{ background: '#0a0a0f' }}>
      {showWorldBuilder && (
        <div className="fixed right-0 top-0 h-full z-50" style={{ width: '320px', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
          <WorldBuilderPanel
            blockHeight={blockHeight}
            ownerAddress={walletAddress || ''}
            onClose={() => setShowWorldBuilder(false)}
            objects={worldData.objects}
            onObjectsChange={worldData.setObjects}
            selectedObjectId={selectedWorldObjectId}
            onSelectObject={setSelectedWorldObjectId}
            terrain={worldData.terrain}
            onTerrainChange={worldData.setTerrain}
            toolMode={worldToolMode}
            onToolModeChange={setWorldToolMode}
          />
        </div>
      )}
      {showVPSModal && <VPSLinkModal onClose={() => setShowVPSModal(false)} blockHeight={blockHeight} parcelIndex={displayParcel?.txIndex ?? 0} />}
      {showAgentModal && <GuardianConfigPanel
        blockHeight={blockHeight}
        ownerAddress={getStoredAddress()}
        onClose={() => setShowAgentModal(false)}
        walletSign={async (msg: string) => {
          if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).unisat) {
            return await ((window as unknown as Record<string, unknown>).unisat as { signMessage: (m: string) => Promise<string> }).signMessage(msg);
          }
          return '';
        }}
      />}
      {showEstateModal && <EstateModal onClose={() => setShowEstateModal(false)} blockHeight={blockHeight} parcels={parcels} />}
      {showLivestreamModal && <LivestreamModal onClose={() => setShowLivestreamModal(false)} blockHeight={blockHeight} parcelIndex={displayParcel?.txIndex ?? 0} isStreaming={isStreaming} onStartStream={handleStartStream} onEndStream={handleEndStream} walletAddress={walletAddress} />}

      {/* Live Stream Embed — visible to ALL visitors when stream is active */}
      {isStreaming && streamEmbedUrl && !showLivestreamModal && (
        <div className="fixed bottom-4 right-4 z-40 rounded-xl overflow-hidden shadow-2xl" style={{ border: '2px solid rgba(255,51,51,0.5)', width: 400, height: 240 }}>
          <div className="flex items-center justify-between px-3 py-1.5" style={{ background: 'rgba(15,15,24,0.95)' }}>
            <div className="flex items-center gap-2">
              <style>{`@keyframes live-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`}</style>
              <div className="w-2 h-2 rounded-full" style={{ background: '#ff3333', animation: 'live-dot 1s ease-in-out infinite' }} />
              <span className="text-[10px] font-mono font-bold" style={{ color: '#ff3333' }}>LIVE</span>
              <span className="text-[10px] font-mono" style={{ color: '#64748b' }}>{activeStreamType}</span>
            </div>
            <button onClick={() => setStreamEmbedUrl(null)} className="text-[#64748b] hover:text-white text-xs">✕</button>
          </div>
          <iframe
            src={streamEmbedUrl}
            width="100%"
            height="208"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            style={{ border: 'none' }}
          />
        </div>
      )}
      {showSendBtcModal && <SendBitcoinModal onClose={() => setShowSendBtcModal(false)} blockHeight={blockHeight} recipientOwner={displayParcelOwner ?? blockOwner} />}
      {showQrProfile && <QrProfileModal onClose={() => setShowQrProfile(false)} owner={displayParcelOwner ?? blockOwner} blockHeight={blockHeight} />}
      {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} currentTier={3} />}
      {showTransferPrep && <TransferPrepModal
        onClose={() => setShowTransferPrep(false)}
        blockHeight={blockHeight}
        guardianCount={guardianStatus ? 1 : 0}
        walletAddress={walletAddress || ''}
        walletSign={async (msg: string) => {
          if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).unisat) {
            return await ((window as unknown as Record<string, unknown>).unisat as { signMessage: (m: string) => Promise<string> }).signMessage(msg);
          }
          return '';
        }}
      />}
      {showDelegationListing && <DelegationListingModal onClose={() => setShowDelegationListing(false)} blockHeight={blockHeight} parcelIndex={displayParcel?.txIndex ?? -1} owner={displayParcelOwner ?? blockOwner} />}
      {showGetAccess && <GetAccessModal onClose={() => setShowGetAccess(false)} blockHeight={blockHeight} parcelIndex={displayParcel?.txIndex ?? -1} owner={displayParcelOwner ?? blockOwner} />}

      {/* Left sidebar — view toggles */}
      <div className="absolute top-16 left-3 z-30 flex flex-col gap-3">
        {viewModes.map(({ mode, icon, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className="w-[60px] h-[60px] rounded-xl flex items-center justify-center text-2xl transition-all group relative active:scale-95"
            style={{
              background: viewMode === mode ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.04)',
              border: viewMode === mode ? '1.5px solid #f7931a' : '1.5px solid rgba(255,255,255,0.1)',
              color: viewMode === mode ? '#f7931a' : '#64748b',
              boxShadow: viewMode === mode ? '0 0 20px rgba(247,147,26,0.3), inset 0 0 15px rgba(247,147,26,0.1)' : '0 0 8px rgba(0,0,0,0.3)',
            }}
            title={label}
          >
            {icon}
            <span className="absolute left-[68px] px-3 py-1.5 rounded-lg text-[11px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ background: 'rgba(10,10,15,0.95)', border: '1px solid rgba(247,147,26,0.25)', color: '#e2e8f0', boxShadow: '0 0 12px rgba(247,147,26,0.15)' }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Street View controls HUD */}
      {viewMode === 'street' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-2xl"
          style={{ background: 'rgba(10,10,15,0.85)', border: '1px solid rgba(247,147,26,0.2)', backdropFilter: 'blur(12px)' }}>
          <span className="text-[11px] font-mono text-slate-400">
            <span className="text-amber-400">WASD</span> / <span className="text-amber-400">↑↓←→</span> Walk
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-[11px] font-mono text-slate-400">
            <span className="text-amber-400">Shift</span> Run
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-[11px] font-mono text-slate-400">
            <span className="text-amber-400">Click + Drag</span> Look
          </span>
        </div>
      )}

      {/* Flyover HUD */}
      {viewMode === 'flyover' && (
        <>
          {/* Top-left: altitude & speed */}
          <div className="absolute top-4 left-4 z-40 flex flex-col gap-2 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(10,10,15,0.85)', border: '1px solid rgba(247,147,26,0.2)', backdropFilter: 'blur(12px)', fontFamily: 'monospace' }}>
            <span className="text-[13px] text-amber-400">ALT: {Math.round(FLY_HEIGHT * METERS_PER_UNIT)}m</span>
            <span className="text-[13px] text-slate-400">SPD: <span className="text-amber-300">{autoTour ? '72' : '—'} km/h</span></span>
          </div>
          {/* Top-right: auto tour toggle */}
          <div className="absolute top-4 right-4 z-40">
            <button
              onClick={() => setAutoTour(!autoTour)}
              className="px-4 py-2 rounded-lg text-[12px] font-mono transition-all"
              style={{
                background: autoTour ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                border: autoTour ? '1.5px solid rgba(34,197,94,0.5)' : '1.5px solid rgba(255,255,255,0.1)',
                color: autoTour ? '#22c55e' : '#64748b',
              }}
            >
              🎬 Auto Tour {autoTour ? 'ON' : 'OFF'}
            </button>
          </div>
          {/* Bottom: controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-2xl"
            style={{ background: 'rgba(10,10,15,0.85)', border: '1px solid rgba(247,147,26,0.2)', backdropFilter: 'blur(12px)' }}>
            <span className="text-[11px] font-mono text-slate-400">
              <span className="text-amber-400">WASD</span> Move
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] font-mono text-slate-400">
              <span className="text-amber-400">Space</span> ↑
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] font-mono text-slate-400">
              <span className="text-amber-400">Ctrl</span> ↓
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] font-mono text-slate-400">
              <span className="text-amber-400">Shift</span> Boost
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] font-mono text-slate-400">
              <span className="text-amber-400">Mouse</span> Look
            </span>
          </div>
        </>
      )}

      {/* Standard Bitmap View (2D Bitfeed-style canvas rendering) */}
      {viewMode === 'standard' && (
        <div className="flex-1 relative flex items-center justify-center" style={{ background: '#0a0a0f' }}>
          <StandardBitmapCanvas blockHeight={blockHeight} parcels={parcels} />
        </div>
      )}

      {/* 3D Canvas */}
      {viewMode !== 'standard' && <div className="flex-1 relative">
        <Canvas
          shadows
          camera={{ position: [15, 12, 15], fov: 50, near: 0.01, far: 2000 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.setClearColor('#0a0a0f');
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.4;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <ambientLight intensity={0.25} color="#ffeedd" />
          {/* Main sun light */}
          <directionalLight
            position={[20, 30, 10]} intensity={2.0} castShadow color="#ffddaa"
            shadow-mapSize-width={2048} shadow-mapSize-height={2048}
            shadow-camera-far={100} shadow-camera-left={-30} shadow-camera-right={30}
            shadow-camera-top={30} shadow-camera-bottom={-30}
            shadow-bias={-0.0001}
          />
          {/* Rim/back light for depth */}
          <directionalLight position={[-15, 20, -15]} intensity={0.6} color="#4488ff" />
          {/* Warm accent lights */}
          <pointLight position={[0, 15, 0]} intensity={0.8} color="#f7931a" distance={40} decay={2} />
          <pointLight position={[-10, 8, -10]} intensity={0.4} color="#ff6622" distance={30} decay={2} />
          <pointLight position={[10, 5, 10]} intensity={0.3} color="#ffaa44" distance={25} decay={2} />
          {/* Cool fill from below for atmosphere */}
          <hemisphereLight args={['#1a1a3a', '#0a0a0f', 0.3]} />

          <fog attach="fog" args={viewMode === 'street' ? ['#0d0d1a', 0.3, 4] : viewMode === 'flyover' ? ['#0a0a14', 3, 40] : ['#0a0a0f', 50, 300]} />

          {viewMode !== 'street' && viewMode !== 'flyover' && (
            <OrbitControls
              ref={controlsRef}
              enableDamping dampingFactor={0.06}
              minDistance={0.3}
              maxDistance={500}
              zoomSpeed={1.2}
              rotateSpeed={0.8}
              panSpeed={0.8}
              enablePan
            />
          )}
          <CameraManager viewMode={viewMode} />
          <StreetWalker active={viewMode === 'street'} parcels={parcels} teleportTo={streetTeleport} />
          <FlyoverController active={viewMode === 'flyover'} parcels={parcels} autoTour={autoTour} onExitAutoTour={() => setAutoTour(false)} />
          <FlyToCamera flyTarget={flyTarget} onComplete={handleFlyComplete} />

          <GroundPlane parcels={parcels} viewMode={viewMode} />
          <StreetSigns parcels={parcels} viewMode={viewMode} />
          <DirectionIndicators parcels={parcels} viewMode={viewMode} />
          <MiniMap parcels={parcels} viewMode={viewMode} />
          <GridLines />
          <GroundGlow />

          {viewMode !== 'dna' ? (
            <>
              <InstancedParcels key={`${blockHeight}-${dataSource}-${parcels.length}`} customizations={parcelCustomizations}
                parcels={parcels} viewMode={viewMode}
                hoveredIndex={hoveredParcel?.txIndex ?? -1}
                selectedIndex={selectedParcel?.txIndex ?? -1}
                onHover={setHoveredParcel}
                onClick={handleParcelClick}
                onDoubleClick={handleParcelDoubleClick}
              />
              {parcelCustomizations.size > 0 && (
                <ParcelTextureOverlay parcels={parcels} customizations={parcelCustomizations} viewMode={viewMode} />
              )}
              <EstateOverlay
                estates={estates} parcels={parcels}
                hoveredEstateId={hoveredEstateId}
                onHoverEstate={setHoveredEstateId}
                onClickEstate={(estate) => {
                  const firstParcel = parcels[estate.parcelIndices[0]];
                  if (firstParcel) handleParcelClick(firstParcel);
                }}
              />
              <AmbientParticles count={30} spread={BLOCK_SIZE * 1.2} />
              <EnergyBeams parcels={parcels} />
              <SpatialAvatars avatars={spatialAvatars.slice(0, 5)} parcels={parcels} />
              <SpatialMessages avatars={spatialAvatars.slice(0, 3)} parcels={parcels} />
              <SpatialReactions parcels={parcels} reactions={spatialReactions} />
              {isStreaming && selectedParcel && displayParcelOwner && (
                <>
                  <LivestreamOverlay3D parcel={selectedParcel} ownerData={displayParcelOwner} viewerCount={streamViewerCount} />
                  <LivestreamPulseRing parcel={selectedParcel} />
                  <LivestreamBeam parcel={selectedParcel} />
                </>
              )}
              {/* Showcase city buildings on featured blocks */}
              {showcaseBuildings && <ShowcaseCityRenderer buildings={showcaseBuildings} />}
              <WorldObjects
                blockHeight={blockHeight}
                selectedObjectId={showWorldBuilder ? selectedWorldObjectId : null}
                onSelectObject={showWorldBuilder ? setSelectedWorldObjectId : undefined}
                isBuilder={showWorldBuilder}
              />
              {gameElements.length > 0 && (
                <GameObjects3D
                  blockHeight={blockHeight}
                  elements={gameElements}
                  walletAddress={walletAddress || undefined}
                  onClaim={handleGameClaim}
                  collected={gameState?.collected ? JSON.parse(gameState.collected) : []}
                />
              )}
            </>
          ) : (
            <>
              <DNAHelixView blockHeight={blockHeight} />
              <AmbientParticles count={100} spread={15} />
            </>
          )}

          {/* Post-processing effects for near-game quality */}
          {/* Environment lighting — inline to avoid external HDR fetch failures */}
          <ambientLight intensity={0.15} color="#1a1a3a" />
          <hemisphereLight args={['#1a1a4a', '#0a0a1a', 0.3]} />
          <EffectComposer multisampling={0}>
            <Bloom
              luminanceThreshold={0.6}
              luminanceSmoothing={0.4}
              intensity={0.5}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.25} darkness={0.6} />
          </EffectComposer>
        </Canvas>

        {/* Game HUD overlay */}
        {viewMode === 'street' && gameElements.length > 0 && walletAddress && (
          <GameHUD
            blockHeight={blockHeight}
            walletAddress={walletAddress}
            gameState={gameState}
            quests={gameQuests}
            newAchievements={newAchievements}
            onDismissAchievement={() => setNewAchievements(prev => prev.slice(1))}
          />
        )}

        {/* Title overlay */}
        <div className="absolute top-3 left-16 z-20">
          <div className="text-lg font-mono font-bold" style={{ color: '#c8a050', textShadow: '0 0 20px rgba(247,147,26,0.3)' }}>
            {blockHeight.toLocaleString()}.BITMAP
            {isFeaturedBlock(blockHeight) && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse" style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)', color: '#ffd700' }}>
                ✨ Featured City
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono" style={{ color: '#64748b' }}>
            {viewMode === 'dna' ? 'GENOME VIEW' : `${parcels.length.toLocaleString()} parcels / txs · Treemap layout · Drag to rotate · Scroll to zoom`}
          </div>
        </div>

        <VisitorOverlay count={realtimeViewerCount > 0 ? realtimeViewerCount : visitorCount} />

        {/* Fullscreen toggle */}
        <button onClick={toggleFullscreen}
          className="absolute z-20 px-2.5 py-2 rounded-xl transition-all hover:brightness-150 active:scale-90"
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen immersive mode'}
          style={{
            top: 48,
            right: 12,
            background: 'rgba(10,10,15,0.85)',
            border: `1px solid ${isFullscreen ? 'rgba(0,255,136,0.3)' : 'rgba(247,147,26,0.15)'}`,
            backdropFilter: 'blur(8px)',
            color: isFullscreen ? '#00ff88' : '#94a3b8',
            boxShadow: isFullscreen ? '0 0 12px rgba(0,255,136,0.2)' : 'none',
          }}>
          <span className="text-[13px]">{isFullscreen ? '⛶' : '⛶'}</span>
          <span className="ml-1.5 text-[9px] font-mono">{isFullscreen ? 'EXIT' : 'FULL'}</span>
        </button>

        {/* Hover tooltip */}
        {hoveredParcel && viewMode !== 'dna' && (
          <div className="absolute bottom-4 left-16 z-40 px-4 py-3 rounded-xl font-mono pointer-events-none"
            style={{ background: 'rgba(10,10,15,0.95)', border: '1px solid rgba(247,147,26,0.3)', backdropFilter: 'blur(16px)', color: '#e2e8f0', minWidth: 240 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-sm" style={{ background: hoveredParcel.color, boxShadow: `0 0 8px ${hoveredParcel.color}66` }} />
              <span className="text-sm font-bold" style={{ color: '#f7931a' }}>
                {hoveredParcel.isCoinbase ? '⛏ Coinbase Plaza' : `Parcel ${hoveredParcel.txIndex}`}
              </span>
              <span className="text-[9px]" style={{ color: '#64748b' }}>child inscription</span>
            </div>
            <div className="space-y-1 text-[11px]" style={{ color: '#94a3b8' }}>
              <div className="flex justify-between gap-6"><span>Address</span><span style={{ color: '#f7931a' }}>{hoveredParcel.txIndex}.{blockHeight}.bitmap</span></div>
              <div className="flex justify-between gap-6"><span>Dimensions</span><span style={{ color: '#e2e8f0' }}>{fmtDim(hoveredParcel.width)}m × {fmtDim(hoveredParcel.depth)}m</span></div>
              <div className="flex justify-between gap-6"><span>Total Area</span><span style={{ color: '#e2e8f0' }}>{hoveredParcel.areaSqMeters.toLocaleString()} m²</span></div>
              <div className="flex justify-between gap-6"><span>Height</span><span style={{ color: '#e2e8f0' }}>{hoveredParcel.heightMeters.toFixed(0)}m</span></div>
              <div className="flex justify-between gap-6"><span>Value</span><span style={{ color: '#e2e8f0' }}>₿ {hoveredParcel.value.toFixed(4)}</span></div>
              <div className="flex justify-between gap-6"><span>Size</span><span style={{ color: '#e2e8f0' }}>{hoveredParcel.bytes.toLocaleString()} vB</span></div>
              {parcelCustomizations.has(hoveredParcel.txIndex) && (
                <div className="flex justify-between gap-6"><span>Custom</span><span style={{ color: '#ffcc00' }}>🎨 Customized</span></div>
              )}
            </div>
          </div>
        )}

        {/* Estate hover tooltip */}
        {hoveredEstate && viewMode !== 'dna' && (
          <div className="absolute top-16 left-16 z-40 px-4 py-3 rounded-xl font-mono pointer-events-none"
            style={{
              background: 'rgba(10,10,15,0.95)',
              border: `1.5px solid ${hoveredEstate.glowColor}66`,
              backdropFilter: 'blur(16px)',
              color: '#e2e8f0',
              minWidth: 220,
              boxShadow: `0 0 20px ${hoveredEstate.glowColor}33`,
            }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: hoveredEstate.glowColor, fontSize: '13px', fontWeight: 700, textShadow: `0 0 8px ${hoveredEstate.glowColor}` }}>
                🏰 {hoveredEstate.name}
              </span>
            </div>
            <div className="space-y-1 text-[11px]" style={{ color: '#94a3b8' }}>
              <div className="flex justify-between gap-4"><span>Owner</span><span style={{ color: '#e2e8f0' }}>@{hoveredEstate.ownerHandle}</span></div>
              <div className="flex justify-between gap-4"><span>Parcels</span><span style={{ color: '#e2e8f0' }}>{hoveredEstate.parcelIndices.length} merged</span></div>
              <div className="flex justify-between gap-4"><span>Total Area</span><span style={{ color: '#e2e8f0' }}>
                {hoveredEstate.parcelIndices.reduce((s, i) => s + (parcels[i]?.areaSqMeters ?? 0), 0).toLocaleString()} m²
              </span></div>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: hoveredEstate.glowColor, boxShadow: `0 0 6px ${hoveredEstate.glowColor}` }} />
                <span style={{ color: '#64748b', fontSize: '9px' }}>Click to explore</span>
              </div>
            </div>
          </div>
        )}

        {/* Live Activity Ticker */}
        {viewMode !== 'dna' && <LiveActivityTicker activities={mockActivities} />}

        {/* Emoji Reaction Bar */}
        {viewMode !== 'dna' && selectedParcel && <EmojiReactionBar onReact={handleEmojiReact} />}
      </div>}

      {/* ═══ Panel Toggle (when hidden) ═══ */}
      {panelSize === 'hidden' && (
        <button onClick={() => setPanelSize('quarter')}
          className="absolute top-16 right-0 z-30 px-2 py-3 rounded-l-lg transition-all hover:brightness-130"
          style={{ background: 'rgba(10,10,15,0.95)', border: '1px solid rgba(247,147,26,0.2)', borderRight: 'none', color: '#f7931a' }}>
          ◀
        </button>
      )}

      {/* ═══ Right Panel ═══ */}
      <div className={`${PANEL_WIDTHS[panelSize]} flex-shrink-0 flex flex-col transition-all duration-300 overflow-hidden`}
        style={{ background: 'rgba(10,10,15,0.95)', borderLeft: panelSize !== 'hidden' ? '1px solid rgba(247,147,26,0.15)' : 'none' }}>
        
        {/* Panel resize controls */}
        <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex gap-1">
            {([
              { size: 'compact' as PanelSize, icon: '▐', title: 'Compact' },
              { size: 'quarter' as PanelSize, icon: '◧', title: 'Default' },
              { size: 'third' as PanelSize, icon: '◫', title: '1/3 screen' },
              { size: 'half' as PanelSize, icon: '◨', title: '1/2 screen' },
            ]).map(s => (
              <button key={s.size} onClick={() => setPanelSize(s.size)} title={s.title}
                className="w-7 h-7 rounded flex items-center justify-center text-xs transition-all hover:brightness-150"
                style={{
                  background: panelSize === s.size ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.03)',
                  color: panelSize === s.size ? '#f7931a' : '#475569',
                  border: panelSize === s.size ? '1px solid rgba(247,147,26,0.3)' : '1px solid rgba(255,255,255,0.05)',
                }}>{s.icon}</button>
            ))}
          </div>
          <button onClick={() => setPanelSize('hidden')} title="Hide panel"
            className="w-6 h-6 rounded flex items-center justify-center text-[11px] transition-all hover:brightness-150"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#475569', border: '1px solid rgba(255,255,255,0.05)' }}>
            ▶
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'rgba(247,147,26,0.15)' }}>
          {[
            { key: 'properties' as RightTab, label: 'PROPERTIES' },
            { key: 'chat' as RightTab, label: 'CHAT' },
            { key: 'rank' as RightTab, label: '📊 RANK' },
            ...(gameElements.length > 0 ? [{ key: 'gaming' as RightTab, label: '🎮 GAMING' }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setRightTab(tab.key)}
              className="px-3 py-3 text-xs font-bold tracking-wider transition-colors flex-1"
              style={{
                color: rightTab === tab.key ? '#f7931a' : '#475569',
                borderBottom: rightTab === tab.key ? '2px solid #f7931a' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {rightTab === 'rank' ? (
          /* ═══ GDP RANKING TAB ═══ */
          <div className="flex-1 overflow-y-auto">
            {/* Block Rank Hero */}
            <div className="px-4 py-4 text-center" style={{ background: 'linear-gradient(180deg, rgba(247,147,26,0.08) 0%, transparent 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Universal Block Rank</div>
              <div className="text-4xl font-mono font-black mb-1" style={{ color: '#f7931a', textShadow: '0 0 30px rgba(247,147,26,0.4)' }}>
                #{(() => { const rng = seededRandom(blockHeight * 2741); return (1 + Math.floor(rng() * 5000)).toLocaleString(); })()}
              </div>
              <div className="text-[10px] font-mono" style={{ color: '#94a3b8' }}>of 880,000 blocks</div>
              <div className="flex items-center justify-center gap-1 mt-2">
                <span className="text-[10px]" style={{ color: '#22c55e' }}>▲ 127</span>
                <span className="text-[9px]" style={{ color: '#64748b' }}>past 24h</span>
              </div>
            </div>

            {/* GDP Score */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#94a3b8' }}>GDP Score</span>
                <span className="text-lg font-mono font-black" style={{ color: '#f7931a' }}>
                  {(() => { const rng = seededRandom(blockHeight * 1337); return (Math.floor(rng() * 9000 + 1000)).toLocaleString(); })()}
                </span>
              </div>

              {/* GDP Breakdown bars */}
              {(() => {
                const rng = seededRandom(blockHeight * 5531);
                const metrics = [
                  { label: '⚡ Transaction Volume', value: Math.floor(rng() * 100), color: '#f7931a' },
                  { label: '🎫 Delegations Sold', value: Math.floor(rng() * 100), color: '#aa44ff' },
                  { label: '👁 Visitor Traffic', value: Math.floor(rng() * 100), color: '#00ccff' },
                  { label: '🛒 Commerce Volume', value: Math.floor(rng() * 100), color: '#00ff88' },
                  { label: '🏗️ Content & Builds', value: Math.floor(rng() * 100), color: '#ffcc00' },
                  { label: '⏱️ Uptime & Activity', value: Math.floor(rng() * 100), color: '#ff6b35' },
                ];
                return metrics.map((m, i) => (
                  <div key={i} className="mb-2.5">
                    <div className="flex justify-between text-[9px] mb-1">
                      <span style={{ color: '#94a3b8' }}>{m.label}</span>
                      <span className="font-mono font-bold" style={{ color: m.color }}>{m.value}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${m.value}%`, background: `linear-gradient(90deg, ${m.color}44, ${m.color})`, boxShadow: `0 0 8px ${m.color}44` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Historical GDP trend — above leaderboard */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="text-[10px] uppercase tracking-wider font-bold mb-3" style={{ color: '#94a3b8' }}>📈 GDP Trend (7 days)</div>
              <svg viewBox="0 0 200 60" className="w-full" style={{ filter: 'drop-shadow(0 0 4px rgba(247,147,26,0.3))' }}>
                <defs>
                  <linearGradient id="gdpGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f7931a" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#f7931a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {(() => {
                  const rng = seededRandom(blockHeight * 6619);
                  const points = Array.from({ length: 7 }, (_, i) => ({ x: i * 33 + 2, y: 10 + rng() * 40 }));
                  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                  const area = line + ` L ${points[6].x} 58 L ${points[0].x} 58 Z`;
                  return (
                    <>
                      <path d={area} fill="url(#gdpGrad2)" />
                      <path d={line} fill="none" stroke="#f7931a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#f7931a" stroke="#0a0a0f" strokeWidth="1.5" />)}
                    </>
                  );
                })()}
                <line x1="0" y1="58" x2="200" y2="58" stroke="rgba(255,255,255,0.05)" />
              </svg>
              <div className="flex justify-between text-[8px] mt-1" style={{ color: '#475569' }}>
                <span>7d ago</span><span>6d</span><span>5d</span><span>4d</span><span>3d</span><span>2d</span><span>Today</span>
              </div>
            </div>

            {/* Top Blocks Leaderboard */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="text-[10px] uppercase tracking-wider font-bold mb-3" style={{ color: '#94a3b8' }}>🏆 Top Blocks — Global</div>
              {(() => {
                const rng = seededRandom(blockHeight * 8881);
                const topBlocks = Array.from({ length: 10 }, (_, i) => ({
                  rank: i + 1,
                  height: Math.floor(rng() * 880000),
                  handle: MOCK_HANDLES[Math.floor(rng() * MOCK_HANDLES.length)],
                  gdp: Math.floor(9999 - i * (rng() * 800 + 200)),
                  change: Math.floor(rng() * 50) - 15,
                  avatar: MOCK_AVATARS[Math.floor(rng() * MOCK_AVATARS.length)],
                  tier: (rng() < 0.6 ? 1 : 2) as 1 | 2,
                }));
                return topBlocks.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 py-2 group hover:brightness-130 cursor-pointer transition-all"
                    style={{ borderBottom: i < 9 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                    <span className="w-5 text-right text-[11px] font-mono font-black" style={{
                      color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#475569',
                      textShadow: i < 3 ? `0 0 8px ${i === 0 ? '#FFD70066' : i === 1 ? '#C0C0C066' : '#CD7F3266'}` : 'none',
                    }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </span>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px]"
                      style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a' }}>{b.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono font-bold truncate" style={{ color: '#e2e8f0' }}>#{b.height.toLocaleString()}</span>
                        <CrownShield tier={b.tier} size={10} />
                      </div>
                      <span className="text-[8px] font-mono" style={{ color: '#64748b' }}>@{b.handle}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono font-bold" style={{ color: '#f7931a' }}>{b.gdp.toLocaleString()}</div>
                      <div className="text-[8px] font-mono" style={{ color: b.change >= 0 ? '#22c55e' : '#ff4444' }}>
                        {b.change >= 0 ? '▲' : '▼'} {Math.abs(b.change)}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Block Achievements */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="text-[10px] uppercase tracking-wider font-bold mb-3" style={{ color: '#94a3b8' }}>🎖️ Achievements</div>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const rng = seededRandom(blockHeight * 3377);
                  const allAchievements = [
                    { icon: '🔥', label: 'Hot Block', desc: 'Top 100 traffic', color: '#ff6b35' },
                    { icon: '💎', label: 'Diamond Hands', desc: 'Held 1+ year', color: '#00ccff' },
                    { icon: '🏗️', label: 'Builder', desc: '10+ customizations', color: '#ffcc00' },
                    { icon: '🤝', label: 'Delegator', desc: '5+ Tier 3 passes', color: '#aa44ff' },
                    { icon: '⚡', label: 'Lightning', desc: '1M+ sats volume', color: '#f7931a' },
                    { icon: '🎮', label: 'Experience', desc: 'App deployed', color: '#00ff88' },
                    { icon: '🌐', label: 'Connected', desc: 'VPS linked', color: '#66ccff' },
                    { icon: '🤖', label: 'AI Powered', desc: 'Agent linked', color: '#22c55e' },
                  ];
                  const earned = allAchievements.filter(() => rng() > 0.4);
                  return earned.map((a, i) => (
                    <div key={i} className="px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all hover:brightness-130"
                      title={a.desc}
                      style={{ background: `${a.color}10`, border: `1px solid ${a.color}30`, boxShadow: `0 0 6px ${a.color}15` }}>
                      <span className="text-sm">{a.icon}</span>
                      <span className="text-[8px] font-mono font-bold" style={{ color: a.color }}>{a.label}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* (GDP Trend chart moved above Top Blocks) */}
          </div>
        ) : rightTab === 'properties' ? (
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2">
                <button onClick={onBack} className="text-[#64748b] hover:text-[#f7931a] transition-colors text-sm">‹</button>
                <span className="text-xs font-bold tracking-wider" style={{ color: '#94a3b8' }}>Block</span>
              </div>
              <span className="font-mono text-base font-bold" style={{ color: '#f7931a' }}>{blockHeight.toLocaleString()}</span>
            </div>

            <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
                style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a' }}>{blockOwner.avatar}</div>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-xs font-mono truncate" style={{ color: '#e2e8f0' }}>@{blockOwner.handle}</span>
                <CrownShield tier={blockOwner.tier} size={16} />
                {blockOwner.verified && <span className="text-[9px]" style={{ color: '#66ccff' }}>✓</span>}
              </div>
              <button onClick={() => setShowQrProfile(true)} className="text-[12px] hover:brightness-150 transition-all active:scale-90" title="View Bitcoin address & QR">₿</button>
            </div>

            <div className="px-4 py-3 space-y-2 text-xs font-mono" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <PropRow label="PARCELS / TXS" value={parcels.length.toLocaleString()} />
              <PropRow label="VALUE" value={`₿ ${totalValue.toFixed(4)}`} highlight />
              <PropRow label="VBYTES" value={(blockStats.vbytes ?? totalBytes).toLocaleString()} />
              <PropRow label="HEIGHT" value={blockHeight.toLocaleString()} />
              <PropRow label="HASH" value={blockStats.hash ? `${blockStats.hash.slice(0, 4)}...${blockStats.hash.slice(-4)}` : `0000...${(blockHeight * 7919).toString(16).slice(-4)}`} />
              <PropRow label="SIZE" value={blockStats.size.toLocaleString()} />
              <PropRow label="WEIGHT" value={blockStats.weight.toLocaleString()} />
              <PropRow label="EPOCH" value={`${block.epoch}`} />
              <PropRow label="DATA" value={dataSource === 'real' ? '🟢 Live' : dataSource === 'loading' ? '⏳ Loading...' : '🟡 Mock'} />
              <PropRow label="LAYOUT" value="Treemap (proportional)" />
              <PropRow label="DISTRICT" value="2.1 km × 2.1 km" />
              <PropRow label="VISITORS" value={`👁 ${visitorCount}`} />
              {parcelCustomizations.size > 0 && <PropRow label="CUSTOMIZED" value={`🎨 ${parcelCustomizations.size}`} />}
            </div>

            {/* Get Access button for visitors */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <button
                onClick={() => setShowGetAccess(true)}
                className="w-full py-3 rounded-xl text-[13px] font-mono font-bold transition-all hover:brightness-130 active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(135deg, rgba(170,68,255,0.15), rgba(247,147,26,0.15))',
                  border: '1.5px solid rgba(170,68,255,0.35)',
                  color: '#aa44ff',
                  boxShadow: '0 0 20px rgba(170,68,255,0.15)',
                }}
              >
                🎫 Get Tier 3 Access
              </button>
            </div>

            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => navigateParcel(-1)} className="text-[#64748b] hover:text-[#f7931a] transition-colors text-lg px-1.5 active:scale-90">‹</button>
                  <span className="text-xs font-bold tracking-wider" style={{ color: '#94a3b8' }}>Parcel <span className="text-[10px] font-normal" style={{ color: '#475569' }}>(child inscription)</span></span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number" value={parcelNavIndex}
                    onChange={(e) => { const v = Math.max(0, Math.min(parcels.length - 1, parseInt(e.target.value) || 0)); setParcelNavIndex(v); setSelectedParcel(parcels[v]); }}
                    className="w-16 bg-transparent text-right font-mono text-sm font-bold outline-none"
                    style={{ color: '#f7931a' }} min={0} max={parcels.length - 1}
                  />
                  <button onClick={() => navigateParcel(1)} className="text-[#64748b] hover:text-[#f7931a] transition-colors text-lg px-1.5 active:scale-90">›</button>
                </div>
              </div>
            </div>

            {displayParcel && (
              <div className="px-4 py-3 space-y-2 text-xs font-mono" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {displayParcelOwner && (
                  <div className="flex items-center gap-2 pb-2 mb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px]"
                      style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a' }}>{displayParcelOwner.avatar}</div>
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>Owned by</span>
                    <span className="text-[10px] font-mono" style={{ color: '#e2e8f0' }}>@{displayParcelOwner.handle}</span>
                    <CrownShield tier={displayParcelOwner.tier} size={12} />
                    <div className="flex-1" />
                    <button onClick={() => setShowQrProfile(true)} className="text-[11px] hover:brightness-150 transition-all active:scale-90" title="View Bitcoin address & QR">₿</button>
                    {isWalletConnected && <button onClick={() => setShowSendBtcModal(true)} className="text-[11px] hover:brightness-150 transition-all active:scale-90" title="Send sats">⚡</button>}
                  </div>
                )}

                {displayParcel && estateByParcel.has(displayParcel.txIndex) && (() => {
                  const estate = estateByParcel.get(displayParcel.txIndex)!;
                  const totalArea = estate.parcelIndices.reduce((s, i) => s + (parcels[i]?.areaSqMeters ?? 0), 0);
                  const maxH = Math.max(...estate.parcelIndices.map(i => parcels[i]?.heightMeters ?? 0));
                  return (
                    <div className="pb-2 mb-2 space-y-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: estate.glowColor, textShadow: `0 0 6px ${estate.glowColor}66` }}>🏰 ESTATE</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold" style={{ color: estate.glowColor, textShadow: `0 0 8px ${estate.glowColor}66` }}>{estate.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px]" style={{ color: '#94a3b8' }}>@{estate.ownerHandle}</span>
                        <CrownShield tier={estate.ownerTier} size={11} />
                      </div>
                      <PropRow label="PARCELS MERGED" value={`${estate.parcelIndices.length}`} />
                      <PropRow label="TOTAL AREA" value={`${totalArea.toLocaleString()} m²`} />
                      <PropRow label="MAX HEIGHT" value={`${maxH.toFixed(0)}m`} />
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: '#64748b', fontSize: '11px' }}>GLOW</span>
                        <div className="w-3 h-3 rounded-full" style={{ background: estate.glowColor, boxShadow: `0 0 6px ${estate.glowColor}` }} />
                      </div>
                      <button onClick={() => console.log('[Estate] Manage:', estate.id)}
                        className="w-full py-2 rounded-lg text-[11px] font-mono font-bold mt-1 transition-all hover:brightness-130"
                        style={{ background: `${estate.glowColor}15`, border: `1px solid ${estate.glowColor}44`, color: estate.glowColor }}>
                        📐 Manage Estate
                      </button>
                    </div>
                  );
                })()}

                <PropRow label="TRANSACTION" value={displayParcel.txIndex.toString()} />
                <div className="flex justify-between items-center">
                  <span style={{ color: '#64748b' }}>ADDRESS</span>
                  <span className="flex items-center gap-1.5">
                    {isStreaming && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#ff3333', color: '#fff' }}>🔴 LIVE</span>}
                    <span style={{ color: '#f7931a' }}>{displayParcel.txIndex}.{blockHeight}.bitmap</span>
                  </span>
                </div>
                {isStreaming && (
                  <>
                    <PropRow label="STREAM TIME" value={`${Math.floor(streamElapsed / 60)}:${String(streamElapsed % 60).padStart(2, '0')}`} />
                    <PropRow label="VIEWERS" value={`👁 ${streamViewerCount}`} />
                  </>
                )}
                <PropRow label="TYPE" value={displayParcel.isCoinbase ? '⛏ Coinbase' : 'Standard'} />
                <PropRow label="VALUE" value={`₿ ${displayParcel.value.toFixed(6)}`} />
                <PropRow label="SIZE" value={`${displayParcel.bytes.toLocaleString()} vB`} />
                <PropRow label="DIMENSIONS" value={`${fmtDim(displayParcel.width)}m × ${fmtDim(displayParcel.depth)}m`} />
                <PropRow label="AREA" value={`${displayParcel.areaSqMeters.toLocaleString()} m²`} />
                <PropRow label="BUILD HEIGHT" value={`${displayParcel.heightMeters.toFixed(0)}m`} />

                <div className="pt-3 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="text-[10px] uppercase tracking-wider mb-3" style={{ color: '#475569' }}>Owner Actions</div>
                  {ownerLock && (
                    <div className="text-center py-2 rounded-xl mb-3" style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)' }}>
                      <span className="text-[11px] font-mono" style={{ color: '#f7931a' }}>
                        🔐 {ownerLock === 'connect' ? 'Connect wallet to unlock actions' : 'Verify your identity to unlock actions'}
                      </span>
                    </div>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => handleOwnerAction(() => setShowAgentModal(true))}
                      className="w-full py-3 rounded-xl text-[13px] font-mono font-bold mb-3 transition-all hover:brightness-130 active:scale-[0.97]"
                      style={{
                        background: 'rgba(0,255,136,0.08)',
                        border: '1.5px solid rgba(0,255,136,0.25)',
                        color: '#00ff88',
                        boxShadow: '0 0 15px rgba(0,255,136,0.12), inset 0 0 10px rgba(0,255,136,0.04)',
                        opacity: ownerLock ? 0.6 : 1,
                      }}
                    >
                      {guardianStatus === 'active' ? '🟢 Guardian AI Agent' : guardianStatus === 'paused' ? '⏸ Guardian Paused' : '🛡️ Guardian AI Agent'}
                    </button>
                    {ownerLock && (
                      <div className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.6)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.15)' }}>
                        🔐 Locked
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => handleOwnerAction(() => setShowWorldBuilder(true))}
                      className="w-full py-3 rounded-xl text-[13px] font-mono font-bold mb-3 transition-all hover:brightness-130 active:scale-[0.97]"
                      style={{
                        background: showWorldBuilder ? 'rgba(247,147,26,0.2)' : 'rgba(247,147,26,0.08)',
                        border: `1.5px solid ${showWorldBuilder ? 'rgba(247,147,26,0.5)' : 'rgba(247,147,26,0.25)'}`,
                        color: '#f7931a',
                        boxShadow: `0 0 15px rgba(247,147,26,${showWorldBuilder ? '0.3' : '0.12'}), inset 0 0 10px rgba(247,147,26,0.04)`,
                        opacity: ownerLock ? 0.6 : 1,
                      }}
                    >
                      🏗️ Build
                    </button>
                    {ownerLock && (
                      <div className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.6)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.15)' }}>
                        🔐 Locked
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => handleOwnerAction(() => setShowLivestreamModal(true))}
                      className="w-full py-3 rounded-xl text-[13px] font-mono font-bold transition-all hover:brightness-130 active:scale-[0.97]"
                      style={{
                        background: isStreaming ? 'rgba(255,51,51,0.2)' : 'rgba(255,51,51,0.08)',
                        border: `1.5px solid ${isStreaming ? '#ff3333' : 'rgba(255,51,51,0.25)'}`,
                        color: '#ff3333',
                        boxShadow: `0 0 15px rgba(255,51,51,${isStreaming ? '0.3' : '0.12'}), inset 0 0 10px rgba(255,51,51,0.04)`,
                        opacity: ownerLock ? 0.6 : 1,
                      }}
                    >
                      {isStreaming ? '🔴 LIVE — TimesSquare' : '📺 TimesSquare'}
                    </button>
                    {ownerLock && (
                      <div className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.6)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.15)' }}>
                        🔐 Locked
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => handleOwnerAction(() => setShowEstateModal(true))}
                      className="w-full py-3 rounded-xl text-[13px] font-mono font-bold mt-3 transition-all hover:brightness-130 active:scale-[0.97]"
                      style={{
                        background: 'rgba(0,255,255,0.08)',
                        border: '1.5px solid rgba(0,255,255,0.25)',
                        color: '#00ffff',
                        boxShadow: '0 0 15px rgba(0,255,255,0.12), inset 0 0 10px rgba(0,255,255,0.04)',
                        opacity: ownerLock ? 0.6 : 1,
                      }}
                    >
                      🏰 Create Estate
                    </button>
                    {ownerLock && (
                      <div className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.6)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.15)' }}>
                        🔐 Locked
                      </div>
                    )}
                  </div>
                  {activeListing && (
                    <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(170,68,255,0.06)', border: '1px solid rgba(170,68,255,0.2)' }}>
                      <div className="flex items-center gap-2 text-[11px] font-mono" style={{ color: '#aa44ff' }}>
                        <span>🏷️ Listed for delegation</span>
                        <span className="ml-auto" style={{ color: '#f7931a' }}>{activeListing.price30d?.toLocaleString()} sats/month</span>
                      </div>
                      <div className="text-[9px] mt-1" style={{ color: '#64748b' }}>
                        {activeListing.spotsTotal === -1 ? '∞' : (activeListing.spotsTotal - activeListing.spotsUsed)} spots available · {activeListing.price365d?.toLocaleString()} sats/year
                      </div>
                    </div>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => handleOwnerAction(() => setShowDelegationListing(true))}
                      className="w-full py-3 rounded-xl text-[13px] font-mono font-bold mt-3 transition-all hover:brightness-130 active:scale-[0.97]"
                      style={{
                        background: 'rgba(170,68,255,0.08)',
                        border: '1.5px solid rgba(170,68,255,0.25)',
                        color: '#aa44ff',
                        boxShadow: '0 0 15px rgba(170,68,255,0.12), inset 0 0 10px rgba(170,68,255,0.04)',
                        opacity: ownerLock ? 0.6 : 1,
                      }}
                    >
                      🏷️ {activeListing ? 'Update Listing' : 'List for Delegation'}
                    </button>
                    {ownerLock && (
                      <div className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.6)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.15)' }}>
                        🔐 Locked
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => handleOwnerAction(() => setShowCustomizePanel(!showCustomizePanel))}
                      className="w-full py-3 rounded-xl text-[13px] font-mono font-bold mt-3 transition-all hover:brightness-130 active:scale-[0.97]"
                      style={{
                        background: showCustomizePanel ? 'rgba(255,204,0,0.2)' : 'rgba(255,204,0,0.08)',
                        border: `1.5px solid ${showCustomizePanel ? 'rgba(255,204,0,0.5)' : 'rgba(255,204,0,0.25)'}`,
                        color: '#ffcc00',
                        boxShadow: `0 0 15px rgba(255,204,0,${showCustomizePanel ? '0.3' : '0.12'}), inset 0 0 10px rgba(255,204,0,0.04)`,
                        opacity: ownerLock ? 0.6 : 1,
                      }}
                    >
                      🎨 Customize Land
                    </button>
                    {ownerLock && (
                      <div className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.6)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.15)' }}>
                        🔐 Locked
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── Prepare for Transfer ─── */}
                <div className="relative mt-3">
                  <button
                    onClick={() => handleOwnerAction(() => setShowTransferPrep(true))}
                    className="w-full py-2.5 rounded-xl text-[12px] font-mono transition-all hover:brightness-130 active:scale-[0.97]"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#64748b',
                      opacity: ownerLock ? 0.6 : 1,
                    }}
                  >
                    🔄 Prepare for Transfer
                  </button>
                  {ownerLock && (
                    <div className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.6)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.15)' }}>
                      🔐 Locked
                    </div>
                  )}
                </div>

                {/* ─── Land Customization Panel ─── */}
                {showCustomizePanel && displayParcel && isVerified && (
                  <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,204,0,0.15)' }}>
                    <CustomizeLandPanel
                      parcel={displayParcel}
                      customization={parcelCustomizations.get(displayParcel.txIndex) || {}}
                      onChange={(c) => handleParcelCustomize(displayParcel.txIndex, c)}
                      onImageUpload={(f) => handleImageUpload(displayParcel.txIndex, f)}
                      onClose={() => setShowCustomizePanel(false)}
                      onSave={() => handleSaveCustomization(displayParcel.txIndex)}
                      isSaving={isSavingCustomization}
                    />
                    {customizeSaveMsg && (
                      <div className="mt-2 px-3 py-1.5 rounded-md text-[10px] font-mono" style={{
                        background: customizeSaveMsg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        border: `1px solid ${customizeSaveMsg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        color: customizeSaveMsg.type === 'success' ? '#22c55e' : '#ef4444',
                      }}>
                        {customizeSaveMsg.text}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="px-4 py-3">
              <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#475569' }}>Height = BTC Value</div>
              <div className="flex items-center gap-1 mb-1">
                <div className="flex-1 h-2 rounded-sm" style={{ background: 'linear-gradient(to right, #3a2510, #c8852a, #f7931a, #ffcc44)' }} />
              </div>
              <div className="flex justify-between text-[9px]" style={{ color: '#475569' }}><span>Low</span><span>High</span></div>
              <div className="mt-2 flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#f7931a', boxShadow: '0 0 6px rgba(247,147,26,0.5)' }} />
                <span className="text-[9px]" style={{ color: '#94a3b8' }}>⛏ Coinbase (glowing)</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#475569' }} />
                <span className="text-[9px]" style={{ color: '#94a3b8' }}>Area ∝ vBytes (treemap)</span>
              </div>
              <div className="mt-3 text-[9px]" style={{ color: '#334155' }}>
                🖱 Drag to rotate · Scroll to zoom · Click parcel to fly
              </div>
            </div>
          </div>
        ) : (
          /* ═══ CHAT TAB ═══ */
          <div className="flex-1 flex flex-col">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/gif,.gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  // TODO: upload file to storage, for now just show locally
                  const newMsg: ChatMessage = {
                    id: `msg-${Date.now()}`,
                    sender: 'You',
                    text: `📎 ${file.name}`,
                    time: 'now',
                    type: 'image',
                  };
                  setChatMessages(prev => [...prev, newMsg]);
                  e.target.value = '';
                }
              }}
            />

            <div className="px-3 py-2.5 flex gap-1.5 items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {([
                { key: 'block' as const, label: 'Block Chat', icon: '📢' },
                { key: 'dm' as const, label: 'DM Owner', icon: '🔒' },
                { key: 'global' as const, label: 'Global', icon: '🌐' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setChatMode(tab.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all active:scale-95"
                  style={{
                    background: chatMode === tab.key ? 'rgba(247,147,26,0.18)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${chatMode === tab.key ? 'rgba(247,147,26,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: chatMode === tab.key ? '#f7931a' : '#64748b',
                    boxShadow: chatMode === tab.key ? '0 0 12px rgba(247,147,26,0.2)' : 'none',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
              <div className="flex-1" />
              {isWalletConnected && (
              <button
                onClick={() => setShowSendBtcModal(true)}
                className="px-2.5 py-1.5 rounded-lg text-[14px] font-bold transition-all active:scale-90 hover:brightness-130"
                title="Send Bitcoin"
                style={{
                  background: 'rgba(247,147,26,0.15)',
                  border: '1px solid rgba(247,147,26,0.35)',
                  color: '#f7931a',
                  boxShadow: '0 0 12px rgba(247,147,26,0.2)',
                }}
              >
                ⚡
              </button>
              )}
            </div>

            <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="text-[10px]" style={{ color: '#64748b' }}>
                {chatMode === 'block' && `📢 Block #${blockHeight.toLocaleString()} public chat · Images, GIFs & links in public`}
                {chatMode === 'dm' && (e2eStatus === 'ready' ? `🔒 Private DM with block owner · E2E encrypted · All media types allowed` : e2eStatus === 'setting-up' ? `🔒 Setting up encryption...` : `🔒 Private DM with block owner · Connect wallet to enable E2E encryption`)}
                {chatMode === 'global' && `🌐 Global Bitmap chat · All blocks, all users · Images, GIFs & links only`}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
              {chatMode === 'dm' ? (
                <div className="flex-1 flex flex-col items-center justify-center py-8">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                    style={{ background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.2)' }}>
                    <span className="text-lg">🔒</span>
                  </div>
                  <div className="text-[12px] font-bold mb-1" style={{ color: '#e2e8f0' }}>DM Block Owner</div>
                  <div className="text-[10px] text-center mb-4" style={{ color: '#64748b', maxWidth: 200 }}>
                    Send an E2E encrypted message to the owner of block #{blockHeight.toLocaleString()}.bitmap
                  </div>
                  <div className="text-[10px] text-center mb-2" style={{ color: '#475569' }}>
                    📷 Photos · 🎥 Videos · 📎 Files · 🔗 Links — all allowed in DMs
                  </div>
                  <div className="text-[9px] px-3 py-1.5 rounded-full" style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.15)', color: '#22c55e' }}>
                    ₿ Bitcoin-native E2E encryption · secp256k1 · AES-256-GCM
                  </div>
                </div>
              ) : chatMode === 'global' ? (
                <div className="space-y-3">
                  <div className="flex-1 flex flex-col items-center justify-center py-4 mb-3">
                    <span className="text-2xl mb-2">🌐</span>
                    <div className="text-[11px] font-bold" style={{ color: '#e2e8f0' }}>Global Bitmap Chat</div>
                    <div className="text-[9px]" style={{ color: '#64748b' }}>All blocks · All users · One conversation</div>
                  </div>
                  {[
                    { sender: 'nexus_dev', text: 'Just deployed my game on block 840000 🎮', time: '2m ago' },
                    { sender: 'bitmap_whale', text: 'Who owns block 100? Interested in buying', time: '5m ago' },
                    { sender: 'satoshi_ghost', text: 'The Nexus is going to change everything', time: '8m ago' },
                  ].map((msg, i) => (
                    <div key={i} className="group flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold"
                        style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a' }}>
                        {msg.sender[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>{msg.sender}</span>
                          <span className="text-[9px]" style={{ color: '#334155' }}>{msg.time}</span>
                          {isWalletConnected && <button className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#475569' }}>🚩</button>}
                        </div>
                        <div className="text-[11px]" style={{ color: '#94a3b8' }}>{msg.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                {isStreaming && displayParcelOwner && (
                  <div className="mb-3 p-3 rounded-xl" style={{ background: 'rgba(255,51,51,0.08)', border: '1px solid rgba(255,51,51,0.25)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#ff3333', color: '#fff' }}>🔴 LIVE NOW</span>
                      <span className="text-[10px] font-mono" style={{ color: '#e2e8f0' }}>@{displayParcelOwner.handle} is streaming on parcel {displayParcel?.txIndex}</span>
                    </div>
                    <div className="text-[10px] font-mono mb-2" style={{ color: '#94a3b8' }}>
                      📺 {activeStreamType.charAt(0).toUpperCase() + activeStreamType.slice(1)} · {streamViewerCount} viewers · {Math.floor(streamElapsed / 60)}:{String(streamElapsed % 60).padStart(2, '0')}
                    </div>
                    <button onClick={() => console.log('[Stream] Click to watch')}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all hover:brightness-130"
                      style={{ background: 'rgba(255,51,51,0.15)', border: '1px solid rgba(255,51,51,0.3)', color: '#ff3333' }}>
                      Click to watch
                    </button>
                  </div>
                )}
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="group" style={msg.isDemo ? { opacity: 0.4 } : undefined}>
                    {msg.isDemo && chatMessages.indexOf(msg) === 0 && (
                      <div className="text-[9px] text-center mb-2" style={{ color: '#475569' }}>💬 Demo messages — be the first to chat!</div>
                    )}
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                        style={{ background: msg.sender === 'You' ? 'rgba(0,255,136,0.2)' : 'rgba(247,147,26,0.15)', color: msg.sender === 'You' ? '#00ff88' : '#f7931a' }}>
                        {msg.sender[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold" style={{ color: msg.isOwner ? '#f7931a' : '#e2e8f0' }}>
                            {msg.sender}
                          </span>
                          {msg.ownerData && <CrownShield tier={msg.ownerData.tier} size={12} />}
                          {msg.isOwner && <span className="text-[10px]" style={{ color: '#f7931a' }}>👑 OWNER</span>}
                          <span className="text-[10px]" style={{ color: '#334155' }}>{msg.time}</span>
                          {isWalletConnected && <button className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ml-auto" style={{ color: '#475569' }} title="Report">🚩</button>}
                        </div>
                        <div className="text-xs leading-relaxed" style={{ color: msg.type === 'link' ? '#66ccff' : '#94a3b8', wordBreak: 'break-all' }}>
                          {msg.type === 'image' ? (
                            <MediaPreviewImage msgId={msg.id} />
                          ) : msg.type === 'gif' ? (
                            <MediaPreviewGif msgId={msg.id} />
                          ) : msg.type === 'link' ? (
                            <MediaPreviewLink text={msg.text} />
                          ) : msg.text}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                </>
              )}
            </div>

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="px-3 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                <span className="text-[10px] font-mono italic" style={{ color: '#64748b' }}>
                  {typingUsers.length === 1 ? `${typingUsers[0]} is typing...` : `${typingUsers.join(', ')} are typing...`}
                </span>
              </div>
            )}

            {/* Presence: who's here */}
            {realtimeViewers.length > 1 && (
              <div className="px-3 py-1" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                <span className="text-[9px] font-mono" style={{ color: '#475569' }}>
                  👁 {realtimeViewers.map(v => v.handle).join(', ')}
                </span>
              </div>
            )}

            <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {!isWalletConnected ? (
                <div className="text-center py-3 rounded-xl" style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)' }}>
                  <span className="text-xs font-mono" style={{ color: '#f7931a' }}>🔐 Connect wallet to chat</span>
                </div>
              ) : !isVerified ? (
                <div className="text-center py-3 rounded-xl" style={{ background: 'rgba(170,68,255,0.06)', border: '1px solid rgba(170,68,255,0.15)' }}>
                  <span className="text-xs font-mono" style={{ color: '#aa44ff' }}>🔐 Verify your identity to chat</span>
                </div>
              ) : (
                <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-base transition-all hover:brightness-130 active:scale-90"
                  style={{ background: 'rgba(247,147,26,0.08)', border: '1px solid rgba(247,147,26,0.2)', color: '#f7931a', boxShadow: '0 0 10px rgba(247,147,26,0.1)' }}
                  title="Upload image, GIF, or media"
                >
                  📎
                </button>
                <input
                  type="text" value={chatInput}
                  onChange={(e) => { setChatInput(e.target.value); handleTyping(); }}
                  onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                  placeholder={
                    chatMode === 'dm' ? 'Private message to owner...'
                    : chatMode === 'global' ? 'Message all of Bitmap...'
                    : 'Message this block...'
                  }
                  className="flex-1 px-3 py-2.5 rounded-lg text-xs font-mono outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                />
                <button
                  onClick={sendChat}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold transition-all hover:brightness-130 active:scale-90"
                  style={{
                    background: chatInput ? 'rgba(247,147,26,0.25)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${chatInput ? 'rgba(247,147,26,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: chatInput ? '#f7931a' : '#333',
                    boxShadow: chatInput ? '0 0 15px rgba(247,147,26,0.2)' : 'none',
                  }}
                >
                  ↑
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg text-[11px] transition-all hover:text-[#f7931a] active:scale-95"
                  style={{ color: '#64748b', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  🖼️ Photo
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg text-[11px] transition-all hover:text-[#f7931a] active:scale-95"
                  style={{ color: '#64748b', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  GIF
                </button>
                <button onClick={() => { setChatInput(chatInput + 'https://'); }}
                  className="px-2.5 py-1 rounded-lg text-[11px] transition-all hover:text-[#f7931a] active:scale-95"
                  style={{ color: '#64748b', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  🔗 Link
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Guardian Chat Widget for visitors */}
      {guardianStatus === 'active' && (
        <GuardianChatWidget
          blockHeight={blockHeight}
          guardianName={guardianName}
          visitorAddress={getStoredAddress() || undefined}
        />
      )}
    </div>
  );
}

/* ─── Property Row ─── */
function PropRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-xs" style={{ color: '#64748b' }}>{label}</span>
      <span className="text-right text-xs font-medium truncate ml-3" style={{ color: highlight ? '#f7931a' : '#e2e8f0', maxWidth: '60%' }}>{value}</span>
    </div>
  );
}