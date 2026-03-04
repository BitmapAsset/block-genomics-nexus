/**
 * Squarified Treemap Algorithm
 * Based on: Bruls, Huizing, van Wijk — "Squarified Treemaps" (2000)
 *
 * Produces space-filling rectangular layouts where each item's area
 * is proportional to its weight. Minimizes aspect ratios for readability.
 *
 * This is the de facto standard for Bitcoin block visualization used by
 * Bitfeed, bitmap.land, mempool.space, and other bitmap platforms.
 */

export interface TreemapInput {
  index: number;
  weight: number; // e.g. vbytes for Bitcoin transactions
}

export interface TreemapRect {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the worst aspect ratio of a row of items laid out along the shorter
 * side of the remaining rectangle.
 */
function worstAspectRatio(row: number[], sideLength: number): number {
  if (row.length === 0 || sideLength <= 0) return Infinity;

  const rowSum = row.reduce((a, b) => a + b, 0);
  const maxVal = Math.max(...row);
  const minVal = Math.min(...row);

  // aspect ratio formula from the paper:
  // max( (s^2 * rmax) / rowSum^2, rowSum^2 / (s^2 * rmin) )
  const s2 = sideLength * sideLength;
  const rowSum2 = rowSum * rowSum;

  return Math.max(
    (s2 * maxVal) / rowSum2,
    rowSum2 / (s2 * minVal)
  );
}

/**
 * Layout a single row of items along the shorter side of the rectangle.
 * Returns the rectangles for this row and the remaining bounding rect.
 */
function layoutRow(
  row: { index: number; normalizedWeight: number }[],
  rect: BoundingRect
): { rects: TreemapRect[]; remaining: BoundingRect } {
  const rowSum = row.reduce((s, item) => s + item.normalizedWeight, 0);

  const isWide = rect.width >= rect.height;
  const sideLength = isWide ? rect.height : rect.width;
  const otherSide = isWide ? rect.width : rect.height;

  // The row occupies a strip along the shorter side
  const stripThickness = sideLength > 0 ? rowSum / sideLength : 0;

  const rects: TreemapRect[] = [];
  let offset = 0;

  for (const item of row) {
    const itemLength = sideLength > 0 ? item.normalizedWeight / stripThickness : 0;

    if (isWide) {
      // Row lays out vertically along the left side
      rects.push({
        index: item.index,
        x: rect.x,
        y: rect.y + offset,
        width: stripThickness,
        height: itemLength,
      });
    } else {
      // Row lays out horizontally along the top
      rects.push({
        index: item.index,
        x: rect.x + offset,
        y: rect.y,
        width: itemLength,
        height: stripThickness,
      });
    }

    offset += itemLength;
  }

  // Compute remaining rectangle after this row
  let remaining: BoundingRect;
  if (isWide) {
    remaining = {
      x: rect.x + stripThickness,
      y: rect.y,
      width: rect.width - stripThickness,
      height: rect.height,
    };
  } else {
    remaining = {
      x: rect.x,
      y: rect.y + stripThickness,
      width: rect.width,
      height: rect.height - stripThickness,
    };
  }

  return { rects, remaining };
}

/**
 * Core squarified treemap algorithm.
 *
 * @param items - Array of {index, weight} items to layout
 * @param bounds - Bounding rectangle to fill
 * @returns Array of positioned rectangles
 */
export function squarifiedTreemap(
  items: TreemapInput[],
  bounds: BoundingRect
): TreemapRect[] {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{
      index: items[0].index,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }];
  }

  const totalWeight = items.reduce((s, item) => s + item.weight, 0);
  if (totalWeight <= 0) return [];

  // Normalize weights to fill the bounding area
  const totalArea = bounds.width * bounds.height;
  const normalized = items
    .map(item => ({
      index: item.index,
      normalizedWeight: (item.weight / totalWeight) * totalArea,
      originalWeight: item.weight,
    }))
    // Sort descending by weight (critical for squarified algorithm)
    .sort((a, b) => b.originalWeight - a.originalWeight);

  const result: TreemapRect[] = [];
  let currentRect = { ...bounds };
  let currentRow: { index: number; normalizedWeight: number }[] = [];
  let i = 0;

  while (i < normalized.length) {
    const shorterSide = Math.min(currentRect.width, currentRect.height);

    if (shorterSide <= 0) {
      // Degenerate rectangle — just stack remaining items
      for (; i < normalized.length; i++) {
        result.push({
          index: normalized[i].index,
          x: currentRect.x,
          y: currentRect.y,
          width: Math.max(0, currentRect.width),
          height: Math.max(0, currentRect.height),
        });
      }
      break;
    }

    const item = normalized[i];
    const currentWeights = currentRow.map(r => r.normalizedWeight);
    const newWeights = [...currentWeights, item.normalizedWeight];

    if (
      currentRow.length === 0 ||
      worstAspectRatio(newWeights, shorterSide) <=
        worstAspectRatio(currentWeights, shorterSide)
    ) {
      // Adding this item improves or maintains the aspect ratio
      currentRow.push(item);
      i++;
    } else {
      // Adding this item would worsen the aspect ratio — finalize current row
      const { rects, remaining } = layoutRow(currentRow, currentRect);
      result.push(...rects);
      currentRect = remaining;
      currentRow = [];
      // Don't increment i — re-process this item in the next row
    }
  }

  // Layout any remaining items in the current row
  if (currentRow.length > 0) {
    const { rects } = layoutRow(currentRow, currentRect);
    result.push(...rects);
  }

  return result;
}

/**
 * Convenience function: compute treemap with gap between rectangles.
 * Shrinks each rectangle inward by `gap` pixels/units on all sides.
 *
 * @param items - Array of {index, weight} items
 * @param bounds - Bounding rectangle
 * @param gap - Gap size (applied as inset on each side)
 * @returns Array of positioned rectangles with gaps applied
 */
export function squarifiedTreemapWithGap(
  items: TreemapInput[],
  bounds: BoundingRect,
  gap: number
): TreemapRect[] {
  const rects = squarifiedTreemap(items, bounds);
  const halfGap = gap / 2;

  return rects.map(r => ({
    index: r.index,
    x: r.x + halfGap,
    y: r.y + halfGap,
    width: Math.max(0.001, r.width - gap),
    height: Math.max(0.001, r.height - gap),
  }));
}

/**
 * Convert treemap output from (x,y) coordinate space to (x,z) for 3D worlds.
 * Centers the layout around origin (0,0).
 *
 * @param items - Treemap input items
 * @param blockSize - Total block size in world units
 * @param gap - Gap between parcels in world units
 * @returns Array of {index, x, z, width, depth} positioned in world space
 */
export function treemapToWorldSpace(
  items: TreemapInput[],
  blockSize: number,
  gap: number
): { index: number; x: number; z: number; width: number; depth: number }[] {
  const half = blockSize / 2;
  const bounds: BoundingRect = {
    x: -half,
    y: -half,
    width: blockSize,
    height: blockSize,
  };

  const rects = squarifiedTreemapWithGap(items, bounds, gap);

  return rects.map(r => ({
    index: r.index,
    x: r.x + r.width / 2,  // center x
    z: r.y + r.height / 2, // y → z for 3D (center z)
    width: r.width,
    depth: r.height,        // height → depth for 3D
  }));
}
