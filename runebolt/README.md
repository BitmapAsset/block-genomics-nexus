# RuneBolt

### The First Runes-over-Lightning Bridge

**By [Block Genomics](https://blockgenomics.io) | Instant $DOG transfers over Lightning**

---

RuneBolt enables instant, low-cost transfers of Bitcoin Runes tokens over the Lightning Network. Lock Runes on-chain, get paid over Lightning. Pay Lightning, receive Runes. Trustless submarine swaps powered by HTLCs.

Built as core infrastructure for the [Block Genomics](https://blockgenomics.io) ecosystem — connecting Runes liquidity to Bitmap ownership and Guardian AI agents.

## Features

### Runes Bridge
- **Submarine Swaps** — Atomic Runes-to-Lightning exchanges using HTLCs
- **Deposit** — Lock Runes on-chain, receive Lightning payment instantly
- **Withdraw** — Pay a Lightning invoice, receive Runes on-chain

### Bitmap Marketplace
- **Trustless NFT Sales** — List and sell Bitmap blocks via Lightning payments
- **HTLC Escrow** — Seller locks inscription in escrow, buyer pays Lightning, atomic swap
- **Auto-refund** — If buyer never pays, timelock expires and inscription returns to seller

### Infrastructure
- **Real-time Updates** — WebSocket streaming for swap and listing state changes
- **REST API** — Full API for bridge operations and marketplace
- **CLI** — Command-line for deposits, withdrawals, Bitmap sales, and balance checks
- **Runes Indexer** — Balance lookups via ord API with Unisat fallback
- **Fee Estimation** — Automatic on-chain fee estimation via bitcoind
- **Docker Ready** — Full Docker Compose setup with bitcoind + LND
- **Security Hardened** — Input validation, secret redaction, connection limits

## Architecture

```
 User                          RuneBolt                         Lightning
  │                               │                               Network
  │  ┌─────────────────────────┐  │  ┌─────────────────────────┐  │
  │  │ DEPOSIT                 │  │  │ WITHDRAW                │  │
  │  │                         │  │  │                         │  │
  │  │ 1. Lock Runes in HTLC  │  │  │ 1. Get LN invoice       │  │
  │  │    (on-chain tx with    │  │  │ 2. Pay invoice ─────────│──│──>
  │  │     Runestone)          │  │  │ 3. Bridge sends Runes   │  │
  │  │ 2. Bridge verifies ────│──│──│──> on-chain to user      │  │
  │  │ 3. Bridge pays LN ─────│──│──│──────────────────────────│──│──>
  │  │ 4. Swap complete        │  │  │ 4. Swap complete        │  │
  │  └─────────────────────────┘  │  └─────────────────────────┘  │
  │                               │                               │
  │       ┌───────────────────────┤                               │
  │       │    Core Components    │                               │
  │       ├───────────────────────┤                               │
  │       │  HTLCManager          │ HTLC scripts + Runestones     │
  │       │  SubmarineSwap        │ Swap lifecycle engine          │
  │       │  BitmapEscrow         │ HTLC escrow for inscriptions   │
  │       │  BitmapMarketplace    │ Bitmap listing/buy engine      │
  │       │  RunesIndexer         │ ord/Unisat balance tracking    │
  │       │  LightningClient      │ LND gRPC adapter               │
  │       │  WalletManager        │ UTXO selection + broadcast     │
  │       │  FeeEstimator         │ On-chain fee estimation        │
  │       └───────────────────────┘                               │
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Docker & Docker Compose (for bitcoind + LND)
- An ord indexer or Unisat API key (for Runes balance lookups)

### 1. Clone and Install

```bash
git clone https://github.com/gary-moto/runebolt.git
cd runebolt
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your bitcoind, LND, and indexer settings
```

### 3. Start Infrastructure (Dev)

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### 4. Build and Run

```bash
npm run build
npm start
```

Or for development:

```bash
npm run dev
```

The API server starts at `http://localhost:3000/api/v1` with WebSocket at `ws://localhost:3000/ws`.

## CLI Usage

```bash
# Deposit: Lock Runes on-chain, get Lightning payment
runebolt deposit \
  --rune DOG \
  --amount 1000 \
  --lightning lnbc1000n1... \
  --refund bc1p...

# Withdraw: Pay Lightning, receive Runes on-chain
runebolt withdraw \
  --rune DOG \
  --amount 1000 \
  --address bc1p...

# Check swap status
runebolt status --swap <swap-id>

# Check Runes balance
runebolt balance --address bc1p...

# ── Bitmap Marketplace ──

# List a Bitmap block for sale
runebolt bitmap list \
  --inscription abc123...def:0 \
  --bitmap 820000.bitmap \
  --price 100000 \
  --seller bc1p...

# Confirm inscription locked in escrow
runebolt bitmap escrow --id <listing-id> --txid <escrow-txid>

# Buy a listed Bitmap (after paying the Lightning invoice)
runebolt bitmap buy --id <listing-id> --address bc1p...

# View active listings
runebolt bitmap listings

# Cancel a listing
runebolt bitmap cancel --id <listing-id>

# Check listing status
runebolt bitmap status --id <listing-id>
```

Set `RUNEBOLT_API_URL` to point to a different API server (default: `http://localhost:3000/api/v1`).

## API Endpoints

### Swap Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/swap/deposit` | Initiate Runes deposit |
| `POST` | `/api/v1/swap/deposit/:id/confirm` | Confirm deposit with HTLC txid |
| `POST` | `/api/v1/swap/withdraw` | Initiate Runes withdrawal |
| `GET`  | `/api/v1/swap/:id` | Get swap status |

### Runes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/v1/runes/:address` | Check Runes balances for address |

### Bitmap Marketplace

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST`   | `/api/v1/bitmap/list` | List a Bitmap block for sale |
| `POST`   | `/api/v1/bitmap/:id/escrow` | Confirm inscription locked in escrow |
| `POST`   | `/api/v1/bitmap/:id/buy` | Buy a listed Bitmap |
| `GET`    | `/api/v1/bitmap/listings` | Get active listings |
| `GET`    | `/api/v1/bitmap/:id` | Get listing details |
| `DELETE` | `/api/v1/bitmap/:id` | Cancel a listing |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/v1/health` | Health check (includes LND status) |

### Example: Deposit

```bash
# 1. Create deposit swap
curl -X POST http://localhost:3000/api/v1/swap/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "runeName": "DOG",
    "runeAmount": "1000",
    "lightningInvoice": "lnbc1000n1...",
    "refundAddress": "bc1p..."
  }'

# Response: { "id": "swap-id", "state": "created", ... }

# 2. Send Runes to the HTLC address (on-chain), then confirm
curl -X POST http://localhost:3000/api/v1/swap/deposit/swap-id/confirm \
  -H "Content-Type: application/json" \
  -d '{ "htlcTxid": "abc123..." }'
```

### Example: Withdraw

```bash
# 1. Create withdrawal (returns Lightning invoice)
curl -X POST http://localhost:3000/api/v1/swap/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "runeName": "DOG",
    "runeAmount": "1000",
    "destinationAddress": "bc1p..."
  }'

# Response: { "id": "swap-id", "lightningInvoice": "lnbcrt...", "satoshiAmount": 1050, ... }

# 2. Pay the Lightning invoice — bridge automatically sends Runes on-chain
```

### WebSocket

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  // Subscribe to a specific swap
  ws.send(JSON.stringify({ action: 'subscribe', swapId: 'swap-id' }));

  // Or subscribe to all swaps (operator mode)
  ws.send(JSON.stringify({ action: 'subscribe_all' }));
};

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log(`Swap ${update.swapId}: ${update.state}`);
};
```

## Docker Setup

### Development (regtest)

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

This starts:
- **bitcoind** on regtest (RPC port 18443)
- **LND** connected to bitcoind (gRPC port 10009)
- **RuneBolt API** on port 3000

### Production

```bash
docker-compose up -d
```

Ensure `.env` is configured with mainnet settings, LND credentials, and a funded bridge wallet.

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `BITCOIN_NETWORK` | `regtest` | Bitcoin network (`mainnet`, `testnet`, `regtest`) |
| `BITCOIN_RPC_URL` | `http://localhost:18443` | bitcoind RPC URL |
| `BITCOIN_RPC_USER` | `bitcoin` | bitcoind RPC username |
| `BITCOIN_RPC_PASS` | `bitcoin` | bitcoind RPC password |
| `LND_HOST` | `localhost` | LND gRPC host |
| `LND_PORT` | `10009` | LND gRPC port |
| `LND_TLS_CERT` | `~/.lnd/tls.cert` | Path to LND TLS certificate |
| `LND_MACAROON` | `~/.lnd/...admin.macaroon` | Path to LND admin macaroon |
| `ORD_API_URL` | `http://localhost:80` | ord indexer API URL |
| `UNISAT_API_URL` | `https://open-api.unisat.io` | Unisat API URL (fallback) |
| `UNISAT_API_KEY` | — | Unisat API key |
| `HTLC_TIMEOUT_BLOCKS` | `144` | HTLC timeout in blocks (~24h) |
| `FEE_RATE_BPS` | `50` | Bridge fee in basis points (50 = 0.5%) |
| `MIN_SWAP_AMOUNT` | `1000` | Minimum swap amount (Rune units) |
| `MAX_SWAP_AMOUNT` | `100000000` | Maximum swap amount |
| `BRIDGE_ADDRESS` | — | Bridge operator's Bitcoin address |
| `SERVER_PORT` | `3000` | API server port |
| `SERVER_HOST` | `0.0.0.0` | API server bind address |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated) |
| `LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |

## Project Structure

```
runebolt/
├── src/
│   ├── core/
│   │   ├── RunesBridge.ts      # Main orchestrator
│   │   ├── HTLCManager.ts      # HTLC scripts + Runestone encoding
│   │   ├── SubmarineSwap.ts    # Swap lifecycle engine
│   │   ├── BitmapEscrow.ts     # HTLC escrow for Ordinals inscriptions
│   │   ├── BitmapMarketplace.ts # Bitmap listing/buy engine
│   │   ├── RunesIndexer.ts     # Runes balance tracking
│   │   ├── LightningClient.ts  # LND gRPC adapter
│   │   ├── WalletManager.ts    # UTXO management
│   │   └── FeeEstimator.ts     # Fee estimation
│   ├── api/
│   │   ├── server.ts           # Express + WebSocket server
│   │   ├── routes.ts           # REST API routes (Runes bridge)
│   │   ├── bitmap-routes.ts    # REST API routes (Bitmap marketplace)
│   │   └── websocket.ts        # WebSocket handler
│   ├── cli/
│   │   ├── index.ts            # CLI entry point
│   │   └── commands/           # deposit, withdraw, status, balance, bitmap
│   ├── types/
│   │   └── index.ts            # TypeScript types + Zod schemas
│   └── utils/
│       ├── config.ts           # Configuration loader
│       ├── logger.ts           # Pino logger
│       └── errors.ts           # Error classes
├── tests/
│   ├── unit/                   # Unit tests (HTLC, swap logic)
│   ├── integration/            # Integration tests (requires infra)
│   └── mocks/                  # Mock Lightning/Indexer clients
├── docs/
│   ├── ARCHITECTURE.md         # Technical architecture document
│   └── SECURITY.md             # Security model + audit checklist
├── docker-compose.yml          # Production Docker setup
├── docker-compose.dev.yml      # Development overrides (regtest)
├── Dockerfile                  # RuneBolt container
├── .env.example                # Environment variable template
└── README.md
```

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests (requires running infrastructure)
RUN_INTEGRATION=1 npm run test:integration

# All tests
npm test
```

## How It Works

1. **Runes** are UTXO-based fungible tokens on Bitcoin, encoded via OP_RETURN "Runestones"
2. **Lightning** provides instant payments using payment hashes and preimages
3. **RuneBolt** bridges them using submarine swaps — the same SHA-256 preimage locks both the on-chain HTLC and the Lightning payment
4. **Atomic**: Either both sides complete, or neither does. Timeouts ensure refunds.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical deep-dive.
See [docs/SECURITY.md](docs/SECURITY.md) for the security model and audit checklist.

## Block Genomics Ecosystem

RuneBolt is part of the **Block Genomics** platform:

- **Bitmap Ownership** — Discover and manage Bitcoin Bitmap parcels
- **Guardian AI Agents** — AI-powered agents for Bitcoin asset management
- **RuneBolt Bridge** — Instant Runes transfers over Lightning (this project)

Together, these tools form a complete Bitcoin-native asset infrastructure layer.

Visit [blockgenomics.io](https://blockgenomics.io) to learn more.

## Contributing

RuneBolt is open-source and welcomes contributions.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a Pull Request

For major changes, please open an issue first to discuss the approach.

**Maintained by [Block Genomics](https://blockgenomics.io) | GitHub: [gary-moto](https://github.com/gary-moto)**

## License

MIT License. See [LICENSE](LICENSE) for details.

---

*RuneBolt — bridging Runes to Lightning, one swap at a time.*
