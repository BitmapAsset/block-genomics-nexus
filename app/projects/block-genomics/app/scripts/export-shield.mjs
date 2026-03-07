/**
 * Export the Block Genomics Verification Shield as a PNG asset.
 * Run: node scripts/export-shield.mjs
 */
import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const size = 1024;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');
const cx = size / 2;
const cy = size / 2;
const s = size / 512;

// ── Outer glow ──
const outerGlow = ctx.createRadialGradient(cx, cy, size * 0.2, cx, cy, size * 0.5);
outerGlow.addColorStop(0, 'rgba(247, 147, 26, 0.25)');
outerGlow.addColorStop(0.5, 'rgba(102, 204, 255, 0.12)');
outerGlow.addColorStop(1, 'transparent');
ctx.fillStyle = outerGlow;
ctx.fillRect(0, 0, size, size);

function drawShieldPath() {
  ctx.beginPath();
  ctx.moveTo(cx, cy - 170 * s);
  ctx.bezierCurveTo(cx + 50 * s, cy - 170 * s, cx + 145 * s, cy - 150 * s, cx + 150 * s, cy - 130 * s);
  ctx.lineTo(cx + 150 * s, cy - 20 * s);
  ctx.bezierCurveTo(cx + 148 * s, cy + 60 * s, cx + 100 * s, cy + 120 * s, cx, cy + 180 * s);
  ctx.bezierCurveTo(cx - 100 * s, cy + 120 * s, cx - 148 * s, cy + 60 * s, cx - 150 * s, cy - 20 * s);
  ctx.lineTo(cx - 150 * s, cy - 130 * s);
  ctx.bezierCurveTo(cx - 145 * s, cy - 150 * s, cx - 50 * s, cy - 170 * s, cx, cy - 170 * s);
  ctx.closePath();
}

// Shield fill
ctx.save();
drawShieldPath();
const shieldGrad = ctx.createLinearGradient(cx, cy - 170 * s, cx, cy + 180 * s);
shieldGrad.addColorStop(0, '#1a1a2e');
shieldGrad.addColorStop(0.5, '#12121a');
shieldGrad.addColorStop(1, '#0a0a14');
ctx.fillStyle = shieldGrad;
ctx.fill();
ctx.restore();

// Shield border
ctx.save();
drawShieldPath();
const borderGrad = ctx.createLinearGradient(cx - 150 * s, cy, cx + 150 * s, cy);
borderGrad.addColorStop(0, '#f7931a');
borderGrad.addColorStop(0.3, '#ffd27d');
borderGrad.addColorStop(0.7, '#66ccff');
borderGrad.addColorStop(1, '#a855f7');
ctx.strokeStyle = borderGrad;
ctx.lineWidth = 5 * s;
ctx.stroke();
ctx.restore();

// Inner border
ctx.save();
ctx.translate(0, 0);
ctx.scale(0.92, 0.92);
ctx.translate(cx * 0.08 / 0.92, cy * 0.08 / 0.92);
drawShieldPath();
ctx.strokeStyle = 'rgba(255, 210, 125, 0.2)';
ctx.lineWidth = 1.5 * s;
ctx.stroke();
ctx.restore();

// DNA helix
ctx.save();
drawShieldPath();
ctx.clip();
const helixAmplitude = 40 * s;
const helixTop = cy - 140 * s;
const helixBottom = cy + 150 * s;
const helixSteps = 80;
for (let strand = 0; strand < 2; strand++) {
  const phase = strand * Math.PI;
  const color = strand === 0 ? '#f7931a' : '#66ccff';
  ctx.beginPath();
  for (let i = 0; i <= helixSteps; i++) {
    const t = i / helixSteps;
    const y = helixTop + t * (helixBottom - helixTop);
    const x = cx + Math.sin(t * Math.PI * 4 + phase) * helixAmplitude;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 2.5 * s;
  ctx.stroke();
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 1.5 * s;
  for (let i = 0; i <= helixSteps; i++) {
    const t = i / helixSteps;
    const sinVal = Math.sin(t * Math.PI * 4 + phase);
    if (Math.abs(sinVal) < 0.15 && i % 4 === 0) {
      const y = helixTop + t * (helixBottom - helixTop);
      const x1 = cx - helixAmplitude * 0.8;
      const x2 = cx + helixAmplitude * 0.8;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      const rungGrad = ctx.createLinearGradient(x1, y, x2, y);
      rungGrad.addColorStop(0, '#f7931a');
      rungGrad.addColorStop(1, '#66ccff');
      ctx.strokeStyle = rungGrad;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
ctx.restore();

// ₿ symbol
ctx.save();
drawShieldPath();
ctx.clip();
const btcGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60 * s);
btcGlow.addColorStop(0, 'rgba(247, 147, 26, 0.3)');
btcGlow.addColorStop(1, 'transparent');
ctx.fillStyle = btcGlow;
ctx.beginPath();
ctx.arc(cx, cy, 60 * s, 0, Math.PI * 2);
ctx.fill();
ctx.font = `bold ${90 * s}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
const btcTextGrad = ctx.createLinearGradient(cx, cy - 45 * s, cx, cy + 45 * s);
btcTextGrad.addColorStop(0, '#ffd27d');
btcTextGrad.addColorStop(0.5, '#ffffff');
btcTextGrad.addColorStop(1, '#f7931a');
ctx.fillStyle = btcTextGrad;
ctx.fillText('₿', cx, cy + 2 * s);
ctx.strokeStyle = 'rgba(247, 147, 26, 0.4)';
ctx.lineWidth = 1.5 * s;
ctx.strokeText('₿', cx, cy + 2 * s);
ctx.restore();

// BG monogram
ctx.save();
drawShieldPath();
ctx.clip();
ctx.font = `bold ${22 * s}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = 'rgba(102, 204, 255, 0.6)';
ctx.fillText('BG', cx, cy + 135 * s);
ctx.restore();

// Checkmark
ctx.save();
drawShieldPath();
ctx.clip();
const checkY = cy - 130 * s;
ctx.beginPath();
ctx.moveTo(cx - 18 * s, checkY);
ctx.lineTo(cx - 6 * s, checkY + 12 * s);
ctx.lineTo(cx + 18 * s, checkY - 8 * s);
ctx.strokeStyle = '#22ff88';
ctx.lineWidth = 4 * s;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.stroke();
const checkGlow = ctx.createRadialGradient(cx, checkY, 0, cx, checkY, 25 * s);
checkGlow.addColorStop(0, 'rgba(34, 255, 136, 0.2)');
checkGlow.addColorStop(1, 'transparent');
ctx.fillStyle = checkGlow;
ctx.beginPath();
ctx.arc(cx, checkY, 25 * s, 0, Math.PI * 2);
ctx.fill();
ctx.restore();

// Corner diamonds
ctx.save();
drawShieldPath();
ctx.clip();
[
  { x: cx - 110 * s, y: cy - 80 * s },
  { x: cx + 110 * s, y: cy - 80 * s },
  { x: cx - 90 * s, y: cy + 50 * s },
  { x: cx + 90 * s, y: cy + 50 * s },
].forEach(({ x, y }) => {
  ctx.beginPath();
  ctx.moveTo(x, y - 5 * s);
  ctx.lineTo(x + 4 * s, y);
  ctx.lineTo(x, y + 5 * s);
  ctx.lineTo(x - 4 * s, y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 210, 125, 0.4)';
  ctx.fill();
});
ctx.restore();

// Export
const outPath = join(__dirname, '..', 'public', 'assets', 'badges', 'verification-shield.png');
writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log(`✅ Shield exported to ${outPath} (${(canvas.toBuffer('image/png').length / 1024).toFixed(0)} KB)`);
