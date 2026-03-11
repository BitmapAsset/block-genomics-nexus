/**
 * Bitmap Comparison v4 — 21 Blocks × 3 Platforms
 *
 * Platforms:
 *   1. Block Genomics  — Our live API (blockgenomics.io)
 *   2. Bitfeed         — Original Mondrian reference (local faithful port)
 *   3. Size Heatmap    — Alt visualization: txs colored by size tier
 *
 * Layout: 3 blocks per row × 7 rows = 21 blocks
 * Each cell: 3 platform thumbnails side by side
 */

const { createCanvas, loadImage } = require('canvas');
const fs   = require('fs');
const path = require('path');

// ── 21 diverse blocks (includes Pepe's + Gravity's owned Bitmap blocks) ──
const BLOCKS = [
  3279,    // Ancient — 1 tx
  83811,   // Early era
  136580,  // Early era
  326869,  // Mid era
  433445,  // Gravity's wallet block
  477393,  // Pre-SegWit, dense
  494162,  // Pre-SegWit, dense
  612888,  // Gravity's Xverse block
  618605,  // Post-SegWit
  640860,  // Gravity's Xverse block
  654795,  // High-activity
  708332,  // High-activity
  718840,  // 🐸 Pepe's Bitmap block
  720143,  // 🐸 Pepe's Guardian block
  724562,  // High-activity
  738505,  // 🐸 Pepe's Bitmap block
  745506,  // 🐸 Pepe's Bitmap block
  745966,  // 🐸 Pepe's Bitmap block
  830496,  // Newer era
  850000,  // Recent
  866238,  // Recent
];

// ── Bitfeed-accurate tx size → grid squares ──
function byteTxSize(vbytes) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, vbytes) / 256)));
}

// ── Mondrian Layout (faithful port of Bitfeed's algorithm) ──
class MondrianLayout {
  constructor(width) { this.width = width; this.rowOffset = 0; this.rows = []; }
  addRow() { const r = { y: this.rows.length + this.rowOffset, slots: [], map: {} }; this.rows.push(r); return r; }
  getRow(y) { return this.rows[y - this.rowOffset]; }
  getSlot(x, y) { const r = this.getRow(y); return r ? r.map[x] : undefined; }
  addSlot(slot) {
    if (slot.r <= 0) return;
    const ex = this.getSlot(slot.x, slot.y);
    if (ex) { if (slot.r > ex.r) ex.r = slot.r; return ex; }
    const row = this.getRow(slot.y); if (!row) return;
    let insertAt = null;
    for (let i = 0; i < row.slots.length && insertAt == null; i++) { if (row.slots[i].x > slot.x) insertAt = i; }
    if (insertAt == null) row.slots.push(slot); else row.slots.splice(insertAt, 0, slot);
    row.map[slot.x] = slot; return slot;
  }
  removeSlot(slot) { const row = this.getRow(slot.y); if (row) { delete row.map[slot.x]; const i = row.slots.indexOf(slot); if (i >= 0) row.slots.splice(i, 1); } }
  fillSlot(slot, sw) {
    const sq = { left: slot.x, right: slot.x + sw, top: slot.y + sw };
    this.removeSlot(slot);
    for (let ri = slot.y; ri < sq.top; ri++) {
      const row = this.getRow(ri);
      if (row) {
        let coll = [], maxEx = 0;
        for (const ts of row.slots) { if (!((ts.x + ts.r < sq.left) || (ts.x >= sq.right))) { coll.push(ts); maxEx = Math.max(maxEx, Math.max(0, ts.x + ts.r - (slot.x + slot.r))); } }
        if (sq.right < this.width && !row.map[sq.right]) this.addSlot({ x: sq.right, y: ri, r: slot.r - sw + maxEx });
        for (const c of coll) { c.r = slot.x - c.x; if (c.r <= 0) this.removeSlot(c); }
      } else {
        this.addRow();
        if (slot.x > 0) this.addSlot({ x: 0, y: ri, r: slot.x });
        if (sq.right < this.width) this.addSlot({ x: sq.right, y: ri, r: this.width - sq.right });
      }
    }
    for (let ri = Math.max(0, slot.y - sw); ri < slot.y; ri++) {
      const row = this.getRow(ri);
      if (row) {
        for (const ts of row.slots) {
          if (ts.x < slot.x + sw && ts.x + ts.r > slot.x && ts.y + ts.r >= slot.y) {
            const oldW = ts.r; ts.r = slot.y - ts.y; if (ts.r <= 0) this.removeSlot(ts);
            let rem = { x: ts.x + ts.r, y: ts.y, w: oldW - ts.r, h: ts.r };
            while (rem.w > 0 && rem.h > 0) {
              if (rem.w <= rem.h) { this.addSlot({ x: rem.x, y: rem.y, r: rem.w }); rem.y += rem.w; rem.h -= rem.w; }
              else { this.addSlot({ x: rem.x, y: rem.y, r: rem.h }); rem.x += rem.h; rem.w -= rem.h; }
            }
          }
        }
      }
    }
    return { x: slot.x, y: slot.y, r: sw };
  }
  place(size) {
    for (const row of this.rows) { for (const slot of row.slots) { if (slot.r >= size) return this.fillSlot(slot, size); } }
    const row = this.addRow(); const slot = this.addSlot({ x: 0, y: row.y, r: this.width }); return this.fillSlot(slot, size);
  }
}

// ── Platform color schemes ──
const PLATFORM = {
  blockgenomics: { bg: '#0d0d1a', color: () => '#fd931e' },           // orange on very dark blue (fetched from API)
  bitfeed:       { bg: '#1d1f31', color: () => '#fd931e' },           // orange on Bitfeed navy
  heatmap:       { bg: '#111111', color: (vbytes) => {                // size-tier heatmap on black
    if (vbytes < 150)  return '#00d4ff';  // tiny: cyan
    if (vbytes < 500)  return '#00ff99';  // small: green
    if (vbytes < 2000) return '#ffcc00';  // medium: yellow
    if (vbytes < 8000) return '#ff7700';  // large: orange
    return '#ff2266';                     // whale: pink/red
  }},
};

// ── Local renderer (Bitfeed or Heatmap style) ──
function renderLocal(ctx, txs, x0, y0, size, platformKey) {
  const p = PLATFORM[platformKey];
  ctx.fillStyle = p.bg;
  ctx.fillRect(x0, y0, size, size);
  if (txs.length === 0) return;

  const squares = txs.map(tx => byteTxSize(tx.vbytes));
  const totalArea = squares.reduce((s, sq) => s + sq * sq, 0);
  const gridW = Math.ceil(Math.sqrt(totalArea));
  const pxPerGrid = size / gridW;
  const unitPadding = pxPerGrid / 4;

  const layout = new MondrianLayout(gridW);
  for (let i = 0; i < txs.length; i++) {
    const pos = layout.place(squares[i]);
    const px = x0 + pos.x * pxPerGrid + unitPadding;
    const py = y0 + pos.y * pxPerGrid + unitPadding;
    const pw = pos.r * pxPerGrid - unitPadding * 2;
    const ph = pos.r * pxPerGrid - unitPadding * 2;
    if (pw > 0 && ph > 0) {
      ctx.fillStyle = p.color(txs[i].vbytes);
      ctx.fillRect(px, py, pw, ph);
    }
  }
}

// ── Data fetching ──
async function fetchBlockTxs(height) {
  const outDir = path.join(__dirname, 'output');
  const cacheFile = path.join(outDir, `block-${height}-txs.json`);
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

  console.log(`  Fetching block ${height}...`);
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
    if (i < pages - 1) await new Promise(r => setTimeout(r, 150));
  }

  console.log(`  ✓ Block ${height}: ${txs.length}/${txCount} txs fetched`);
  fs.writeFileSync(cacheFile, JSON.stringify(txs));
  return txs;
}

async function fetchOurThumbnail(height, size) {
  const url = `https://blockgenomics.io/api/v1/block-thumbnail/${height}?size=${size}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return loadImage(buf);
}

// ── Main ──
async function main() {
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const THUMB       = 220;    // size of each platform thumbnail
  const GAP         = 6;      // gap between 3 platform thumbs in a cell
  const CELL_PAD    = 20;     // padding between cells
  const LABEL_TOP   = 52;     // height of top label area per cell
  const STAT_H      = 22;     // height of bottom stats per cell
  const PLAT_LABEL  = 18;     // platform name label height
  const COLS        = 3;      // 3 block cells per row
  const ROWS        = 7;      // 7 rows = 21 blocks
  const HEADER_H    = 80;     // global header
  const FOOTER_H    = 60;     // global footer / legend

  const cellW = THUMB * 3 + GAP * 2;
  const cellH = LABEL_TOP + PLAT_LABEL + THUMB + STAT_H + 10;

  const canvasW = CELL_PAD + (cellW + CELL_PAD) * COLS;
  const canvasH = HEADER_H + (cellH + CELL_PAD) * ROWS + FOOTER_H;

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');

  // ── Background ──
  ctx.fillStyle = '#060608';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // ── Header ──
  ctx.font = 'bold 28px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('BITMAP PARCEL COMPARISON — 21 BLOCKS × 3 PLATFORMS', CELL_PAD, 42);

  // Platform color indicators in header
  const platLabels = [
    { label: '■ Block Genomics (Live API)', color: '#fd931e' },
    { label: '■ Bitfeed (Reference)',       color: '#fd931e' },
    { label: '■ Size Heatmap (Alt Render)', color: '#00d4ff' },
  ];
  let hx = CELL_PAD;
  ctx.font = '14px monospace';
  for (const p of platLabels) {
    ctx.fillStyle = p.color;
    ctx.fillText(p.label, hx, 66);
    hx += 380;
  }

  let successCount = 0;
  let errorCount   = 0;

  for (let i = 0; i < BLOCKS.length; i++) {
    const height = BLOCKS[i];
    const col    = i % COLS;
    const row    = Math.floor(i / COLS);
    const cellX  = CELL_PAD + col * (cellW + CELL_PAD);
    const cellY  = HEADER_H + row * (cellH + CELL_PAD);

    console.log(`\n[${i + 1}/21] Block #${height}`);

    // ── Cell background ──
    ctx.fillStyle = '#0f0f18';
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cellX, cellY, cellW, cellH, 6);
    ctx.fill();
    ctx.stroke();

    // ── Block label ──
    const isPepe    = [718840, 720143, 738505, 745506, 745966].includes(height);
    const isGravity = [433445, 612888, 640860].includes(height);
    const badge     = isPepe ? ' 🐸' : isGravity ? ' 👑' : '';
    ctx.font  = 'bold 16px monospace';
    ctx.fillStyle = isPepe ? '#fd931e' : isGravity ? '#a855f7' : '#cccccc';
    ctx.fillText(`Block #${height}${badge}`, cellX + 6, cellY + 20);

    let txLabel = '...';

    try {
      // Fetch tx data
      const txs = await fetchBlockTxs(height);
      txLabel   = `${txs.length} txs`;
      await new Promise(r => setTimeout(r, 100));

      // ── Thumbnail Y ──
      const thumbY = cellY + LABEL_TOP + PLAT_LABEL;

      // ── Platform 1: Block Genomics (our live API) ──
      const x1 = cellX;
      try {
        const img = await fetchOurThumbnail(height, THUMB);
        ctx.drawImage(img, x1, thumbY, THUMB, THUMB);
      } catch (e) {
        // Fallback: render locally (same algorithm as API)
        console.log(`    API error, using local render: ${e.message}`);
        renderLocal(ctx, txs, x1, thumbY, THUMB, 'blockgenomics');
      }

      // ── Platform 2: Bitfeed reference ──
      const x2 = cellX + THUMB + GAP;
      renderLocal(ctx, txs, x2, thumbY, THUMB, 'bitfeed');

      // ── Platform 3: Size Heatmap ──
      const x3 = cellX + (THUMB + GAP) * 2;
      renderLocal(ctx, txs, x3, thumbY, THUMB, 'heatmap');

      // ── Platform name labels (above thumbnails) ──
      ctx.font = '11px monospace';
      const platNames = [
        { x: x1, label: 'blockgenomics.io', color: '#fd931e' },
        { x: x2, label: 'bitfeed.live',     color: '#66aaff' },
        { x: x3, label: 'size heatmap',     color: '#00d4ff' },
      ];
      for (const p of platNames) {
        ctx.fillStyle = p.color;
        ctx.fillText(p.label, p.x + 4, thumbY - 4);
      }

      successCount++;
    } catch (e) {
      ctx.fillStyle = '#ff4444';
      ctx.font = '13px monospace';
      ctx.fillText(`ERROR: ${e.message}`, cellX + 6, cellY + LABEL_TOP + 40);
      txLabel = 'error';
      errorCount++;
    }

    // ── Tx count label (bottom) ──
    ctx.font  = '12px monospace';
    ctx.fillStyle = '#888888';
    ctx.fillText(txLabel, cellX + 6, cellY + cellH - 6);
  }

  // ── Footer legend ──
  const fy = canvasH - FOOTER_H + 14;
  ctx.font  = 'bold 13px monospace';
  ctx.fillStyle = '#666666';
  ctx.fillText('SIZE HEATMAP LEGEND:', CELL_PAD, fy);
  const legend = [
    { color: '#00d4ff', label: '< 150 vB (tiny)'  },
    { color: '#00ff99', label: '150–500 vB'        },
    { color: '#ffcc00', label: '500–2000 vB'       },
    { color: '#ff7700', label: '2000–8000 vB'      },
    { color: '#ff2266', label: '> 8000 vB (whale)' },
  ];
  let lx = 280;
  for (const l of legend) {
    ctx.fillStyle = l.color;
    ctx.fillRect(lx, fy - 11, 14, 14);
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(l.label, lx + 18, fy);
    lx += 200;
  }
  ctx.font  = '12px monospace';
  ctx.fillStyle = '#444444';
  ctx.fillText(`🐸 Pepe's Bitmap Blocks   👑 Gravity's Wallet Blocks   Generated: ${new Date().toISOString()}`, CELL_PAD, canvasH - 12);

  // ── Summary ──
  console.log(`\n═══════════════════════════════`);
  console.log(`✓ Done: ${successCount}/21 blocks rendered`);
  if (errorCount > 0) console.log(`✗ Errors: ${errorCount}`);

  const outFile = path.join(outDir, 'comparison-v4-21blocks.png');
  fs.writeFileSync(outFile, canvas.toBuffer('image/png'));
  console.log(`\n📸 Saved: ${outFile}`);
}

main().catch(console.error);
