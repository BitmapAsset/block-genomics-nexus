# Block Genomics — Trust Score Engine

The algorithmic heart of Block Genomics. This engine calculates deterministic trust scores (0-100) for verified agents based on Bitcoin block properties, verification history, and identity claims.

## Quick Start

```ts
import { TrustScoreEngine } from './trust-score.js';

const engine = new TrustScoreEngine();
const result = engine.calculateScore(agent, block, verifications, claims);

console.log(result.score);  // 87
console.log(result.tier);   // 'excellent'
```

## Architecture

```
engine/
├── trust-score.ts              # Core TrustScoreEngine class
├── types.ts                    # All TypeScript types and constants
├── components/
│   ├── age-score.ts            # Block age (logarithmic curve, 25 pts)
│   ├── richness-score.ts       # TX volume/value (soft-capped, 25 pts)
│   ├── security-score.ts       # Mining difficulty/hash quality (20 pts)
│   ├── ownership-score.ts      # Bitmap/BIP-322 proof strength (20 pts)
│   ├── history-score.ts        # Verification frequency/consistency (10 pts)
│   └── claim-bonus.ts          # Identity claim bonuses (up to 15 pts)
├── test-cases.ts               # Comprehensive test suite
├── ALGORITHM.md                # Mathematical specification
└── README.md                   # This file
```

## How Scoring Works

### Pipeline

```
Inputs → Components → Sum → Tier Multiplier → Time Decay → Claim Bonus → Clamp [0,100]
```

1. **Five components** are calculated independently from on-chain block data
2. **Raw scores** are summed (max 100 points)
3. **Tier multiplier** scales the total (Tier 1 = 1.0×, Tier 2 = 0.8×, Tier 3 = 0.6×)
4. **Time decay** penalizes stale verifications (up to -20 points after 90-day grace)
5. **Claim bonus** adds points for verified identity claims (up to +15)
6. **Final score** is clamped to [0, 100] and rounded to integer

### Components

| Component | Max Points | Primary Signal | Curve |
|-----------|-----------|----------------|-------|
| **Age** | 25 | Block timestamp | Logarithmic (log₂) |
| **Richness** | 25 | TX count, size, value | Soft-cap (Michaelis-Menten) |
| **Security** | 20 | Difficulty, hash, nonce | Log₁₀ + linear |
| **Ownership** | 20 | Bitmap, BIP-322, recency | Binary + exponential decay |
| **History** | 10 | Verifications, consistency | Log₂ + CV analysis |

### Claim Bonuses

| Claim | Bonus |
|-------|-------|
| Domain ownership | +5 |
| Lightning Node | +4 |
| DNS TXT record | +4 |
| X (Twitter) | +3 |
| GitHub | +3 |
| PGP Key | +3 |
| Email | +2 |
| Nostr | +2 |

Maximum total: 15 points (even if individual claims sum higher).

### Trust Tiers

| Score | Label | Description |
|-------|-------|-------------|
| 90-100 | 🏆 Legendary | Exceptional — old block, fully verified, many claims |
| 75-89 | ⭐ Excellent | Very high — established and well-maintained |
| 60-74 | ✅ Good | Solid — reliable agent |
| 40-59 | 🔵 Moderate | Average — functional but room to grow |
| 20-39 | 🟡 Low | Below average — new or under-maintained |
| 0-19 | ⚪ Minimal | Very low — unverified or severely decayed |

## Usage

### Basic Usage

```ts
import { TrustScoreEngine } from './trust-score.js';
import { Tier, ClaimType } from './types.js';

const engine = new TrustScoreEngine();

const result = engine.calculateScore(
  {
    id: 'bg_abc123',
    name: 'MyAgent',
    blockHeight: 500000,
    blockHash: '00000000000000000024fb37...',
    genome: 'a3f7b2...',
    tier: Tier.TIER_1,
    isAI: false,
    walletAddress: 'bc1q...',
    verified: true,
    verifiedAt: '2025-12-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    height: 500000,
    hash: '00000000000000000024fb37...',
    merkleRoot: '5765c867...',
    previousHash: '0000000000000000007962...',
    timestamp: 1513622125,
    nonce: 1560058197,
    bits: '18009645',
    difficulty: 1873105475221.611,
    txCount: 2701,
    size: 1048030,
    weight: 3993402,
  },
  [
    {
      id: 'ver_001',
      agentId: 'bg_abc123',
      signature: 'sig...',
      signerAddress: 'bc1q...',
      blockHeight: 500000,
      status: 'VERIFIED',
      createdAt: '2025-12-01T00:00:00Z',
      expiresAt: '2026-12-01T00:00:00Z',
    },
  ],
  [
    { type: ClaimType.DOMAIN, value: 'example.com', verified: true },
    { type: ClaimType.X_ACCOUNT, value: '@myagent', verified: true },
  ],
);

console.log(result.score);                      // 78
console.log(result.tier);                        // 'excellent'
console.log(result.components.age.raw);          // 21.5
console.log(result.components.richness.raw);     // 18.3
console.log(result.decayPenalty);                // 0
console.log(result.claimBonusTotal);             // 8
console.log(result.anomalies);                   // []
```

### Individual Components

```ts
// Calculate just one component
const ageScore = engine.calculateAgeOnly(block);
console.log(ageScore.raw, ageScore.ageYears, ageScore.era);

const richnessScore = engine.calculateRichnessOnly(block);
console.log(richnessScore.txCount, richnessScore.blockSize);
```

### Custom Configuration

```ts
// Override specific settings
const engine = new TrustScoreEngine({
  nowTimestamp: 1738800000,           // Fixed time for deterministic tests
  currentBlockHeight: 880000,
  decay: {
    gracePeriodDays: 60,              // Shorter grace period
    maxDecayPenalty: 30,              // Harsher decay
    decayRatePerDay: 0.15,
  },
});
```

### Convenience Factory

```ts
import { createEngine } from './trust-score.js';

const engine = createEngine({ nowTimestamp: Date.now() / 1000 });
```

## Running Tests

```bash
npx tsx test-cases.ts
```

Expected output:
```
═══════════════════════════════════════════════════════════════
  Block Genomics — Trust Score Engine Test Suite
═══════════════════════════════════════════════════════════════

  ✅ Genesis Block (Block 0) — Tier 1, Full Claims
     Score: 85 (expected: 70-100)
  ✅ Recent Block (Block 879000) — Tier 1, No Claims
     Score: 62 (expected: 45-80)
  ...
  ✅ Determinism: Run 1 score = 78, Run 2 score = 78 (identical)
  ✅ Tier ordering: T1(78) ≥ T2(63) ≥ T3(47)
  ✅ Claims add value: without=72, with=83 (+11)

  Results: 17 passed, 0 failed, 17 total
═══════════════════════════════════════════════════════════════
```

## Design Principles

- **Pure functions**: Every scoring function is a pure function with no side effects
- **No external calls**: The engine never fetches data — all inputs are passed in
- **Strict types**: Full TypeScript with readonly types throughout
- **JSDoc documented**: Every exported function has complete JSDoc documentation
- **BigInt for sats**: Satoshi amounts use BigInt to prevent overflow
- **Configurable**: All constants are configurable via TrustScoreConfig
- **Extensible**: New components or claim types can be added without breaking changes

## Mathematical Details

See [ALGORITHM.md](./ALGORITHM.md) for:
- Exact formulas for each component
- Curve derivations and rationale
- Weight justifications
- Edge case analysis
- Comparison to SSL certificates, credit scores, and PGP web of trust
