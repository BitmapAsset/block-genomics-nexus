# 🔍 Verification Protocol — Technical Spec

## Overview
The Block Genomics Verification Protocol enables AI agents to prove their identity through Bitcoin block ownership. This document defines the complete verification flow.

## Protocol Steps

### Step 1: Wallet Connection
```
Client → Wallet: requestAccounts()
Wallet → Client: [address]
Client → Wallet: getInscriptions()
Wallet → Client: [inscriptions]
Client: Filter for .bitmap inscriptions
Client: Display available Bitmaps to user
```

### Step 2: Challenge Generation
```
Client → Server: POST /api/challenge
  Body: { blockHeight, agentName }
Server: Generate { nonce, timestamp, challengeId }
Server → Client: { challengeMessage, challengeId }
```

### Step 3: Signature
```
Client → Wallet: signMessage(challengeMessage)
Wallet → User: "Sign this message?"
User: Approves
Wallet → Client: { signature }
```

### Step 4: Verification
```
Client → Server: POST /api/verify
  Body: { challengeId, signature, address, blockHeight }

Server verification steps:
  1. ✅ Challenge validity (exists, not expired, not used)
  2. ✅ Signature verification (bitcoinjs-message.verify)
  3. ✅ Bitmap existence (query indexer for {height}.bitmap inscription)
  4. ✅ Ownership match (inscription owner === signer address)
  5. ✅ Genome generation (hash block data → unique fingerprint)
  6. ✅ Trust score calculation

Server → Client: { verified: true, agentId, genome, trustScore, badge }
```

## Data Model

### Agent Record
```json
{
  "agentId": "bg_agent_7a3fc912...",
  "name": "PepeAgent",
  "description": "AI assistant for Gravity",
  "blockHeight": 800000,
  "blockHash": "00000000000000000002a7c4c1e48d76c5a37902...",
  "genome": "7a3f...c912",
  "ownerAddress": "bc1q...",
  "bitmapInscriptionId": "abc123i0",
  "tier": 1,
  "trustScore": 94,
  "verifiedAt": "2026-02-03T09:30:00Z",
  "lastVerifiedAt": "2026-02-03T09:30:00Z",
  "status": "active",
  "delegations": []
}
```

### Verification Record
```json
{
  "verificationId": "ver_...",
  "agentId": "bg_agent_...",
  "challengeMessage": "Block Genomics Agent Verification...",
  "signature": "H+...",
  "signerAddress": "bc1q...",
  "blockHeight": 800000,
  "verified": true,
  "verifiedAt": "2026-02-03T09:30:00Z",
  "expiresAt": "2027-02-03T09:30:00Z"
}
```

### Delegation Record (Tier 2 & 3)
```json
{
  "delegationId": "del_...",
  "parentAgentId": "bg_agent_...",
  "childAgentId": "bg_agent_...",
  "tier": 3,
  "blockHeight": 800000,
  "transactionId": null,
  "grantedAt": "2026-02-03T09:30:00Z",
  "expiresAt": "2027-02-03T09:30:00Z",
  "revokedAt": null,
  "signature": "H+..."
}
```

## Trust Score Algorithm

```
Trust Score = Block Age Factor 
            + Data Richness Factor 
            + Network Security Factor 
            + Ownership Factor 
            + History Factor

Block Age Factor (0-25):
  years = (now - block.timestamp) / seconds_per_year
  score = min(years / 10, 1) * 25
  // 10+ year old blocks get maximum age score

Data Richness Factor (0-25):
  txDensity = block.tx_count / 4000
  sizeDensity = block.size / 4_000_000
  score = min(avg(txDensity, sizeDensity), 1) * 25
  // Blocks with more transactions and data score higher

Network Security Factor (0-20):
  diffRatio = block.difficulty / current_difficulty
  score = min(diffRatio, 1) * 20
  // Blocks mined under higher difficulty score higher

Ownership Factor (0-20):
  if (directOwnership) score = 20
  if (tier2_txAnchor) score = 14
  if (tier3_delegated) score = 8
  // Direct ownership gets maximum, delegation gets less

History Factor (0-10):
  holdingTime = now - bitmap_acquisition_date
  reverifications = count(successful_reverifications)
  score = min(holdingTime_months / 12, 1) * 5 + min(reverifications / 10, 1) * 5
  // Long-term holders and frequently reverified agents score higher

Maximum possible score: 100
```

## Public API Endpoints

```
GET  /api/v1/verify/{agentId}          → Verification status + trust score
GET  /api/v1/genome/{blockHeight}      → Block genome data
GET  /api/v1/agent/{agentId}           → Agent profile
GET  /api/v1/block/{height}/agents     → All agents verified under this block
GET  /api/v1/badge/{agentId}.svg       → Dynamic SVG badge
GET  /api/v1/badge/{agentId}.png       → Dynamic PNG badge
POST /api/v1/challenge                 → Generate verification challenge
POST /api/v1/verify                    → Submit signed challenge
POST /api/v1/register                  → Register new agent
POST /api/v1/delegate                  → Create delegation
GET  /api/v1/stats                     → Protocol statistics
```

## Badge Embed

### HTML Widget
```html
<script src="https://verify.blockgenomics.io/widget.js"></script>
<bg-badge agent="bg_agent_7a3f..." theme="dark" size="standard"></bg-badge>
```

### Simple Image
```html
<img src="https://verify.blockgenomics.io/api/v1/badge/bg_agent_7a3f....svg" />
```

### JavaScript Verification
```javascript
import { BlockGenomics } from '@blockgenomics/sdk';

const bg = new BlockGenomics();
const result = await bg.verify('bg_agent_7a3f...');
// { verified: true, tier: 1, trustScore: 94, genome: '7a3f...', block: 800000 }
```
