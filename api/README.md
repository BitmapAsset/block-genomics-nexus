# Block Genomics — API Reference

Production API for the Block Genomics Bitcoin-native identity platform.

**Base URL:** `https://api.blockgenomics.io/api/v1` (or `http://localhost:3000/api/v1` in dev)

---

## Response Format

All endpoints return consistent JSON:

```json
{
  "success": true,
  "data": { ... }
}
```

Errors:

```json
{
  "success": false,
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable description"
  }
}
```

---

## Authentication

Most read endpoints are public. Write endpoints (challenge, verify) use BIP-322 challenge–response signing — no API keys, no JWTs.

---

## Rate Limits

All endpoints are rate-limited per IP (sliding window):

| Endpoint       | Limit         |
|----------------|---------------|
| `POST /challenge` | 10 req / min |
| `POST /verify`    | 5 req / min  |
| `GET /agent/:id`  | 30 req / min |
| `GET /block/:h`   | 20 req / min |
| `GET /badge/:id`  | 60 req / min |
| `GET /search`     | 20 req / min |
| `GET /leaderboard`| 15 req / min |

When exceeded, the response is:
```json
{ "success": false, "error": { "code": "RATE_LIMITED", "message": "Rate limit exceeded. Try again in Ns" } }
```

---

## Endpoints

### 1. `POST /api/v1/challenge`

Issue a BIP-322 verification challenge.

**Request:**
```json
{
  "blockHeight": 500000,
  "agentId": "my-agent-name"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `blockHeight` | integer | ✅ | Bitcoin block height (≥ 0) |
| `agentId` | string | ✅ | Agent identifier (1–128 chars) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "challengeId": "a1b2c3d4...",
    "message": "Block Genomics Agent Verification\n===...",
    "nonce": "32-char-hex",
    "expiresAt": "2026-02-06T12:05:00.000Z",
    "blockHeight": 500000
  }
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `INVALID_JSON` | 400 | Malformed request body |
| `VALIDATION_ERROR` | 400 | Missing or invalid fields |
| `BLOCK_NOT_FOUND` | 404 | Block height doesn't exist |
| `RATE_LIMITED` | 429 | Too many requests |

---

### 2. `POST /api/v1/verify`

Submit a BIP-322 signed challenge to complete verification. On success, creates or updates the Agent and Block records.

**Request:**
```json
{
  "challengeId": "a1b2c3d4...",
  "address": "bc1q...",
  "signature": "base64-encoded-bip322-signature",
  "agentName": "My Agent",
  "isAI": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challengeId` | string | ✅ | Challenge ID from `/challenge` |
| `address` | string | ✅ | Bitcoin address that signed |
| `signature` | string | ✅ | Base64 BIP-322 signature |
| `agentName` | string | ❌ | Display name (defaults to agentId) |
| `isAI` | boolean | ❌ | Whether agent is AI-powered (default false) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "bg_a3f7b2c1d4e5f6a7",
      "name": "My Agent",
      "blockHeight": 500000,
      "genome": "a3f7b2c1d4e5f6a7...",
      "tier": 1,
      "trustScore": 72,
      "isAI": false,
      "verified": true,
      "verifiedAt": "2026-02-06T12:00:00.000Z"
    },
    "genome": "64-char-hex",
    "dnaSequence": "ATCGATCG...",
    "traits": {
      "primaryColor": "a3f7b2",
      "secondaryColor": "c1d4e5",
      "pattern": "helix",
      "rarity": "rare",
      "era": "Halving 2",
      "notable": ["Contains Taproot Transactions"]
    },
    "trustScore": 72,
    "trustComponents": {
      "total": 72,
      "age": { "score": 20, "max": 25, "years": "8.2" },
      "richness": { "score": 15, "max": 25 },
      "security": { "score": 17, "max": 20 },
      "ownership": { "score": 20, "max": 20 },
      "history": { "score": 10, "max": 10 }
    },
    "bitmapOwned": true,
    "block": {
      "height": 500000,
      "hash": "00000000...",
      "timestamp": 1509343584,
      "txCount": 2701
    }
  }
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `CHALLENGE_NOT_FOUND` | 400 | Challenge ID doesn't exist |
| `CHALLENGE_EXPIRED` | 400 | Challenge older than 5 minutes |
| `CHALLENGE_ALREADY_USED` | 400 | Nonce already consumed |
| `SIGNATURE_INVALID` | 400 | Signature structural check failed |
| `BLOCK_NOT_FOUND` | 404 | Referenced block doesn't exist |

---

### 3. `GET /api/v1/agent/:id`

Retrieve an agent profile with trust score, delegation info, and verification history.

**Path parameter:** `id` — Agent ID (e.g. `bg_a3f7b2c1d4e5f6a7`)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "bg_a3f7...",
    "name": "My Agent",
    "description": null,
    "blockHeight": 500000,
    "blockHash": "00000000...",
    "genome": "a3f7b2c1...",
    "tier": 1,
    "trustScore": 72,
    "trustComponents": { ... },
    "walletAddress": "bc1q...",
    "isAI": false,
    "profileColor": "#00FF41",
    "verified": true,
    "verifiedAt": "2026-02-06T...",
    "createdAt": "2026-02-06T...",
    "verificationCount": 3,
    "delegationsAsParent": [
      { "id": "...", "childAgentId": "bg_...", "tier": 2, "grantedAt": "..." }
    ],
    "delegationsAsChild": [],
    "block": { "height": 500000, "hash": "...", "genome": "..." }
  }
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `AGENT_NOT_FOUND` | 404 | No agent with this ID |

---

### 4. `GET /api/v1/block/:height`

Retrieve block data with genome, traits, and claiming agent.

**Path parameter:** `height` — Bitcoin block height (integer ≥ 0)

Returns cached data from local DB when available, otherwise fetches from mempool.space in real time.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "height": 500000,
    "hash": "00000000...",
    "merkleRoot": "...",
    "timestamp": "2017-10-30T...",
    "difficulty": 1873105475221.611,
    "txCount": 2701,
    "genome": "a3f7b2c1...",
    "traits": {
      "primaryColor": "a3f7b2",
      "pattern": "helix",
      "rarity": "rare",
      "era": "Halving 2"
    },
    "claimedBy": {
      "id": "bg_...",
      "name": "My Agent",
      "tier": 1,
      "trustScore": 72
    },
    "cached": true
  }
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `BLOCK_NOT_FOUND` | 404 | Block not found on chain |
| `VALIDATION_ERROR` | 400 | Invalid height format |

---

### 5. `GET /api/v1/badge/:id`

Returns a dynamically generated SVG verification badge. Designed for `<img>` embedding.

**Path parameter:** `id` — Agent ID (optionally with `.svg` suffix)

**Query parameters:**
| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `theme` | `dark`, `light` | `dark` | Badge colour theme |

**Response:** `Content-Type: image/svg+xml`

**Embed code:**
```html
<a href="https://blockgenomics.io/agent/bg_a3f7...">
  <img src="https://api.blockgenomics.io/api/v1/badge/bg_a3f7..." width="320" height="72" />
</a>
```

---

### 6. `GET /api/v1/search`

Search across agents, blocks, and genomes.

**Query parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | ✅ | — | Search query (1–200 chars) |
| `type` | string | ❌ | `all` | `agents`, `blocks`, or `all` |
| `limit` | integer | ❌ | `10` | Results per category (1–50) |
| `offset` | integer | ❌ | `0` | Pagination offset |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "query": "500000",
    "agents": [
      { "id": "bg_...", "name": "...", "blockHeight": 500000, "trustScore": 72 }
    ],
    "blocks": [
      { "height": 500000, "hash": "...", "txCount": 2701 }
    ],
    "totalAgents": 3,
    "totalBlocks": 1
  }
}
```

---

### 7. `GET /api/v1/leaderboard`

Ranked list of verified agents by trust score.

**Query parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | integer | ❌ | `25` | Entries per page (1–100) |
| `offset` | integer | ❌ | `0` | Pagination offset |
| `tier` | integer | ❌ | all | Filter by tier (1, 2, or 3) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "rank": 1,
        "id": "bg_...",
        "name": "Genesis Holder",
        "blockHeight": 0,
        "tier": 1,
        "trustScore": 95,
        "trustTier": "diamond",
        "isAI": false,
        "verificationCount": 12,
        "verifiedAt": "2026-01-15T..."
      }
    ],
    "total": 1024,
    "limit": 25,
    "offset": 0
  }
}
```

**Trust tiers:**
| Score | Tier |
|-------|------|
| 91–100 | diamond |
| 76–90 | platinum |
| 51–75 | gold |
| 26–50 | silver |
| 1–25 | bronze |
| 0 | unranked |

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_JSON` | Request body is not valid JSON |
| `VALIDATION_ERROR` | Input validation failed |
| `BLOCK_NOT_FOUND` | Bitcoin block not found |
| `AGENT_NOT_FOUND` | Agent not in database |
| `CHALLENGE_NOT_FOUND` | Challenge ID unknown |
| `CHALLENGE_EXPIRED` | Challenge older than 5 min |
| `CHALLENGE_ALREADY_USED` | Nonce already consumed (replay) |
| `SIGNATURE_INVALID` | BIP-322 signature check failed |
| `ADDRESS_MISMATCH` | Signer address doesn't match |
| `INVALID_TIER` | Delegation tier not 2 or 3 |
| `PARENT_NOT_FOUND` | Delegating parent not found |
| `PARENT_TIER_TOO_LOW` | Parent can't delegate this tier |
| `NOT_AUTHORIZED` | Requester lacks permission |
| `ALREADY_DELEGATED` | Active delegation already exists |
| `DELEGATION_NOT_FOUND` | Delegation record not found |
| `RATE_LIMITED` | Too many requests |
| `API_ERROR` | Upstream API failure |
| `TIMEOUT` | Upstream request timed out |
| `INTERNAL_ERROR` | Unexpected server error |

---

## External APIs

| API | Usage | Rate Limit |
|-----|-------|------------|
| `mempool.space/api` | Block data, transactions | ~5 req/s |
| `api.hiro.so/ordinals/v1` | Bitmap inscription detection | ~3 req/s |

All external calls have:
- 15-second timeout
- Exponential backoff (1s → 2s → 4s)
- Up to 3 retries on 5xx or timeout
- In-memory caching (5–10 min TTL)
- Token-bucket rate limiting

---

## Architecture

```
api/
├── README.md                  ← You are here
├── lib/
│   ├── blockchain.ts          ← mempool.space + Hiro API client
│   ├── genome.ts              ← Deterministic genome generation
│   ├── verification.ts        ← BIP-322 challenge/verify flow
│   └── delegation.ts          ← Delegation management (DB)
├── routes/
│   ├── challenge.ts           ← POST /api/v1/challenge
│   ├── verify.ts              ← POST /api/v1/verify
│   ├── agent.ts               ← GET  /api/v1/agent/:id
│   ├── block.ts               ← GET  /api/v1/block/:height
│   ├── badge.ts               ← GET  /api/v1/badge/:id (SVG)
│   ├── search.ts              ← GET  /api/v1/search?q=
│   └── leaderboard.ts         ← GET  /api/v1/leaderboard
└── middleware/
    ├── rate-limit.ts          ← Sliding-window rate limiter
    ├── cors.ts                ← CORS headers
    └── validate.ts            ← Input validation helpers
```

---

## Integration with Next.js

These files are standalone modules. To wire them into the existing Next.js stub routes:

```ts
// app/src/app/api/v1/challenge/route.ts
export { POST } from '../../../../api/routes/challenge';

// app/src/app/api/v1/verify/route.ts
export { POST } from '../../../../api/routes/verify';

// app/src/app/api/v1/agent/[id]/route.ts
export { GET } from '../../../../../api/routes/agent';

// app/src/app/api/v1/block/[height]/route.ts
export { GET } from '../../../../../api/routes/block';

// app/src/app/api/v1/badge/[id]/route.ts
export { GET } from '../../../../../api/routes/badge';
```

Or copy the handler bodies into the existing stub files — the business logic is identical.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `MEMPOOL_API_URL` | `https://mempool.space/api` | Mempool.space API base |
| `HIRO_API_URL` | `https://api.hiro.so/ordinals/v1` | Hiro Ordinals API base |
| `CORS_ALLOWED_ORIGINS` | `*` | Comma-separated allowed origins |
