// Generate PWA icons for Block Genomics
// Uses the canvas package already in dependencies
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

function drawIcon(size, maskable = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  if (maskable) {
    // Maskable icons need safe zone (inner 80%)
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, size, size);
  } else {
    // Regular icon — rounded feel with dark bg
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, size, size);
  }

  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 512;

  // Outer glow ring
  const gradient = ctx.createRadialGradient(cx, cy, size * 0.15, cx, cy, size * 0.42);
  gradient.addColorStop(0, 'rgba(247, 147, 26, 0.15)');
  gradient.addColorStop(0.5, 'rgba(102, 204, 255, 0.08)');
  gradient.addColorStop(1, 'rgba(168, 85, 247, 0.05)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // DNA double helix
  const helixWidth = size * 0.06;
  const amplitude = size * 0.18;
  const vertStart = maskable ? size * 0.2 : size * 0.12;
  const vertEnd = maskable ? size * 0.8 : size * 0.88;
  const steps = 60;

  // Left strand
  ctx.beginPath();
  ctx.strokeStyle = '#66ccff';
  ctx.lineWidth = helixWidth;
  ctx.lineCap = 'round';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = vertStart + t * (vertEnd - vertStart);
    const x = cx + Math.sin(t * Math.PI * 3) * amplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Right strand
  ctx.beginPath();
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = helixWidth;
  ctx.lineCap = 'round';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = vertStart + t * (vertEnd - vertStart);
    const x = cx - Math.sin(t * Math.PI * 3) * amplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Base pair connections
  ctx.lineWidth = helixWidth * 0.5;
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    const y = vertStart + t * (vertEnd - vertStart);
    const x1 = cx + Math.sin(t * Math.PI * 3) * amplitude;
    const x2 = cx - Math.sin(t * Math.PI * 3) * amplitude;

    ctx.beginPath();
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(247, 147, 26, 0.7)' : 'rgba(102, 204, 255, 0.5)';
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  }

  // Bitcoin ₿ symbol at center
  const btcSize = size * 0.14;
  ctx.font = `bold ${btcSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F7931A';
  ctx.shadowColor = 'rgba(247, 147, 26, 0.6)';
  ctx.shadowBlur = size * 0.04;
  ctx.fillText('₿', cx, cy);
  ctx.shadowBlur = 0;

  return canvas.toBuffer('image/png');
}

// Generate all icon sizes
const sizes = [192, 512];

for (const size of sizes) {
  // Regular icon
  const regular = drawIcon(size, false);
  fs.writeFileSync(path.join(ICONS_DIR, `icon-${size}x${size}.png`), regular);
  console.log(`Generated icon-${size}x${size}.png`);

  // Maskable icon
  const maskable = drawIcon(size, true);
  fs.writeFileSync(path.join(ICONS_DIR, `icon-maskable-${size}x${size}.png`), maskable);
  console.log(`Generated icon-maskable-${size}x${size}.png`);
}

// Generate apple-touch-icon (180x180)
const appleIcon = drawIcon(180, true);
fs.writeFileSync(path.join(ICONS_DIR, 'apple-touch-icon.png'), appleIcon);
console.log('Generated apple-touch-icon.png');

// Generate favicon (32x32)
const favicon = drawIcon(32, false);
fs.writeFileSync(path.join(ICONS_DIR, 'favicon-32x32.png'), favicon);
console.log('Generated favicon-32x32.png');

console.log('\nAll PWA icons generated successfully!');
