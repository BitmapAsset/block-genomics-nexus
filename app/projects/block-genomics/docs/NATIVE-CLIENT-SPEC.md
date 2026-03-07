# Block Genomics — Native Client Architecture Spec

**Purpose:** Game-level 3D client for The Nexus, connecting to the existing Block Genomics backend.
**Engine:** Unreal Engine 5 (preferred) or Godot 4
**Status:** Hiring phase — this spec is the handoff document for a game developer.

---

## Overview

The native client is a **second frontend** that reads/writes to the same backend API and database as the web version (blockgenomics.io). It does NOT replace the web version — both run simultaneously.

```
┌──────────────┐     ┌──────────────┐
│  Web Client   │     │ Native Client │
│  (Three.js)   │     │  (Unreal/UE5) │
└──────┬───────┘     └──────┬───────┘
       │                     │
       └──────────┬──────────┘
                  │
         ┌────────▼────────┐
         │  Block Genomics  │
         │   Backend API    │
         │  (Next.js + DB)  │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │    Supabase DB   │
         │   + Realtime     │
         └─────────────────┘
```

---

## Backend API (Already Built)

Base URL: `https://blockgenomics.io/api/v1`

### Auth & Identity
- `POST /challenge` — Get signing challenge
- `POST /auth/verify` — BIP-322 wallet verification + profile creation
- `GET /users/by-handle/[handle]` — User lookup
- `GET /users/by-wallet/[address]` — User lookup by wallet
- `GET /users/list?limit=20&offset=0` — Paginated user list

### Blocks & World
- `GET /blocks/[height]` — Block data
- `POST /world` — Place world object (requires wallet signature)
- `POST /world/terrain` — Modify terrain (requires wallet signature)
- `DELETE /world/[id]` — Remove object (requires wallet signature)
- `GET /world?blockHeight=720143` — Get all objects for a block

### Chat (Real-time via Supabase)
- `POST /chat` — Send message (requires wallet signature)
- `GET /chat?blockHeight=720143&channel=block` — Get messages
- Supabase Realtime subscription on `ChatMessage` table for live updates

### Guardian AI
- `POST /guardian/chat` — Chat with block's Guardian agent
- `GET /guardian/[id]` — Guardian status and config

### Blockchain Data
- mempool.space API for real block data (tx list, sizes, weights)
- Bitfeed formula: `gridSize = ceil(sqrt(vbytes / 256))`
- Grid width: `ceil(sqrt(totalGridArea))`
- Natural tx order (NOT sorted by size)

---

## Universal World Schema

Every world object in the database must support both web (basic) and native (full fidelity):

```typescript
interface WorldObject {
  id: string;
  blockHeight: number;
  ownerAddress: string;
  
  // Geometry
  objectType: "primitive" | "prefab" | "light" | "effect" | "text3d" | "sound" | "npc";
  geometry: "box" | "sphere" | "cylinder" | "cone" | "torus" | "custom";
  prefabId?: string;          // For complex pre-built structures
  customMeshUrl?: string;     // URL to .glb/.gltf asset
  
  // Transform
  posX: number; posY: number; posZ: number;
  rotX: number; rotY: number; rotZ: number;
  scaleX: number; scaleY: number; scaleZ: number;
  
  // Material (web uses color only, native uses full PBR)
  color: string;              // Hex color — both renderers use this
  textureUrl?: string;        // Albedo/diffuse texture
  normalMapUrl?: string;      // Normal map
  roughness?: number;         // 0-1, PBR roughness
  metallic?: number;          // 0-1, PBR metallic
  emissive?: string;          // Hex emissive color
  emissiveIntensity?: number; // Glow strength
  opacity?: number;           // 0-1 transparency
  
  // LOD (Level of Detail)
  lodHigh?: string;           // High-poly mesh URL
  lodMedium?: string;         // Medium-poly mesh URL  
  lodLow?: string;            // Low-poly mesh URL
  
  // Physics (native client only)
  hasCollision: boolean;
  isStatic: boolean;
  mass?: number;
  
  // Interaction
  interactType?: "none" | "click" | "proximity" | "pickup";
  interactAction?: string;    // JSON action payload
  
  // Metadata
  name?: string;
  description?: string;
  createdAt: Date;
  createdBy: "owner" | "guardian";
}
```

### Terrain Schema

```typescript
interface BlockTerrain {
  blockHeight: number;
  groundColor: string;
  groundTexture?: string;
  heightmapUrl?: string;      // For sculpted terrain (native only)
  fogEnabled: boolean;
  fogColor?: string;
  fogDensity?: number;
  skyColor?: string;
  skyboxUrl?: string;         // HDR skybox (native only)
  weather?: "clear" | "rain" | "snow" | "storm" | "aurora" | "fireflies";
  weatherIntensity?: number;
  timeOfDay?: number;         // 0-24 hour float
  ambientColor?: string;
  ambientIntensity?: number;
  musicUrl?: string;          // Background audio
  musicVolume?: number;
}
```

### Prefab System

```typescript
interface Prefab {
  id: string;                 // "medieval_castle_01"
  name: string;               // "Medieval Castle"
  category: string;           // "buildings" | "nature" | "vehicles" | "furniture" | "effects"
  meshUrl: string;            // .glb/.gltf asset URL
  thumbnailUrl: string;       // Preview image
  lodMeshes: {
    high: string;
    medium: string;
    low: string;
  };
  defaultScale: { x: number; y: number; z: number };
  hasCollision: boolean;
  tags: string[];
}
```

---

## Block Layout (Bitmap Standard)

Each Bitcoin block = 2.1km × 2.1km territory (immutable protocol rule).

### Parcel Calculation
```
For each transaction in the block:
  gridSize = ceil(sqrt(vbytes / 256))
  
Grid width = ceil(sqrt(sum of all gridSize²))

Layout: Mondrian/square-packing algorithm
  - Place transactions in NATURAL order (NOT sorted by size)
  - Each tx is a square of gridSize × gridSize cells
  - Coinbase tx (index 0) = first placed, landmark building
```

### Scale Mapping
```
cellSize = 2100 / gridWidth  (meters per cell)
parcelWidth = gridSize × cellSize (meters)
parcelHeight = derived from vbytes (taller = more value)
```

### Visual Style
- Standard bitmap colors: uniform orange hsl(28, 90%) with slight brightness variation
- Gaps between parcels: ~6% of cell size (thin white/dark gaps)
- Roads render in gap areas
- Coinbase parcel = landmark (2.5x height, special effects)

---

## Wallet Integration (Native Client)

Browsers have wallet extensions (Unisat, Xverse). Native client doesn't. Options:

### Option A: Built-in Signer (Recommended)
- User imports wallet via seed phrase or WIF key (encrypted locally with AES-256)
- Client signs BIP-322 messages directly
- Private key NEVER leaves the device
- Most seamless UX

### Option B: WalletConnect-style Bridge
- Client shows QR code
- User scans with mobile wallet (Unisat mobile, Xverse mobile)
- Signing requests sent via WebSocket relay
- More secure (keys never touch the client) but clunkier UX

### Option C: Browser Bridge
- Client opens localhost HTTP server
- User opens blockgenomics.io/connect in browser with wallet extension
- Browser extension signs, passes signature back to native client via localhost
- Hybrid approach

**Recommendation:** Start with Option A for v1, add Option B later.

---

## Real-time Features

### Chat & Presence
- Connect to Supabase Realtime via WebSocket
- Subscribe to `ChatMessage` table changes filtered by blockHeight
- Presence channel for tracking who's online in each block

### World Updates
- Subscribe to `WorldObject` table changes
- When Guardian places an object → native client sees it appear in real-time
- When another user modifies terrain → all clients update

---

## Guardian AI Integration

The Guardian agent builds worlds by writing to the database. The native client just renders what's in the DB.

### Flow: Voice Command → World
```
1. Owner speaks to OpenClaw on Telegram
2. OpenClaw → Monitor API → Guardian
3. Guardian calls "place_prefab" tool
4. Backend writes WorldObject to DB
5. Supabase Realtime pushes update
6. Native client receives update → renders new object
7. Web client also receives update → renders simplified version
```

### Guardian Tools (expanded for native)
```json
{"tool": "place_prefab", "prefabId": "medieval_castle_01", "posX": 100, "posY": 0, "posZ": 200, "name": "Main Castle"}
{"tool": "sculpt_terrain", "heightmapUrl": "https://...", "area": {"x1": 0, "z1": 0, "x2": 500, "z2": 500}}
{"tool": "set_lighting", "timeOfDay": 18.5, "ambientColor": "#ff6600", "ambientIntensity": 0.8}
{"tool": "create_zone", "type": "shop", "bounds": {"x1": 50, "z1": 50, "x2": 150, "z2": 150}, "name": "Market Square"}
{"tool": "spawn_npc", "prefabId": "merchant_01", "posX": 100, "posY": 0, "posZ": 100, "dialogue": "Welcome to Block 720143!"}
{"tool": "set_music", "url": "https://...", "volume": 0.6, "zone": "Market Square"}
{"tool": "set_weather", "type": "aurora", "intensity": 0.7}
```

---

## Views / Camera Modes

Match the web version's 7 view modes:

1. **Grid (▦)** — Top-down flat view of parcels
2. **Isometric (◇)** — Classic isometric angle
3. **Heights (▥)** — 3D height-mapped parcels
4. **Genome (🧬)** — DNA visualization overlay
5. **Street (🚶)** — First-person, eye-level 1.7m, WASD walking, collision
6. **Showcase (🏙️)** — Generated city buildings on parcels
7. **Flyover (🦅)** — Free fly + auto tour drone camera

Street view is the primary mode for the native client (immersive experience).

---

## Minimum Viable Features (v1)

- [ ] Connect wallet (Option A — built-in signer)
- [ ] Load real block data from API (tx list, parcel layout)
- [ ] Render Mondrian parcel layout at 2.1km × 2.1km scale
- [ ] Street-level first-person walking with collision
- [ ] Render world objects from DB (primitives + basic prefabs)
- [ ] Real-time chat via Supabase WebSocket
- [ ] Guardian AI chat panel (talk to block's Guardian)
- [ ] Teleport between blocks (enter block number → load new world)
- [ ] Basic prefab library (20-30 buildings, trees, props)
- [ ] Day/night cycle + weather rendering

## Phase 2 Features
- [ ] Full prefab marketplace (user-uploaded assets)
- [ ] Multiplayer avatars (see other users walking around)
- [ ] Voice chat (proximity-based)
- [ ] Physics interactions (pickup, throw, vehicles)
- [ ] Steam/Epic Games Store listing
- [ ] VR support (SteamVR / Meta Quest via Link)

---

## Distribution Plan

1. **Direct download** from blockgenomics.io/download — v1 launch
2. **Steam** — $100 listing fee, submit after v1 is polished
3. **Epic Games Store** — Free listing (Unreal Engine project), submit after Steam

---

## Tech Requirements for Developer

- Unreal Engine 5.4+ experience
- C++ and Blueprints
- HTTP REST API integration (JSON)
- WebSocket/Supabase Realtime integration
- PBR materials and lighting
- Landscape/terrain systems
- First-person character controller with collision
- Basic UI (HUD, chat panel, menus)
- Experience with Steam SDK (for Phase 2)

---

## Asset Requirements

- Modular building kit (walls, roofs, floors, windows) — stylized or realistic
- Nature pack (trees, rocks, grass, water)
- Urban props (benches, streetlights, signs, vehicles)
- Sky/weather system (dynamic clouds, rain, snow, aurora)
- Character model for first-person (arms/hands visible)
- UI kit for menus and HUD

**Budget option:** Use Unreal Marketplace assets ($500-2000 total for quality packs)
**Premium option:** Commission custom assets ($5000+)

---

*This spec is the complete handoff document. A qualified Unreal developer should be able to build v1 from this spec + our existing API documentation (docs/API.md).*

*Written: February 16, 2026*
*Block Genomics — The Bitcoin Metaverse*
