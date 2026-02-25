# The Nexus — Comprehensive Research Report
### A Decentralized Internet Gateway on Bitcoin's Bitmap Protocol
**Prepared by Pepe 🐸 | February 9, 2026**

---

## Table of Contents
1. [Bitmap Protocol Deep Dive](#1-bitmap-protocol-deep-dive)
2. [Existing Bitmap Explorers & Maps](#2-existing-bitmap-explorers--maps)
3. [Competitors & Similar Projects](#3-competitors--similar-projects)
4. [Technical Architecture Research](#4-technical-architecture-research)
5. [Design Inspiration](#5-design-inspiration)
6. [Recommended Architecture](#6-recommended-architecture-for-the-nexus)
7. [Design Direction](#7-design-direction-recommendations)
8. [Proposed MVP Feature Set](#8-proposed-mvp-feature-set)

---

## 1. Bitmap Protocol Deep Dive

### What is Bitmap?

Bitmap is a **metaprotocol** built on top of Bitcoin's Ordinals protocol. It maps each Bitcoin block to a unique, ownable digital "land parcel." The core idea: every Bitcoin block ever mined (and every block that will ever be mined) represents a discrete unit of digital territory in a Bitcoin-native metaverse.

**Key concept:** Bitmap treats Bitcoin's blockchain itself as the map — each block is a "district" and each transaction within a block is a "parcel" within that district.

### How Bitmap Ownership Works

**Inscription Mechanism:**
1. A user inscribes a satoshi with the text `{block_number}.bitmap` (e.g., `840000.bitmap`)
2. This inscription is made using the standard Ordinals inscription process (commit/reveal two-phase transaction)
3. The inscription follows the Ordinals envelope format: `OP_FALSE OP_IF OP_PUSH "ord" ... OP_ENDIF`
4. Content type: `text/plain` with the bitmap claim string
5. **First-is-first rule:** The first valid inscription claiming a block number owns that bitmap. Duplicate claims are invalid.
6. Ownership is tracked via the satoshi the inscription was made on — transferring that sat transfers ownership

**The inscription data is minimal — just the block number + ".bitmap" suffix.** This makes it extremely cheap to claim (just the inscription fee, no large data payload).

**Metaprotocol Tag:** Bitmap uses Ordinals' metaprotocol field (tag 7) to identify itself, allowing indexers to filter bitmap inscriptions from the millions of other ordinals.

### Where Ownership Data is Publicly Available

**APIs & Indexers:**
- **Ordinals.com** — The canonical Ordinals explorer (https://ordinals.com). Can search inscriptions by content.
- **Best in Slot (BIS)** — Major Ordinals indexer with a dedicated Bitmaps collection page (https://bestinslot.xyz/ordinals/collections/bitmap). Provides API access for developers.
- **GeniiData** — Ordinals analytics platform with Bitmap collection tracking (https://geniidata.com/ordinals/collection/bitmap)
- **Magic Eden** — Primary marketplace for Bitmap trading (https://magiceden.io/ordinals/marketplace/bitmap). Has API for collection data.
- **UniSat** — Wallet and marketplace with Bitmap support (https://unisat.io)
- **Hiro/Ordhook** — Hiro's Ordhook is a re-org aware indexing engine for Ordinals that can be self-hosted to index Bitmap inscriptions
- **OrdAPI / ord indexer** — The official `ord` binary (https://github.com/ordinals/ord) runs a full indexer that can be queried locally

**Key API endpoints (Best in Slot example):**
```
GET /api/v1/collection/bitmap/inscriptions
GET /api/v1/inscription/{inscription_id}
```

**Self-hosted indexing:** Running your own `ord` server gives you complete, trustless access to all Bitmap ownership data. This is the recommended approach for The Nexus.

### Current Bitmap Ecosystem Stats

- **Total possible Bitmaps:** Equal to the total number of Bitcoin blocks ever mined (~880,000+ as of Feb 2026)
- **Claimed Bitmaps:** The vast majority of blocks up to the current height have been claimed. Bitmap became one of the largest Ordinals collections by inscription count.
- **Launch date:** Bitmap Theory was introduced in June 2023 by pseudonymous creator **Bitoshi Blockamoto**
- **Peak activity:** Late 2023 through mid-2024, with hundreds of thousands of claims
- **Trading volume:** Bitmaps have traded on Magic Eden, UniSat, and OKX marketplace. Floor prices have fluctuated significantly with the broader Ordinals market.
- **New blocks:** Every ~10 minutes a new Bitcoin block is mined, creating a new potential Bitmap to claim

### Key Players and Communities

- **Bitoshi Blockamoto** (@blockamoto) — Pseudonymous creator of Bitmap Theory
- **Bitmap.community** — Primary community hub, provides rarity tools and trait analysis for Bitmaps
- **Bitmap.land** — Another community project exploring Bitmap visualization
- **Twitter/X community** — Active under #bitmap hashtag, with builders and collectors
- **Discord servers** — Multiple community Discords for Bitmap holders and builders
- **Blockamoto Labs** (https://blockamoto.com) — Development portfolio related to Bitmap ecosystem

### Bitmap Theory: Block-as-Land Mapping

The theory maps block data to land properties:
- **Block number** → Location/address in the metaverse
- **Number of transactions** → "Population" or density of the parcel
- **Block size** → Physical size of the land
- **Block fees** → Economic activity/value
- **Miner** → Original "developer" of the land
- **Timestamp** → Age/vintage of the territory
- **Halving epoch** → Era/age classification
- **Difficulty adjustment** → Geological era
- **Special blocks** (genesis, halving blocks, etc.) → Rare/legendary properties

---

## 2. Existing Bitmap Explorers & Maps

### bitmap.community

**What it does:**
- Rarity ranking engine for Bitmaps based on block traits
- Trait analysis: shows block properties (size, tx count, fees, miner, epoch, etc.)
- Community-driven documentation via GitBook (https://docs.bitmap.community)
- Helps answer "What makes one Bitmap more valuable than another?"

**UI Description:**
- Clean, data-centric interface focused on rarity scores
- Each Bitmap displayed with its block traits and calculated rarity
- Search by block number to see trait breakdown
- Sorting and filtering by various rarity metrics

**Limitations:**
- Primarily a rarity/analytics tool, NOT a visual map/metaverse
- No real-time interaction, no spatial visualization
- No resource linking or content hosting
- Static data presentation

### bitmap.land

- Simpler community project
- Minimal content (appears to be early stage or reduced activity)
- Focused on Bitmap as digital land concept

### Other Visualization Tools

**Bitfeed.live:**
- Real-time Bitcoin block/transaction visualizer
- Not Bitmap-specific but shows how block data can be visualized beautifully
- Animated, real-time feed of blocks being mined

**Ordinals explorers (ordinals.com, ord.io):**
- Can look up specific Bitmap inscriptions
- Show inscription content, ownership history, transfer history
- No spatial/map visualization

### Gap Analysis: What's Missing

**Nobody has built:**
- A spatial/3D map of all Bitmaps
- Real-time visitor interaction on Bitmap land
- Resource linking (connecting external content to Bitmap blocks)
- A true metaverse experience on Bitmap

**This is The Nexus's massive opportunity.** The ecosystem has ownership infrastructure but NO experience layer.

---

## 3. Competitors & Similar Projects

### Direct Bitmap Competitors

**Very few projects are building metaverse/worlds specifically on Bitmap.** The space is remarkably underdeveloped relative to the number of Bitmap holders. Most activity has been speculative (trading) rather than utility-building.

Some experimental projects have appeared:
- Small indie teams building 2D/3D Bitmap viewers
- Hackathon projects attempting Bitmap visualization
- None have achieved significant traction or feature completeness

### Comparable Metaverse Projects (Other Chains)

| Project | Chain | Model | Strengths | Weaknesses |
|---------|-------|-------|-----------|------------|
| **Decentraland** | Ethereum | Fixed grid of LAND parcels | Mature, browser-based 3D world, DAO governance | Low daily active users (~500-1000), heavy client, corporate feel |
| **The Sandbox** | Ethereum | Voxel-based LAND parcels | Strong brand partnerships, creator tools | Walled garden, centralized, game-focused |
| **Otherside** (Yuga Labs) | Ethereum | "Otherdeeds" NFT land | Massive funding, Bored Apes IP | Unclear vision, slow development |
| **Worldwide Webb** | Ethereum | Pixel-art MMORPG | Fun gameplay, NFT integration | Niche audience, not a platform |
| **Somnium Space** | Ethereum | VR-focused metaverse | Immersive VR, persistent world | Small user base, VR requirement limits adoption |
| **Voxels (Cryptovoxels)** | Ethereum | Voxel-based parcels | Simple, accessible, browser-based | Low visual fidelity, limited interactivity |

**Key insight:** All major metaverse projects are on Ethereum. NONE are on Bitcoin. The Nexus would be the first serious Bitcoin-native metaverse platform.

### Differentiators for The Nexus

1. **Bitcoin-native** — Leverages the most secure, decentralized blockchain
2. **Pre-existing land system** — ~880K+ blocks already claimed, no need to sell land
3. **Sovereign blocks** — Owners bring their OWN server power (truly decentralized)
4. **Resource linking** — Not just empty land; blocks become gateways to real digital resources
5. **Scale** — Grows with Bitcoin itself (new block every 10 min forever)
6. **Base protocol philosophy** — We're the internet layer, not a walled garden

### Real-time Interaction Layers on Bitcoin

- **Lightning Network** — Provides payment channels; could enable micropayments within The Nexus
- **Stacks** — Smart contract layer for Bitcoin; could handle complex on-chain logic
- **RGB Protocol** — Client-side validated smart contracts on Bitcoin
- **Nostr** — Decentralized social protocol that could complement Bitmap for identity/messaging

---

## 4. Technical Architecture Research

### 4.1 Fetching Bitmap Ownership Data

**Option A: Self-hosted ord indexer (RECOMMENDED)**
```
# Run full ord indexer
ord --bitcoin-rpc-url=<node> server --http-port 8080
```
- Requires Bitcoin Core full node + ord binary
- Indexes all inscriptions including Bitmaps
- Full API access, no rate limits, no third-party dependency
- Storage: ~500GB+ for full index

**Option B: Third-party APIs**
- Best in Slot API: `https://api.bestinslot.xyz/v3/`
- Hiro Ordinals API: `https://api.hiro.so/ordinals/v1/`
- OrdAPI: Various community-run APIs
- Risk: rate limits, downtime, dependency

**Option C: Hybrid approach (RECOMMENDED for MVP)**
- Use third-party APIs for initial data load
- Run own indexer for real-time updates and trustless verification
- Cache ownership data in a fast database (PostgreSQL + Redis)

**Data structure needed:**
```json
{
  "block_number": 840000,
  "bitmap_inscription_id": "abc123...i0",
  "owner_address": "bc1p...",
  "block_data": {
    "timestamp": 1713571767,
    "tx_count": 3050,
    "size": 1548576,
    "weight": 3993412,
    "fees_total": 37500000,
    "miner": "Foundry USA",
    "difficulty": 86388558925171.02,
    "halving_epoch": 4,
    "merkle_root": "...",
    "nonce": 3932395645
  },
  "linked_resources": [],  // The Nexus's value-add
  "owner_server": null      // The Nexus's value-add
}
```

### 4.2 Real-time Communication (Visitor Interaction)

**WebSocket (for state sync & chat):**
- Proven at scale (Discord uses WebSocket for millions of concurrent users)
- Ideal for: chat, presence, cursor/avatar position updates, notifications
- Libraries: Socket.IO, ws (Node.js), or native WebSocket
- Can handle ~65K concurrent connections per server (with proper tuning)

**WebRTC (for peer-to-peer interaction):**
- Direct browser-to-browser audio/video/data
- Lower latency than server-relayed
- Ideal for: voice chat, direct file sharing, proximity-based audio
- Requires signaling server (WebSocket) + STUN/TURN servers
- Libraries: PeerJS, simple-peer

**Recommended hybrid approach:**
```
┌─────────────┐     WebSocket      ┌──────────────┐
│   Browser    │◄──────────────────►│  Nexus Hub   │
│  (Visitor)   │                    │   Server     │
└──────┬──────┘                    └──────┬───────┘
       │                                  │
       │  WebRTC (P2P)                    │ Federation
       │  (voice, video, data)            │ Protocol
       ▼                                  ▼
┌─────────────┐                    ┌──────────────┐
│   Browser    │                    │ Block Owner  │
│  (Visitor)   │                    │   Server     │
└─────────────┘                    └──────────────┘
```

**Scaling strategy:**
- Spatial partitioning: divide the map into "zones" (groups of blocks)
- Each zone handled by a dedicated WebSocket server
- Visitors only receive updates from nearby blocks (interest management)
- Use Redis Pub/Sub for cross-zone communication

### 4.3 Resource Linking System

**How block owners link resources to their Bitmap:**

**Option A: On-chain metadata inscriptions**
- Inscribe a child inscription (using Ordinals parent/child) with metadata JSON
- Contains URLs, server addresses, content descriptions
- Pros: Fully on-chain, permanent, verifiable
- Cons: Costs sats for every update, slow to change

**Option B: DNS-like resolution system (RECOMMENDED)**
```
┌──────────────┐    ┌───────────────┐    ┌──────────────┐
│  Nexus Client │───►│  Nexus DNS    │───►│ Block Owner  │
│  (Browser)    │    │  Registry     │    │   Server     │
└──────────────┘    └───────────────┘    └──────────────┘
```
- Block owners register their server endpoint with The Nexus registry
- Authentication: Sign a message with the Bitcoin key that owns the Bitmap inscription
- Registry stores: `block_number → { server_url, capabilities, metadata }`
- Owners can update their linked resources instantly (off-chain registry, on-chain auth)
- Similar to how DNS maps domain names to IP addresses

**Option C: Hybrid (RECOMMENDED for production)**
- On-chain: Store a "root hash" or "manifest pointer" as a child inscription
- Off-chain: Full manifest with resource list, server URLs, metadata
- The on-chain hash verifies the off-chain data hasn't been tampered with
- Owners update off-chain freely, re-inscribe hash only for major changes

**Resource types block owners could link:**
- Websites / web apps
- Game servers
- API endpoints
- Media galleries
- Chat rooms
- Storefronts
- Live streams
- 3D environments
- Any HTTP/WebSocket/WebRTC endpoint

### 4.4 Server Federation Model

**Concept:** Block owners run their own servers, The Nexus provides the discovery layer.

```
                    ┌─────────────────────┐
                    │   The Nexus Gateway  │
                    │   (Discovery Layer)  │
                    │                      │
                    │  • Block registry    │
                    │  • Visitor routing   │
                    │  • Presence system   │
                    │  • Map rendering     │
                    └──────┬──────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
      ┌───────▼──┐  ┌──────▼───┐  ┌────▼──────┐
      │ Owner    │  │ Owner    │  │ Owner     │
      │ Server A │  │ Server B │  │ Server C  │
      │ (Block   │  │ (Block   │  │ (Block    │
      │  840000) │  │  1)      │  │  500000)  │
      └──────────┘  └──────────┘  └───────────┘
```

**Federation protocol spec (proposed):**
```json
{
  "nexus_protocol": "1.0",
  "block_number": 840000,
  "server": {
    "url": "wss://my-block.example.com",
    "capabilities": ["website", "game", "chat", "api"],
    "max_visitors": 100,
    "status": "online"
  },
  "manifest": {
    "name": "The Halving Block",
    "description": "Welcome to Block 840000 — the 4th halving",
    "thumbnail": "https://...",
    "entry_point": "/index.html",
    "resources": [...]
  },
  "auth": {
    "signature": "...",  // Signed by Bitmap owner's key
    "pubkey": "..."
  }
}
```

**Owner server SDK (provide):**
- Simple Node.js/Python/Rust SDK
- `nexus-server init` → scaffolds a block server
- Handles Nexus protocol handshake, visitor routing, resource serving
- Think "Minecraft server" but for a single block in the metaverse

### 4.5 3D/WebGL Map Rendering at Scale

**The challenge:** Rendering 880,000+ blocks visually in a browser.

**Level-of-Detail (LOD) approach:**
```
Zoom Level 1 (Galaxy view):  All blocks as colored dots/pixels
Zoom Level 2 (Region view):  Blocks as small cubes with basic color
Zoom Level 3 (District view): Blocks as detailed structures  
Zoom Level 4 (Block view):    Full 3D environment of a single block
```

**Technology stack:**
- **Three.js** — Most mature WebGL library, massive community
- **InstancedMesh** — Render hundreds of thousands of identical geometries efficiently
- **GPU instancing** — Send block data as instance attributes (position, color, scale)
- **Frustum culling** — Only render blocks in the camera's view
- **Octree spatial indexing** — Fast spatial queries for click/hover detection

**Performance targets:**
- 60fps with 100K+ visible blocks (achievable with instancing)
- Progressive loading (load nearby blocks first, distant blocks as LOD 1)
- Web Workers for data processing off the main thread
- Texture atlases for block thumbnails

**Alternative rendering approaches:**
- **Canvas 2D** — For a simpler "top-down map" view (very fast, millions of blocks)
- **Mapbox GL / Deck.gl** — Treat blocks as geographic points, use map rendering (excellent at scale)
- **PixiJS** — High-performance 2D rendering, good for a "satellite view"

**Recommended: Start with 2D map (Deck.gl or Canvas), add 3D view as enhancement.**

**Layout algorithms for block positioning:**
- **Hilbert curve** — Space-filling curve that preserves locality (blocks near in number are near in space)
- **Grid layout** — Simple N×M grid by block number
- **Spiral** — Genesis block at center, spiraling outward (visually striking)
- **Timeline** — Linear timeline with block age as one axis

---

## 5. Design Inspiration

### Best Metaverse/Virtual World UIs

1. **Minecraft** — Infinite procedural world, simple voxels, maximum creativity
   - Lesson: Simplicity enables expression; the blocks are the canvas
   
2. **Fortnite Creative** — User-generated islands, social hub
   - Lesson: Portal system (hop between experiences), social-first design

3. **Roblox** — Platform of platforms, each "experience" is user-created
   - Lesson: Creator economy, simple tools = massive adoption

4. **VRChat** — User-created worlds, avatar expression
   - Lesson: Social presence and identity matter most

### Data Visualization Inspiration

1. **GitHub Contribution Graph** — Simple, beautiful, instantly readable
   - Apply: Each block as a colored cell, color = activity/value

2. **Observable / D3.js visualizations** — Interactive, zoomable, explorable
   - Apply: Multi-scale exploration from galaxy to block level

3. **Google Earth** — Seamless zoom from space to street level
   - Apply: The gold standard for multi-scale spatial navigation

4. **Wind Map (hint.fm/wind)** — Beautiful real-time data visualization
   - Apply: Show real-time activity flows across the block landscape

5. **Strava Global Heatmap** — Billions of data points rendered beautifully
   - Apply: Show activity density across all Bitmaps

### Cutting-Edge WebGL/Three.js Experiences

1. **Bruno Simon's Portfolio (bruno-simon.com)** — 3D car driving through a portfolio
2. **Lusion.co** — Award-winning WebGL studio, stunning interactive experiences
3. **Awwwards WebGL winners** — Continuous inspiration for web-based 3D
4. **Active Theory projects** — High-end interactive web experiences
5. **Midwam.com** — Beautiful particle-based navigation

### Making Block Exploration Feel Magical

**Key principles:**
- **Progressive disclosure** — Start simple, reveal depth as users zoom in
- **Ambient life** — Particles, gentle animations, subtle sound
- **Real-time pulse** — Show the blockchain breathing (new blocks arriving, transactions flowing)
- **Ownership glow** — Blocks with active owners visually distinct from unclaimed/dormant
- **Discovery rewards** — Hidden details, easter eggs in special blocks (genesis, halvings)
- **Sound design** — Each block era has its own ambient soundscape
- **Social warmth** — Seeing other visitors as fireflies/particles, hearing footsteps

---

## 6. Recommended Architecture for The Nexus

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Map Engine  │  │  Chat/Social │  │  Block       │     │
│  │  (Three.js/  │  │  (WebSocket) │  │  Viewer      │     │
│  │   Deck.gl)   │  │              │  │  (iframe/    │     │
│  │              │  │              │  │   portal)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  React/Next.js SPA with WebGL rendering                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS / WSS
┌─────────────────────▼───────────────────────────────────────┐
│                      GATEWAY LAYER                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  API Server  │  │  WebSocket   │  │  Registry    │     │
│  │  (REST/      │  │  Hub         │  │  (Block→     │     │
│  │   GraphQL)   │  │  (Presence,  │  │   Server     │     │
│  │              │  │   Chat)      │  │   mapping)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  Node.js / Rust microservices                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                       DATA LAYER                            │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  PostgreSQL  │  │  Redis       │  │  ord Indexer │     │
│  │  (Block data │  │  (Cache,     │  │  (Bitcoin    │     │
│  │   registry,  │  │   pub/sub,   │  │   Core +     │     │
│  │   users)     │  │   sessions)  │  │   Ordinals)  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   FEDERATION LAYER                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Owner       │  │  Owner       │  │  Owner       │     │
│  │  Server A    │  │  Server B    │  │  Server C    │     │
│  │  (Block X)   │  │  (Block Y)   │  │  (Block Z)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  Self-hosted by block owners using Nexus SDK               │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack Recommendation

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 15 + React 19 | SSR for SEO, great DX, massive ecosystem |
| Map Engine | Deck.gl (2D) + Three.js (3D) | Deck.gl handles millions of points; Three.js for immersive 3D |
| Styling | Tailwind CSS + Framer Motion | Fast iteration, beautiful animations |
| Realtime | Socket.IO (WebSocket) | Proven at scale, fallback support, rooms |
| Voice | WebRTC via LiveKit or PeerJS | Open-source SFU for scalable voice |
| API | tRPC or GraphQL (Hasura) | Type-safe, real-time subscriptions |
| Auth | Bitcoin message signing + JWT | Wallet-native auth, no passwords |
| Database | PostgreSQL + TimescaleDB | Relational + time-series for block data |
| Cache | Redis Cluster | Pub/sub, sessions, rate limiting |
| Search | Meilisearch | Fast block/user search |
| Indexer | ord (self-hosted) | Trustless Bitmap ownership data |
| Block Node | Bitcoin Core | Required for ord indexer |
| CDN | Cloudflare | Edge caching, DDoS protection |
| Deploy | Docker + Kubernetes | Scale horizontally |
| Owner SDK | TypeScript + Node.js | Lowest barrier for block owners |

### Authentication Flow

```
1. User connects Bitcoin wallet (Xverse, Unisat, Leather, etc.)
2. Server sends challenge: "Sign this to prove you own address bc1p..."
3. User signs with their Bitcoin key
4. Server verifies signature
5. If user owns any Bitmap inscriptions → "Owner" role
6. If not → "Visitor" role
7. JWT issued for session
```

---

## 7. Design Direction Recommendations

### Visual Identity

**Theme: "The Living Chain"**
- The blockchain is alive — blocks pulse, transactions flow like blood
- Dark background (space-like) with luminous blocks
- Color palette: Deep navy → electric blue → gold (Bitcoin colors)
- Genesis block glows mythic gold at the center
- Halving blocks mark era transitions with distinct visual borders

### UX Flow

```
Landing Page → Connect Wallet → Enter The Nexus (Map View)
                                       │
                              ┌────────┼────────┐
                              │        │        │
                         Galaxy    Region    Block
                          View     View     View
                        (all       (1000    (single
                        blocks)    blocks)  block)
                                            │
                                    ┌───────┼───────┐
                                    │       │       │
                                  Info   Resources  Chat
                                  Panel  Portal    with
                                         (owner's  visitors
                                          content)
```

### Block Visual Representation

Each block rendered based on its actual data:
- **Height (Y-axis)** → Number of transactions (tall = busy block)
- **Width** → Block size in bytes
- **Color hue** → Halving epoch (era)
- **Brightness** → Fee density (bright = high-fee block)
- **Glow** → Active owner server online
- **Particles** → Number of current visitors
- **Crown/badge** → Special blocks (genesis, halving, difficulty adjustment)

### Interaction Design

- **Hover** → Block tooltip (number, date, tx count, owner)
- **Click** → Zoom into block, show detail panel
- **Double-click** → Enter block (load owner's content)
- **Minimap** → Always visible, shows your position
- **Cursor trail** → See other visitors moving on the map
- **Search bar** → Jump to any block by number

---

## 8. Proposed MVP Feature Set

### Phase 1: Map & Discovery (Weeks 1-8)

**Core:**
- [ ] Interactive 2D map of all Bitcoin blocks (Deck.gl)
- [ ] Color-coded by epoch, size by transaction count
- [ ] Zoom from galaxy view to individual block
- [ ] Block detail panel (all block data, ownership info)
- [ ] Search by block number
- [ ] Bitcoin wallet connection (Xverse, UniSat, Leather)
- [ ] Owner identification (your blocks highlighted)

**Data:**
- [ ] Ingest all Bitmap ownership data from BIS API
- [ ] Cache block metadata from Bitcoin Core
- [ ] PostgreSQL database with all block + ownership data
- [ ] Real-time new block detection

### Phase 2: Social & Presence (Weeks 9-14)

**Core:**
- [ ] Visitor presence system (see others on the map as dots/avatars)
- [ ] Global chat + block-specific chat rooms
- [ ] User profiles (linked to Bitcoin address)
- [ ] "Currently exploring" status
- [ ] Visitor count per block

**Tech:**
- [ ] WebSocket server (Socket.IO)
- [ ] Redis pub/sub for scaling
- [ ] Spatial interest management (only see nearby visitors)

### Phase 3: Resource Linking & Federation (Weeks 15-22)

**Core:**
- [ ] Owner dashboard ("Manage My Block")
- [ ] Resource registry (link URLs, servers, content to your block)
- [ ] Owner verification (sign message with Bitmap-owning key)
- [ ] Block portal viewer (iframe/embed owner content)
- [ ] Owner server health monitoring (online/offline status)
- [ ] Nexus SDK for block owners (npm package)

**Tech:**
- [ ] Federation protocol spec (v1)
- [ ] Owner server SDK (TypeScript)
- [ ] Registry API
- [ ] Content Security Policy for embedded content

### Phase 4: Immersion & 3D (Weeks 23-30)

**Core:**
- [ ] 3D block view (Three.js) as alternative to 2D
- [ ] Procedural block terrain generation from block data
- [ ] Avatar system (simple 3D characters)
- [ ] Proximity voice chat (WebRTC)
- [ ] Block "neighborhoods" (groups of adjacent blocks)

### Phase 5: Economy & Ecosystem (Weeks 31+)

**Core:**
- [ ] Lightning Network micropayments integration
- [ ] Block owner revenue tools (charge entry, sell items)
- [ ] Cross-block portals (owner A links to owner B)
- [ ] Developer API for third-party integrations
- [ ] Mobile app (React Native or PWA)
- [ ] Governance system for protocol upgrades

---

## Technical Feasibility Assessment

| Component | Feasibility | Risk | Notes |
|-----------|------------|------|-------|
| Bitmap ownership data | ✅ High | Low | Well-indexed, APIs available |
| 2D map (800K+ blocks) | ✅ High | Low | Deck.gl handles millions of points |
| 3D map (800K+ blocks) | ⚠️ Medium | Medium | Needs aggressive LOD, but proven techniques exist |
| WebSocket presence | ✅ High | Low | Mature tech, well-understood scaling |
| WebRTC voice | ⚠️ Medium | Medium | Needs TURN servers, NAT traversal can be tricky |
| Resource linking registry | ✅ High | Low | Standard web architecture |
| Owner server federation | ⚠️ Medium | Medium | Novel protocol design needed, adoption dependent |
| Bitcoin wallet auth | ✅ High | Low | Libraries exist (bitcoinjs-lib, etc.) |
| Lightning payments | ⚠️ Medium | Medium | Adds complexity, but LN libraries are maturing |
| Scale to 100K users | ⚠️ Medium | Medium | Requires proper infra, but achievable with K8s |

---

## Key Sources & References

- **Ordinals Protocol:** https://docs.ordinals.com / https://github.com/ordinals/ord
- **Bitmap Community:** https://bitmap.community / https://docs.bitmap.community
- **Bitmap.land:** https://bitmap.land
- **Best in Slot (Bitmap data):** https://bestinslot.xyz/ordinals/collections/bitmap
- **GeniiData:** https://geniidata.com/ordinals/collection/bitmap
- **Magic Eden (Bitmap marketplace):** https://magiceden.io/ordinals/marketplace/bitmap
- **Blockamoto Labs:** https://blockamoto.com
- **Three.js:** https://threejs.org
- **Deck.gl:** https://deck.gl
- **Socket.IO:** https://socket.io
- **LiveKit (WebRTC):** https://livekit.io
- **Hiro Ordhook:** https://docs.hiro.so/ordhook

---

## Final Thoughts

The Nexus occupies a **blue ocean position**: there is significant Bitmap ownership (hundreds of thousands of inscriptions) but virtually zero infrastructure for experiencing, interacting with, or building on those Bitmaps. Every other metaverse project exists on Ethereum or is chain-agnostic — nobody owns the Bitcoin metaverse layer.

The key insight is the **base protocol philosophy**: The Nexus doesn't need to build every experience. It needs to build the MAP, the PRESENCE layer, and the FEDERATION protocol. Block owners build everything else. This is what made the internet successful — the protocol was thin, the applications were infinite.

**Build the internet of Bitcoin blocks. Let a thousand worlds bloom.** 🐸

---
*Research compiled February 9, 2026 by Pepe 🐸 for Gravity / Block Genomics*
