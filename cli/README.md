# Block Genomics CLI

A command-line client for the Block Genomics protocol — Bitcoin-anchored
identity via the Bitmap standard. The read commands talk to the **live public
API** so any AI agent can verify block ownership and read world data directly.

## Install

```bash
npm install
npm run build
```

## Run (dev)

```bash
npx tsx src/bin/bg.ts --help
npx tsx src/bin/bg.ts block 718222
```

## Configuration

The API base is resolved in this order:

1. `BLOCKGENOMICS_API_URL` environment variable
2. `apiBaseUrl` in `~/.block-genomics/config.json`
3. Default: `https://blockgenomics.io`

```bash
# Point at a local dev server or a fork
BLOCKGENOMICS_API_URL=http://localhost:3000 npx tsx src/bin/bg.ts block 840000
```

Config (default block, profile handle, local draft resources) is stored at
`~/.block-genomics/config.json`.

## Get started (for agents)

Everything below hits the live API and returns real data — no signing or keys
required:

```bash
# Real on-chain + DB lookup for a block (ownership, owner handle, world, genome)
bg block 718222
bg block 718222 --json

# Read-only ownership verification + the deterministic identity genome
bg verify --block 718222 --json

# Live delegation/rental marketplace listings
bg market list

# Local status (cached from your last verify) and current API base
bg status
```

The genome hash shown is the **real** value the server derives:
`0x` + `sha256("block-genomics:genome:v1:<height>:<ownerAddress>")`.

## Commands

| Command | Data source | Notes |
|---|---|---|
| `bg block <height> [--json]` | **Live API** | Ownership + world + genome for a block |
| `bg verify [--block <h>] [--json]` | **Live API** | Read-only on-chain ownership check |
| `bg market list [--block <h>]` | **Live API** | Real delegation listings |
| `bg status` | Local + API base | Cached verify result |
| `bg explore` | Live API on select | TUI map; grid colors illustrative, Enter fetches live ownership |
| `bg init` | **Live API** | Verifies a chosen block on-chain, saves config |
| `bg connect --resource <url>` | Real HTTP probe | Reachability is real; on-chain link needs signing |
| `bg profile <create\|show\|edit\|delete>` | Local config | Local profile draft |
| `bg market price\|rent` | — | Honest: requires signing, not wired |
| `bg wallet balance\|...` | Local demo | Demo wallet — no keys, no chain |
| `bg build --block <h>` | Local draft | Records locally; real deploy needs signing |
| `bg agent <start\|verify>` | **Live API** | Agent-mode wrapper around verify |

## What's real vs. not wired

- **Real (live API):** block lookup, ownership verification, genome derivation,
  marketplace listings, resource reachability probe.
- **Not wired (honestly labeled):** anything that requires signing a BIP-322
  challenge with a wallet — claiming a block as your identity, world-object
  deploys, terrain edits, delegation purchases, buying Bitmaps. The CLI holds no
  keys and does **not** sign. For those flows, request a challenge from
  `POST /api/v1/challenge`, sign it with your wallet, and POST to the relevant
  endpoint (e.g. `/api/v1/auth/verify`, `/api/v1/world`), or use the web app at
  `/verify`.
