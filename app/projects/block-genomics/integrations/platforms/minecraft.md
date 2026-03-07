# Block Genomics — Minecraft Integration

> Verify players by genome, grant trust-based permissions, and bring Bitcoin identity into Minecraft servers.

---

## Overview

The Minecraft integration lets server operators gate access, assign permissions, and display trust badges — all linked to Block Genomics verification. Higher-trust players get more land, special particle effects, and exclusive areas.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Minecraft Server                             │
│                                                                   │
│  Player joins → Server checks BG verification                    │
│       │                                                           │
│       ├─ Not verified → Guest mode (limited access)              │
│       │                                                           │
│       ├─ 🥉 Bronze → Verified status + basic land (16×16)       │
│       │                                                           │
│       ├─ 🥈 Silver → Verified + expanded land (32×32)           │
│       │   + silver particle trail                                │
│       │                                                           │
│       └─ 🥇 Gold → Full access + large land (64×64)             │
│           + gold particle trail + name glow                       │
│           + access to Gold-only areas                            │
│                                                                   │
│  In-game commands:                                               │
│  /bg verify <genome>    — Link your genome to this server        │
│  /bg trust <player>     — Check a player's trust score           │
│  /bg claim              — Claim land based on trust tier          │
│  /bg badge              — Toggle your BG badge display           │
│  /bg info               — Show your genome info                  │
└─────────────────────────────────────────────────────────────────┘
```

## Plugin Architecture

This is a **Bukkit/Spigot/Paper** plugin specification. The TypeScript file provides the BG API interaction layer; the actual Java plugin wraps it.

```
┌───────────────────────────────────────────────┐
│  Minecraft Server (Paper/Spigot)              │
│                                                │
│  ┌─────────────────────────────────────────┐  │
│  │  BlockGenomics Plugin (Java)            │  │
│  │                                          │  │
│  │  ├── Commands                            │  │
│  │  │   ├── /bg verify                      │  │
│  │  │   ├── /bg trust                       │  │
│  │  │   ├── /bg claim                       │  │
│  │  │   ├── /bg badge                       │  │
│  │  │   └── /bg info                        │  │
│  │  │                                       │  │
│  │  ├── Events                              │  │
│  │  │   ├── PlayerJoinEvent → check BG      │  │
│  │  │   ├── PlayerQuitEvent → cleanup       │  │
│  │  │   └── BlockPlaceEvent → land check    │  │
│  │  │                                       │  │
│  │  ├── BG API Client (HTTP)               │  │
│  │  │   ├── Verify genome                   │  │
│  │  │   ├── Get trust score                 │  │
│  │  │   └── JWT offline verify              │  │
│  │  │                                       │  │
│  │  ├── Land Claim System                   │  │
│  │  │   ├── Tier-based claim sizes          │  │
│  │  │   ├── WorldGuard integration          │  │
│  │  │   └── Claim visualization             │  │
│  │  │                                       │  │
│  │  └── Visual Effects                      │  │
│  │      ├── Particle trails (tier-based)    │  │
│  │      ├── Name tag badges                 │  │
│  │      └── Scoreboard display              │  │
│  └─────────────────────────────────────────┘  │
│                                                │
│  Dependencies:                                 │
│  ├── WorldGuard (optional, land claims)        │
│  ├── PlaceholderAPI (optional, placeholders)   │
│  └── Vault (optional, permissions)             │
└───────────────────────────────────────────────┘
```

## Verification Flow

### In-Game Verification

```
Player types: /bg verify
        │
        ▼
Plugin sends chat message with clickable link:
  "🧬 Click here to verify your Block Genomics genome:
   https://verify.blockgenomics.io/minecraft?code=mc_abc123&server=play.example.com"
        │
        ▼
Player clicks → opens browser → connects wallet → signs BIP-322
        │
        ▼
BG API issues JWT with Minecraft UUID embedded
        │
        ▼
BG API sends webhook to plugin server:
  { event: "verification.completed", minecraftUuid: "...", jwt: "..." }
        │
        ▼
Plugin receives webhook → validates JWT → links player
        │
        ▼
In-game: "✅ [Player] is now BG Gold verified! Trust: 87/100"
Plugin assigns permissions + visual effects
```

### Pre-Verification (Link Before Joining)

Players can link their Minecraft UUID on the BG website before joining a server.
When they join, the plugin checks the API and auto-assigns their tier.

## Configuration

### `config.yml`

```yaml
# Block Genomics Minecraft Plugin Configuration

api:
  key: "bg_live_your_api_key_here"
  url: "https://api.blockgenomics.io/v1"
  # Webhook endpoint for receiving verification callbacks
  webhook-port: 8080
  webhook-secret: "whsec_your_secret_here"
  # Cache verification results for this long (seconds)
  cache-ttl: 3600
  # Use JWT offline verification (recommended for performance)
  offline-verify: true

verification:
  # Allow players to verify in-game
  enabled: true
  # Require verification to play (vs. guest mode)
  required: false
  # Guest mode permissions (if verification not required)
  guest-permissions:
    - "bg.guest"
    - "essentials.chat"

# Trust tier configuration
tiers:
  gold:
    min-trust: 70
    permission-group: "bg-gold"  # Vault/LuckPerms group
    land-claim-size: 64  # blocks × blocks
    particle-effect: "VILLAGER_HAPPY"
    particle-color: "FFD700"
    name-prefix: "&6[🥇]&r "
    max-homes: 5
    
  silver:
    min-trust: 50
    permission-group: "bg-silver"
    land-claim-size: 32
    particle-effect: "CRIT_MAGIC"
    particle-color: "C0C0C0"
    name-prefix: "&7[🥈]&r "
    max-homes: 3
    
  bronze:
    min-trust: 0
    permission-group: "bg-bronze"
    land-claim-size: 16
    particle-effect: "SPELL_INSTANT"
    particle-color: "CD7F32"
    name-prefix: "&c[🥉]&r "
    max-homes: 1

# Land claims
claims:
  enabled: true
  worldguard-integration: true
  # Show claim boundaries with particles
  visualize-borders: true
  # Maximum claims per player (multiplied by tier)
  max-claims-per-tier:
    gold: 5
    silver: 3
    bronze: 1

# Visual effects
effects:
  particle-trails: true
  name-badges: true
  # Show trust score on scoreboard
  scoreboard: true
  # Join/leave messages include BG info
  custom-join-message: true

# Messages
messages:
  verify-prompt: "&e🧬 Click to verify your Block Genomics genome: &b{url}"
  verify-success: "&a✅ {player} is now BG {tier} verified! Trust: {trust}/100"
  verify-required: "&cYou must verify with Block Genomics to play on this server."
  trust-check: "&e🧬 {player}: {tier} | Trust: {trust}/100 | Block #{block}"
  claim-success: "&a✅ Claimed a {size}×{size} area at your location!"
  claim-denied: "&cYou don't have any claims remaining for your tier."
  not-verified: "&c{player} is not BG verified."
```

## Commands Reference

| Command | Permission | Description |
|---------|-----------|-------------|
| `/bg verify` | `bg.verify` | Start verification flow |
| `/bg verify <jwt>` | `bg.verify` | Verify with a JWT token directly |
| `/bg trust [player]` | `bg.trust` | Check trust score (self or other) |
| `/bg claim` | `bg.claim` | Claim land at current location |
| `/bg unclaim` | `bg.claim` | Remove a land claim |
| `/bg badge` | `bg.badge` | Toggle badge visibility |
| `/bg info [player]` | `bg.info` | Show genome details |
| `/bg reload` | `bg.admin` | Reload plugin config |
| `/bg revoke <player>` | `bg.admin` | Revoke a player's verification |

## Land Claim System

### Trust-Based Claims

```
🥇 Gold (Trust ≥ 70):
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│                        64 × 64 blocks                            │
│                                                                   │
│                    ┌──────────────────┐                           │
│                    │                  │                           │
│                    │   Player's       │                           │
│                    │   Build Area     │                           │
│                    │                  │                           │
│                    └──────────────────┘                           │
│                                                                   │
│   Up to 5 separate claims                                        │
└──────────────────────────────────────────────────────────────────┘

🥈 Silver (Trust ≥ 50):
┌──────────────────────────────────────┐
│                                       │
│          32 × 32 blocks              │
│                                       │
│      ┌──────────┐                    │
│      │  Build   │                    │
│      │  Area    │                    │
│      └──────────┘                    │
│                                       │
│   Up to 3 separate claims            │
└──────────────────────────────────────┘

🥉 Bronze (Trust ≥ 0):
┌──────────────────┐
│                   │
│  16 × 16 blocks  │
│                   │
│  ┌──────┐        │
│  │Build │        │
│  └──────┘        │
│                   │
│  1 claim only    │
└──────────────────┘
```

### WorldGuard Integration

The plugin auto-creates WorldGuard regions for claims:

```
Region name: bg-claim-{playerUUID}-{claimNumber}
Flags:
  - build: allow (for owner)
  - block-break: allow (for owner)
  - block-place: allow (for owner)
  - pvp: deny
  - mob-spawning: deny (configurable)
  - entry: allow (configurable per tier)
```

## Visual Effects

### Particle Trails

Verified players get a particle trail behind them as they walk:

| Tier | Particle | Color | Pattern |
|------|----------|-------|---------|
| 🥇 Gold | VILLAGER_HAPPY | Gold (#FFD700) | Spiral |
| 🥈 Silver | CRIT_MAGIC | Silver (#C0C0C0) | Straight trail |
| 🥉 Bronze | SPELL_INSTANT | Bronze (#CD7F32) | Dots |

### Name Tag Badges

Above each verified player's head:

```
Without BG:
  PlayerName

With BG Gold:
  [🥇] PlayerName
  Trust: 87

With BG Silver:
  [🥈] PlayerName
```

### Scoreboard

Optional sidebar showing top trusted players:

```
┌─────────────────────────┐
│  🧬 Block Genomics       │
│  ━━━━━━━━━━━━━━━━━━━━━  │
│  🥇 SatoshiFan    87    │
│  🥇 Nakamoto      82    │
│  🥈 BitBuilder    65    │
│  🥈 CryptoKnight  58    │
│  🥉 NewPlayer     31    │
│                          │
│  Your Trust: 87          │
│  Your Tier: Gold         │
└─────────────────────────┘
```

## PlaceholderAPI Placeholders

For use in other plugins (tab list, chat format, etc.):

| Placeholder | Example Output |
|------------|---------------|
| `%bg_verified%` | `true` |
| `%bg_tier%` | `gold` |
| `%bg_trust%` | `87` |
| `%bg_block%` | `500000` |
| `%bg_genome_short%` | `0xa3f7b2c9…` |
| `%bg_badge%` | `[🥇]` |
| `%bg_name_colored%` | `§6[🥇]§r PlayerName` |

## Performance Considerations

### Caching Strategy

```
Player joins server
    │
    ├─ Check local cache (SQLite/in-memory)
    │   └─ If cached + not expired → use cached verification
    │
    ├─ Check JWT offline (Ed25519 signature verify)
    │   └─ If valid JWT + not expired → use JWT data (no API call!)
    │
    └─ API call (fallback)
        └─ Cache result for config.cache-ttl seconds
```

**Target:** Zero API calls during normal gameplay. All verification is cached or JWT-based.

### Data Storage

```
SQLite Database (plugins/BlockGenomics/data.db):
├── players
│   ├── uuid (PK)
│   ├── genome
│   ├── agent_id
│   ├── tier
│   ├── trust_score
│   ├── block_height
│   ├── jwt
│   ├── verified_at
│   └── last_checked
│
├── claims
│   ├── id (PK)
│   ├── player_uuid (FK)
│   ├── world
│   ├── x1, z1, x2, z2
│   ├── claimed_at
│   └── worldguard_region
│
└── settings
    ├── key
    └── value
```

## Server Setup Guide

### 1. Download Plugin

```
plugins/BlockGenomics.jar
```

### 2. Start Server (creates config)

```bash
java -jar paper.jar
# Plugin creates plugins/BlockGenomics/config.yml
```

### 3. Configure API Key

Edit `plugins/BlockGenomics/config.yml`:
```yaml
api:
  key: "bg_live_your_key_here"
```

### 4. Reload

```
/bg reload
```

### 5. Done!

Players can now `/bg verify` to link their genome.

## Optional: Genome-Based Skins

### Concept

Generate a unique skin overlay based on a player's genome DNA sequence. The DNA sequence maps to visual patterns.

```
DNA Sequence: ATGCATGCATGC...
              │││ │││ │││
              ▼▼▼ ▼▼▼ ▼▼▼
Skin mapping:
  A = Pattern element 1 (color from genome)
  T = Pattern element 2
  G = Pattern element 3
  C = Pattern element 4

Result: A unique "genome skin" overlay that's deterministic —
same genome always produces the same visual pattern.
```

### Implementation

This requires a skin server that:
1. Takes a genome as input
2. Generates a deterministic skin texture
3. Applies it as a skull/armor overlay
4. Players see the genome-based pattern

> **Note:** Full skin replacement requires Mojang's skin server; we'd use cosmetic overlays (hats, capes via resource pack) instead.

## Compatibility

| Server Software | Supported | Notes |
|----------------|-----------|-------|
| Paper 1.20+ | ✅ Full | Recommended |
| Spigot 1.20+ | ✅ Full | |
| Bukkit 1.20+ | ⚠️ Partial | Missing some Paper APIs |
| Purpur | ✅ Full | Paper-compatible |
| Fabric | ❌ | Different mod system (future) |
| Forge | ❌ | Different mod system (future) |
| Bedrock (Geyser) | ⚠️ Partial | Commands work, visuals limited |

## Dependencies

| Plugin | Required? | Purpose |
|--------|-----------|---------|
| WorldGuard + WorldEdit | Optional | Land claim protection |
| PlaceholderAPI | Optional | Placeholders for other plugins |
| Vault + LuckPerms | Optional | Permission group assignment |
| ProtocolLib | Optional | Advanced name tag badges |

---

*See `minecraft-plugin.ts` for the BG API interaction layer.*
