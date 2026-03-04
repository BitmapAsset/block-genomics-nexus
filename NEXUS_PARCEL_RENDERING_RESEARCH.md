# 🏗️ Nexus Parcel Rendering — Enterprise Research Document
### Block Genomics | The Nexus
**Date:** March 3, 2026
**Author:** Pepe (AI Architect) for Gravity
**Classification:** Internal — Strategic Engineering

---

## Executive Summary

This document is a comprehensive analysis of the Bitmap rendering standard, how existing platforms visualize Bitcoin blocks as spatial land, and a detailed engineering plan for The Nexus to become **THE definitive implementation** of Bitmap rendering — surpassing every competitor in fidelity, interactivity, and functionality.

**Key finding:** There is NO single "official" rendering algorithm. Bitmap Theory provides the DATA MAPPING rules (block → district, transaction → parcel, input size → parcel area), but the VISUAL LAYOUT is left to platform interpretation. This is simultaneously a risk (inconsistency) and an opportunity (we can define the gold standard).

---

## 1. Bitmap Theory — The Canonical Standard

### Source: [Blockamoto Gitbook](https://gitbook.bitmap.land/bitmap-theory-whitepaper/theory)

#### Hierarchy of Spatial Resolution
| Level | Bitcoin Data | Bitmap Concept | Inscribing Format |
|-------|-------------|----------------|-------------------|
| **District** | Block | The full "city block" | `{block-height}.bitmap` |
| **Parcel** | Transaction | A plot of land within the district | `{tx-index}.{block-height}.bitmap` |
| **Chunk** | Transaction Input/Output | Sub-division of a parcel | Proposed, not finalized |
| **Bitoshi** | Individual Satoshi | Smallest addressable coordinate | Proposed, not finalized |

#### Core Rules (INVIOLABLE — these are consensus)
1. **1 Block = 1 District** — Each Bitcoin block maps to exactly one district
2. **1 Transaction = 1 Parcel** — Each transaction in the block maps to one parcel
3. **Parcel size ∝ Transaction input size** — Larger transactions (by input value/vbytes) produce larger parcels
4. **Parent-child relationship** — Uninscribed parcels belong to the District owner; inscribed parcels become independent
5. **First-is-first** — First valid inscription of `{height}.bitmap` owns the district

#### What The Standard DOES NOT Specify
- **Layout algorithm** (treemap, grid, random, organic — platform choice)
- **Color scheme** (platforms pick their own)
- **3D interpretation** (height, elevation, terrain — all platform-defined)
- **Gap/road rendering** (not in the spec at all)
- **Scale/proportions** (no canonical meters-per-satoshi ratio)

### ⚡ Key Insight
> The Bitmap standard is deliberately a **protocol, not a product**. It defines WHAT maps to WHAT, but leaves HOW to render it to platforms. This is by design — from the whitepaper: "Platforms may interpret the data in unique ways, but the data itself is shared across all platforms."

---

## 2. Platform Analysis — How Others Render Blocks

### 2.1 Bitfeed (bits.monospace.live)
- **Open source:** [github.com/bitfeed-project/bitfeed](https://github.com/bitfeed-project/bitfeed)
- **Layout:** Squarified treemap algorithm
- **Parcel sizing:** Based on transaction size (vbytes/weight)
- **Visual style:** Colored rectangles packed tightly, Mondrian-like
- **Used as reference by:** MetaCat analysis, Blockamoto himself (linked Bitfeed for block visualization)
- **Status:** This is the de facto "standard 2D view" that everyone references

### 2.2 bitmap.land (Official Bitmap Explorer)
- **Macro view:** Grid of blocks colored by claim status (claimed/unclaimed)
- **Block detail view:** Shows parcels within a block when clicked (Phase 2)
- **Layout:** Grid-based macro view; treemap-style parcel view
- **Key feature:** Halving era color coding (4 eras visible on map)
- **Limitation:** Primarily a claim/ownership explorer, not a metaverse renderer

### 2.3 3DBitmap.com
- **3D rendering:** Multiple visualization modes (Bitspace, Century Standard, Stilltura, Sphere)
- **Data source:** Fetches block transactions from blockchain APIs
- **Approach:** Artistic interpretation — blocks as 3D sculptures
- **Relevance:** Shows that 3D is viable but they're going for art, not city-building

### 2.4 Mscribe / The NATRIX
- **Most relevant competitor** — Actually building a Bitmap metaverse
- **Key innovation:** "BitmapOS" — translates 2D block render into 3D immersive space
- **Parcel editing:** In-world editor using MML code
- **META system:** Custom 3D creations deployable to owned parcels
- **LDE (Land Distribution Event):** 4,012 parcels for block 716472, sized 1-8 scale
- **⚠️ IMPORTANT:** They explicitly say they "respect the current interpretation of the 2D render" when translating to 3D

### 2.5 MetasoftStudios (Competitor flagged 2026-02-15)
- **Engine:** Unreal Engine — AAA-quality rendering
- **Approach:** High-fidelity game-engine rendering of bitmap districts
- **Status:** Better graphics but no protocol/verification/AI layer
- **Threat level:** Medium — great visuals but missing the intelligence layer we have

### 2.6 Ordinals Wallet / Magic Eden
- **Simple view:** List/grid of owned bitmaps with basic metadata
- **No spatial rendering** — just marketplace/collection views

---

## 3. The De Facto Rendering Standard — Squarified Treemap

### Why Treemap Is The Standard
Every platform that renders parcels visually uses some variant of the **squarified treemap algorithm**. This is because:

1. **Space-filling** — No wasted area; every pixel represents data
2. **Proportional** — Larger transactions naturally produce larger rectangles
3. **Deterministic** — Same input always produces same layout
4. **Familiar** — mempool.space uses treemaps for fee visualization; crypto users recognize the pattern

### Algorithm: Squarified Treemap
Based on: Bruls, Huizing, van Wijk — "Squarified Treemaps" (2000)

```
Input: List of values (transaction sizes), bounding rectangle
Output: List of rectangles with x, y, width, height

1. Sort transactions by size (descending)
2. For each transaction:
   a. Calculate area proportional to tx size / total block size
   b. Place in current row, computing aspect ratio
   c. If aspect ratio worsens, start new row
   d. Minimize aspect ratio → squares preferred over thin strips
3. Result: Tightly-packed rectangles, larger ones roughly square
```

### What Drives Parcel Size
From the canonical standard and common implementation:
- **Transaction input size** (total input value in satoshis, OR transaction weight/vbytes)
- Different platforms may use different metrics, but **vbytes (virtual bytes)** is the most common because it directly represents how much blockspace the transaction consumed

---

## 4. Gap Analysis — Our Current Rendering vs Standard

### What We Currently Have (BitmapThumbnail component)
- Mondrian-style layout using mempool.space data
- Orange on black color scheme
- Square with rounded corners
- Gap ratio scaling for high-tx blocks (0.5% for 900+ tx blocks)

### What Needs to Change

| Issue | Current State | Required State |
|-------|--------------|----------------|
| **Layout algorithm** | Custom Mondrian approximation | Proper squarified treemap matching Bitfeed/bitmap.land |
| **Parcel sizing metric** | Approximated | Transaction vbytes (weight units / 4) from real blockchain data |
| **Visual consistency** | Looks different from other platforms | Must be recognizable as the same block across platforms |
| **Interactivity** | Static thumbnail | Click parcels → select, remove, build |
| **3D translation** | No 3D parcel view | 2D treemap extruded to 3D with proper proportions |
| **Roads** | Not implemented | Gaps between parcels render as roads with lane markings |
| **Parcel removal** | Not possible | Core feature — remove parcels to clear land for building |
| **Building placement** | Not possible | Place buildings on cleared parcel footprints |
| **Scale** | Arbitrary | Consistent real-world-feel proportions |

---

## 5. Engineering Architecture — The Nexus Rendering Pipeline

### Phase 1: Canonical 2D Treemap (MUST DO FIRST)

#### Data Pipeline
```
Bitcoin Node / API → Block Data → Transaction List → Sorted by vbytes → Squarified Treemap Algorithm → Parcel Rectangles
```

#### Data Source Priority
1. **mempool.space API** — `GET /api/block/{hash}` + `/api/block/{hash}/txs`
   - Returns transaction list with size, weight, fee data
   - Rate limited but reliable
2. **Blockstream API** — Fallback, similar data
3. **Our own Bitcoin node** (future) — Most reliable, no rate limits

#### Parcel Rectangle Format
```typescript
interface Parcel {
  txIndex: number;           // Position in block (0 = coinbase)
  txid: string;              // Transaction hash
  vbytes: number;            // Virtual bytes (weight / 4)
  value: number;             // Total output value in sats
  inputCount: number;        // Number of inputs
  outputCount: number;       // Number of outputs
  fee: number;               // Fee in sats
  // Layout computed:
  x: number;                 // Treemap position
  y: number;
  width: number;
  height: number;
  // Nexus state:
  removed: boolean;          // Has owner cleared this parcel?
  building: Building | null; // What's built here?
  owner: string | null;      // Wallet address if inscribed as individual parcel
}
```

#### Rendering Rules
1. **Coinbase transaction (tx index 0)** = Special parcel (city hall / monument)
2. **Color** = Derived from transaction characteristics (fee rate → warm/cool gradient)
3. **Border** = Thin lines between parcels (1-2px at top view)
4. **Hover** = Highlight parcel, show tooltip with tx data
5. **Click** = Select parcel for actions (remove, build, inspect)

### Phase 2: Parcel Management System

#### Remove Parcels
```
Owner selects parcel(s) → Confirm removal → Parcel area becomes "cleared land"
Cleared land = flat terrain with dirt/grass texture
Roads auto-generate between remaining parcels and cleared areas
```

#### Build on Cleared Land
```
Owner selects cleared area → Opens building menu
Building types:
  - Residential (homes, apartments)
  - Commercial (shops, offices)
  - Cultural (museums, galleries)
  - Entertainment (gaming arenas, fun zones)
  - Infrastructure (roads, parks, utilities)
  - Custom (upload your own 3D model)
```

#### Central Park / Estates
```
Owner selects multiple adjacent parcels → "Combine into estate"
Combined area becomes one large buildable zone
Can place large-scale features (parks, stadiums, monuments)
```

### Phase 3: 2D → 3D Translation

#### Extrusion Rules
```
2D Parcel Rectangle → 3D Building Footprint
  Height = f(transaction value, fee, or owner-chosen)
  Default height = proportional to tx output value
  Cleared parcels = ground level (0 height)
  Roads = slightly below parcel level (-0.5 units)
```

#### Camera System
```
Top-down view ←→ Isometric ←→ First-person
  - Top-down: Treemap view (2D canonical)
  - Isometric: City overview (SimCity feel)
  - First-person: Walk through streets (metaverse)
```

### Phase 4: Roads & Infrastructure

#### Road Generation Algorithm
```
1. Identify gaps between parcel rectangles
2. If gap > threshold → render as road
3. Roads get:
   - Yellow center divider
   - White edge lines
   - Raised sidewalks on parcel edges
   - Amber street lights at intersections
4. Default: All empty space between parcels = roads
5. If no natural gaps (treemap is space-filling):
   - Insert minimum gap (2-3% of parcel width) between all parcels
   - These gaps become the road network
```

---

## 6. Competitive Differentiation — Why The Nexus Wins

| Feature | bitmap.land | Mscribe/NATRIX | MetasoftStudios | **The Nexus** |
|---------|------------|----------------|-----------------|---------------|
| 2D Canonical View | ✅ Basic | ✅ | ❌ | ✅ **Gold standard treemap** |
| 3D Rendering | ❌ | ✅ Basic | ✅ AAA | ✅ **Progressive (2D→3D)** |
| Parcel Removal | ❌ | ✅ | ❌ | ✅ **Core feature** |
| Building System | ❌ | ✅ MML code | ❌ | ✅ **Visual editor + code** |
| AI Integration | ❌ | ❌ | ❌ | ✅ **Guardian AI agents** |
| Verification | ❌ | ❌ | ❌ | ✅ **BIP-322 + genome** |
| Estate Combining | ❌ | ❌ | ❌ | ✅ **Central Park feature** |
| Roads Default | ❌ | ❌ | ❌ | ✅ **City-coming-to-life** |
| Block Coverage | 840K+ | Single blocks | Unknown | ✅ **All blocks** |

### Our Unique Moat
1. **AI Guardian agents living ON the land** — Nobody else has this
2. **Genome-verified ownership** — Cryptographic proof of who owns what
3. **Block Genomics verification protocol** — The trust layer
4. **Progressive rendering** — Same data, seamless 2D↔3D transition
5. **"Internet 2.0"** — Not just land, but a functional protocol layer

---

## 7. Implementation Roadmap

### Sprint 1: Foundation (Week 1-2)
- [ ] Implement proper squarified treemap algorithm
- [ ] Fetch real transaction data per block (vbytes, value, fee)
- [ ] Render canonical 2D treemap that matches Bitfeed/bitmap.land visual
- [ ] Test against first 840,000 blocks (pre-halving 4)
- [ ] Side-by-side comparison tool (our render vs Bitfeed)

### Sprint 2: Interactivity (Week 3-4)
- [ ] Parcel selection (click/tap)
- [ ] Parcel info panel (tx data, ownership, status)
- [ ] Parcel removal flow (with confirmation)
- [ ] Road auto-generation in cleared areas
- [ ] Estate combining (multi-select → merge)

### Sprint 3: Building System (Week 5-6)
- [ ] Building placement on cleared parcels
- [ ] Starter building library (10-20 types)
- [ ] Building editor (resize, rotate, customize)
- [ ] Save/load building state per block

### Sprint 4: 3D Translation (Week 7-8)
- [ ] Three.js / React Three Fiber extrusion
- [ ] Camera system (top → iso → first-person)
- [ ] Road rendering in 3D (lanes, lights, sidewalks)
- [ ] Building models in 3D space
- [ ] Walk-through capability

### Sprint 5: Polish & Scale (Week 9-10)
- [ ] Performance optimization for high-tx blocks (3000+ tx)
- [ ] Loading states and progressive rendering
- [ ] Mobile responsiveness
- [ ] Cross-block navigation (walk from one district to adjacent)
- [ ] Guardian AI placement on parcels

---

## 8. Technical References

### APIs
- mempool.space: `https://mempool.space/api/block/{hash}/txs`
- Blockstream: `https://blockstream.info/api/block/{hash}/txs`
- Our proxy: `https://blockgenomics.io/api/v1/block/{height}`

### Libraries
- **Treemap algorithm:** d3-hierarchy (`d3.treemap()`) or custom squarified implementation
- **3D rendering:** Three.js + React Three Fiber
- **2D canvas:** HTML5 Canvas or SVG for thumbnails, WebGL for full view
- **Data caching:** Redis/PostgreSQL for pre-computed parcel layouts

### Academic Papers
- Bruls, Huizing, van Wijk — "Squarified Treemaps" (2000) — The treemap algorithm
- Shneiderman — "Tree Visualization with Tree-Maps" (1992) — Original treemap concept

### Bitmap Standard Sources
- Blockamoto Gitbook: https://gitbook.bitmap.land/
- Bitmap Theory Whitepaper: https://gitbook.bitmap.land/bitmap-theory-whitepaper/theory
- Blockamoto GitHub: https://github.com/Blockamoto/gitbook
- TRIP Methodology: https://gitbook.bitmap.land/bitmap-theory-whitepaper/methodology

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Bitmap standard changes | Low | High | Monitor Blockamoto gitbook, participate in community |
| Performance with high-tx blocks | Medium | Medium | Pre-compute layouts, level-of-detail rendering |
| Inconsistent rendering across platforms | Medium | High | Use same algorithm as Bitfeed (squarified treemap) |
| MetasoftStudios ships first | Low | Medium | They lack AI/verification — our moat is different |
| Mscribe gains traction | Medium | Medium | Our tech stack is stronger, move fast |
| API rate limits | High | Low | Cache aggressively, eventually run our own node |

---

## 10. Conclusion

The Nexus has the opportunity to become the **definitive Bitmap rendering platform** by:

1. **Nailing the canonical 2D view** — Match the Bitfeed/treemap standard so blocks look the same across platforms
2. **Adding the layer nobody else has** — Parcel removal, building, roads, estates
3. **Translating to 3D properly** — Same data, seamless transition, real metaverse feel
4. **Integrating our unique tech** — AI Guardians, genome verification, Block Genomics protocol
5. **Moving with trillion-dollar execution** — Sprint-based delivery, enterprise testing, pixel-perfect quality

We're not just rendering blocks. We're building the **operating system for the Bitcoin metaverse**.

---

*Prepared by Pepe 🐸 | Block Genomics Engineering Division*
*"Some inventions are more like discoveries" — Bitoshi Blockamoto*
