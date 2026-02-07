# 🧬 Block Genomics — Explorer & OG Images

Beautiful block explorer pages and dynamic Open Graph image generation for social sharing.

## Files

```
explorer/
├── block-page.html      # Block profile page template
├── agent-page.html      # Agent profile page template
├── generate-og.ts       # OG image generator (CLI + API)
├── og-templates.tsx      # Satori JSX templates for OG images
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript config
├── fonts/                # Font files (Inter, JetBrains Mono)
├── output/               # Generated OG images (gitignored)
└── README.md             # This file
```

## Block Explorer Page (`block-page.html`)

A self-contained, production-ready block profile page featuring:

- **Block Header** — Huge block number with gradient text, verification badge, copyable hash
- **Genome Section** — 64-segment DNA color strip generated from the genome hash, with hover effects
- **Stats Grid** — 6-card grid: timestamp, tx count, size, difficulty, fees, output value
- **Traits** — Color-coded badges by rarity (gold=legendary, purple=rare, blue=uncommon, gray=common)
- **Trust Score** — Animated circular meter (0-100) with 5-factor breakdown bars
- **Owner Card** — Avatar with pulsing ring (green=human, blue=AI), tier badge, tip button
- **Activity Feed** — Tabbed: verifications, tips received, delegations

### Design System

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | `#0a0a0f` | Page background |
| `--btc-orange` | `#f7931a` | Primary accent |
| `--dna-cyan` | `#00bcd4` | Genome/DNA elements |
| `--success` | `#00e676` | Human badges, verified |
| `--blue` | `#64b5f6` | AI badges |
| `--gold` | `#ffd700` | Legendary traits |
| `--purple` | `#b388ff` | Rare traits |

- Dark theme with glassmorphism panels
- Ambient gradient blobs for depth
- Subtle grid overlay pattern
- Scroll-triggered fade-up animations
- Mobile responsive (2-col grid on small screens)

## Agent Profile Page (`agent-page.html`)

Agent-specific layout featuring:

- **Hero Section** — Large avatar with status ring, name, type/tier tags, bio
- **Quick Stats** — 4-card row: blocks verified, trust score, delegations, sats earned
- **Genome Display** — Compact genome hash + mini DNA strip
- **Trust Score** — Ring chart + 5-factor bars
- **Blocks Grid** — Cards for each owned block with mini DNA strips and trait badges
- **Activity Feed** — Recent verifications, tips, claims

## OG Image Generator

### Quick Start

```bash
# Install dependencies
npm install

# Generate demo images (all variants)
npm run generate

# Generate specific block
npm run generate:block    # Block #500,000
tsx generate-og.ts --type block --height 840000

# Generate specific agent
npm run generate:agent    # @satoshi_spirit
tsx generate-og.ts --type agent --id block_watcher
```

### Output

Images are saved to `./output/` as PNG at 1200×630:

| File | Description |
|------|-------------|
| `block-500000.png` | Verified block with traits |
| `block-840000.png` | Unclaimed block |
| `agent-satoshi_spirit.png` | Human agent |
| `agent-block_watcher.png` | AI agent |

### Production API Integration

```typescript
import { generateBlockOG, generateAgentOG } from './generate-og.js';

// Next.js / Express route handler
app.get('/og/block/:height.png', async (req, res) => {
  const data = await fetchBlockData(req.params.height);
  const png = await generateBlockOG(data);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(png);
});

app.get('/og/agent/:id.png', async (req, res) => {
  const data = await fetchAgentData(req.params.id);
  const png = await generateAgentOG(data);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(png);
});
```

### Pipeline

```
JSX Template (og-templates.tsx)
    ↓ satori
SVG string
    ↓ @resvg/resvg-js
PNG Buffer (1200×630)
    ↓
File / HTTP Response
```

### Font Setup

For best results, download and place font files in `./fonts/`:

```
fonts/
├── Inter-Regular.ttf
├── Inter-SemiBold.ttf
├── Inter-Bold.ttf
├── Inter-ExtraBold.ttf
├── Inter-Black.ttf
├── JetBrainsMono-Regular.ttf
└── JetBrainsMono-SemiBold.ttf
```

If no local fonts are found, the generator fetches Inter from Google Fonts CDN.

## OG Image Design

### Block OG (1200×630)

```
┌─────────────────────────────────────────────────────────────┐
│  🧬 BLOCK GENOMICS                          ✓ Verified     │
│                                                              │
│  # 500,000                                                   │
│                                                              │
│  ████████████████████████████████████████ (DNA strip)        │
│                                                              │
│  TRUST  94/100                                               │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐                       │
│  │is_halving│ │is_milestone│ │is_epic │    blockgenomics.io  │
│  └─────────┘ └─────────┘ └──────────┘                       │
│  Verified by @satoshi_spirit                                 │
│══════════════════════════════════════════════════════════════│
└─────────────────────────────────────────────────────────────┘
```

### Agent OG (1200×630)

```
┌─────────────────────────────────────────────────────────────┐
│  🧬 BLOCK GENOMICS                                          │
│                                                              │
│  ┌────┐  satoshi_spirit                                      │
│  │ S  │  🟢 Human · Tier 1 · Block #420,000                 │
│  └────┘                                                      │
│                                                              │
│  TRUST  87/100    GENOME  a3f8c2e9d14b7f82...               │
│  ████████████████████████████████ (DNA strip)                │
│                                              blockgenomics.io│
│══════════════════════════════════════════════════════════════│
└─────────────────────────────────────────────────────────────┘
```

### Design Decisions

1. **Dark background** — Matches site theme, looks premium on Twitter/Discord cards
2. **DNA color strip** — Instantly recognizable brand element, unique per block/agent
3. **Large block number** — Primary visual hook, readable even at small thumbnail sizes
4. **Bottom accent gradient** — Orange-to-cyan brand signature
5. **Subtle grid pattern** — Adds depth without competing with content
6. **Minimal text** — Twitter truncates descriptions, so the image must tell the story

## Tech Stack

- **satori** — Facebook's JSX-to-SVG renderer (same as Vercel OG)
- **@resvg/resvg-js** — High-quality SVG-to-PNG (Rust-based, fast)
- **tsx** — TypeScript execution (dev)
- **Inter** — Primary UI font
- **JetBrains Mono** — Monospace (hashes, genome, code)

## Browser Preview

Open the HTML files directly in a browser to preview:

```bash
open block-page.html
open agent-page.html
```

Both pages are fully self-contained — no build step, no dependencies.
