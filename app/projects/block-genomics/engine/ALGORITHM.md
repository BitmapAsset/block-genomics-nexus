# Trust Score Algorithm — Mathematical Specification

**Version:** 1.0.0  
**Author:** Block Genomics Engine Team  
**Last Updated:** February 2026

---

## 1. Overview

The Block Genomics Trust Score is a composite metric ∈ [0, 100] (integer) that quantifies the trustworthiness of a verified agent. The score is:

- **Deterministic**: identical inputs always produce identical outputs
- **Transparent**: every point is explained with contributing factors
- **Sybil-resistant**: primary inputs are costly-to-fake on-chain data
- **Bitcoin-native**: block properties are the dominant trust signal

## 2. Scoring Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  INPUTS: agent, block, verifications[], claims[]                │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: Calculate component scores                             │
│    S_age       = f_age(block)           ∈ [0, 25]              │
│    S_richness  = f_richness(block)      ∈ [0, 25]              │
│    S_security  = f_security(block)      ∈ [0, 20]              │
│    S_ownership = f_ownership(agent, block, verifications)       │
│                                         ∈ [0, 20]              │
│    S_history   = f_history(agent, verifications)                │
│                                         ∈ [0, 10]              │
│                                                                 │
│  Step 2: Sum raw components                                     │
│    S_raw = S_age + S_richness + S_security + S_ownership        │
│            + S_history                  ∈ [0, 100]              │
│                                                                 │
│  Step 3: Apply tier multiplier                                  │
│    S_mult = S_raw × M_tier             ∈ [0, 100]              │
│    M_tier = { T1: 1.0, T2: 0.8, T3: 0.6 }                    │
│                                                                 │
│  Step 4: Apply time decay                                       │
│    S_decayed = S_mult − D_penalty      ∈ [−20, 100]           │
│                                                                 │
│  Step 5: Add claim bonuses                                      │
│    S_final_raw = S_decayed + B_claims  ∈ [−20, 115]            │
│                                                                 │
│  Step 6: Clamp and round                                        │
│    S_final = round(clamp(S_final_raw, 0, 100))                 │
│                                         ∈ {0, 1, ..., 100}    │
│                                                                 │
│  Step 7: Anomaly detection (parallel, doesn't affect score)     │
│  Step 8: Assign trust tier label                                │
├─────────────────────────────────────────────────────────────────┤
│  OUTPUT: TrustScore { score, tier, components, anomalies, ... } │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Component Formulas

### 3.1 Age Score (25 points max)

**Purpose:** Older blocks have longer histories and are harder to retroactively manipulate. The Bitcoin network's immutability strengthens over time.

**Formula:**

```
age_years = (now - block.timestamp) / (365.25 × 24 × 3600)

S_age = W_age × log₂(1 + min(age_years, 17)) / log₂(1 + 17)
```

Where `W_age = 25` (component weight).

**Logarithmic curve rationale:** Linear scoring would make new blocks nearly worthless while giving a 16-year-old block only marginally more than a 15-year-old block. The logarithmic curve compresses the high end while expanding the low end:

| Age (years) | Score (of 25) | % of Max |
|-------------|---------------|----------|
| 0           | 0.00          | 0%       |
| 0.5         | 2.48          | 10%      |
| 1           | 4.48          | 18%      |
| 2           | 7.10          | 28%      |
| 5           | 12.27         | 49%      |
| 8           | 15.59         | 62%      |
| 10          | 17.38         | 70%      |
| 15          | 21.51         | 86%      |
| 17          | 25.00         | 100%     |

**Special case:** Genesis block (height = 0) receives the full 25 points regardless of curve calculation.

**Cap:** `MAX_AGE_YEARS = 17`. Blocks older than 17 years score identically to 17-year-old blocks. This cap should be periodically reviewed.

### 3.2 Richness Score (25 points max)

**Purpose:** Economically active blocks contain more real-world value and are harder to game. A block full of genuine transactions signals a healthy network segment.

**Sub-components** (weighted within richness):

| Sub-component     | Weight | Formula |
|-------------------|--------|---------|
| TX density        | 40%    | `txCount / (txCount + 2000)` |
| Size utilization  | 30%    | `min(weight / 4,000,000, 1.0)` |
| Value throughput  | 30%    | `log₁₀(1 + outputSats) / log₁₀(1 + 10⁹)` |

**TX density** uses a soft-cap (Michaelis-Menten kinetics):

```
f(x) = x / (x + K)    where K = 2000 (half-saturation constant)
```

At 2000 txs → 0.5, at 4000 txs → 0.67, at 8000 txs → 0.8. This prevents empty blocks from scoring zero while capping very full blocks.

**Size utilization** is a direct ratio against the 4M weight-unit limit.

**Value throughput** uses log₁₀ scaling with a reference of 10 BTC (10⁹ sats). Blocks moving ≥10 BTC score near maximum.

**Fallback:** If `totalOutputSats` is unavailable, value throughput is estimated as `(txDensity + sizeRatio) / 2`.

### 3.3 Security Score (20 points max)

**Purpose:** Higher mining difficulty means more energy was expended to produce the block, making it essentially immutable. Hash quality is a direct proxy for proof-of-work.

**Sub-components:**

| Sub-component    | Weight | Formula |
|------------------|--------|---------|
| Mining difficulty | 60%   | `log₁₀(1 + difficulty) / log₁₀(1 + 10¹⁴)` |
| Hash quality      | 25%   | `leadingZeroBits / 80` |
| Nonce entropy     | 15%   | `1 - |hammingWeight(nonce) - 16| / 16` |

**Mining difficulty** uses log₁₀ scaling against a reference of 100T (10¹⁴). Early blocks (difficulty = 1) score ~0%, modern blocks score ~100%.

**Hash quality** counts the number of leading zero bits in the block hash. Modern Bitcoin requires ~75+ leading zeros out of 256 bits. Normalized against 80.

**Leading zero bit counting algorithm:**
```
For each hex char in hash:
  if char == '0': add 4 zero bits
  else:
    if nibble < 2: add 3 zeros
    elif nibble < 4: add 2 zeros
    elif nibble < 8: add 1 zero
    break
```

**Nonce entropy** measures the Hamming weight (number of set bits) of the 32-bit nonce. A random nonce should have ~16 set bits. Deviation from 16 reduces the score. This is a weak anti-grinding signal — it catches obviously patterned nonces but has a floor of 0.1 (since nonce = 0 is rare but valid).

### 3.4 Ownership Score (20 points max)

**Purpose:** Stronger ownership proof means the agent genuinely controls the Bitcoin block. This is the core innovation of Block Genomics.

**Sub-components:**

| Sub-component       | Weight | Formula |
|---------------------|--------|---------|
| Bitmap inscription  | 40%    | `{detected: 1.0, not_found: 0.0} × tierAdjust` |
| BIP-322 signature   | 40%    | `{verified: 1.0, unverified: 0.0}` |
| Verification recency| 20%    | exponential decay (see below) |

**Tier adjustment for bitmap detection:**
- Tier 1 (block owner): 100% credit
- Tier 2 (TX-anchored): 60% credit
- Tier 3 (delegated): 30% credit

**Recency decay:**
```
if days_since ≤ 30:  score = 1.0
else:
  effective_days = days_since - 30
  half_life = 150 days
  score = e^(-effective_days / half_life × ln(2))
```

This gives full credit within the first month, then halves every 150 days after that.

### 3.5 History Score (10 points max)

**Purpose:** Agents with longer, more consistent verification histories are more trustworthy. This rewards staying power and penalizes fly-by-night actors.

**Sub-components:**

| Sub-component          | Weight | Formula |
|------------------------|--------|---------|
| Verification count     | 40%    | `log₂(1 + count) / log₂(1 + 10)` |
| Verification consistency| 35%   | `1 / (1 + CV)` where CV = coefficient of variation |
| Account age            | 25%    | `min(accountAgeDays / 365, 1.0)` |

**Verification count** uses log₂ scaling: 1 verification → 28%, 3 → 57%, 5 → 72%, 10 → 100%.

**Verification consistency** measures the regularity of re-verification intervals. The coefficient of variation (CV = σ/μ) of intervals between verifications is computed:
- CV = 0 (perfectly regular): score = 1.0
- CV = 1 (irregular): score = 0.5
- CV → ∞ (very irregular): score → 0

For agents with 0-1 verifications, a neutral base score of 0.3 is applied.

**Account age** is a simple linear ramp over 365 days. Accounts over 1 year old receive full credit.

**New agent floor:** Brand-new agents (0 verifications) receive a base score of 30% on the count sub-component to avoid excessively harsh cold-start penalties.

### 3.6 Claim Bonus (up to 15 points)

**Purpose:** Off-chain identity claims provide additional trust signals. They are additive bonuses, not primary scoring components, to keep the system Bitcoin-native.

| Claim Type       | Bonus Points |
|------------------|-------------|
| Email            | +2          |
| Domain           | +5          |
| X (Twitter)      | +3          |
| GitHub           | +3          |
| Nostr            | +2          |
| Lightning Node   | +4          |
| PGP Key          | +3          |
| DNS TXT Record   | +4          |

**Rules:**
- Only verified, non-expired claims count
- Only one claim per type (deduplication)
- Total capped at 15 points
- Claims are added AFTER tier multiplier and time decay

**Rationale for values:**
- Domain (+5) and DNS TXT (+4) require infrastructure control — hardest to fake
- Lightning Node (+4) requires running Bitcoin infrastructure
- X/GitHub/PGP (+3) require account ownership with some setup cost
- Email/Nostr (+2) are easy to obtain but still add identity signal

## 4. Tier Multipliers

| Tier | Multiplier | Description |
|------|-----------|-------------|
| Tier 1 | 1.0× | Block owner — direct bitmap inscription ownership |
| Tier 2 | 0.8× | TX-anchored — attached to a specific transaction in a block |
| Tier 3 | 0.6× | Delegated — granted by a Tier 1 owner |

**Justification:** Tier 1 agents have the strongest proof (they own the block). Tier 2 agents have strong but indirect proof (they're anchored to a transaction). Tier 3 agents have the weakest proof (they're delegated by an owner, which is trust-transitive).

The 0.2 step between tiers ensures meaningful differentiation while still allowing Tier 2/3 agents to achieve respectable scores.

## 5. Time Decay

```
if days_since_last_verification ≤ grace_period (90 days):
  decay = 0

else:
  days_past_grace = days_since - 90
  decay = min(days_past_grace × 0.1, 20)
```

| Days Since Verification | Decay Penalty |
|------------------------|---------------|
| 0-90                   | 0             |
| 100                    | 1             |
| 150                    | 6             |
| 200                    | 11            |
| 250                    | 16            |
| 290+                   | 20 (max)      |

**Rationale:** A 90-day grace period means quarterly re-verification is sufficient. The 0.1 points/day rate is slow enough to not panic agents, but fast enough that 6-month-old verifications lose meaningful trust. The 20-point cap prevents scores from going to zero — even stale agents retain their on-chain history.

## 6. Anomaly Detection

Anomalies are informational flags that don't affect the score. They alert consumers of the trust score to potentially suspicious patterns.

| Code | Severity | Trigger |
|------|----------|---------|
| `VERIFICATION_BURST` | Warning | 3+ verifications within 1 hour |
| `VERY_RECENT_BLOCK` | Info | Tier 1 verification on block < 24h old |
| `EMPTY_BLOCK` | Info | Block contains only coinbase transaction |
| `CLAIM_SPAM` | Warning | 5+ claims with 0 verifications |
| `EXPIRED_VERIFICATION_ACTIVE_CLAIMS` | Warning | All verifications expired but claims active |
| `FUTURE_BLOCK` | Critical | Block height exceeds current chain height |
| `ZERO_NONCE` | Info | Block nonce is exactly 0 |

## 7. Trust Tier Labels

| Score Range | Tier Label | Description |
|-------------|-----------|-------------|
| 90-100      | Legendary | Exceptional trust — old block, verified, many claims |
| 75-89       | Excellent | Very high trust — established, well-verified |
| 60-74       | Good      | Solid trust — reliable agent |
| 40-59       | Moderate  | Average trust — functional but room to grow |
| 20-39       | Low       | Below average — new or poorly maintained |
| 0-19        | Minimal   | Very low trust — unverified or severely decayed |

## 8. Edge Cases and Bounds

### 8.1 Minimum Possible Score: 0
An agent with:
- Tier 3 (0.6× multiplier)
- Very recent block (age ≈ 0)
- Empty block (richness ≈ 0)
- Low difficulty (security ≈ low)
- No verifications (history ≈ base, ownership ≈ 0)
- No claims
- Maximum time decay

Could theoretically score 0 after clamping.

### 8.2 Maximum Possible Score: 100
An agent with:
- Tier 1 (1.0× multiplier)
- Genesis-era block (age = 25)
- Full block with high value (richness ≈ 25)
- Modern difficulty on chain (security ≈ 20)
- Verified with bitmap + BIP-322 (ownership = 20)
- Many verifications, consistent, old account (history = 10)
- All claims verified (bonus = 15)
- Fresh verification (no decay)

Would score: 100 × 1.0 - 0 + 15 = 115 → clamped to 100.

### 8.3 Genesis Block Special Handling
Block 0 always receives maximum age score (25/25) regardless of the logarithmic curve result, as it is the foundation of Bitcoin.

### 8.4 Integer Overflow Prevention
Satoshi amounts use `bigint` to prevent overflow. A single block's total output can exceed Number.MAX_SAFE_INTEGER (which is ~90M BTC in sats).

### 8.5 Timestamp Edge Cases
- If `block.timestamp > nowTimestamp`: age is clamped to 0 (no negative ages)
- If `agent.createdAt` is in the future: account age is 0

## 9. Comparison to Existing Trust Systems

### SSL/TLS Certificate Levels
| SSL Level | Block Genomics Equivalent |
|-----------|--------------------------|
| DV (Domain Validated) — automated, proves domain control | Tier 3 — delegated, minimal proof |
| OV (Organization Validated) — manual org verification | Tier 2 — TX-anchored, moderate proof |
| EV (Extended Validation) — extensive verification | Tier 1 — block owner, cryptographic proof |

### Credit Score (FICO) Comparison
| Factor | FICO Weight | Block Genomics Analog |
|--------|-------------|----------------------|
| Payment history (35%) | Verification history (10%) + ownership (20%) |
| Amounts owed (30%) | Richness (25%) — economic activity |
| Length of credit history (15%) | Age (25%) — block age |
| Credit mix (10%) | Security (20%) — mining quality |
| New credit (10%) | History consistency + time decay |

### Web of Trust (PGP) Comparison
PGP's web of trust is transitive and subjective. Block Genomics is:
- **Objective**: scores derive from on-chain data, not human opinions
- **Non-transitive**: Tier 2/3 agents don't propagate trust to others
- **Quantitative**: a single number (0-100) vs. binary trust/untrust
- **Decaying**: trust fades without re-verification, unlike PGP signatures

## 10. Weight Justifications

| Component | Weight | Justification |
|-----------|--------|---------------|
| Age (25%) | High | Immutability strengthens with age; hard to game (can't make blocks older) |
| Richness (25%) | High | Economic activity is the strongest signal of genuine block usage |
| Security (20%) | Medium | Mining difficulty is exogenous (not controlled by the agent) but important |
| Ownership (20%) | Medium | Cryptographic proof is the core innovation; weighted to reward verification |
| History (10%) | Low | Behavioral signal; easy to game by re-verifying frequently, so weighted lower |

The weights sum to exactly 100, ensuring the raw total is directly interpretable as a percentage.

## 11. Future Extensibility

The engine is designed for forward compatibility:

1. **New components** can be added by reducing existing weights proportionally
2. **New claim types** can be added to the claim bonus table
3. **New anomaly detectors** can be added without affecting scores
4. **Reference constants** (MAX_AGE_YEARS, REFERENCE_DIFFICULTY) should be reviewed annually
5. **Dynamic difficulty reference** could be fetched from the blockchain instead of hardcoded

### Planned Enhancements
- **Cross-agent reputation**: trust from interactions with other verified agents
- **Network graph analysis**: position in the delegation tree affects trust
- **On-chain activity tracking**: post-verification block activity monitoring
- **Community voting**: weighted votes from high-trust agents
