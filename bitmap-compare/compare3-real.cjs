/**
 * REAL Bitmap Comparison v3
 * 
 * Fetches thumbnails from OUR LIVE API and compares against
 * a locally-rendered Bitfeed reference.
 * 
 * This is the REAL test — not same-function-vs-itself.
 */

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// 12 diverse blocks for comparison
const BLOCKS = [3279, 83811, 136580, 326869, 477393, 494162, 618605, 654795, 708332, 724562, 830496, 866238];

// ── Bitfeed-accurate byteTxSize ──
function byteTxSize(vbytes) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, vbytes) / 256)));
}

// ── Bitfeed Mondrian Layout (faithful port) ──
class MondrianLayout {
  constructor(width) {
    this.width = width;
    this.rowOffset = 0;
    this.rows = [];
  }
  addRow() {
    const r = { y: this.rows.length + this.rowOffset, slots: [], map: {} };
    this.rows.push(r);
    return r;
  }
  getRow(y) { return this.rows[y - this.rowOffset]; }
  getSlot(x, y) { const r = this.getRow(y); return r ? r.map[x] : undefined; }
  addSlot(slot) {
    if (slot.r <= 0) return;
    const existing = this.getSlot(slot.x, slot.y);
    if (existing) { if (slot.r > existing.r) existing.r = slot.r; return existing; }
    const row = this.getRow(slot.y);
    if (!row) return;
    let insertAt = null;
    for (let i = 0; i < row.slots.length && insertAt == null; i++) {
      if (row.slots[i].x > slot.x) insertAt = i;
    }
    if (insertAt == null) row.slots.push(slot); else row.slots.splice(insertAt, 0, slot);
    row.map[slot.x] = slot;
    return slot;
  }
  removeSlot(slot) {
    const row = this.getRow(slot.y);
    if (row) { delete row.map[slot.x]; const i = row.slots.indexOf(slot); if (i >= 0) row.slots.splice(i, 1); }
  }
  fillSlot(slot, squareWidth) {
    const sq = { left: slot.x, right: slot.x + squareWidth, top: slot.y + squareWidth };
    this.removeSlot(slot);
    for (let ri = slot.y; ri < sq.top; ri++) {
      const row = this.getRow(ri);
      if (row) {
        let collisions = [], maxExcess = 0;
        for (const ts of row.slots) {
          if (!((ts.x + ts.r < sq.left) || (ts.x >= sq.right))) {
            collisions.push(ts);
            maxExcess = Math.max(maxExcess, Math.max(0, ts.x + ts.r - (slot.x + slot.r)));
          }
        }
        if (sq.right < this.width && !row.map[sq.right])
          this.addSlot({ x: sq.right, y: ri, r: slot.r - squareWidth + maxExcess });
        for (const c of collisions) { c.r = slot.x - c.x; if (c.r <= 0) this.removeSlot(c); }
      } else {
        this.addRow();
        if (slot.x > 0) this.addSlot({ x: 0, y: ri, r: slot.x });
        if (sq.right < this.width) this.addSlot({ x: sq.right, y: ri, r: this.width - sq.right });
      }
    }
    for (let ri = Math.max(0, slot.y - squareWidth); ri < slot.y; ri++) {
      const row = this.getRow(ri);
      if (row) {
        for (const ts of row.slots) {
          if (ts.x < slot.x + squareWidth && ts.x + ts.r > slot.x && ts.y + ts.r >= slot.y) {
            const oldW = ts.r;
            ts.r = slot.y - ts.y;
            if (ts.r <= 0) this.removeSlot(ts);
            let rem = { x: ts.x + ts.r, y: ts.y, w: oldW - ts.r, h: ts.r };
            while (rem.w > 0 && rem.h > 0) {
              if (rem.w <= rem.h) { this.addSlot({ x: rem.x, y: rem.y, r: rem.w }); rem.y += rem.w; rem.h -= rem.w; }
              else { this.addSlot({ x: rem.x, y: rem.y, r: rem.h }); rem.x += rem.h; rem.w -= rem.h; }
            }
          }
        }
      }
    }
    return { x: slot.x, y: slot.y, r: squareWidth };
  }
  place(size) {
    for (let ri = 0; ri < this.rows.length; ri++) {
      const row = this.rows[ri];
      for (let si = 0; si < row.slots.length; si++) {
        if (row.slots[si].r >= size) return this.fillSlot(row.slots[si], size);
      }
    }
    const row = this.addRow();
    const slot = this.addSlot({ x: 0, y: row.y, r: this.width });
    return this.fillSlot(slot, size);
  }
}

const BITFEED_BG = '#1d1f31';
const BITFEED_ORANGE = 'rgb(253,147,30)';

function renderBitfeedRef(ctx, txs, x0, y0, size) {
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
    if (pw > 0 && ph > 0) { ctx.fillStyle = BITFEED_ORANGE; ctx.fillRect(px, py, pw, ph); }
  }
}

async function fetchBlockTxs(height) {
  const cacheDir = path.join(__dirname, 'output');
  const cacheFile = path.join(cacheDir, `block-${height}-txs.json`);
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

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
  fs.writeFileSync(cacheFile, JSON.stringify(txs));
  return txs;
}

async function fetchOurThumbnail(height, size) {
  const url = `https://blockgenomics.io/api/v1/block-thumbnail/${height}?size=${size}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return loadImage(buf);
}

function comparePixels(ctx1, x1, y1, ctx2, x2, y2, size) {
  const d1 = ctx1.getImageData(x1, y1, size, size);
  const d2 = ctx2.getImageData(x2, y2, size, size);
  let diffPixels = 0;
  let totalDiff = 0;
  for (let i = 0; i < d1.data.length; i += 4) {
    const dr = Math.abs(d1.data[i] - d2.data[i]);
    const dg = Math.abs(d1.data[i+1] - d2.data[i+1]);
    const db = Math.abs(d1.data[i+2] - d2.data[i+2]);
    if (dr > 2 || dg > 2 || db > 2) {
      diffPixels++;
      totalDiff += dr + dg + db;
    }
  }
  const totalPx = size * size;
  return { diffPixels, totalPx, pct: ((diffPixels / totalPx) * 100).toFixed(2), avgDiff: diffPixels > 0 ? (totalDiff / diffPixels / 3).toFixed(1) : 0 };
}

async function main() {
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const THUMB = 256;
  const PADDING = 16;
  const LABEL_H = 50;
  const COLS = 4;
  const ROWS = Math.ceil(BLOCKS.length / COLS);
  const cellW = THUMB * 2 + PADDING * 3;
  const cellH = THUMB + LABEL_H + PADDING + 20;
  const HEADER_H = 60;
  const canvasW = cellW * COLS + PADDING * 2;
  const canvasH = HEADER_H + cellH * ROWS + PADDING;

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('REAL Comparison: OUR LIVE API vs BITFEED REFERENCE', PADDING, 35);

  // Temp canvas for pixel comparison
  const tmpCanvas = createCanvas(THUMB, THUMB);
  const tmpCtx = tmpCanvas.getContext('2d');

  let allResults = [];

  for (let i = 0; i < BLOCKS.length; i++) {
    const height = BLOCKS[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const baseX = PADDING + col * cellW;
    const baseY = HEADER_H + row * cellH;

    console.log(`Processing block ${height}...`);

    let result = { height, status: 'unknown', diff: null };

    try {
      // Fetch real tx data for bitfeed reference
      const txs = await fetchBlockTxs(height);
      await new Promise(r => setTimeout(r, 300));

      // Fetch OUR live thumbnail
      const ourImg = await fetchOurThumbnail(height, THUMB);

      // Render bitfeed reference
      const refX = baseX + THUMB + PADDING * 2;
      renderBitfeedRef(ctx, txs, refX, baseY + LABEL_H, THUMB);

      // Draw our API thumbnail
      ctx.drawImage(ourImg, baseX + PADDING, baseY + LABEL_H, THUMB, THUMB);

      // Pixel comparison
      tmpCtx.clearRect(0, 0, THUMB, THUMB);
      tmpCtx.drawImage(ourImg, 0, 0, THUMB, THUMB);
      const diff = comparePixels(tmpCtx, 0, 0, ctx, refX, baseY + LABEL_H, THUMB);
      result.diff = diff;

      // Labels
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#ccc';
      ctx.fillText(`Block #${height} (${txs.length} txs)`, baseX + PADDING, baseY + 16);

      ctx.fillStyle = '#4488ff';
      ctx.fillText('OUR API', baseX + PADDING + 80, baseY + 34);
      ctx.fillStyle = '#44ff44';
      ctx.fillText('BITFEED REF', refX + 60, baseY + 34);

      // Match result
      const isMatch = diff.pct === '0.00' || parseFloat(diff.pct) < 0.5;
      ctx.fillStyle = isMatch ? '#44ff44' : '#ff4444';
      ctx.font = 'bold 12px monospace';
      const matchText = isMatch ? `✓ MATCH (${diff.pct}% diff)` : `✗ ${diff.pct}% diff (${diff.diffPixels}px, avg ${diff.avgDiff})`;
      ctx.fillText(matchText, baseX + PADDING, baseY + LABEL_H + THUMB + 14);
      result.status = isMatch ? 'match' : 'diff';

    } catch (e) {
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`ERROR: ${e.message}`, baseX + PADDING, baseY + LABEL_H + 30);
      result.status = 'error';
      result.error = e.message;
    }

    allResults.push(result);
  }

  // Summary
  const matches = allResults.filter(r => r.status === 'match').length;
  const diffs = allResults.filter(r => r.status === 'diff').length;
  const errors = allResults.filter(r => r.status === 'error').length;

  console.log(`\n=== RESULTS ===`);
  console.log(`Matches: ${matches}/${BLOCKS.length}`);
  console.log(`Differences: ${diffs}`);
  console.log(`Errors: ${errors}`);

  for (const r of allResults) {
    if (r.diff) {
      console.log(`  Block ${r.height}: ${r.diff.pct}% different (${r.diff.diffPixels} pixels)`);
    }
  }

  const outFile = path.join(outDir, 'comparison-v3-real.png');
  fs.writeFileSync(outFile, canvas.toBuffer('image/png'));
  console.log(`\nSaved: ${outFile}`);
}

main().catch(console.error);
