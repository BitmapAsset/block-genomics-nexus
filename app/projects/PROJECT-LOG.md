# 📋 Block Genomics — Master Project Log

*Comprehensive record of all progress, decisions, and milestones. Updated continuously.*

**Last Updated:** 2026-02-04, 2:30 AM PST

---

## Project Overview

| Field | Value |
|-------|-------|
| **Project** | Block Genomics |
| **Tagline** | The Trust Layer for AI Agents on Bitcoin |
| **Vision** | Digital Times Square — Bitcoin blocks as living digital real estate |
| **Founded** | February 2, 2026 |
| **Team** | Gravity (Founder/Visionary) + Pepe 🐸 (AI Builder) |
| **Status** | Active — Phase 2 Complete, Product Vision Defined |

---

## Timeline & Milestones

### Day 1 — February 2, 2026 (Foundation Day)

**Infrastructure:**
- [x] Pepe AI assistant born, named by Gravity
- [x] Identity system created (IDENTITY.md, SOUL.md, USER.md)
- [x] Memory system established (MEMORY.md, daily logs)
- [x] Telegram paired (Bot: @Pepethe1Bot, Chat ID: 5884742938)
- [x] TTS configured (Edge TTS, male voice)
- [x] Backup system: `scripts/backup-soul.sh` running every 30min via cron
- [x] Security protocols established (no sharing secrets, no deletion without confirmation)

**Dev Toolkit:**
- [x] System audit: Mac mini, Apple Silicon arm64, macOS 26.2, 228GB disk
- [x] Existing: Node.js 25, Python 3.14, Go 1.25, Swift 6.2, Java, Git, VS Code, Cursor
- [x] Installed: Rust 1.93, PostgreSQL 17 (running), Redis 8 (running)
- [x] Installed: Deno 2.6.8, Bun 1.3.8, Yarn 1.22
- [x] Installed: ngrok 3.35, Vercel 50.9, Prisma 7.3, Supabase 2.75, Playwright

**Block Genomics Conception:**
- [x] NAT (Non-Arbitrary Token) concept analysis from Gravity's original idea
- [x] AI Agent verification analysis — how Bitmap can provide agent identity
- [x] Scalability model designed: Tier 1 (~1M blocks), Tier 2 (~2.3B txs), Tier 3 (∞ delegations)
- [x] Name "Block Genomics" chosen — Gravity loved it
- [x] Project dashboard created at localhost:8099

### Day 2 — February 3, 2026 (Build Day)

**Phase 1 — Foundation (COMPLETE ✅):**
- [x] Block Explorer PoC (`/projects/block-genomics/index.html`)
  - Real block data from mempool.space API
  - Genome fingerprint generation (SHA-256 from block NAT data)
  - DNA strand visualization (color-coded by script type)
  - Fee pressure heatmap
  - Value flow constellation
  - Genomic analysis charts
- [x] Verification Flow PoC (`/projects/block-genomics/verify/index.html`)
  - 4-page app: Home, Verify Agent, Badges, Register
  - Trust score algorithm (age + richness + difficulty + ownership + history, max 100)
  - Three-tier badge system (Gold/Silver/Bronze)
  - Agent profile card with genome display
  - Embeddable badge code generator
- [x] Technical specs written:
  - `docs/WALLET-INTEGRATION.md`
  - `docs/VERIFICATION-PROTOCOL.md`
  - `docs/ROADMAP.md` (7-phase, ~80-100 tasks)

**Phase 2 — Wallet Integration (COMPLETE ✅):**
- [x] Research completed: Unisat API, Xverse/Sats Connect, Hiro Ordinals API
- [x] Core application logic (`verify/app.js` — 550+ lines, 20,676 bytes)
  - Wallet detection: Unisat, Xverse, Leather auto-detection
  - Connection flows for each wallet provider
  - Inscription fetching with pagination (Unisat native + Hiro API fallback)
  - Bitmap detection (regex matching `{height}.bitmap` format)
  - Challenge-response system with nonce + timestamp + BIP-322 signing
  - Enhanced genome generation (block + transaction fingerprints)
  - Trust score: 5-factor algorithm (Age 25, Richness 25, Security 20, Ownership 20, History 10)
  - Block analysis (script types, notable characteristics)
  - Agent registration with local storage
  - Badge SVG generation + embed code
  - Delegation protocol (Tier 2 & 3)
  - Demo mode for users without wallets
- [x] Full UI built: verify/index.html v0.2
  - Wallet connect modal with provider auto-detection
  - Connected wallet banner with Bitmap list
  - Full registration flow: Connect → Select Bitmap → Details → Sign → Verified
  - Rich agent profile cards with trust meter, genome, DNA strand, badges

**Chrome Extension:**
- [x] OpenClaw browser extension installed (`~/.openclaw/browser/chrome-extension`)
- [x] Steps provided to Gravity for loading unpacked in Chrome

**TTS Voice:**
- [x] Upgraded from en-US-GuyNeural (robotic) to en-US-AndrewMultilingualNeural (natural)
- [x] Rate set to +15% for natural pacing
- [x] Output format: ogg-48khz-16bit-mono-opus for Telegram voice bubbles with speed controls

### Day 2 (Evening) — February 3-4, 2026 (Vision Day)

**Product Vision — "Digital Times Square" (COMPLETE ✅):**
- [x] Gravity shared grand vision: Bitcoin blocks as living digital real estate
- [x] Comprehensive research conducted:
  - Bitmap Community trait taxonomy: 30+ on-chain traits, 50+ blocktributes
  - Competitive landscape: bitmap.community, bitmap.game, Magic Eden, BestInSlot
  - Key finding: NO ONE has built verification, social, or commerce on Bitmap
- [x] Product Vision document created (`docs/PRODUCT-VISION.md` — 35K bytes)
  - Five-layer architecture: Verification → Identity → Social → Commerce → Experience
  - Interactive Bitmap Map with 4 zoom levels (Cosmic → District → Street → Interior)
  - Block Dashboard with drag-and-drop widget system for owners
  - Chat system: Universal + Block + Era + Trait + Agent channels
  - 10+ revenue engines for block owners
  - 4 viral growth loops + features (Block of the Day, treasure hunts, etc.)
  - 4 complete user journeys
  - Technical architecture (Next.js + Canvas/WebGL + WebSocket + PostgreSQL + Redis + Lightning)
  - Revenue projections: $2.5M (Y1) → $100M (Y3) → $1B (Y5)
  - 6-phase rollout plan (~20 weeks)
  - 12 strategic questions for Gravity's input

---

## Key Technical Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Primary wallet | Unisat | Most popular Ordinals wallet, best SDK |
| Signing protocol | BIP-322 | Taproot-compatible, modern standard |
| Block data API | mempool.space | Free, no key needed, comprehensive |
| Ordinals indexer | Hiro API | Free, no key required (unlike BestInSlot) |
| Trust score model | 5-factor, max 100 | Age(25) + Richness(25) + Security(20) + Ownership(20) + History(10) |
| Tier system | 3-tier with multipliers | T1=1.0x, T2=0.8x, T3=0.6x |
| PoC storage | localStorage | PostgreSQL for production |
| Dashboard approach | Custom HTML | Full control, later: Next.js |
| Bitcoin wallet | Light + Programmable | No full node (~600GB too large) |
| Reminder delivery | Telegram only | System events don't reach Gravity |
| TTS voice | Andrew Multilingual | Most natural Edge TTS male voice |

---

## Key Architecture Decisions

| Component | Technology | Status |
|-----------|-----------|--------|
| Frontend (PoC) | Vanilla HTML/CSS/JS | ✅ Built |
| Frontend (Production) | Next.js 16 + React | 📐 Planned |
| Map rendering | Canvas/WebGL (PixiJS or custom) | 📐 Planned |
| Real-time chat | WebSocket (Socket.io) | 📐 Planned |
| Backend API | Node.js / Next.js API routes | 📐 Planned |
| Database | PostgreSQL 17 | ✅ Running (schema TBD) |
| Cache | Redis 8 | ✅ Running |
| Payments | Lightning Network (LNbits/BTCPay) | 📐 Planned |
| Deployment | Vercel + Railway/Fly.io | 📐 Planned |
| Domain | TBD (blockgenomics.io?) | ❓ Needs decision |

---

## File Inventory

### Core Project Files
| File | Description | Size |
|------|-------------|------|
| `projects/block-genomics/index.html` | Block Explorer PoC | ~15KB |
| `projects/block-genomics/verify/index.html` | Verification App v0.2 | ~25KB |
| `projects/block-genomics/verify/app.js` | Core application logic | 20,676 bytes |
| `projects/block-genomics/README.md` | Project readme | ~3KB |

### Documentation
| File | Description | Size |
|------|-------------|------|
| `projects/block-genomics/docs/PRODUCT-VISION.md` | Full product architecture | 35,281 bytes |
| `projects/block-genomics/docs/ROADMAP.md` | 7-phase roadmap | ~8KB |
| `projects/block-genomics/docs/VERIFICATION-PROTOCOL.md` | Protocol specs | ~5KB |
| `projects/block-genomics/docs/WALLET-INTEGRATION.md` | Wallet integration specs | ~5KB |

### Research & Analysis
| File | Description |
|------|-------------|
| `projects/bitmap-nat/README.md` | NAT concept analysis |
| `projects/bitmap-nat/ai-agent-verification-analysis.md` | AI agent verification deep-dive |
| `projects/bitmap-nat/scalability-model.md` | 3-tier supply/demand model |

### Logs & Tracking
| File | Description |
|------|-------------|
| `projects/block-genomics/logs/2026-02-03.md` | Dev log day 2 |
| `projects/dashboard-data.json` | Dashboard state data |
| `projects/PROJECT-LOG.md` | THIS FILE — master log |
| `memory/2026-02-02.md` | Daily memory day 1 |
| `memory/2026-02-03.md` | Daily memory day 2 |

---

## Infrastructure Status

| Service | Status | Details |
|---------|--------|---------|
| PostgreSQL 17 | ✅ Running | `brew services`, port 5432 |
| Redis 8 | ✅ Running | `brew services`, port 6379 |
| HTTP Server | ✅ Running | Python, port 8099, serves project files |
| Backup Cron | ✅ Active | Every 30min, cron ID `c37f8ea2` |
| Telegram Bot | ✅ Active | @Pepethe1Bot, chat ID 5884742938 |
| OpenClaw | ✅ Running | v2026.1.30, Model: Claude Opus 4.5 |

---

## Pending Items

### Blocked (Need Gravity)
- [ ] Docker Desktop install (requires sudo)
- [ ] Brave Search API key (brave.com/search/api)
- [ ] X/Twitter account creation (human verification required)
- [ ] Domain registration decision
- [ ] 12 strategic questions from Product Vision doc

### Next Up
- [ ] Gravity reviews Product Vision & answers 12 questions
- [ ] Phase 3: PostgreSQL schema + API server
- [ ] Phase B: Interactive Bitmap Map prototype
- [ ] Phase C: Chat system prototype

---

## Revenue Model Summary

### For Block Owners (Bitmap Holders)
- Advertising (CPM/CPC billboards on blocks)
- Storefronts (digital goods, services)
- AI Agent services (pay-per-query)
- Event hosting (AMAs, auctions, parties)
- Lightning tips
- Tier 2/3 verification delegation fees
- Data licensing
- Rental/subleasing of block space
- Sponsorships from brands

### For Block Genomics Platform
- 10% platform fee on all transactions
- Premium features for block owners
- Enterprise verification API
- Analytics dashboards
- Featured placement/promotion

### Projections
| Year | Ecosystem Revenue | Platform Revenue (10%) |
|------|-------------------|----------------------|
| Year 1 | $2.5M | $250K |
| Year 3 | $100M | $10M |
| Year 5 | $1B | $100M |

---

*This document is the single source of truth for all project progress. Updated with every significant change.*

## 🛒 AI Deals Hub (Amazon Affiliate Site)
- **Status:** Planning
- **Goal:** Passive income via Amazon Associates affiliate links
- **Concept:** Beautiful, AI-curated product showcase site — personalized deals, urgency triggers, high-ticket focus
- **Stack:** Next.js + Vercel (zero hosting cost), Amazon Product Advertising API, AI curation
- **Revenue model:** Amazon Associates commissions (1-10% per category)
- **Target:** $500/day (requires ~25K-50K daily visitors at average commission)
- **Key insight:** Site is easy — TRAFFIC is the bottleneck. Social distribution critical.
- **Priority niches:** Tech, electronics, home appliances (high-ticket = fewer sales needed)
- **Started:** 2026-02-23
