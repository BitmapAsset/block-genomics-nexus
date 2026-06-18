// Deterministic Bitcoin block VISUALS (geometry, epoch colors, special markers,
// tx-packing texture). Ownership/identity is NOT generated here — real claimed
// status comes from the DB (GET /api/v1/blocks/claimed). The hash/genomeHash
// fields are placeholder visuals only and must never be surfaced as a real
// block hash or owner identity.

export interface BlockData {
  height: number;
  timestamp: number;
  txCount: number;
  size: number;
  fees: number;
  epoch: number;
  claimed: boolean;
  isSpecial: boolean;
  specialType?: 'genesis' | 'halving' | 'round';
  hash: string;
  genomeHash: string;
}

const GENESIS_TIMESTAMP = 1231006505; // Jan 3, 2009
const AVG_BLOCK_TIME = 600; // 10 minutes
const HALVING_INTERVAL = 210000;
const TOTAL_BLOCKS = 880000;
const COLS = 1000;

const EPOCH_COLORS: Record<number, string> = {
  0: '#f7931a', // Gold
  1: '#66ccff', // Cyan
  2: '#a855f7', // Purple
  3: '#22c55e', // Green
  4: '#10b981', // Emerald
};

const HALVING_BLOCKS = [0, 210000, 420000, 630000, 840000];

// Simple seeded random for deterministic data
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function fakeHash(height: number): string {
  const chars = '0123456789abcdef';
  const rng = seededRandom(height * 7919);
  let h = '';
  for (let i = 0; i < 64; i++) h += chars[Math.floor(rng() * 16)];
  return h;
}

export function getEpoch(height: number): number {
  return Math.floor(height / HALVING_INTERVAL);
}

export function getEpochColor(epoch: number): string {
  return EPOCH_COLORS[epoch] ?? EPOCH_COLORS[4];
}

export function isSpecialBlock(height: number): boolean {
  return height === 0 || HALVING_BLOCKS.includes(height) || (height > 0 && height % 100000 === 0);
}

export function getSpecialType(height: number): BlockData['specialType'] | undefined {
  if (height === 0) return 'genesis';
  if (HALVING_BLOCKS.includes(height)) return 'halving';
  if (height % 100000 === 0) return 'round';
  return undefined;
}

// Generate a single block on-demand (no giant array needed)
export function generateBlock(height: number): BlockData {
  const rng = seededRandom(height);
  const epoch = getEpoch(height);
  const special = isSpecialBlock(height);
  return {
    height,
    timestamp: GENESIS_TIMESTAMP + height * AVG_BLOCK_TIME,
    // Realistic tx count: varies by era. Early blocks had few txs, modern blocks have thousands
    txCount: height < 100000
      ? Math.floor(rng() * 50) + 1          // early era: 1-50 txs
      : height < 400000
      ? Math.floor(rng() * 500) + 10        // middle era: 10-510 txs
      : Math.floor(rng() * 3000) + 100,     // modern era: 100-3100 txs
    size: Math.floor(rng() * 1500000) + 300000,
    fees: parseFloat((rng() * 2 + 0.01).toFixed(4)),
    epoch,
    // Ownership is real data, not fabricated. Default unclaimed; the map overlays
    // genuine claimed heights from GET /api/v1/blocks/claimed.
    claimed: false,
    isSpecial: special,
    specialType: getSpecialType(height),
    hash: fakeHash(height),
    genomeHash: fakeHash(height + 1000000),
  };
}

// Grid layout helpers
export function getGridCols(): number { return COLS; }
export function getTotalBlocks(): number { return TOTAL_BLOCKS; }
export function getGridRows(): number { return Math.ceil(TOTAL_BLOCKS / COLS); }

export function heightToGrid(height: number): { col: number; row: number } {
  return { col: height % COLS, row: Math.floor(height / COLS) };
}

export function gridToHeight(col: number, row: number): number | null {
  const h = row * COLS + col;
  return h >= 0 && h < TOTAL_BLOCKS ? h : null;
}

export { EPOCH_COLORS, HALVING_BLOCKS, TOTAL_BLOCKS, COLS };
