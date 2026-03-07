# ⚡ RuneBolt — Lightning Transport for DOG & Bitmap

Part of [Block Genomics](https://blockgenomics.io). The first Lightning-powered transport layer for $DOG and Bitmap on Bitcoin.

## Two Assets. One Bridge.

| | $DOG 🐕 | Bitmap 🗺️ |
|---|---------|-----------|
| Type | Rune (fungible) | Inscription (non-fungible) |
| Fee | 0.3% of amount | 500 sats flat |
| Speed | Near-instant | Near-instant |
| On-chain method | Runestone OP_RETURN | Ordinal transfer |

Users see a simple **DOG ↔ Bitmap toggle** on the RuneBolt page.

## How It Works

```
You have $DOG or a Bitmap (slow on-chain transfer)
        ↓
RuneBolt creates a Lightning invoice (tiny fee)
        ↓
You pay the invoice (instant, proves intent)
        ↓
RuneBolt sends from its inventory to the receiver
        ↓
Done in seconds, not minutes ⚡
```

## API

### Bridge
- `GET /api/bridge/assets` — List supported assets
- `POST /api/bridge/fee` — Calculate fee `{asset: "DOG"|"BITMAP", amount}`
- `POST /api/bridge/transfer/dog` — Transfer DOG `{amount, senderAddress, receiverAddress}`
- `POST /api/bridge/transfer/bitmap` — Transfer Bitmap `{blockNumber, senderAddress, receiverAddress}`
- `GET /api/bridge/transfer/:id` — Check status
- `GET /api/bridge/inventory` — Current inventory

### Lightning
- `POST /api/lightning/invoice` — Create invoice
- `POST /api/lightning/pay` — Pay invoice
- `GET /api/lightning/info` — Node info

## Setup

```bash
cd app/runebolt
npm install
cp .env.example .env  # Add Voltage credentials
node src/server.js
```

## Infrastructure

- **Lightning:** Voltage Cloud LND (mainnet)
- **Channel:** 20,000 sats active
- **Direct LND REST** — no LNbits middleware

## License

BSL 1.1 — Block Genomics
