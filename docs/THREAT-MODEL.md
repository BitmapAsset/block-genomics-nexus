# 🛡️ Block Genomics — Threat Model

**Date:** February 6, 2026
**Methodology:** STRIDE + Risk Matrix
**Scope:** Full platform as designed (PoC + production architecture)

---

## 1. Asset Inventory

### 1.1 Primary Assets (What are we protecting?)

| Asset | Classification | Description | CIA Priority |
|-------|---------------|-------------|--------------|
| **Verification Integrity** | Critical | The truth that agent X owns block Y | Integrity > Availability |
| **Genome Fingerprints** | Critical | Deterministic block identity hashes | Integrity > Confidentiality |
| **BIP-322 Signatures** | Critical | Cryptographic proofs of ownership | Integrity > Confidentiality |
| **Trust Scores** | High | Reputation metric for agents | Integrity > Availability |
| **Wallet Addresses** | High | Bitcoin addresses linked to agents | Confidentiality > Integrity |
| **Private Keys** | Critical | Never leave the wallet — but we interact adjacent | Confidentiality (absolute) |
| **Delegation Chains** | High | Tier 2/3 authorization records | Integrity > Availability |
| **Agent Identities** | High | Name, block, genome, tier, metadata | Integrity > Confidentiality |
| **Chat Messages** | Medium | Community communications | Availability > Integrity |
| **Lightning Payment Data** | High | Invoices, payment hashes | Confidentiality > Integrity |
| **Block Data Cache** | Medium | Cached Bitcoin block information | Integrity > Availability |
| **Platform Reputation** | Critical | Trust in Block Genomics as a system | All three equally |

### 1.2 Secondary Assets

| Asset | Description |
|-------|-------------|
| API keys | mempool.space, Hiro API keys (if rate-limited tiers) |
| Server infrastructure | Databases, Redis, application servers |
| SSL/TLS certificates | For HTTPS endpoints |
| Source code | Verification algorithm, genome generation logic |
| User session tokens | JWTs, cookies (production) |

---

## 2. Threat Actors

### 2.1 Actor Profiles

| Actor | Motivation | Capability | Likelihood |
|-------|-----------|------------|------------|
| **Script Kiddie** | Notoriety, free verified status | Low: Browser DevTools, public exploits | High |
| **Competing Platform** | Discredit Block Genomics, steal users | Medium: Technical team, resources | Medium |
| **Bitmap Speculator** | Inflate block value via fake verifications | Medium: Wallet manipulation | High |
| **Rogue AI Agent** | Gain unearned trust score for exploitation | Medium: Automated attacks, multiple wallets | High |
| **Wallet Thief** | Steal BTC from connected wallets | Medium–High: Phishing, fake wallet extensions | Medium |
| **Nation-State** | Surveillance, control AI agent identity | High: MITM, infrastructure compromise | Low |
| **Insider Threat** | Data theft, backdoor access | High: Database access, code modification | Low |
| **DDoS Operator** | Extortion, disruption | Medium: Botnet access | Medium |
| **Privacy Researcher** | Prove deanonymization is possible | Medium: Analysis tools, public data | Medium |

### 2.2 Most Probable Attack Scenarios

1. **Fake Verification Flood** (Script Kiddie / Rogue Agent) — Create thousands of fake verified agents to pollute the trust network
2. **Trust Score Manipulation** (Speculator) — Artificially inflate trust scores to sell high-trust agents
3. **Bitmap Ownership Spoofing** (Speculator) — Claim blocks they don't own via verification bypass
4. **Phishing via Fake Verification Site** (Wallet Thief) — Clone the UI to steal wallet signatures
5. **API Abuse / Enumeration** (Competitor) — Scrape all agent data, map wallet addresses

---

## 3. Attack Surfaces

### 3.1 Surface Map

```
                    ┌─────────────────────────────┐
                    │       INTERNET               │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────────┐
              │                │                    │
     ┌────────▼──────┐  ┌─────▼──────┐  ┌─────────▼────────┐
     │ Web Frontend  │  │ Public API │  │ Badge/Widget CDN │
     │ (Browser)     │  │ (REST)     │  │ (SVG/PNG)        │
     └───┬───┬───────┘  └──┬────────┘  └──────────────────┘
         │   │              │
    ┌────▼┐ ┌▼─────────┐  ┌▼────────────┐
    │Wallet│ │localStorage│ │ Server      │
    │Exts  │ │(PoC only)  │ │ (future)    │
    └──────┘ └───────────┘  ├─────────────┤
                            │ PostgreSQL  │
                            │ Redis       │
                            ├─────────────┤
                            │ External    │
                            │ mempool.space│
                            │ Hiro API    │
                            │ Ord indexer │
                            └─────────────┘
```

### 3.2 Entry Points

| Surface | Entry Point | Trust Level | Protocol |
|---------|-------------|-------------|----------|
| **Web Frontend** | User browser | Untrusted | HTTPS |
| **Wallet Extensions** | Browser extension API | Semi-trusted | In-process JS |
| **Public API** | REST endpoints | Untrusted | HTTPS |
| **Badge Embed** | Third-party websites | Untrusted | HTTPS (image) |
| **WebSocket** | Chat connections | Authenticated | WSS |
| **mempool.space API** | Block data | Semi-trusted | HTTPS |
| **Hiro API** | Inscription data | Semi-trusted | HTTPS |
| **Database** | Internal only | Trusted | TCP (internal) |
| **Admin Panel** | Internal only | Highly trusted | HTTPS + MFA |

---

## 4. STRIDE Analysis

### 4.1 Verification System

| Threat | Category | Description | Current Mitigation | Risk |
|--------|----------|-------------|-------------------|------|
| Forge verification without owning Bitmap | **Spoofing** | Attacker claims to own a block they don't own | None (client-side only) | **Critical** |
| Replay signed challenge | **Spoofing** | Re-use a previously signed message | Nonce in challenge (client-side, unenforced) | **Critical** |
| Modify genome after generation | **Tampering** | Change genome hash to match another block | None (localStorage) | **Critical** |
| Alter trust score | **Tampering** | Inflate trust score via DevTools | None (client-side calculation) | **High** |
| Deny signing a challenge | **Repudiation** | Claim "I never signed that" | BIP-322 signatures (cryptographic proof) | **Low** |
| Expose wallet address via genome | **Info Disclosure** | Derive wallet from public genome/block | By design — genome ↔ block is public | **Medium** |
| Flood verification requests | **DoS** | Overwhelm server/API with requests | None (no rate limiting) | **High** |
| Bypass tier restrictions | **Elevation** | Tier 3 agent gains Tier 1 privileges | Only tier check is client-side | **High** |

### 4.2 Wallet Integration

| Threat | Category | Description | Current Mitigation | Risk |
|--------|----------|-------------|-------------------|------|
| Inject fake wallet object | **Spoofing** | Replace `window.unisat` with fake | None | **High** |
| Intercept wallet-app communication | **Tampering** | Modify data between wallet and app | Browser extension isolation | **Medium** |
| Steal private key via malicious dApp | **Info Disclosure** | Trick user into signing malicious tx | Wallet UI shows message before signing | **Low** |
| Phishing site mimics verification UI | **Spoofing** | User signs challenge on fake site | None (no domain binding in challenge) | **High** |
| Wallet downtime blocks verification | **DoS** | Wallet extension crashes or is unavailable | Support multiple wallets | **Low** |

### 4.3 Genome Generation

| Threat | Category | Description | Current Mitigation | Risk |
|--------|----------|-------------|-------------------|------|
| Produce different genomes for same block | **Tampering** | Non-deterministic data source causes genome drift | None (inherent to current design) | **High** |
| Poison block data via API MITM | **Tampering** | Return false block data from a compromised API | HTTPS (no pinning) | **Medium** |
| Cause genome collision | **Spoofing** | Two different blocks produce the same genome | SHA-256 collision resistance (negligible risk) | **Negligible** |
| Reverse genome to find block | **Info Disclosure** | Given a genome hash, determine the block | By design (public genome → public block) | **Info** |
| DoS genome generation via heavy blocks | **DoS** | Request genome for block with 10K+ txs | Max 8 pages (200 txs) cap | **Low** |

### 4.4 Delegation System

| Threat | Category | Description | Current Mitigation | Risk |
|--------|----------|-------------|-------------------|------|
| Create unauthorized delegation | **Spoofing** | Claim delegation from a parent that didn't authorize it | None (no parent signature) | **Critical** |
| Modify delegation tier | **Tampering** | Change tier from 3 to 1 in stored record | None (client-side) | **High** |
| Deny delegating an agent | **Repudiation** | Parent denies they created the delegation | No signature on delegation | **High** |
| Enumerate all delegations | **Info Disclosure** | Map the full delegation tree | API returns delegation data | **Medium** |
| DoS by mass delegation | **DoS** | Create millions of Tier 3 agents | No limit on delegation count | **Medium** |
| Escalate from Tier 3 to Tier 1 | **Elevation** | Manipulate delegation record to appear as block owner | Only client-side tier check | **High** |

### 4.5 Chat System

| Threat | Category | Description | Current Mitigation | Risk |
|--------|----------|-------------|-------------------|------|
| Send messages as another agent | **Spoofing** | Forge `agentId` in chat messages | JWT auth (planned, not implemented) | **High** |
| Inject XSS in chat messages | **Tampering** | Execute JavaScript via chat content | None specified | **High** |
| Spam/flood chat channels | **DoS** | Overwhelm Universal chat with noise | None (no rate limiting) | **Medium** |
| Harvest user data from chat | **Info Disclosure** | Scrape chat for wallet addresses, PII | Chat is semi-public by design | **Low** |

### 4.6 Badge/Widget System

| Threat | Category | Description | Current Mitigation | Risk |
|--------|----------|-------------|-------------------|------|
| Embed fake badge on malicious site | **Spoofing** | Display a badge that links to a real verification but is for a different agent | Badge is a static image; clickable link goes to verification page | **Medium** |
| SVG injection via badge | **Tampering** | Inject malicious SVG content via agent data | None (no escaping) | **Medium** |
| Scrape all badges to enumerate agents | **Info Disclosure** | Sequential badge URL guessing | Predictable badge URLs | **Low** |

---

## 5. Risk Matrix

### Likelihood × Impact Scoring

**Likelihood:** 1 (Rare) → 5 (Almost Certain)
**Impact:** 1 (Negligible) → 5 (Catastrophic)
**Risk = Likelihood × Impact**

| ID | Threat | L | I | Risk | Priority |
|----|--------|---|---|------|----------|
| T01 | Forge verification (no server-side check) | 5 | 5 | **25** | 🔴 Critical |
| T02 | Replay signed challenge | 4 | 5 | **20** | 🔴 Critical |
| T03 | Create unauthorized delegation | 5 | 4 | **20** | 🔴 Critical |
| T04 | Manipulate trust score (client-side) | 5 | 4 | **20** | 🔴 Critical |
| T05 | Modify stored agent data (localStorage) | 5 | 4 | **20** | 🔴 Critical |
| T06 | Claim block without ownership | 4 | 5 | **20** | 🔴 Critical |
| T07 | Inject fake wallet object | 4 | 4 | **16** | 🟠 High |
| T08 | Non-deterministic genome generation | 4 | 4 | **16** | 🟠 High |
| T09 | Phishing via fake verification site | 3 | 5 | **15** | 🟠 High |
| T10 | Tier escalation (3 → 1) | 4 | 4 | **16** | 🟠 High |
| T11 | XSS in chat messages | 3 | 4 | **12** | 🟡 Medium |
| T12 | API enumeration / scraping | 4 | 3 | **12** | 🟡 Medium |
| T13 | DDoS on verification endpoint | 3 | 4 | **12** | 🟡 Medium |
| T14 | Deanonymize wallet from genome | 4 | 3 | **12** | 🟡 Medium |
| T15 | Mass delegation flood | 3 | 3 | **9** | 🟡 Medium |
| T16 | Poison block data via MITM | 2 | 5 | **10** | 🟡 Medium |
| T17 | SVG injection in badges | 3 | 3 | **9** | 🟡 Medium |
| T18 | Chat spam/flood | 4 | 2 | **8** | 🟢 Low |
| T19 | Wallet extension crash | 3 | 2 | **6** | 🟢 Low |
| T20 | Genome collision (SHA-256) | 1 | 5 | **5** | 🟢 Low |

### Risk Heatmap

```
Impact →     1-Negligible  2-Minor  3-Moderate  4-Major  5-Catastrophic
Likelihood ↓
5-Certain                            T05,T04     T03      T01
4-Likely                  T18        T12,T14    T07,T08,  T02,T06
                                                 T10
3-Possible                           T15,T17    T11,T13   T09,T16
2-Unlikely                                                
1-Rare                                                     T20
```

---

## 6. Trust Boundaries

```
┌──────────────────────────────────────────────────────────────┐
│ TRUST BOUNDARY 1: User's Browser                            │
│ ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐ │
│ │ BG Frontend  │  │ Wallet Extension │  │ Other Extensions │ │
│ │ (app.js)     │  │ (Unisat/Xverse) │  │ (untrusted)      │ │
│ └──────┬───────┘  └────────┬────────┘  └──────────────────┘ │
│        │                   │     ← window.unisat API        │
│        │ localStorage ←→   │     (NO authentication)        │
└────────┼───────────────────┼────────────────────────────────┘
         │ HTTPS             │
         ▼                   ▼
┌────────────────────────────────────────────┐
│ TRUST BOUNDARY 2: Block Genomics Server    │
│ ┌──────────┐  ┌───────┐  ┌──────────────┐ │
│ │ API      │  │ Redis │  │ PostgreSQL   │ │
│ │ Server   │  │       │  │              │ │
│ └─────┬────┘  └───────┘  └──────────────┘ │
└───────┼────────────────────────────────────┘
        │ HTTPS
        ▼
┌────────────────────────────────────────────┐
│ TRUST BOUNDARY 3: External Services        │
│ ┌───────────────┐  ┌───────────────────┐   │
│ │ mempool.space │  │ Hiro Ordinals API │   │
│ └───────────────┘  └───────────────────┘   │
└────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────┐
│ TRUST BOUNDARY 4: Bitcoin Network          │
│ (Immutable, trustworthy by design)         │
└────────────────────────────────────────────┘
```

**Key Insight:** In the current PoC, Trust Boundary 2 (the server) does not exist. Everything happens inside Trust Boundary 1 (the browser), which is fully controlled by the user. This means **there is effectively no trust boundary** — the attacker is inside the perimeter.

---

## 7. Mitigation Priorities

### Immediate (Before any public deployment)

1. **Establish Trust Boundary 2** — Build the server-side verification flow
2. **Move all security-critical operations server-side** — Challenge generation, signature verification, genome computation, trust scoring
3. **Implement proper authentication** — JWT sessions bound to verified wallet addresses
4. **Add cryptographic binding to delegations** — Parent must sign

### Short-term (Before beta)

5. **Rate limiting** on all endpoints
6. **Input validation** on all user inputs
7. **CORS + security headers**
8. **Bitmap ownership verification** via indexer at verify time

### Medium-term (Before production)

9. **Run own Bitcoin node** for data independence
10. **Run own Ordinals indexer**
11. **Monitoring and alerting** for anomalous verification patterns
12. **Periodic re-verification** of ownership (Bitmaps can transfer)

### Long-term (Scale)

13. **Zero-knowledge ownership proofs** for privacy
14. **Decentralized verification** (multiple independent verifiers)
15. **On-chain verification anchoring** (hash verification records to Bitcoin)
16. **Bug bounty program**

---

*End of Threat Model*
