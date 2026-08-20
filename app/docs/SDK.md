# Block Genomics SDK Quick Start

A JavaScript/TypeScript guide for integrating with the Block Genomics protocol.

> **Base URL:** `https://blockgenomics.io/api/v1`

---

## Installation

Block Genomics doesn't ship a dedicated SDK package — it's a REST API. Use `fetch` or any HTTP client.

For Bitcoin wallet signing, you'll need:

```bash
npm install bip322-js @noble/curves @noble/hashes
```

For browser wallet integration:

```bash
npm install sats-connect
```

---

## Sandbox Tier (no wallet, no Bitmap required)

You do not need to own a Bitmap block to start building. Mint a read-only sandbox
key and call the API immediately.

```bash
curl -X POST https://blockgenomics.io/api/v1/sandbox/key \
  -H 'Content-Type: application/json' \
  -d '{"label":"my-first-integration"}'
```

```jsonc
{
  "success": true,
  "data": {
    "apiKey": "bg_sbx_…",   // returned ONCE — store it now
    "tier": "sandbox",
    "access": "read-only",
    "dailyLimit": 100
  }
}
```

Send it as a bearer token (or `X-API-Key`) on any read endpoint:

```js
const SANDBOX_KEY = process.env.BG_SANDBOX_KEY;

const res = await fetch('https://blockgenomics.io/api/v1/blocks/840000', {
  headers: { Authorization: `Bearer ${SANDBOX_KEY}` },
});

console.log(res.headers.get('X-RateLimit-Remaining')); // e.g. "99"
```

Confirm a key is live and see what's left:

```bash
curl https://blockgenomics.io/api/v1/sandbox/whoami \
  -H "Authorization: Bearer $BG_SANDBOX_KEY"
```

### Limits

| | Sandbox | Verified (Bitmap owner) |
|---|---|---|
| Ownership proof | none | BIP-322 signature |
| Reads | ✅ 100 / UTC day | ✅ |
| Writes (register, world, experiences) | ❌ `403 sandbox_read_only` | ✅ |
| Issuance | 3 keys per IP per day | — |

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
`X-RateLimit-Reset` (Unix seconds). Exceeding the quota returns `429` with
`Retry-After`.

### Upgrading from sandbox

Writes are gated on Bitmap ownership, not on a paid plan. A write attempted with a
sandbox key returns a `403` that spells out the path:

```jsonc
{
  "success": false,
  "code": "sandbox_read_only",
  "upgrade": {
    "steps": [
      "POST /api/v1/challenge — request a signing challenge",
      "Sign the challenge with the Bitcoin wallet that owns your Bitmap block (BIP-322)",
      "POST /api/v1/auth/verify — exchange the signature for verified-tier access"
    ]
  }
}
```

Once you own a block, follow [Verify a Wallet](#3-verify-a-wallet) below — the
sandbox key is no longer needed.

---

## Quick Start

### 1. Connect a Wallet

Detect and connect to a Bitcoin wallet in the browser:

```typescript
type WalletType = "unisat" | "xverse" | "leather";

function detectWallets(): WalletType[] {
  const wallets: WalletType[] = [];
  if (typeof window !== "undefined") {
    if (window.unisat) wallets.push("unisat");
    if (window.BitcoinProvider) wallets.push("xverse");
    if (window.LeatherProvider) wallets.push("leather");
  }
  return wallets;
}

async function connectWallet(type: WalletType): Promise<string> {
  switch (type) {
    case "unisat": {
      const accounts = await window.unisat.requestAccounts();
      return accounts[0];
    }
    case "xverse": {
      const response = await window.BitcoinProvider.request("getAddresses");
      const taproot = response.result.addresses.find(
        (a: any) => a.purpose === "ordinals"
      );
      return taproot?.address || response.result.addresses[0].address;
    }
    case "leather": {
      const response = await window.LeatherProvider.request("getAddresses");
      const taproot = response.result.addresses.find(
        (a: any) => a.type === "p2tr"
      );
      return taproot?.address || response.result.addresses[0].address;
    }
  }
}
```

### 2. Sign a Message (BIP-322)

```typescript
async function signMessage(
  type: WalletType,
  message: string,
  address?: string
): Promise<string> {
  switch (type) {
    case "unisat":
      return window.unisat.signMessage(message, "bip322-simple");
    case "xverse":
      return window.BitcoinProvider.request("signMessage", {
        address,
        message,
        protocol: "BIP322",
      });
    case "leather": {
      const resp = await window.LeatherProvider.request("signMessage", {
        message,
        paymentType: "p2tr",
      });
      return resp.result.signature;
    }
  }
}
```

### 3. Verify a Wallet

The full verification flow:

```typescript
const BASE = "https://blockgenomics.io/api/v1";

async function verifyWallet(
  walletType: WalletType,
  walletAddress: string,
  handle: string,
  blockHeight?: number
) {
  // Step 1: Request challenge
  const challengeRes = await fetch(`${BASE}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  const { nonce, message } = await challengeRes.json();

  // Step 2: Sign with wallet
  const signature = await signMessage(walletType, message, walletAddress);

  // Step 3: Verify on server
  const verifyRes = await fetch(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      signature,
      message,
      handle,
      blockHeight,
    }),
  });

  return verifyRes.json();
  // → { verified: true, walletAddress, handle, genomeHash, tier }
}
```

---

## Core Operations

### Check Handle Availability

```typescript
async function checkHandle(handle: string): Promise<boolean> {
  const res = await fetch(`${BASE}/auth/verify?handle=${handle}`);
  const data = await res.json();
  return data.available;
}
```

### Look Up a User

```typescript
// By handle
async function getUserByHandle(handle: string) {
  const res = await fetch(`${BASE}/users/by-handle/${handle}`);
  if (!res.ok) return null;
  return res.json();
}

// By wallet address
async function getUserByWallet(address: string) {
  const res = await fetch(`${BASE}/users/by-wallet/${address}`);
  if (!res.ok) return null;
  return res.json();
}
```

### Get Block Data

```typescript
async function getBlock(height: number) {
  const res = await fetch(`${BASE}/blocks/${height}`);
  return res.json();
}

async function getBlockParcels(height: number) {
  const res = await fetch(`${BASE}/blocks/${height}/parcels`);
  return res.json();
}
```

---

## BitmapAgent (Agent Connect)

The `/api/v1/agents/*` surface lets an autonomous agent register itself on a block it owns, heartbeat liveness, and poll a real-time event stream driven by actual user actions (visitor page views, chat messages, guardian escalations, world writes, delegation listings). Full contract in `public/openapi.json` (tag: **Agents**).

### End-to-end lifecycle

```
own block on-chain
      │
      ▼
POST /api/v1/challenge { purpose: 'agent-register' }
      │  → { message, nonce }
      ▼
sign(message) with BIP-322 (owner wallet)
      │
      ▼
POST /api/v1/agents/register  ← consumes challenge, checks block ownership
      │  → { id: agentId, ... }
      ▼
loop {
  POST  /api/v1/agents/{agentId}/heartbeat        every ~30s
  GET   /api/v1/agents/{agentId}/events?since=... continuously
  POST  /api/v1/agents/{agentId}/brief             periodic digest (optional)
}
```

Ownership + replay protection: the register route rejects with `401` if the challenge is missing/expired/already-used or the BIP-322 signature doesn't verify, and with `403` if the signer wallet doesn't own `blockHeight` (checked against the synced `Block` table and the verified `User`'s `anchorBlock`/`ownedBlocks`).

### Register an agent

```bash
# 1) Request a challenge
curl -sX POST https://blockgenomics.io/api/v1/challenge \
  -H 'content-type: application/json' \
  -d '{"walletAddress":"bc1p...","purpose":"agent-register"}'
# → {"success":true,"data":{"message":"Block Genomics verification: <nonce>","nonce":"<nonce>"}}

# 2) Sign the `message` with your BIP-322 signer (Unisat/Xverse/Leather or bip322-js).

# 3) Register
curl -sX POST https://blockgenomics.io/api/v1/agents/register \
  -H 'content-type: application/json' \
  -d '{
    "walletAddress":"bc1p...",
    "endpointUrl":"https://agent.example.com",
    "blockHeight":840128,
    "tier":1,
    "permissions":["READ_DMS","SEND_DMS"],
    "signature":"<bip322-signature>",
    "challenge":"Block Genomics verification: <nonce>"
  }'
# → { "success": true, "data": { "id":"<agentId>", ... } }
```

Errors: `400` missing/invalid input · `401` bad signature or spent challenge · `403` not the block owner · `409` tier agent cap reached (T1=10, T2=3, T3=1 per block) · `429` 24h cooldown active for this wallet.

### Heartbeat + event polling

```bash
# heartbeat every 30s
curl -sX POST https://blockgenomics.io/api/v1/agents/<agentId>/heartbeat

# poll new events
curl -s "https://blockgenomics.io/api/v1/agents/<agentId>/events?since=2026-07-09T00:00:00Z&limit=100"
```

Event types the poll returns:

| type | producer | trigger |
|------|----------|---------|
| `visitor_arrived` | `GET /api/v1/profiles/by-block/{height}` | Someone loaded the block profile (deduped ~10min per visitor). |
| `dm_received` | `POST /api/v1/chat/{blockHeight}` (channel=dm) + `POST /api/v1/guardian/chat` | A visitor DM'd the block or messaged its guardian. |
| `chat_message` | `POST /api/v1/chat/{blockHeight}` (channel=block) | Public chat on the block. |
| `listing_created` | `POST /api/v1/delegations/listings` | Owner created/updated a delegation listing. |
| `world_updated` | `POST /api/v1/world` + `POST /api/v1/world/batch` | Owner mutated the block's 3D world. |
| `escalation` | `POST /api/v1/guardian/chat` (no-LLM path) | Guardian escalated to owner because no LLM is configured. |
| `heartbeat` | `POST /api/v1/agents/{agentId}/heartbeat` | Written alongside every heartbeat. |
| `permission_request` | `DELETE /api/v1/agents/{agentId}` | Revocation ledger. |

Payloads are small JSON — `actor`, short `summary`, and resource ids only. **They never contain LLM keys, emails, wallet signatures, or private fields.**

### CLI

The `block-genomics` npm package ships a CLI that wraps the same flow:

```bash
npx block-genomics verify --address bc1p... --sig <bip322-sig> --block 840128
npx block-genomics register-agent --block 840128 --endpoint https://agent.example.com --tier 1
npx block-genomics events poll --agent <agentId>      # long-poll, JSON lines
npx block-genomics heartbeat --agent <agentId>
```

Configure via env: `BG_API_URL` (default `https://blockgenomics.io`), `BG_WALLET_ADDRESS`, `BG_SIGNATURE_CMD` (a shell command that reads the challenge on stdin and prints a BIP-322 signature on stdout — so you can plug in a hardware wallet or the bip322-js CLI).

---

## Guardian Shell

### Create a Guardian

```typescript
async function createGuardian(
  walletType: WalletType,
  walletAddress: string,
  config: {
    blockHeight: number;
    name: string;
    llmProvider: "openai" | "anthropic" | "google" | "xai" | "custom";
    llmModel: string;
    llmApiKey: string;
    personality?: string;
  }
) {
  // Get challenge & sign
  const { message } = await fetch(`${BASE}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  }).then((r) => r.json());

  const signature = await signMessage(walletType, message, walletAddress);

  const res = await fetch(`${BASE}/guardian`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...config,
      ownerAddress: walletAddress,
      signature,
      message,
    }),
  });

  return res.json();
}
```

### Chat with a Guardian

```typescript
async function chatWithGuardian(
  blockHeight: number,
  message: string,
  visitorHandle?: string
) {
  const res = await fetch(`${BASE}/guardian/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blockHeight,
      message,
      visitorHandle,
    }),
  });

  return res.json();
  // → { response: "...", source: "llm", conversationId: "..." }
}
```

---

## Guardian Monitor API

For programmatic guardian management from external agents.

### Pair with a Guardian

```typescript
async function pairMonitor(
  monitorToken: string,
  guardianId: string,
  walletAddress: string,
  webhookUrl?: string
) {
  const res = await fetch(`${BASE}/guardian/monitor/pair`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${monitorToken}`,
    },
    body: JSON.stringify({ guardianId, walletAddress, webhookUrl }),
  });

  return res.json();
  // → { paired: true, guardianName: "...", blockHeight: 720143 }
}
```

### Send Commands

```typescript
type MonitorCommand =
  | "get_status"
  | "update_personality"
  | "update_soul"
  | "update_agent"
  | "update_auto_responses"
  | "pause"
  | "resume";

async function sendCommand(
  token: string,
  guardianId: string,
  command: MonitorCommand,
  params?: Record<string, unknown>
) {
  const res = await fetch(`${BASE}/guardian/monitor/command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ guardianId, command, params }),
  });

  return res.json();
}

// Examples:
await sendCommand(token, guardianId, "get_status");
await sendCommand(token, guardianId, "pause");
await sendCommand(token, guardianId, "update_personality", {
  personality: "A wise and friendly guide to Bitcoin history",
});
```

### Get Conversations & Events

```typescript
async function getConversations(token: string, guardianId: string) {
  const res = await fetch(
    `${BASE}/guardian/monitor/conversations?guardianId=${guardianId}&limit=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}

async function getEvents(
  token: string,
  guardianId: string,
  type = "all"
) {
  const res = await fetch(
    `${BASE}/guardian/monitor/events?guardianId=${guardianId}&type=${type}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}

async function getSummary(
  token: string,
  guardianId: string,
  hours = 24
) {
  const res = await fetch(
    `${BASE}/guardian/monitor/summary?guardianId=${guardianId}&hours=${hours}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}
```

---

## Explore the Nexus

### List Users

```typescript
async function listUsers(limit = 50, offset = 0) {
  const res = await fetch(
    `${BASE}/users/list?limit=${limit}&offset=${offset}`
  );
  return res.json();
  // → { users: [...], total: 142, limit: 50, offset: 0 }
}
```

### Browse Parcel Rental Listings

```typescript
async function getDelegationListings(options?: {
  blockHeight?: number;
  tier?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (options?.blockHeight)
    params.set("blockHeight", String(options.blockHeight));
  if (options?.tier) params.set("tier", String(options.tier));
  if (options?.limit) params.set("limit", String(options.limit));
  params.set("active", "true");

  const res = await fetch(`${BASE}/delegations/listings?${params}`);
  return res.json();
}
```

### Scan Inscriptions

```typescript
async function scanInscriptions(address: string) {
  const res = await fetch(
    `${BASE}/inscriptions/scan?address=${address}`
  );
  return res.json();
  // → { inscriptions: [...], count: 3 }
}
```

---

## World Building

### Read World State

```typescript
async function getWorld(blockHeight: number) {
  const res = await fetch(`${BASE}/world?blockHeight=${blockHeight}`);
  return res.json();
  // → { objects: [...], terrain: { ... } }
}
```

### Place an Object

```typescript
async function placeObject(
  walletType: WalletType,
  walletAddress: string,
  blockHeight: number,
  object: {
    objectType: string;
    posX: number;
    posY: number;
    posZ: number;
    color?: string;
  }
) {
  const { message } = await fetch(`${BASE}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  }).then((r) => r.json());

  const signature = await signMessage(walletType, message, walletAddress);

  const res = await fetch(`${BASE}/world`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blockHeight,
      ownerAddress: walletAddress,
      ...object,
      signature,
      message,
    }),
  });

  return res.json();
}
```

### Batch Operations (Up to 100)

A batch is **all-or-nothing**: a `2xx` means every sub-operation applied, and any
other status means none of them did. A failed sub-operation is never reported
inside a `2xx`, so the status code is the whole answer.

Retrying is safe after `400`, `403`, `429` or `503` — nothing was applied and the
nonce was not spent, so re-send the identical request. A `500 batch_failed` also
applied nothing, but it *did* spend the nonce: sign again with a fresh challenge.
Retrying a batch that already succeeded will duplicate its `create` sub-operations,
so if a response is lost, reconcile with `GET /world?blockHeight=…` before
re-sending. Full rules: [spec §7.3](https://blockgenomics.io/protocol).

If you already hold a `bg_vfy_` session token covering the block, skip the
challenge/signature round-trip entirely — send the token and the operations:

```typescript
async function batchWorldOpsWithSession(
  sessionToken: string,
  blockHeight: number,
  operations: Array<{
    action: "create" | "update" | "delete";
    id?: string;
    data?: Record<string, unknown>;
  }>
) {
  const res = await fetch(`${BASE}/world/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    // No ownerAddress: the write is attributed to the session's wallet.
    body: JSON.stringify({ blockHeight, operations }),
  });

  return res.json();
}
```

Or with a wallet signature, which binds the hash of the entire batch:

```typescript
async function batchWorldOps(
  walletType: WalletType,
  walletAddress: string,
  blockHeight: number,
  operations: Array<{
    action: "create" | "update" | "delete";
    id?: string;
    data?: Record<string, unknown>;
  }>
) {
  const { message } = await fetch(`${BASE}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  }).then((r) => r.json());

  const signature = await signMessage(walletType, message, walletAddress);

  const res = await fetch(`${BASE}/world/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blockHeight,
      ownerAddress: walletAddress,
      operations,
      signature,
      message,
    }),
  });

  return res.json();
}
```

---

## Lightning Payments

### Create and Monitor an Invoice

```typescript
async function createInvoice(
  amountUsd: number,
  description: string,
  correlationId: string
) {
  const res = await fetch(`${BASE}/lightning/invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountUsd, description, correlationId }),
  });
  return res.json();
  // → { bolt11: "lnbc...", invoiceId: "...", expiresAt: "..." }
}

async function pollPayment(
  invoiceId: string,
  intervalMs = 3000
): Promise<boolean> {
  return new Promise((resolve) => {
    const check = async () => {
      const res = await fetch(`${BASE}/lightning/status/${invoiceId}`);
      const { paid, state } = await res.json();

      if (paid) return resolve(true);
      if (state === "expired" || state === "error") return resolve(false);

      setTimeout(check, intervalMs);
    };
    check();
  });
}

// Usage:
const invoice = await createInvoice(5.0, "Delegation purchase", "del_123");
console.log("Pay this invoice:", invoice.bolt11);
const paid = await pollPayment(invoice.invoiceId);
console.log(paid ? "Payment received!" : "Payment failed/expired");
```

---

## End-to-End Encryption

Block Genomics uses Bitcoin-native encryption for private messages:

```typescript
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { hkdf } from "@noble/hashes/hkdf";
import { sha512 } from "@noble/hashes/sha512";

// Step 1: Derive encryption keypair from wallet signature
const DERIVATION_MSG =
  "Block Genomics E2E Key Derivation — sign to enable encrypted messaging";

async function setupEncryption(walletType: WalletType, address: string) {
  // Sign derivation message
  const walletSig = await signMessage(walletType, DERIVATION_MSG, address);

  // Derive private key via double SHA-256
  const hash1 = sha256(new TextEncoder().encode(walletSig));
  const privateKey = sha256(hash1);

  // Derive public key
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const pubKeyHex = Buffer.from(publicKey).toString("hex");

  // Register public key with server
  const { message } = await fetch(`${BASE}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address }),
  }).then((r) => r.json());

  const sig = await signMessage(walletType, message, address);

  await fetch(`${BASE}/encryption`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress: address,
      encryptionPubKey: pubKeyHex,
      signature: sig,
      message,
    }),
  });

  return { privateKey, publicKey: pubKeyHex };
}

// Step 2: Look up recipient's public key
async function getRecipientKey(handle: string): Promise<string | null> {
  const res = await fetch(`${BASE}/encryption?handle=${handle}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.encryptionPubKey;
}
```

---

## Genome Utilities

### Generate a Genome from Block Hash

```typescript
import { createHash } from "crypto";

function generateGenome(blockHash: string) {
  const sequence = createHash("sha256")
    .update(`block-genomics:${blockHash}`)
    .digest("hex");

  const integrity =
    parseInt(sequence.slice(0, 8), 16) / 0xffffffff;
  const complexity =
    parseInt(sequence.slice(8, 16), 16) / 0xffffffff;
  const signature = createHash("sha256")
    .update(sequence)
    .digest("hex");

  return { sequence, integrity, complexity, signature };
}

// Parse 8 traits from genome
function parseGenomeTraits(genome: { sequence: string }) {
  const traits = [
    "Entropy", "Density", "Symmetry", "Complexity",
    "Resonance", "Stability", "Volatility", "Harmony",
  ];

  return traits.map((name, i) => {
    const offset = i * 8;
    const hex = genome.sequence.slice(offset, offset + 8);
    const value = parseInt(hex, 16) / 0xffffffff;
    return { name, value, percent: Math.round(value * 100) };
  });
}
```

---

## Embeddable Badge

Display a user's verification badge on any website:

```html
<!-- By handle -->
<img src="https://blockgenomics.io/api/v1/badge/satoshi.svg" alt="Block Genomics Badge" />

<!-- By wallet address -->
<img src="https://blockgenomics.io/api/v1/badge/bc1p....svg" alt="Block Genomics Badge" />
```

---

## Block Thumbnails

Embed Mondrian-style block visualizations:

```html
<img src="https://blockgenomics.io/api/v1/block-thumbnail/720143.png" alt="Block 720143" />
```

---

## TypeScript Types

Key types for working with the API:

```typescript
interface User {
  walletAddress: string;
  handle: string | null;
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  tier: number; // 1, 2, or 3
  verified: boolean;
  genomeHash: string | null;
  anchorBlock: number | null;
  createdAt: string;
}

interface Block {
  height: number;
  hash: string | null;
  ownerAddress: string | null;
  label: string | null;
  groundColor: string;
  skyColor: string;
  inscriptionId: string | null;
}

interface Guardian {
  id: string;
  blockHeight: number;
  ownerAddress: string;
  name: string;
  personality: string | null;
  llmProvider: string | null;
  llmModel: string | null;
  status: "active" | "paused";
  totalVisitors: number;
  totalMessages: number;
}

interface DelegationListing {
  id: string;
  blockHeight: number;
  ownerAddress: string;
  tier: number;
  spotsTotal: number;
  spotsUsed: number;
  price30d: number; // sats
  price365d: number; // sats
  active: boolean;
}

type WalletType = "unisat" | "xverse" | "leather";

type VerificationTier = 1 | 2 | 3;
// Tier 1: Block owner (Gold)
// Tier 2: Parcel owner (Cyan)
// Tier 3: Delegated access (Purple)
```

---

## Error Handling

All API errors return consistent JSON:

```typescript
interface ApiError {
  success: false;
  error: string;
}

async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}
```

| Status | Meaning |
|--------|---------|
| `400` | Invalid input |
| `401` | Invalid signature or missing auth |
| `403` | Insufficient permissions |
| `404` | Resource not found |
| `409` | Conflict (duplicate handle, etc.) |
| `429` | Rate limited |
| `500` | Server error |
| `503` | Feature not configured |

---

## Next Steps

- [API Reference](API.md) — Complete endpoint documentation
- [Protocol Specification](../PROTOCOL.md) — Genome algorithm, tiers, fees
- [Architecture Guide](ARCHITECTURE.md) — System design for contributors

---

*Built on Bitcoin. Verified by proof of work. Sovereign by design.*
