# Block Genomics — Verification API Server

Server-side challenge-response verification for Bitcoin block ownership using BIP-322 signatures and Bitmap inscriptions.

## Architecture

```
Client                          API Server                    Bitcoin Network
  │                                │                              │
  ├─ POST /challenge ─────────────►│                              │
  │◄─── challengeId + message ─────┤                              │
  │                                │                              │
  │ (user signs message            │                              │
  │  with wallet)                  │                              │
  │                                │                              │
  ├─ POST /verify ─────────────────►│                              │
  │                                ├─ verify BIP-322 signature    │
  │                                ├─ check bitmap ownership ─────►│ Hiro API
  │                                ├─ fetch block data ───────────►│ Blockstream
  │                                ├─ generate genome             │
  │                                ├─ calculate trust score       │
  │◄─── verified + agent record ───┤                              │
```

## Quick Start

```bash
# Install dependencies
npm install

# Development (hot reload)
npm run dev

# Production build
npm run build
npm start
```

Server runs on `http://localhost:3100` by default.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3100` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Comma-separated allowed origins |

## API Endpoints

### `POST /api/v1/challenge`

Generate a verification challenge for signing.

**Request:**
```json
{
  "blockHeight": 840000,
  "agentName": "SatoshiNode",
  "walletAddress": "bc1q..."
}
```

**Response (201):**
```json
{
  "challengeId": "uuid-v4",
  "challengeMessage": "Block Genomics Verification\n===...",
  "expiresAt": "2024-01-01T00:05:00.000Z"
}
```

### `POST /api/v1/verify`

Verify a signed challenge. Performs:
1. Challenge lookup + expiry check
2. BIP-322 signature verification
3. Bitmap inscription ownership check
4. Deterministic genome generation
5. Trust score calculation
6. Agent record creation/update

**Request:**
```json
{
  "challengeId": "uuid-v4",
  "signature": "base64-encoded-signature",
  "address": "bc1q...",
  "blockHeight": 840000
}
```

**Response (200):**
```json
{
  "verified": true,
  "agent": {
    "id": "uuid-v4",
    "name": "SatoshiNode",
    "blockHeight": 840000,
    "genome": "a1b2c3d4...64-hex-chars",
    "genomeVersion": 1,
    "trustScore": 85,
    "trustFactors": {
      "signatureValid": true,
      "bitmapOwnership": true,
      "blockExists": true,
      "addressFormat": "segwit-native",
      "inscriptionAge": 180,
      "blockAge": 365
    },
    "verifiedAt": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "signatureType": "segwit"
  }
}
```

### `GET /api/v1/agent/:id`

Get public agent profile by UUID.

### `GET /api/v1/block/:height`

Get block data including genome and verification status. Block data is fetched live from the Bitcoin network (Blockstream API) and the genome is always computed deterministically.

### `GET /api/v1/badge/:id.svg`

Dynamic SVG badge showing agent name, block, trust score, and verification status. Designed for embedding in profiles, READMEs, etc.

### `GET /api/v1/search?q=query`

Search agents by name, block height, or genome prefix.

### `GET /health`

Health check endpoint.

### `GET /api/v1`

API documentation / endpoint listing.

## Security Measures

| Measure | Implementation |
|---|---|
| **Rate Limiting** | Per-IP sliding window: 10/min (challenge), 5/min (verify), 60/min (general) |
| **Challenge Expiry** | 5-minute TTL, auto-purged every 30s |
| **Replay Protection** | One-time use — challenges marked `used` immediately on verify attempt |
| **Input Validation** | Strict validation on all endpoints (address format, block range, UUID format, etc.) |
| **CORS** | Restricted to configured origins only |
| **Security Headers** | Helmet.js (CSP, HSTS, X-Frame-Options, etc.) |
| **Body Limit** | 10KB max request body |
| **No Sensitive Data** | Wallet addresses excluded from public agent responses |
| **Error Handling** | Generic errors — no stack traces or internals leaked |

## Trust Score Breakdown

| Factor | Points | Description |
|---|---|---|
| Signature Valid | +40 | BIP-322 signature verified cryptographically |
| Bitmap Ownership | +25 | Address holds the `.bitmap` inscription |
| Block Exists | +15 | Block confirmed on Bitcoin mainnet |
| Address Format | +3-10 | Taproot (10), Native SegWit (8), P2SH (5), Legacy (3) |
| Inscription Age | +0-5 | Older inscriptions score higher |
| Block Age | +1-5 | Older blocks score higher |

**Max possible: 100**

## BIP-322 Support

| Address Type | Status | Notes |
|---|---|---|
| Legacy (P2PKH) `1...` | ✅ Verified | via bitcoinjs-message |
| SegWit (P2SH-P2WPKH) `3...` | ✅ Verified | via bitcoinjs-message |
| Native SegWit (P2WPKH) `bc1q...` | ✅ Verified | via bitcoinjs-message |
| Taproot (P2TR) `bc1p...` | ⚠️ Flagged | Pending manual review (Schnorr not yet auto-verified) |

## Genome Determinism

The genome is a SHA-256 hash of canonical block data:

```
version + blockHash + merkleRoot + timestamp + nonce +
bits + difficulty + txCount + size + weight
```

Keys are sorted alphabetically before JSON serialization to guarantee the same genome output regardless of object property order.

## Tech Stack

- **Runtime:** Node.js 18+ with TypeScript
- **Framework:** Express 4
- **Signature Verification:** bitcoinjs-message
- **Block Data:** Blockstream API
- **Bitmap Verification:** Hiro Ordinals API
- **Storage:** In-memory (Map with TTL) — swap for Redis/PostgreSQL in production

## File Structure

```
api-server/
├── server.ts                 # Main server + middleware chain
├── types.ts                  # All TypeScript type definitions
├── routes/
│   ├── challenge.ts          # POST /challenge — generate challenges
│   ├── verify.ts             # POST /verify — signature verification
│   ├── agent.ts              # GET /agent/:id + GET /search
│   ├── block.ts              # GET /block/:height
│   └── badge.ts              # GET /badge/:id.svg
├── lib/
│   ├── bip322.ts             # BIP-322 signature verification
│   ├── bitmap.ts             # Bitmap inscription lookup
│   ├── genome.ts             # Deterministic genome generation
│   └── trust-score.ts        # Trust score calculation
├── middleware/
│   ├── rate-limit.ts         # Per-IP rate limiting
│   └── validate.ts           # Input validation
├── package.json
├── tsconfig.json
└── README.md
```
