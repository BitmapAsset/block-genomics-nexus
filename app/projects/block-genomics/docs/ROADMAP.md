# 🗺️ Block Genomics — Full Product Roadmap

*Every step needed to go from PoC to production.*

---

## Phase 1: Foundation (Current — PoC) ✅
**Goal:** Prove the concept works with real Bitcoin data.

- [x] Fetch real block data from mempool.space API
- [x] Generate unique genome fingerprint (SHA-256 from block NAT data)
- [x] DNA strand visualization (color-coded by script type)
- [x] Fee pressure heatmap
- [x] Value flow constellation
- [x] Genomic analysis charts (script types, sizes, I/O patterns)
- [x] Verification flow demo (4-step visual process)
- [x] Trust score algorithm (age + richness + difficulty + ownership)
- [x] Three-tier badge system (Gold/Silver/Bronze)
- [x] Agent profile card with genome display
- [x] Embeddable badge code generator
- [x] Landing page with stats and explainer

---

## Phase 2: Wallet Connection & Ownership Proof 🔜
**Goal:** Users can actually prove they own a Bitmap by signing with their wallet.

### 2a. Wallet Integration
- [ ] Integrate Unisat Wallet SDK (most popular Ordinals wallet)
- [ ] Integrate Xverse Wallet SDK
- [ ] Integrate Leather (Hiro) Wallet SDK
- [ ] Wallet connect button on UI
- [ ] Read user's Ordinals/inscriptions from connected wallet
- [ ] Detect Bitmap inscriptions specifically
- [ ] Display owned Bitmaps with block numbers

### 2b. Ownership Verification
- [ ] Generate unique challenge message (timestamp + nonce)
- [ ] User signs challenge with wallet that holds Bitmap inscription
- [ ] Verify signature matches the address that owns the Bitmap
- [ ] Cross-reference with Ordinals indexer (ord.io API / Hiro API)
- [ ] Confirm Bitmap inscription is valid (correct format: "blockheight.bitmap")
- [ ] Store verification proof (signature + message + address + bitmap ID)

### 2c. On-Chain Verification
- [ ] Query Ordinals indexer for Bitmap inscription ownership
- [ ] Verify inscription content matches "blockheight.bitmap" format
- [ ] Check current owner address matches signer address
- [ ] Handle transferred Bitmaps (ownership changes)
- [ ] Cache verification results (with expiry)

### Technical Requirements:
- Unisat API: https://docs.unisat.io
- Xverse: https://docs.xverse.app
- Hiro/Stacks: https://docs.hiro.so/ordinals
- Ord.io API: https://ord.io (or run local ord indexer)
- Bitcoin message signing (BIP-322 or legacy)

---

## Phase 3: Agent Registration System
**Goal:** Agents can register, get verified, and receive a persistent identity.

### 3a. Registration Backend
- [ ] Design database schema (agents, blocks, verifications, delegations)
- [ ] Set up PostgreSQL database
- [ ] Build API server (Next.js API routes or standalone)
- [ ] Agent registration endpoint
- [ ] Agent lookup/search endpoint
- [ ] Verification status endpoint
- [ ] Rate limiting and abuse prevention

### 3b. Agent Identity
- [ ] Generate agent ID (deterministic from block genome + registration data)
- [ ] Create agent profile page (public URL)
- [ ] Agent metadata storage (name, description, capabilities, contact)
- [ ] Agent avatar generation (from block genome — generative)
- [ ] Profile editing (with wallet signature verification)

### 3c. Registration Flow
- [ ] User connects wallet
- [ ] System detects owned Bitmaps
- [ ] User selects which Bitmap to register agent under
- [ ] User signs registration message
- [ ] System verifies ownership, generates genome, creates profile
- [ ] Agent receives verification badge and embed code

---

## Phase 4: Verification Protocol & API
**Goal:** Third-party websites and services can verify agents programmatically.

### 4a. Public Verification API
- [ ] `GET /api/verify/{agentId}` — Check if agent is verified
- [ ] `GET /api/verify/{blockHeight}` — Check block verification status
- [ ] `GET /api/genome/{blockHeight}` — Get block genome data
- [ ] `GET /api/badge/{agentId}.svg` — Dynamic SVG badge
- [ ] `GET /api/trust/{agentId}` — Get trust score breakdown
- [ ] API key management for heavy users
- [ ] Webhook notifications for verification status changes

### 4b. Verification SDK
- [ ] JavaScript/TypeScript SDK (`npm install @blockgenomics/verify`)
- [ ] Python SDK (`pip install blockgenomics`)
- [ ] Simple integration: `BlockGenomics.verify(agentId)` → true/false + trust score
- [ ] Badge web component: `<bg-badge agent="..." />`

### 4c. Agent-to-Agent Verification
- [ ] Protocol for agents to verify each other
- [ ] Challenge-response flow
- [ ] Mutual verification (both agents verify each other)
- [ ] Verification result caching

---

## Phase 5: Delegation Protocol (Tier 2 & 3)
**Goal:** Block owners can delegate verification to other agents (scaling to billions).

### 5a. Transaction-Level Anchoring (Tier 2)
- [ ] Parse individual transactions within owned block
- [ ] Assign specific transactions to specific agents
- [ ] Transaction-level genome (sub-genome of block genome)
- [ ] Verification that transaction belongs to the claimed block
- [ ] Agent-to-transaction binding (signed by block owner)

### 5b. Delegated Verification (Tier 3) ✅
- [x] Block owner creates delegation listing (price, spots, duration)
- [x] Two duration options: 30-day and 365-day
- [x] BIP-322 wallet signature for all delegation actions
- [x] Delegation marketplace page with search/filter/sort
- [x] Revocation mechanism (owner can revoke delegations)

### 5c. Revenue System ✅
- [x] Block owners set pricing in sats
- [x] Protocol fee: 97% owner / 2.5% treasury / 0.5% Nexus Brain
- [x] Payment flow via native Bitcoin
- [ ] Lightning Network integration (future)

### 5d. Trustless On-Chain Delegation (Future Upgrade)
**Goal:** Remove server dependency for delegation expiry — fully trustless on Bitcoin.

Current state: Delegation expiry tracked in our database. Wallet ownership and payment are trustless (BIP-322 + on-chain tx), but expiry enforcement is centralized.

Future options:
- [ ] **CLTV/CSV timelocked transactions** — Delegation payment locked in 2-of-2 multisig, auto-releases to owner after duration expires. No server needed to enforce expiry.
- [ ] **Inscription-based delegation certificates** — Inscribe delegation terms (wallet, block, expiry) on Bitcoin. Anyone can verify on-chain without our backend.
- [ ] **DLCs (Discreet Log Contracts)** — Fully on-chain conditional delegation with oracle-free expiry.

This upgrade makes Block Genomics delegation **fully trustless end-to-end**: wallet proof (BIP-322) + payment (on-chain) + expiry (on-chain) — no server trust required.

---

## Phase 6: Production & Launch
**Goal:** Ship it.

### 6a. Infrastructure
- [ ] Domain: blockgenomics.io (or similar)
- [ ] Deploy frontend (Vercel/Cloudflare)
- [ ] Deploy backend API (Railway/Fly.io)
- [ ] Set up PostgreSQL (Supabase/Neon)
- [ ] CDN for badge assets
- [ ] SSL/TLS
- [ ] Monitoring and alerting

### 6b. Security
- [ ] Security audit of verification protocol
- [ ] Rate limiting on all endpoints
- [ ] Input validation and sanitization
- [ ] Protection against replay attacks (nonce in challenges)
- [ ] Secure key management

### 6c. Launch
- [ ] Landing page with clear value proposition
- [ ] Documentation site
- [ ] Blog post: "Introducing Block Genomics"
- [ ] Twitter/X announcement
- [ ] Bitmap community outreach
- [ ] Ordinals community outreach
- [ ] Bitcoin developer community outreach
- [ ] Product Hunt launch
- [ ] First paying customer!

---

## Phase 7: Native Game Client (Post-Traction)
**Goal:** Game-level immersion while keeping web version for accessibility.

- [ ] **Unreal Engine 5 or Godot native client** — connects to existing backend API
- [ ] Same Supabase Realtime for chat/presence
- [ ] Same wallet signing (BIP-322) via built-in signer or WalletConnect
- [ ] Same Guardian Shell / Monitor API integration
- [ ] LOD (level of detail), instanced meshes, GPU-accelerated rendering
- [ ] Distribution: Steam, Epic, or direct download
- [ ] Web version remains primary — native client is premium experience

**Trigger:** Launch after gaining meaningful user traction on web version.
**Estimated effort:** 3-6 months with a game dev.
**Key insight:** Backend is already built for this — native client is just a new frontend.

---

## Phase 8: Growth & Ecosystem
**Goal:** Become the standard.

- [ ] Partnership with Bitmap marketplaces
- [ ] Integration with popular AI agent frameworks
- [ ] Browser extension for verifying agents on any website
- [ ] Mobile app
- [ ] Developer documentation & tutorials
- [ ] Open-source the verification protocol
- [ ] Standard proposal (BIP or similar)
- [ ] Agent marketplace
- [ ] Analytics dashboard for verified agents

---

## Revenue Model

### Block Genomics Platform
| Revenue Stream | Model | Estimated |
|---------------|-------|-----------|
| API calls | Free tier + paid tiers | $X per 1000 verifications |
| Premium badges | Monthly subscription | $10-50/month |
| Enterprise API | Annual contracts | $1K-10K/year |
| Platform fee on delegations | % of delegation fees | 5-10% |
| Data analytics | Premium insights | $50-500/month |

### For Bitmap Owners
| Revenue Stream | Model |
|---------------|-------|
| Tier 2 sub-verifications | Per-agent fee set by owner |
| Tier 3 delegations | Per-agent fee set by owner |
| Block data licensing | Custom pricing |

---

*Total estimated steps to production: ~80-100 tasks*
*Estimated time (focused): 4-8 weeks to MVP*
*Estimated time (with other projects): 8-12 weeks*

---

*Last updated: 2026-02-03*
