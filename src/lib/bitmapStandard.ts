/**
 * Bitcoin Bitmap Standard Layout
 * 
 * Uses the canonical layout from @blockamotolabs/react-bitmap-utils
 * (bitmap.land official library by Bitoshi Blockamoto).
 * 
 * Each epoch (210,000 blocks) is arranged in a near-square grid:
 *   500 columns × 420 rows
 * Epochs are placed left-to-right horizontally.
 * 
 * This is THE universal bitmap standard. Every explorer, every viewer,
 * every project should use this same layout.
 */

// ── Canonical constants ──────────────────────────────────────────────
// Layout from @blockamotolabs/react-bitmap-utils (bitmap.land standard).
// roundSquareRoot(210_000) = 500 — hardcoded to avoid runtime loop.
export const BLOCKS_PER_EPOCH = 210_000;
export const BLOCKS_PER_ROW = 500;
export const BLOCKS_PER_COLUMN = 420;

// ── Epoch colors (Block Genomics palette) ────────────────────────────
export const EPOCH_COLORS = [
  '#f7931a', // Epoch 0 — Gold (Genesis)
  '#66ccff', // Epoch 1 — Cyan
  '#a855f7', // Epoch 2 — Purple
  '#22c55e', // Epoch 3 — Green
  '#10b981', // Epoch 4 — Emerald
] as const;

export const EPOCH_LABELS = [
  { label: 'Epoch 1', sub: 'The Genesis Era', reward: '50 BTC' },
  { label: 'Epoch 2', sub: 'The Growth Era', reward: '25 BTC' },
  { label: 'Epoch 3', sub: 'The Expansion Era', reward: '12.5 BTC' },
  { label: 'Epoch 4', sub: 'The Adoption Era', reward: '6.25 BTC' },
  { label: 'Epoch 5', sub: 'The Scarcity Era', reward: '3.125 BTC' },
] as const;

// ── Bitmap.land official colors ──────────────────────────────────────
export const BITMAP_ORANGE = '#ff9500';
export const BITMAP_ORANGE_DARK = '#ff7e00';
export const BITMAP_BLACK = '#181c1f';

// ── Layout math ──────────────────────────────────────────────────────

/** Which epoch a block belongs to (0-indexed) */
export function getEpochIndex(blockHeight: number): number {
  return Math.floor(blockHeight / BLOCKS_PER_EPOCH);
}

/** Get epoch color for a block height */
export function getEpochColor(blockHeight: number): string {
  const epoch = getEpochIndex(blockHeight);
  return EPOCH_COLORS[epoch] ?? EPOCH_COLORS[EPOCH_COLORS.length - 1];
}

/** 
 * Convert a block height to its canonical 2D grid position.
 * Returns { col, row } within the global map.
 * 
 * - col: x position (epoch offset + position within epoch)
 * - row: y position (row within epoch)
 */
export function blockTo2D(blockHeight: number): { col: number; row: number } {
  const epoch = getEpochIndex(blockHeight);
  const indexInEpoch = blockHeight - epoch * BLOCKS_PER_EPOCH;
  const colInEpoch = indexInEpoch % BLOCKS_PER_ROW;
  const rowInEpoch = Math.floor(indexInEpoch / BLOCKS_PER_ROW);
  return {
    col: epoch * BLOCKS_PER_ROW + colInEpoch,
    row: rowInEpoch,
  };
}

/**
 * Convert a 2D grid position back to block height.
 */
export function gridToBlock(col: number, row: number): number {
  const epoch = Math.floor(col / BLOCKS_PER_ROW);
  const colInEpoch = col - epoch * BLOCKS_PER_ROW;
  return epoch * BLOCKS_PER_EPOCH + row * BLOCKS_PER_ROW + colInEpoch;
}

/**
 * Get the 3D position for a block in the Nexus world.
 * Maps the 2D bitmap.land grid into 3D space.
 * 
 * @param blockHeight - Block number
 * @param blockUnit - Size of each block in world units (default 1)
 * @param gap - Gap between blocks as fraction (default 0.05)
 * @returns { x, y, z } world position
 */
export function blockTo3D(
  blockHeight: number,
  blockUnit = 1,
  gap = 0.05
): { x: number; y: number; z: number } {
  const { col, row } = blockTo2D(blockHeight);
  const spacing = blockUnit * (1 + gap);
  
  // Add epoch separator gaps
  const epoch = getEpochIndex(blockHeight);
  const epochGap = epoch * blockUnit * 2; // wider gap between epochs
  
  return {
    x: col * spacing + epochGap,
    y: 0, // base height — LOD system will extrude
    z: row * spacing,
  };
}

/**
 * Get visible block range for a camera viewport.
 * Returns the block heights that should be rendered.
 */
export function getVisibleBlocks(
  centerBlock: number,
  viewportBlocks: number,
  totalBlocks: number
): { start: number; end: number } {
  const half = Math.floor(viewportBlocks / 2);
  const center2D = blockTo2D(centerBlock);
  
  // Calculate block range based on center
  const startHeight = Math.max(0, centerBlock - half * BLOCKS_PER_ROW - half);
  const endHeight = Math.min(totalBlocks, centerBlock + half * BLOCKS_PER_ROW + half);
  
  return { start: startHeight, end: endHeight };
}

/**
 * Total map dimensions in world units.
 */
export function getMapDimensions(
  totalBlocks: number,
  blockUnit = 1,
  gap = 0.05
): { width: number; depth: number } {
  const epochs = Math.ceil(totalBlocks / BLOCKS_PER_EPOCH);
  const spacing = blockUnit * (1 + gap);
  const epochGap = blockUnit * 2;
  return {
    width: epochs * BLOCKS_PER_ROW * spacing + (epochs - 1) * epochGap,
    depth: BLOCKS_PER_COLUMN * spacing,
  };
}
