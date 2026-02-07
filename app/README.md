# Block Genomics

> Decentralized Bitcoin block verification through cryptographic genome extraction and trust-scored agents.

## Overview

Block Genomics is a platform where verification agents perform cryptographic proofs on Bitcoin blocks, extract "genomic" fingerprints, and build trust scores through consistent, accurate verification work.

## Tech Stack

- **Framework:** Next.js 15+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 (dark theme, glassmorphism)
- **Database:** PostgreSQL via Prisma ORM
- **Runtime:** Node.js 20+

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- pnpm, npm, or yarn

### Installation

```bash
# Clone and enter the project
cd app

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your database URL

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout (header, footer, providers)
│   ├── page.tsx            # Landing page
│   ├── globals.css         # Tailwind + custom theme
│   ├── verify/
│   │   └── page.tsx        # Verification flow
│   ├── block/[height]/
│   │   └── page.tsx        # Individual block page
│   ├── agent/[id]/
│   │   └── page.tsx        # Agent profile
│   ├── explore/
│   │   └── page.tsx        # Block explorer
│   ├── leaderboard/
│   │   └── page.tsx        # Rankings
│   └── api/v1/
│       ├── challenge/      # POST — Issue verification challenge
│       ├── verify/         # POST — Submit verification proof
│       ├── agent/[id]/     # GET  — Agent profile & stats
│       ├── block/[height]/ # GET  — Block data & verification
│       └── badge/[id]/     # GET  — SVG badge
├── components/
│   ├── Header.tsx          # Site header with nav & wallet
│   └── Footer.tsx          # Site footer with links & stats
├── context/
│   └── WalletContext.tsx    # Wallet connection state provider
├── lib/
│   └── prisma.ts           # Prisma client singleton
└── types/
    ├── index.ts            # Re-exports
    ├── agent.ts            # Agent, AgentStats
    ├── block.ts            # Block, BlockSummary
    ├── genome.ts           # Genome, GenomeMarker
    ├── verification.ts     # Verification, Challenge
    └── trust-score.ts      # TrustScore, LeaderboardEntry
```

## Theme

| Token          | Value     | Usage                    |
|----------------|-----------|--------------------------|
| bg-primary     | `#0a0a0f` | Main background          |
| bg-secondary   | `#12121a` | Card/panel backgrounds   |
| bg-tertiary    | `#1a1a2e` | Hover/elevated surfaces  |
| accent-cyan    | `#66ccff` | Primary accent           |
| accent-purple  | `#a855f7` | Secondary accent         |
| success        | `#22c55e` | Success/verified states  |
| bitcoin        | `#f7931a` | Bitcoin-specific UI      |

## API Routes

| Method | Endpoint              | Description                |
|--------|-----------------------|----------------------------|
| POST   | `/api/v1/challenge`   | Issue verification challenge |
| POST   | `/api/v1/verify`      | Submit verification proof  |
| GET    | `/api/v1/agent/:id`   | Agent profile & stats      |
| GET    | `/api/v1/block/:h`    | Block data & verification  |
| GET    | `/api/v1/badge/:id`   | SVG badge image            |

## Scripts

```bash
npm run dev        # Development server (Turbopack)
npm run build      # Production build
npm run start      # Production server
npm run lint       # ESLint
npm run db:generate # Generate Prisma client
npm run db:push    # Push schema to database
npm run db:studio  # Open Prisma Studio
```

## License

MIT
