/**
 * Bitmap Thumbnail Comparison Tool
 * Renders our thumbnails for 22 random blocks and generates a comparison grid.
 * Run: node compare.js
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const BLOCKS = [3279,14593,83811,97197,136580,158514,164197,172098,326869,477393,493062,494162,522791,610605,642965,654795,707812,708332,724562,757315,830496,866238];

const SIZE = 256;
const COLS = 6;

// ── Bitfeed-accurate byteTxSize ──
function byteTxSize(vbytes, max) {
  if (!vbytes) vbytes = 1;
  let scale = Math.max(1, Math.ceil(Math.sqrt(vbytes / 256)));
  return Math.min(max || Infinity, Math.max(1, scale));
}

// ── Bitfeed Mondrian Layout (faithful port) ──
class MondrianLayout {
  constructor(width) {
    this.width = width;
    this.rowOffset = 0;
    this.rows = [];
  }

  addRow() {
    const newRow = { y: this.rows.length + this.rowOffset, slots: [], map: {} };
    this.rows.push(newRow);
    return newRow;
  }

  getRow(y) {
    return this.rows[y - this.rowOffset];
  }

  getSlot(x, y) {
    const row = this.getRow(y);
    return row ? row.map[x] : undefined;
  }

  addSlot(slot) {
    if (slot.r <= 0) return;
    if (this.getSlot(slot.x, slot.y)) {
      const existing = this.getSlot(slot.x, slot.y);
      if (slot.r > existing.r) existing.r = slot.r;
      return existing;
    }
    const row = this.getRow(slot.y);
    if (!row) return;
    
    let insertAt = null;
    for (let i = 0; i < row.slots.length && insertAt == null; i++) {
      if (row.slots[i].x > slot.x) insertAt = i;
    }
    if (insertAt == null) row.slots.push(slot);
    else row.slots.splice(insertAt, 0, slot);
    row.map[slot.x] = slot;
    return slot;
  }

  removeSlot(slot) {
    const row = this.getRow(slot.y);
    if (row) {
      delete row.map[slot.x];
      const idx = row.slots.indexOf(slot);
      if (idx >= 0) row.slots.splice(idx, 1);
    }
  }

  fillSlot(slot, squareWidth) {
    const square = {
      left: slot.x,
      right: slot.x + squareWidth,
      bottom: slot.y,
      top: slot.y + squareWidth
    };

    this.removeSlot(slot);

    // Handle rows within the square
    for (let rowIndex = slot.y; rowIndex < square.top; rowIndex++) {
      const row = this.getRow(rowIndex);
      if (row) {
        let collisions = [];
        let maxExcess = 0;
        for (let i = 0; i < row.slots.length; i++) {
          const testSlot = row.slots[i];
          if (!((testSlot.x + testSlot.r < square.left) || (testSlot.x >= square.right))) {
            collisions.push(testSlot);
            let excess = Math.max(0, (testSlot.x + testSlot.r) - (slot.x + slot.r));
            maxExcess = Math.max(maxExcess, excess);
          }
        }
        if (square.right < this.width && !row.map[square.right]) {
          this.addSlot({ x: square.right, y: rowIndex, r: (slot.r - squareWidth + maxExcess) });
        }
        for (let i = 0; i < collisions.length; i++) {
          collisions[i].r = slot.x - collisions[i].x;
          if (collisions[i].r <= 0) this.removeSlot(collisions[i]);
        }
      } else {
        this.addRow();
        if (slot.x > 0) this.addSlot({ x: 0, y: rowIndex, r: slot.x });
        if (square.right < this.width) this.addSlot({ x: square.right, y: rowIndex, r: this.width - square.right });
      }
    }

    // Handle rows below the square
    for (let rowIndex = Math.max(0, slot.y - squareWidth); rowIndex < slot.y; rowIndex++) {
      const row = this.getRow(rowIndex);
      if (row) {
        for (let i = 0; i < row.slots.length; i++) {
          const testSlot = row.slots[i];
          if ((testSlot.x < slot.x + squareWidth) && (testSlot.x + testSlot.r > slot.x) && (testSlot.y + testSlot.r >= slot.y)) {
            const oldSlotWidth = testSlot.r;
            testSlot.r = slot.y - testSlot.y;
            if (testSlot.r <= 0) this.removeSlot(testSlot);
            let remaining = {
              x: testSlot.x + testSlot.r,
              y: testSlot.y,
              w: oldSlotWidth - testSlot.r,
              h: testSlot.r
            };
            while (remaining.w > 0 && remaining.h > 0) {
              if (remaining.w <= remaining.h) {
                this.addSlot({ x: remaining.x, y: remaining.y, r: remaining.w });
                remaining.y += remaining.w;
                remaining.h -= remaining.w;
              } else {
                this.addSlot({ x: remaining.x, y: remaining.y, r: remaining.h });
                remaining.x += remaining.h;
                remaining.w -= remaining.h;
              }
            }
          }
        }
      }
    }

    return { x: slot.x, y: slot.y, r: squareWidth };
  }

  place(size) {
    let found = false;
    let rowIndex = 0;
    let slotIndex = 0;
    let square = null;

    while (!found && rowIndex < this.rows.length) {
      const row = this.rows[rowIndex];
      while (!found && slotIndex < row.slots.length) {
        const testSlot = row.slots[slotIndex];
        if (testSlot.r >= size) {
          found = true;
          square = this.fillSlot(testSlot, size);
        }
        slotIndex++;
      }
      slotIndex = 0;
      rowIndex++;
    }
    if (!found) {
      const row = this.addRow();
      const slot = this.addSlot({ x: 0, y: row.y, r: this.width });
      square = this.fillSlot(slot, size);
    }

    return square;
  }
}

// ── HCL-to-RGB conversion (simplified, matching bitfeed's d3-color) ──
function hclToRgb(h, c, l) {
  // HCL -> Lab -> RGB
  const hRad = (h * Math.PI) / 180;
  const a = Math.cos(hRad) * c;
  const b = Math.sin(hRad) * c;
  
  // Lab to XYZ
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  
  const xn = 0.950470;
  const yn = 1;
  const zn = 1.088830;
  
  const x = xn * (fx > 6/29 ? fx * fx * fx : (fx - 16/116) * 3 * (6/29) * (6/29));
  const y = yn * (fy > 6/29 ? fy * fy * fy : (fy - 16/116) * 3 * (6/29) * (6/29));
  const z = zn * (fz > 6/29 ? fz * fz * fz : (fz - 16/116) * 3 * (6/29) * (6/29));
  
  // XYZ to sRGB
  let r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  let g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  let bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  
  // Gamma correction
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1/2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1/2.4) - 0.055 : 12.92 * g;
  bl = bl > 0.0031308 ? 1.055 * Math.pow(bl, 1/2.4) - 0.055 : 12.92 * bl;
  
  return {
    r: Math.max(0, Math.min(255, Math.round(r * 255))),
    g: Math.max(0, Math.min(255, Math.round(g * 255))),
    b: Math.max(0, Math.min(255, Math.round(bl * 255)))
  };
}

// Bitfeed orange: h=0.181, l=0.472 -> HCL(65.16°, 78.225, 70.8)
function getBitfeedColor(isCoinbase) {
  if (isCoinbase) {
    // Slightly brighter for coinbase
    const c = hclToRgb(65.16, 78.225, 75);
    return `rgb(${c.r},${c.g},${c.b})`;
  }
  const c = hclToRgb(65.16, 78.225, 70.8);
  return `rgb(${c.r},${c.g},${c.b})`;
}

// ── Render functions ──

function renderBitfeedStyle(ctx, txs, x0, y0, size) {
  // Background - dark
  ctx.fillStyle = '#1d1f31';
  ctx.fillRect(x0, y0, size, size);

  if (txs.length === 0) return;

  const squares = txs.map((tx, i) => ({
    size: byteTxSize(tx.vbytes, Infinity),
    isCoinbase: i === 0
  }));

  const totalArea = squares.reduce((s, sq) => s + sq.size * sq.size, 0);
  const gridW = Math.ceil(Math.sqrt(totalArea));
  const pxPerGrid = size / gridW;
  // Bitfeed uses gridSize/4 padding on each side = 50% of cell is padding
  // That seems extreme for a thumbnail. Let's use their exact value.
  const unitPadding = pxPerGrid / 4;

  const layout = new MondrianLayout(gridW);

  for (const sq of squares) {
    const pos = layout.place(sq.size);
    const px = x0 + pos.x * pxPerGrid + unitPadding;
    const py = y0 + pos.y * pxPerGrid + unitPadding;
    const pw = pos.r * pxPerGrid - unitPadding * 2;
    const ph = pos.r * pxPerGrid - unitPadding * 2;
    if (pw > 0 && ph > 0) {
      ctx.fillStyle = getBitfeedColor(sq.isCoinbase);
      ctx.fillRect(px, py, pw, ph);
    }
  }
}

function renderCurrentStyle(ctx, txs, x0, y0, size) {
  // Our current implementation - dark bg
  ctx.fillStyle = '#000000';
  ctx.fillRect(x0, y0, size, size);

  if (txs.length === 0) return;

  const squares = txs.map((tx, i) => ({
    side: Math.max(1, Math.ceil(Math.sqrt(tx.vbytes / 256))),
    isCoinbase: i === 0,
    vbytes: tx.vbytes
  }));

  // OUR BUG: we sort descending by size
  const indices = squares.map((_, i) => i);
  indices.sort((a, b) => squares[b].side - squares[a].side);

  const totalArea = squares.reduce((s, sq) => s + sq.side * sq.side, 0);
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(totalArea)));
  const cellSize = size / gridSize;
  const gap = Math.max(0.5, cellSize * 0.06);

  // Simple slot-based packing (our current)
  const slots = [{ x: 0, y: 0, size: gridSize }];
  
  for (const idx of indices) {
    const side = squares[idx].side;
    let bestSlotIdx = -1;
    for (let si = 0; si < slots.length; si++) {
      if (slots[si].size >= side) {
        bestSlotIdx = si;
        break;
      }
    }
    if (bestSlotIdx === -1) continue;

    const slot = slots[bestSlotIdx];
    slots.splice(bestSlotIdx, 1);

    const px = x0 + slot.x * cellSize;
    const py = y0 + slot.y * cellSize;
    const pw = side * cellSize - gap;
    const ph = side * cellSize - gap;

    ctx.fillStyle = squares[idx].isCoinbase ? '#f7931a' : '#ff9500';
    if (pw > 0 && ph > 0) ctx.fillRect(px, py, pw, ph);

    const remainder = slot.size - side;
    if (remainder > 0) {
      slots.push({ x: slot.x + side, y: slot.y, size: remainder });
      slots.push({ x: slot.x, y: slot.y + side, size: remainder });
    }
    slots.sort((a, b) => a.y - b.y || a.x - b.x || a.size - b.size);
  }
}

function renderFixedStyle(ctx, txs, x0, y0, size) {
  // Fixed implementation - matching bitfeed
  ctx.fillStyle = '#000000';
  ctx.fillRect(x0, y0, size, size);

  if (txs.length === 0) return;

  const squares = txs.map((tx, i) => ({
    size: byteTxSize(tx.vbytes, Infinity),
    isCoinbase: i === 0
  }));

  const totalArea = squares.reduce((s, sq) => s + sq.size * sq.size, 0);
  const gridW = Math.ceil(Math.sqrt(totalArea));
  const pxPerGrid = size / gridW;
  // Use same padding ratio as bitfeed
  const unitPadding = pxPerGrid / 4;

  const layout = new MondrianLayout(gridW);

  // Process in NATURAL ORDER (like bitfeed)
  for (const sq of squares) {
    const pos = layout.place(sq.size);
    const px = x0 + pos.x * pxPerGrid + unitPadding;
    const py = y0 + pos.y * pxPerGrid + unitPadding;
    const pw = pos.r * pxPerGrid - unitPadding * 2;
    const ph = pos.r * pxPerGrid - unitPadding * 2;
    if (pw > 0 && ph > 0) {
      ctx.fillStyle = sq.isCoinbase ? '#f7931a' : '#ff9500';
      ctx.fillRect(px, py, pw, ph);
    }
  }
}

// ── Fetch block data ──
async function fetchBlockTxs(height) {
  const hashRes = await fetch(`https://mempool.space/api/block-height/${height}`);
  const hash = await hashRes.text();
  
  const infoRes = await fetch(`https://mempool.space/api/block/${hash}`);
  const info = await infoRes.json();
  const txCount = info.tx_count || 1;

  const maxTxs = Math.min(txCount, 5000);
  const pages = Math.ceil(maxTxs / 25);
  const txs = [];

  for (let i = 0; i < pages; i++) {
    const res = await fetch(`https://mempool.space/api/block/${hash}/txs/${i * 25}`);
    if (!res.ok) break;
    const batch = await res.json();
    for (let j = 0; j < batch.length && txs.length < maxTxs; j++) {
      txs.push({ vbytes: Math.ceil((batch[j].weight || 400) / 4) });
    }
    // Rate limit
    if (i < pages - 1) await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  Block ${height}: ${txs.length}/${txCount} txs fetched`);
  return txs;
}

// ── Main ──
async function main() {
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Fetching block data for 22 blocks...');
  
  const blockData = [];
  for (const height of BLOCKS) {
    try {
      const txs = await fetchBlockTxs(height);
      blockData.push({ height, txs });
    } catch (e) {
      console.error(`  Failed: ${height} - ${e.message}`);
      blockData.push({ height, txs: [] });
    }
    // Rate limit between blocks
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nRendering comparison grid...');

  const THUMB = 256;
  const LABEL_H = 30;
  const HEADER_H = 40;
  const PADDING = 10;
  const rows = Math.ceil(blockData.length / COLS);
  
  const colWidth = THUMB * 3 + PADDING * 4;
  const totalWidth = colWidth * Math.min(COLS, blockData.length / 3) + PADDING;
  
  // Each block gets a row with 3 thumbnails side by side: Current | Bitfeed Reference | Fixed
  const gridCols = 3; // blocks per row in the grid
  const gridRows = Math.ceil(blockData.length / gridCols);
  const cellW = THUMB * 3 + PADDING * 4;
  const cellH = THUMB + LABEL_H * 2 + PADDING;
  const canvasW = cellW * gridCols + PADDING * 2;
  const canvasH = HEADER_H + cellH * gridRows + PADDING;

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Header
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('Bitmap Thumbnail Comparison: Current (ours) | Bitfeed Reference | Fixed', PADDING, 28);

  for (let i = 0; i < blockData.length; i++) {
    const { height, txs } = blockData[i];
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);

    const baseX = PADDING + col * cellW;
    const baseY = HEADER_H + row * cellH;

    // Block label
    ctx.fillStyle = '#aaa';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`Block #${height} (${txs.length} txs)`, baseX + PADDING, baseY + 16);

    // Column labels
    ctx.fillStyle = '#f55';
    ctx.font = '11px monospace';
    ctx.fillText('CURRENT (ours)', baseX + PADDING, baseY + LABEL_H);
    ctx.fillStyle = '#5f5';
    ctx.fillText('BITFEED REF', baseX + THUMB + PADDING * 2, baseY + LABEL_H);
    ctx.fillStyle = '#55f';
    ctx.fillText('FIXED', baseX + THUMB * 2 + PADDING * 3, baseY + LABEL_H);

    const thumbY = baseY + LABEL_H + 4;

    // Render all three
    renderCurrentStyle(ctx, txs, baseX + PADDING, thumbY, THUMB);
    renderBitfeedStyle(ctx, txs, baseX + THUMB + PADDING * 2, thumbY, THUMB);
    renderFixedStyle(ctx, txs, baseX + THUMB * 2 + PADDING * 3, thumbY, THUMB);
  }

  const outFile = path.join(outDir, 'comparison-grid.png');
  fs.writeFileSync(outFile, canvas.toBuffer('image/png'));
  console.log(`\nSaved: ${outFile}`);

  // Also save individual comparisons
  for (const { height, txs } of blockData) {
    const c = createCanvas(THUMB * 3 + 20, THUMB + 30);
    const cctx = c.getContext('2d');
    cctx.fillStyle = '#111';
    cctx.fillRect(0, 0, c.width, c.height);
    
    cctx.fillStyle = '#aaa';
    cctx.font = '12px monospace';
    cctx.fillText(`#${height} — Current | Bitfeed | Fixed`, 5, 14);

    renderCurrentStyle(cctx, txs, 0, 20, THUMB);
    renderBitfeedStyle(cctx, txs, THUMB + 10, 20, THUMB);
    renderFixedStyle(cctx, txs, THUMB * 2 + 20, 20, THUMB);

    fs.writeFileSync(path.join(outDir, `block-${height}.png`), c.toBuffer('image/png'));
  }

  console.log('Individual block comparisons saved.');
}

main().catch(console.error);
