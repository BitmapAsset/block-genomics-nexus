/**
 * Bitfeed-style Square Packing Algorithm
 * 
 * The CANONICAL bitmap standard used by Bitfeed, bitmap.land, Bitfeed, etc.
 * Each transaction becomes a SQUARE with side = ceil(sqrt(vbytes / scaleFactor)).
 * Squares are packed into a grid using greedy bin-packing (largest first).
 * 
 * This produces the distinctive bitmap visualization seen across all platforms.
 */

export interface SquarePackInput {
  index: number;
  vbytes: number;
}

export interface PackedSquare {
  index: number;
  x: number;       // grid column (left edge)
  y: number;       // grid row (top edge)
  size: number;    // side length in grid cells
}

export interface PackResult {
  squares: PackedSquare[];
  gridWidth: number;
  gridHeight: number;
}

/**
 * Convert vbytes to square side length.
 * This is the key formula that determines visual tx size.
 * 
 * The scale factor controls how big squares are relative to each other.
 * Bitfeed uses ~256 as divisor (so a 256 vB tx = 1x1 square).
 */
export function txToSquareSize(vbytes: number, scaleFactor = 256): number {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, vbytes) / scaleFactor)));
}

/**
 * Pack squares into a grid using occupancy-based bin packing.
 * Sorted by size (largest first) for optimal packing.
 * Scans left-to-right, top-to-bottom for first available position.
 * 
 * This matches the Bitfeed/bitmap standard layout.
 */
export function packSquares(items: SquarePackInput[], scaleFactor = 256, preserveOrder = false): PackResult {
  if (items.length === 0) return { squares: [], gridWidth: 0, gridHeight: 0 };

  // Calculate square sizes
  const squares = items.map(item => ({
    index: item.index,
    size: txToSquareSize(item.vbytes, scaleFactor),
  }));

  // Sort by size descending for optimal packing, or preserve natural tx order
  const sorted = preserveOrder ? squares : [...squares].sort((a, b) => b.size - a.size);

  // Calculate grid dimensions
  const totalArea = sorted.reduce((s, sq) => s + sq.size * sq.size, 0);
  const maxSquareSize = Math.max(...sorted.map(s => s.size));
  const gridWidth = Math.max(
    maxSquareSize,
    Math.ceil(Math.sqrt(totalArea * (preserveOrder ? 1.15 : 1.05))) // More buffer for natural order
  );

  // 2D occupancy grid
  const maxHeight = gridWidth + Math.ceil(totalArea / gridWidth) + 50;
  const occupied: Uint8Array[] = [];
  for (let r = 0; r < maxHeight; r++) {
    occupied.push(new Uint8Array(gridWidth + 50));
  }

  const result: PackedSquare[] = [];
  let actualMaxY = 0;

  for (const sq of sorted) {
    const size = sq.size;
    let placed = false;

    // Scan grid for first available position (top-left to bottom-right)
    for (let row = 0; row < maxHeight - size + 1 && !placed; row++) {
      for (let col = 0; col <= gridWidth - size && !placed; col++) {
        // Check if this area is free
        let fits = true;
        outer: for (let dr = 0; dr < size; dr++) {
          for (let dc = 0; dc < size; dc++) {
            if (occupied[row + dr][col + dc]) {
              fits = false;
              break outer;
            }
          }
        }

        if (fits) {
          // Mark occupied
          for (let dr = 0; dr < size; dr++) {
            for (let dc = 0; dc < size; dc++) {
              occupied[row + dr][col + dc] = 1;
            }
          }

          result.push({
            index: sq.index,
            x: col,
            y: row,
            size,
          });

          actualMaxY = Math.max(actualMaxY, row + size);
          placed = true;
        }
      }
    }

    // Failsafe: if somehow not placed, put at the end
    if (!placed) {
      result.push({
        index: sq.index,
        x: 0,
        y: actualMaxY,
        size,
      });
      actualMaxY += size;
    }
  }

  return {
    squares: result,
    gridWidth,
    gridHeight: actualMaxY,
  };
}

/**
 * Pack squares and convert to normalized coordinates (0-1 range).
 * Useful for rendering in a fixed-size canvas.
 */
export function packSquaresNormalized(
  items: SquarePackInput[],
  scaleFactor = 256
): { index: number; x: number; y: number; size: number }[] {
  const { squares, gridWidth, gridHeight } = packSquares(items, scaleFactor);
  const maxDim = Math.max(gridWidth, gridHeight, 1);

  return squares.map(sq => ({
    index: sq.index,
    x: sq.x / maxDim,
    y: sq.y / maxDim,
    size: sq.size / maxDim,
  }));
}

/**
 * Pack squares and convert to world-space coordinates for 3D rendering.
 * Centers the layout around (0, 0) and scales to fit blockSize.
 * 
 * Returns squares with center position and dimensions in world units.
 */
export function packSquaresToWorldSpace(
  items: SquarePackInput[],
  blockSize: number,
  gap: number,
  scaleFactor = 256
): { index: number; x: number; z: number; width: number; depth: number }[] {
  const { squares, gridWidth, gridHeight } = packSquares(items, scaleFactor);
  const maxDim = Math.max(gridWidth, gridHeight, 1);

  // Scale: map grid cells to world units
  const cellSize = blockSize / maxDim;
  const halfBlock = blockSize / 2;
  const halfGap = gap / 2;

  return squares.map(sq => {
    const worldX = sq.x * cellSize - halfBlock;
    const worldZ = sq.y * cellSize - halfBlock;
    const worldSize = sq.size * cellSize;

    return {
      index: sq.index,
      x: worldX + worldSize / 2,           // center x
      z: worldZ + worldSize / 2,           // center z
      width: Math.max(0.001, worldSize - gap),   // with gap
      depth: Math.max(0.001, worldSize - gap),   // square: width == depth
    };
  });
}
