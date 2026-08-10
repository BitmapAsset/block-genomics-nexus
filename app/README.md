# Block Genomics Nexus

**The Bitcoin Metaverse — Sovereign AI agents on sovereign digital land.**

Every Bitcoin block becomes a 2.1km × 2.1km district in The Nexus. Own a block, build a world on it, give it a mind. Block Genomics verifies ownership through unique genome fingerprints anchored to Bitcoin.

[Live](https://blockgenomics.io) · [White Paper](https://blockgenomics.io/whitepaper) · [API Reference](docs/API.md) · [SDK Guide](docs/SDK.md)

---

## What is Block Genomics?

Block Genomics is an AI agent verification protocol built on Bitcoin. It uses Bitmap — the concept of owning Bitcoin blocks as digital real estate — combined with unique genome fingerprints to create verifiable, sovereign AI identities.

### Core Concepts

- **Genome Hash** — `SHA-256(wallet + block + signature)` creates a unique DNA for each verified entity
- **Three Tiers** — Tier 1 (block owner, Gold), Tier 2 (parcel owner, Cyan), Tier 3 (delegated, Purple)
- **Guardian Agents** — Autonomous AI agents that live on blocks, powered by BYOK (Bring Your Own Key). Manageable via Monitor API for programmatic control.
- **The Nexus** — 3D metaverse where every Bitcoin block is explorable territory
- **Nexus Brain** — Autonomous moral guardian with 5 rules inscribed on Bitcoin

### Architecture

```
┌─────────────────────────────────────────┐
│              The Nexus (3D)              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │Block 720k│ │Block 738k│ │Block 745k│  │
│  │Guardian  │ │Guardian  │ │         │   │
│  └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────┤
│           Verification Layer            │
│  BIP-322 + On-chain Bitmap Ownership    │
├─────────────────────────────────────────┤
│          Bitcoin (Source of Truth)       │
│  Blocks · Inscriptions · Proof of Work  │
└─────────────────────────────────────────┘
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, Three.js (React Three Fiber)
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** PostgreSQL (Supabase)
- **Blockchain:** mempool.space API, Unisat API, ordinals.com
- **Wallets:** Unisat, Xverse, Leather (Bitcoin wallets)
- **Real-time:** Supabase Realtime (chat + presence)
- **Encryption:** secp256k1 ECDH + AES-256-GCM + HKDF-SHA512
- **Lightning:** ZBD (ZEBEDEE) API for payments

## Getting Started

```bash
# Clone
git clone https://github.com/BitmapAsset/block-genomics-nexus.git
cd block-genomics-nexus

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your database URL

# Set up database
npx prisma generate
npx prisma db push

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API.md) | Complete REST API docs (67+ endpoints) with curl examples |
| [SDK Quick Start](docs/SDK.md) | JavaScript/TypeScript integration guide |
| [Protocol Specification](PROTOCOL.md) | Genome algorithm, tiers, delegation, encryption |
| [Architecture Guide](docs/ARCHITECTURE.md) | System design, database schema, deployment |
| [Contributing Guide](CONTRIBUTING.md) | Setup, code style, PR process, security requirements |
| [White Paper](https://blockgenomics.io/whitepaper) | Full project vision and design rationale |

## Quick API Examples

```bash
# Request a verification challenge
curl -X POST https://blockgenomics.io/api/v1/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "bc1p..."}'

# Look up a user by handle
curl https://blockgenomics.io/api/v1/users/by-handle/satoshi

# Get block data
curl https://blockgenomics.io/api/v1/blocks/720143

# Chat with a Guardian agent
curl -X POST https://blockgenomics.io/api/v1/guardian/chat \
  -H "Content-Type: application/json" \
  -d '{"blockHeight": 720143, "message": "Hello!"}'

# Get a verification badge
curl https://blockgenomics.io/api/v1/badge/satoshi.svg -o badge.svg
```

## Protocol Fee

Block Genomics charges a 3% fee on delegation transactions:
- 2.5% → Protocol Treasury
- 0.5% → Nexus Brain (autonomous moral guardian)

## Version

Current version: **21.0.0** — tribute to Bitcoin's 21M supply cap.

## License

This app is the Nexus platform and is licensed under the
[Business Source License 1.1](LICENSE).

- **Production use:** Permitted, including self-hosting and commercial use
- **Only restriction:** Offering the platform to third parties as a competing paid hosted service
- **Change Date:** 2029-08-10, after which it becomes Apache License 2.0

The Nexus Protocol spec, SDK, MCP server, and CLI are MIT licensed.
See [`LICENSING.md`](../LICENSING.md) for the full breakdown.

## Authors

**Gravity & Pepe** · Human + AI Agent · Block Genomics

---

*Built on Bitcoin. Verified by proof of work. Sovereign by design.*
