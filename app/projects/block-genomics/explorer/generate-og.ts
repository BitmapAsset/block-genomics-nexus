#!/usr/bin/env tsx
/**
 * Block Genomics — Dynamic OG Image Generator
 *
 * Generates 1200x630 PNG images for social sharing (Twitter, Discord, Telegram).
 * Uses satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG) pipeline.
 *
 * Usage:
 *   tsx generate-og.ts --type block --height 500000
 *   tsx generate-og.ts --type agent --id satoshi_spirit
 *   tsx generate-og.ts                                     # generates demo images
 *
 * In production, call generateBlockOG() or generateAgentOG() from your API route.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  BlockOGTemplate,
  AgentOGTemplate,
  type BlockOGData,
  type AgentOGData,
} from './og-templates.js';

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, 'output');

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// ═══════════════════════════════════════════════════════════════
// Font Loading
// ═══════════════════════════════════════════════════════════════

/**
 * Load fonts for satori rendering.
 * In production, bundle Inter and JetBrains Mono font files.
 * For development, we fetch from Google Fonts CDN.
 */
async function loadFonts(): Promise<Array<{ name: string; data: ArrayBuffer; weight: number; style: string }>> {
  const fonts: Array<{ name: string; data: ArrayBuffer; weight: number; style: string }> = [];

  // Try to load local font files first
  const fontPaths = [
    { name: 'Inter', weight: 400, path: join(__dirname, 'fonts', 'Inter-Regular.ttf') },
    { name: 'Inter', weight: 600, path: join(__dirname, 'fonts', 'Inter-SemiBold.ttf') },
    { name: 'Inter', weight: 700, path: join(__dirname, 'fonts', 'Inter-Bold.ttf') },
    { name: 'Inter', weight: 800, path: join(__dirname, 'fonts', 'Inter-ExtraBold.ttf') },
    { name: 'Inter', weight: 900, path: join(__dirname, 'fonts', 'Inter-Black.ttf') },
    { name: 'JetBrains Mono', weight: 400, path: join(__dirname, 'fonts', 'JetBrainsMono-Regular.ttf') },
    { name: 'JetBrains Mono', weight: 600, path: join(__dirname, 'fonts', 'JetBrainsMono-SemiBold.ttf') },
  ];

  for (const fp of fontPaths) {
    if (existsSync(fp.path)) {
      const data = readFileSync(fp.path);
      fonts.push({
        name: fp.name,
        data: data.buffer as ArrayBuffer,
        weight: fp.weight,
        style: 'normal',
      });
    }
  }

  // If no local fonts found, fetch from Google Fonts
  if (fonts.length === 0) {
    console.log('📥 Fetching fonts from Google Fonts...');

    const googleFonts = [
      {
        name: 'Inter',
        weight: 400,
        url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf',
      },
      {
        name: 'Inter',
        weight: 700,
        url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hjQ.ttf',
      },
      {
        name: 'Inter',
        weight: 900,
        url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuBWYAZ9hjQ.ttf',
      },
    ];

    for (const gf of googleFonts) {
      try {
        const res = await fetch(gf.url);
        const data = await res.arrayBuffer();
        fonts.push({
          name: gf.name,
          data,
          weight: gf.weight,
          style: 'normal',
        });
      } catch (err) {
        console.warn(`⚠️  Could not fetch font ${gf.name} ${gf.weight}:`, err);
      }
    }
  }

  if (fonts.length === 0) {
    throw new Error('No fonts available. Place font files in ./fonts/ or ensure internet access.');
  }

  console.log(`✅ Loaded ${fonts.length} font variants`);
  return fonts;
}

// ═══════════════════════════════════════════════════════════════
// SVG → PNG Pipeline
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a satori virtual DOM tree to PNG buffer
 */
async function renderToPNG(
  template: any,
  fonts: Array<{ name: string; data: ArrayBuffer; weight: number; style: string }>
): Promise<Buffer> {
  // Step 1: JSX → SVG via satori
  const svg = await satori(template, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: fonts as any,
  });

  // Step 2: SVG → PNG via resvg
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: OG_WIDTH,
    },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Generate an OG image for a block page.
 * Returns PNG buffer (write to file or serve from API).
 */
export async function generateBlockOG(data: BlockOGData): Promise<Buffer> {
  const fonts = await loadFonts();
  const template = BlockOGTemplate(data);
  return renderToPNG(template, fonts);
}

/**
 * Generate an OG image for an agent page.
 * Returns PNG buffer.
 */
export async function generateAgentOG(data: AgentOGData): Promise<Buffer> {
  const fonts = await loadFonts();
  const template = AgentOGTemplate(data);
  return renderToPNG(template, fonts);
}

// ═══════════════════════════════════════════════════════════════
// CLI Entry Point
// ═══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const typeFlag = args.indexOf('--type');
  const type = typeFlag !== -1 ? args[typeFlag + 1] : 'demo';

  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('');
  console.log('🧬 Block Genomics — OG Image Generator');
  console.log('═══════════════════════════════════════');
  console.log('');

  const fonts = await loadFonts();

  if (type === 'block' || type === 'demo') {
    // Generate block OG image
    const heightFlag = args.indexOf('--height');
    const height = heightFlag !== -1 ? parseInt(args[heightFlag + 1]) : 500000;
    const formatted = height.toLocaleString('en-US');

    const blockData: BlockOGData = {
      height,
      formattedHeight: formatted,
      genome: 'a3f8c2e9d14b7f82a05ec391b86df420e75319acd60bf287e1c5a8f3d2b90e64',
      trustScore: 94,
      traits: [
        { name: 'is_halving', rarity: 'legendary' },
        { name: 'is_milestone', rarity: 'legendary' },
        { name: 'is_epic', rarity: 'rare' },
      ],
      verifiedBy: 'satoshi_spirit',
      isVerified: true,
    };

    console.log(`📦 Generating Block #${formatted} OG image...`);
    const template = BlockOGTemplate(blockData);
    const png = await renderToPNG(template, fonts);
    const outPath = join(OUTPUT_DIR, `block-${height}.png`);
    writeFileSync(outPath, png);
    console.log(`✅ Saved: ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
    console.log('');
  }

  if (type === 'agent' || type === 'demo') {
    // Generate agent OG image
    const idFlag = args.indexOf('--id');
    const agentName = idFlag !== -1 ? args[idFlag + 1] : 'satoshi_spirit';

    const agentData: AgentOGData = {
      name: agentName,
      initial: agentName[0].toUpperCase(),
      isHuman: true,
      tier: 1,
      blockHeight: 420000,
      formattedBlockHeight: '420,000',
      trustScore: 87,
      genome: 'a3f8c2e9d14b7f82a05ec391b86df420e75319acd60bf287e1c5a8f3d2b90e64',
    };

    console.log(`👤 Generating Agent @${agentName} OG image...`);
    const template = AgentOGTemplate(agentData);
    const png = await renderToPNG(template, fonts);
    const outPath = join(OUTPUT_DIR, `agent-${agentName}.png`);
    writeFileSync(outPath, png);
    console.log(`✅ Saved: ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
    console.log('');
  }

  // Generate an AI agent variant too in demo mode
  if (type === 'demo') {
    const aiData: AgentOGData = {
      name: 'block_watcher',
      initial: 'B',
      isHuman: false,
      tier: 2,
      blockHeight: 750000,
      formattedBlockHeight: '750,000',
      trustScore: 72,
      genome: 'f1e2d3c4b5a69788091a2b3c4d5e6f701234567890abcdef0fedcba987654321',
    };

    console.log(`🤖 Generating AI Agent @block_watcher OG image...`);
    const template = AgentOGTemplate(aiData);
    const png = await renderToPNG(template, fonts);
    const outPath = join(OUTPUT_DIR, 'agent-block_watcher.png');
    writeFileSync(outPath, png);
    console.log(`✅ Saved: ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
    console.log('');

    // Unclaimed block variant
    const unclaimedData: BlockOGData = {
      height: 840000,
      formattedHeight: '840,000',
      genome: 'deadbeef0123456789abcdef0fedcba9876543210000ffff1111222233334444',
      trustScore: 45,
      traits: [
        { name: 'is_halving', rarity: 'legendary' },
        { name: 'recent_block', rarity: 'common' },
      ],
      isVerified: false,
    };

    console.log(`📦 Generating Unclaimed Block #840,000 OG image...`);
    const templateU = BlockOGTemplate(unclaimedData);
    const pngU = await renderToPNG(templateU, fonts);
    const outPathU = join(OUTPUT_DIR, 'block-840000.png');
    writeFileSync(outPathU, pngU);
    console.log(`✅ Saved: ${outPathU} (${(pngU.length / 1024).toFixed(1)} KB)`);
  }

  console.log('');
  console.log('🎉 Done! OG images saved to ./output/');
  console.log('');
}

// Run if called directly
main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
