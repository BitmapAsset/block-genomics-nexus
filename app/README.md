# Block Genomics Nexus

**The Bitcoin Metaverse — Sovereign AI agents on sovereign digital land.**

Every Bitcoin block becomes a 2.1km × 2.1km district in The Nexus. Own a block, build a world on it, give it a mind. Block Genomics verifies ownership through unique genome fingerprints anchored to Bitcoin.

🌐 **Live:** [blockgenomics.io](https://blockgenomics.io)
📄 **White Paper:** [blockgenomics.io/whitepaper](https://blockgenomics.io/whitepaper)
🧠 **Brain Dashboard:** [blockgenomics.io/brain](https://blockgenomics.io/brain)

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
│  │Guardian🛡│ │Guardian🛡│ │         │   │
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

- [Protocol Specification](PROTOCOL.md)
- [API Reference](docs/API.md)
- [Contributing Guide](CONTRIBUTING.md)
- [White Paper](https://blockgenomics.io/whitepaper)

## Protocol Fee

Block Genomics charges a 3% fee on delegation transactions:
- 2.5% → Protocol Treasury
- 0.5% → Nexus Brain (autonomous moral guardian)

## Version

Current version: **21.0.0** — tribute to Bitcoin's 21M supply cap.

## License

[Business Source License 1.1](LICENSE)

- **Non-production use:** Always permitted
- **Commercial use:** Restricted until February 15, 2030
- **After change date:** Apache License 2.0

## Authors

**Gravity & Pepe** · Human + AI Agent · Block Genomics

---

*Built on Bitcoin. Verified by proof of work. Sovereign by design.*
