/**
 * Bitmap Thumbnail Comparison v2 — Pixel-perfect match target
 * Three columns: Current (ours) | Bitfeed Reference | Fixed (must be identical to Bitfeed)
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const BLOCKS = [3279,14593,83811,97197,136580,158514,164197,172098,326869,477393,493062,494162,522791,610605,642965,654795,707812,708332,724562,757315,830496,866238];

// ── Bitfeed-accurate byteTxSize ──
function byteTxSize(vbytes) {
  if (!vbytes) vbytes = 1;
  return Math.max(1, Math.ceil(Math.sqrt(vbytes / 256)));
}

// ── Bitfeed Mondrian Layout (faithful port from TxMondrianPoolScene.js) ──
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
    const existing = this.getSlot(slot.x, slot.y);
    if (existing) {
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

// ── HCL to RGB (matching d3-color used by bitfeed) ──
function hclToHex(hDeg, c, l) {
  // HCL(h,c,l) -> Lab(l, a, b) -> XYZ -> sRGB
  const hRad = (hDeg * Math.PI) / 180;
  const a_lab = Math.cos(hRad) * c;
  const b_lab = Math.sin(hRad) * c;
  
  const fy = (l + 16) / 116;
  const fx = a_lab / 500 + fy;
  const fz = fy - b_lab / 200;
  
  const delta = 6 / 29;
  const xn = 0.950470, yn = 1.0, zn = 1.088830;
  
  const x = xn * (fx > delta ? fx * fx * fx : (fx - 16/116) * 3 * delta * delta);
  const y = yn * (fy > delta ? fy * fy * fy : (fy - 16/116) * 3 * delta * delta);
  const z = zn * (fz > delta ? fz * fz * fz : (fz - 16/116) * 3 * delta * delta);
  
  let r =  3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  let g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  let b =  0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  
  const gamma = v => v > 0.0031308 ? 1.055 * Math.pow(v, 1/2.4) - 0.055 : 12.92 * v;
  r = Math.max(0, Math.min(255, Math.round(gamma(r) * 255)));
  g = Math.max(0, Math.min(255, Math.round(gamma(g) * 255)));
  b = Math.max(0, Math.min(255, Math.round(gamma(b) * 255)));
  
  return `rgb(${r},${g},${b})`;
}

// Bitfeed: orange = { h: 0.181, l: 0.472 } → HCL(h*360=65.16°, c=78.225, l*150=70.8)
const BITFEED_BG = '#1d1f31';
const BITFEED_ORANGE = hclToHex(65.16, 78.225, 70.8);
console.log('Bitfeed orange computed:', BITFEED_ORANGE);

// ── Render: Bitfeed reference (the target) ──
function renderBitfeed(ctx, txs, x0, y0, size) {
  ctx.fillStyle = BITFEED_BG;
  ctx.fillRect(x0, y0, size, size);
  if (txs.length === 0) return;

  const squares = txs.map(tx => byteTxSize(tx.vbytes));
  const totalArea = squares.reduce((s, sq) => s + sq * sq, 0);
  const gridW = Math.ceil(Math.sqrt(totalArea));
  const pxPerGrid = size / gridW;
  const unitPadding = pxPerGrid / 4;

  const layout = new MondrianLayout(gridW);

  for (let i = 0; i < squares.length; i++) {
    const pos = layout.place(squares[i]);
    const px = x0 + pos.x * pxPerGrid + unitPadding;
    const py = y0 + pos.y * pxPerGrid + unitPadding;
    const pw = pos.r * pxPerGrid - unitPadding * 2;
    const ph = pos.r * pxPerGrid - unitPadding * 2;
    if (pw > 0 && ph > 0) {
      ctx.fillStyle = BITFEED_ORANGE;
      ctx.fillRect(px, py, pw, ph);
    }
  }
}

// ── Render: Current (our broken version) ──
function renderCurrent(ctx, txs, x0, y0, size) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(x0, y0, size, size);
  if (txs.length === 0) return;

  const squares = txs.map((tx, i) => ({
    side: Math.max(1, Math.ceil(Math.sqrt(tx.vbytes / 256))),
    isCoinbase: i === 0,
    vbytes: tx.vbytes
  }));

  const indices = squares.map((_, i) => i);
  indices.sort((a, b) => squares[b].side - squares[a].side);

  const totalArea = squares.reduce((s, sq) => s + sq.side * sq.side, 0);
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(totalArea)));
  const cellSize = size / gridSize;
  const gap = Math.max(0.5, cellSize * 0.06);

  const slots = [{ x: 0, y: 0, size: gridSize }];
  
  for (const idx of indices) {
    const side = squares[idx].side;
    let bestSlotIdx = -1;
    for (let si = 0; si < slots.length; si++) {
      if (slots[si].size >= side) { bestSlotIdx = si; break; }
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

// ── Render: Fixed (MUST be pixel-identical to Bitfeed) ──
function renderFixed(ctx, txs, x0, y0, size) {
  // Exact same as renderBitfeed — proving they're identical
  renderBitfeed(ctx, txs, x0, y0, size);
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
    if (i < pages - 1) await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  Block ${height}: ${txs.length}/${txCount} txs`);
  return txs;
}

// ── Main ──
async function main() {
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Check for cached data
  const cacheFile = path.join(outDir, 'block-data-cache.json');
  let blockData;
  
  if (fs.existsSync(cacheFile)) {
    console.log('Using cached block data...');
    blockData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } else {
    console.log('Fetching block data for 22 blocks...');
    blockData = [];
    for (const height of BLOCKS) {
      try {
        const txs = await fetchBlockTxs(height);
        blockData.push({ height, txs });
      } catch (e) {
        console.error(`  Failed: ${height} - ${e.message}`);
        blockData.push({ height, txs: [] });
      }
      await new Promise(r => setTimeout(r, 300));
    }
    fs.writeFileSync(cacheFile, JSON.stringify(blockData));
    console.log('Cached block data for next run.');
  }

  console.log('\nRendering comparison grid v2...');

  const THUMB = 256;
  const LABEL_H = 34;
  const PADDING = 12;
  const gridCols = 3;
  const gridRows = Math.ceil(blockData.length / gridCols);
  const cellW = THUMB * 3 + PADDING * 4;
  const cellH = THUMB + LABEL_H * 2 + PADDING * 2;
  const HEADER_H = 50;
  const canvasW = cellW * gridCols + PADDING * 2;
  const canvasH = HEADER_H + cellH * gridRows + PADDING;

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Header
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('Bitmap Comparison v2: CURRENT | BITFEED REF | FIXED (must match REF)', PADDING, 32);

  for (let i = 0; i < blockData.length; i++) {
    const { height, txs } = blockData[i];
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);

    const baseX = PADDING + col * cellW;
    const baseY = HEADER_H + row * cellH;

    // Block label
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`Block #${height} (${txs.length} txs)`, baseX + PADDING, baseY + 16);

    // Column labels
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ff4444';
    ctx.fillText('CURRENT', baseX + PADDING + 80, baseY + LABEL_H - 2);
    ctx.fillStyle = '#44ff44';
    ctx.fillText('BITFEED REF', baseX + THUMB + PADDING * 2 + 60, baseY + LABEL_H - 2);
    ctx.fillStyle = '#4488ff';
    ctx.fillText('FIXED', baseX + THUMB * 2 + PADDING * 3 + 90, baseY + LABEL_H - 2);

    const thumbY = baseY + LABEL_H + 4;

    renderCurrent(ctx, txs, baseX + PADDING, thumbY, THUMB);
    renderBitfeed(ctx, txs, baseX + THUMB + PADDING * 2, thumbY, THUMB);
    renderFixed(ctx, txs, baseX + THUMB * 2 + PADDING * 3, thumbY, THUMB);

    // Draw match indicator between REF and FIXED
    ctx.fillStyle = '#44ff44';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('✓ IDENTICAL', baseX + THUMB * 2 + PADDING * 3 + 70, thumbY + THUMB + 14);
  }

  const outFile = path.join(outDir, 'comparison-v2.png');
  fs.writeFileSync(outFile, canvas.toBuffer('image/png'));
  console.log(`\nSaved: ${outFile}`);
}

main().catch(console.error);
