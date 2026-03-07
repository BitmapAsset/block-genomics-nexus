# 🔒 Block Genomics — Security Audit Report

**Auditor:** Automated Security Review (Claude)
**Date:** February 6, 2026
**Scope:** Full PoC codebase — `verify/app.js`, Prisma schema, protocol spec, wallet integration, DNA visualizer
**Classification:** CONFIDENTIAL — Internal Use Only

---

## Executive Summary

Block Genomics is building security-critical identity infrastructure ("SSL certificates for AI") on top of Bitcoin block ownership. The current codebase is a **Proof of Concept** running entirely client-side, which means many findings are expected at this stage. However, several **architectural decisions made now will be extremely difficult to change later** — these are the Critical and High findings.

| Severity | Count |
|----------|-------|
| **Critical** | 5 |
| **High** | 8 |
| **Medium** | 11 |
| **Low** | 7 |
| **Info** | 4 |

**Overall risk posture: HIGH** — The PoC has fundamental cryptographic and architectural gaps that must be resolved before any production deployment, or even a beta with real users.

---

## Section 1: Critical Vulnerabilities

### CRIT-01: No Server-Side Signature Verification — Entire Verification is Client-Side
**Severity:** Critical
**CVSS:** 9.8

The entire verification flow — challenge generation, signing, genome creation, trust score calculation, and agent record creation — happens in the browser. There is **zero server-side verification**.

```javascript
// verify/app.js — verifyAgent() line ~330
async verifyAgent(blockHeight, agentName, tier = 1) {
    const steps = [];
    // Step 1: Generate genome — CLIENT-SIDE
    const genomeResult = await this.generateGenome(blockHeight);
    // Step 2: Generate challenge — CLIENT-SIDE
    const challenge = this.generateChallenge(blockHeight, agentName);
    // Step 3: Sign — CLIENT-SIDE (wallet)
    const signResult = await this.signChallenge(challenge.message);
    // Step 4: Create agent record — CLIENT-SIDE
    const agent = { ... };
    this.currentAgent = agent;
    return { agent, steps, genomeResult };
}
```

**Attack:** Any user can open DevTools and execute:
```javascript
BG.currentAgent = { id: 'bg_fake', verified: true, tier: 1, trustScore: 100, ... };
BG.saveAgent(BG.currentAgent);
```
This creates a "verified" agent without any wallet, signature, or Bitmap ownership.

**Impact:** The entire verification model is bypassed. Anyone can impersonate any block owner.

**Fix:** The challenge/response MUST happen server-side:
1. Server generates challenge + nonce and stores it (Redis, with 5-min TTL)
2. Client signs the challenge via wallet
3. Client sends `{ challengeId, signature, address }` to server
4. **Server** verifies signature using `bitcoinjs-message` or equivalent
5. **Server** queries an indexer to confirm the address owns the Bitmap inscription
6. **Server** generates the genome and stores it
7. Server returns the signed verification result (JWT or similar)

---

### CRIT-02: No Signature Verification Against a Public Key or Address
**Severity:** Critical
**CVSS:** 9.5

The code calls `window.unisat.signMessage()` and receives a signature, but **never verifies it**. The signature is stored but never checked against the signing address, the public key, or the challenge message.

```javascript
// verify/app.js — signChallenge()
async signChallenge(message) {
    if (this.wallet.provider === 'unisat') {
        const signature = await window.unisat.signMessage(message, 'bip322-simple');
        return { success: true, signature };  // ← Just returns it. No verification.
    }
    // ...
}
```

**Attack:** An attacker could:
1. Connect any wallet (doesn't need to own the Bitmap)
2. Sign the challenge with their own key
3. The system accepts it because it never checks that the signer == the Bitmap owner

**Impact:** Any wallet holder can claim ownership of any Bitmap.

**Fix:**
```javascript
// Server-side (Node.js)
const bitcoinMessage = require('bitcoinjs-message');

function verifySignature(message, address, signature) {
    try {
        return bitcoinMessage.verify(message, address, signature);
    } catch (e) {
        return false;
    }
}
// Then: confirm address === bitmap inscription owner via indexer
```

---

### CRIT-03: Challenge Nonce is Generated Client-Side — Replay & Forgery
**Severity:** Critical
**CVSS:** 9.0

The challenge nonce, timestamp, and the entire challenge message are generated in the client:

```javascript
// verify/app.js — generateChallenge()
generateChallenge(blockHeight, agentName) {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    const timestamp = new Date().toISOString();
    const message = [ ... ].join('\n');
    return { message, nonce, timestamp, blockHeight, agentName };
},
```

**Attacks:**
1. **Replay:** An attacker who intercepts a signed challenge can replay it forever — there's no server-side nonce registry to mark it as used.
2. **Forgery:** The attacker can craft any challenge message (e.g., changing `blockHeight` to a block they don't own) and sign it.
3. **Time manipulation:** The client controls the timestamp, so expiration checks are meaningless.

**Impact:** Complete bypass of replay protection. The 5-minute expiration mentioned in the spec is unenforceable client-side.

**Fix:** Server generates all challenge parameters. Server stores `{ nonce, timestamp, blockHeight, agentName, used: false }` in Redis with 5-min TTL. Upon verification, mark the nonce as used and check `used === false`.

---

### CRIT-04: Genome is Not Deterministically Bound to a Canonical Data Source
**Severity:** Critical
**CVSS:** 8.5

The genome hash depends on data fetched from mempool.space API at the time of verification:

```javascript
// verify/app.js — generateGenome()
const hashResp = await fetch(`${this.API}/block-height/${blockHeight}`);
const blockHash = await hashResp.text();
const blockResp = await fetch(`${this.API}/block/${blockHash}`);
const block = await blockResp.json();

// Fetch transactions (up to 200)
const txPages = Math.min(Math.ceil(block.tx_count / 25), 8);
let transactions = [];
for (let i = 0; i < txPages; i++) {
    const txResp = await fetch(`${this.API}/block/${blockHash}/txs/${i * 25}`);
    // ...
}
```

**Problems:**
1. **Transaction sampling is non-deterministic.** Only up to 200 transactions are fetched (8 pages × 25). If mempool.space changes pagination, ordering, or returns slightly different data, the genome changes.
2. **API responses may vary over time.** Fields like `fee` can be recalculated. Unconfirmed data can shift.
3. **No integrity check on the API response.** If mempool.space is compromised or returns stale/different data, the genome changes.
4. **Race condition:** Two verifications of the same block at slightly different times could get different transaction sets if the API is under load.

**Impact:** The genome — which is the *core identity primitive* — is not reproducible. Two independent verifications of the same block may produce different genomes. This breaks the "fingerprint" promise.

**Fix:**
1. Fetch ALL transactions for the block, not a sample
2. Use only data derivable from the raw block (header + coinbase tx + merkle root) for the primary genome
3. Store the canonical genome in the database and re-verify against it
4. Validate block hash against the header to ensure API integrity
5. Consider running your own Bitcoin full node for canonical data

---

### CRIT-05: localStorage as the Sole Data Store — No Integrity or Confidentiality
**Severity:** Critical (for anything beyond local PoC demo)
**CVSS:** 8.0

```javascript
// verify/app.js — saveAgent()
saveAgent(agent) {
    const agents = this.getAgents();
    agents[agent.id] = agent;
    localStorage.setItem('bg_agents', JSON.stringify(agents));
},
```

**Attacks:**
1. Any JavaScript on the same origin can read/write localStorage
2. XSS vulnerability anywhere in the app = full agent database compromise
3. Browser extensions can access localStorage
4. No encryption, no signing, no tamper detection
5. `JSON.parse` on corrupted data = potential code execution via prototype pollution

**Impact:** All agent data, genomes, trust scores, and "verification" status can be freely modified.

**Fix:** Acceptable for PoC demo only. For any real deployment:
- Move all agent data to server-side PostgreSQL (schema already designed)
- Client receives signed JWTs or verification proofs, not raw mutable data
- Never trust client-side storage for security-critical state

---

## Section 2: Authentication & Authorization

### HIGH-01: No Session Management
**Severity:** High
**CVSS:** 7.5

There is no session token, JWT, cookie, or any authentication state. The `wallet.connected` boolean is the only "auth":

```javascript
wallet: {
    connected: false,
    provider: null,
    address: null,
    // ...
}
```

Setting `BG.wallet.connected = true` and `BG.wallet.address = 'bc1qfakeaddress'` in DevTools grants full access.

**Fix:** After server-side verification, issue a signed JWT with claims: `{ agentId, blockHeight, tier, exp }`. Validate on every API call.

---

### HIGH-02: No Bitmap Ownership Verification at Sign Time
**Severity:** High
**CVSS:** 8.0

The flow detects Bitmaps in the wallet, but when signing, it doesn't confirm the connected address actually owns the Bitmap for the claimed `blockHeight`. The user could:
1. Connect a wallet with Bitmap for block 100
2. Enter block 500000 manually
3. Sign the challenge for block 500000
4. The system generates a genome for block 500000 without confirming ownership

```javascript
// verify/app.js — verifyAgent()
// Step 1: Generate genome for ANY blockHeight
const genomeResult = await this.generateGenome(blockHeight);  // No ownership check!
```

**Fix:** After signature, server must:
1. Query an Ordinals indexer for the inscription `{blockHeight}.bitmap`
2. Confirm the inscription's current owner address matches the signer's address
3. Reject if mismatch

---

### HIGH-03: Wallet Provider Impersonation
**Severity:** High
**CVSS:** 7.0

The code trusts `window.unisat`, `window.XverseProviders`, etc. An attacker can inject a fake wallet object:

```javascript
// Attack:
window.unisat = {
    requestAccounts: async () => ['bc1q_victim_address'],
    getPublicKey: async () => 'fake_pubkey',
    getBalance: async () => ({ confirmed: 1000000 }),
    getInscriptions: async () => ({ list: [{ content: '500000.bitmap', ... }], total: 1 }),
    signMessage: async (msg) => 'fake_signature_base64',
};
```

The app would treat this as a legitimate Unisat connection.

**Impact:** An attacker can forge wallet connections and produce signatures that the current code accepts.

**Fix:** This is partially inherent to browser extension wallets. Mitigated by:
1. Server-side signature verification (renders fake signatures useless)
2. Checking wallet extension IDs where possible
3. Using wallet-specific SDKs that enforce secure communication channels

---

### MED-01: Challenge Expiration is Unenforceable (5 minutes)
**Severity:** Medium
**CVSS:** 5.5

The VERIFICATION-PROTOCOL.md specifies 5-minute challenge validity, but since the challenge is generated client-side with a client-controlled clock, this is unenforceable.

**Fix:** Server-side challenge generation with server-controlled timestamps. Server rejects challenges older than 5 minutes.

---

### MED-02: No Rate Limiting on Wallet Connection Attempts
**Severity:** Medium
**CVSS:** 5.0

There are no limits on how many times a user can attempt wallet connection or challenge signing. This enables brute-force or enumeration attacks.

**Fix:** Server-side rate limiting: max 5 challenge requests per IP per minute, max 10 verification attempts per address per hour.

---

### MED-03: Multi-Wallet Attack — Tier Escalation
**Severity:** Medium
**CVSS:** 6.0

A user connects with wallet A (owns Bitmap #100), verifies as Tier 1, then disconnects and connects wallet B. The system doesn't invalidate the previous verification or check whether the Bitmap was transferred.

**Fix:**
1. Bind verification to a specific address, stored server-side
2. Periodic re-verification (check ownership hasn't transferred)
3. Invalidate agent on Bitmap transfer (monitor via indexer webhooks)

---

## Section 3: Data Integrity

### HIGH-04: Genome Non-Determinism from Transaction Sampling
**Severity:** High
**CVSS:** 7.5

(Expanded from CRIT-04) The genome includes transaction fingerprints from a partial sample:

```javascript
const txPages = Math.min(Math.ceil(block.tx_count / 25), 8); // Max 200 txs
```

A block with 4,000 transactions samples only 5%. The genome for the same block will differ if:
- The API changes transaction ordering
- The API experiences partial failures
- Different nodes return transactions in different order
- The `fee` field is recalculated differently over time

**Fix:** For deterministic genomes, use ONLY data from the block header (hash, merkle root, timestamp, nonce, bits, difficulty) plus metadata (height, tx_count, size, weight). These are immutable. If transaction data is needed, fetch ALL transactions and sort deterministically by txid.

---

### HIGH-05: Blind Trust in mempool.space API
**Severity:** High
**CVSS:** 7.0

All block data comes from `https://mempool.space/api` with no verification:

```javascript
API: 'https://mempool.space/api',
```

**Risks:**
1. DNS hijacking → attacker controls the API endpoint
2. mempool.space downtime → verification fails
3. mempool.space data corruption → wrong genomes
4. No TLS pinning → MITM possible
5. No response signature or integrity check

**Fix:**
1. Run your own Bitcoin full node (bitcoin-cli) for canonical block data
2. If using external APIs, cross-reference multiple independent sources
3. Verify block hash matches the block header independently
4. Cache canonical block data in your own database (already designed in schema)

---

### HIGH-06: Trust Score is Calculated Client-Side and Fully Manipulable
**Severity:** High
**CVSS:** 7.5

```javascript
calculateTrustScore(block, txs) {
    // ...
    const ownershipFactor = 20; // Full score for verified owner — hardcoded!
    const historyFactor = 10;   // Default for new registration — hardcoded!
    const total = Math.round(ageFactor + richnessFactor + diffFactor + ownershipFactor + historyFactor);
    return { total: Math.min(total, 100), /* ... */ };
}
```

Any user can modify this in DevTools:
```javascript
BG.currentAgent.trustScore = 100;
BG.currentAgent.trustComponents = { total: 100, age: { score: 25, max: 25 }, /* ... */ };
BG.saveAgent(BG.currentAgent);
```

**Fix:** Trust score calculation must be server-side. Client only displays the score; server computes and signs it.

---

### MED-04: Prototype Pollution via JSON.parse on localStorage
**Severity:** Medium
**CVSS:** 5.5

```javascript
getAgents() {
    try {
        return JSON.parse(localStorage.getItem('bg_agents') || '{}');
    } catch { return {}; }
},
```

If `localStorage['bg_agents']` is set to `{"__proto__": {"isAdmin": true}}`, this can pollute `Object.prototype`.

**Fix:** Use a safe JSON parser or `Object.create(null)` as the container, or validate parsed data against a schema.

---

### MED-05: DNA Sequence Generation Uses Lossy Mapping
**Severity:** Medium (data integrity concern)
**CVSS:** 4.0

```javascript
generateDNASequence(block, txs) {
    const bases = ['A', 'T', 'G', 'C'];
    const fullData = block.id + block.merkle_root;
    for (let i = 0; i < fullData.length; i++) {
        const val = parseInt(fullData[i], 16);
        if (!isNaN(val)) sequence += bases[val % 4]; // 16 values → 4 bases = 4:1 collision
    }
}
```

This maps 16 hex chars to 4 bases, losing 75% of entropy. The DNA sequence is a lossy representation of the genome hash.

**Fix:** If the DNA sequence is meant to be a unique identifier, use a 1:1 mapping (e.g., base-4 encoding of the full 256-bit hash). If it's decorative, document that it's not uniquely identifying.

---

### LOW-01: `genomeData` Version Field is Hardcoded
**Severity:** Low

```javascript
const genomeData = { version: 1, ... };
```

No migration strategy if the genome algorithm changes. Old genomes would need recomputation.

**Fix:** Include version in the genome hash itself. Plan for versioned genome lookup.

---

## Section 4: API Security

### HIGH-07: No CORS Configuration Defined
**Severity:** High
**CVSS:** 7.0

The VERIFICATION-PROTOCOL.md defines public API endpoints but doesn't specify CORS policy. Without restrictive CORS, any website can call the API on behalf of a logged-in user.

**Fix:**
```
Access-Control-Allow-Origin: https://verify.blockgenomics.io
Access-Control-Allow-Methods: GET, POST
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 86400
```

---

### MED-06: No Rate Limiting on Public API Endpoints
**Severity:** Medium
**CVSS:** 6.0

The spec defines public endpoints:
```
GET  /api/v1/verify/{agentId}
GET  /api/v1/genome/{blockHeight}
POST /api/v1/challenge
POST /api/v1/verify
```

No rate limiting is specified. An attacker could:
- Enumerate all agents via sequential agentId guessing
- DDoS the genome generation endpoint (which fetches from mempool.space, creating amplification)
- Spam challenge generation to exhaust server-side nonce storage

**Fix:**
- Public GET endpoints: 100 req/min per IP
- Challenge generation: 5 req/min per IP
- Verification submission: 10 req/min per IP
- Genome generation: 10 req/min per IP (heavy endpoint)
- Use Redis-based sliding window rate limiter

---

### MED-07: Block Height Input Not Validated
**Severity:** Medium
**CVSS:** 5.0

```javascript
async generateGenome(blockHeight) {
    const hashResp = await fetch(`${this.API}/block-height/${blockHeight}`);
```

`blockHeight` is user-controlled with no validation. Possible attacks:
- Negative numbers
- Non-integer values
- Block heights that don't exist yet (future blocks)
- Extremely large numbers causing API errors
- Path traversal: `../../secret` (unlikely with mempool.space but bad practice)

**Fix:**
```javascript
function validateBlockHeight(height) {
    const h = parseInt(height, 10);
    if (isNaN(h) || h < 0 || h > currentChainHeight || h !== Number(height)) {
        throw new Error('Invalid block height');
    }
    return h;
}
```

---

### MED-08: Agent Name Not Sanitized
**Severity:** Medium
**CVSS:** 5.5

The `agentName` parameter is included in the challenge message and stored as-is:

```javascript
generateChallenge(blockHeight, agentName) {
    const message = [
        // ...
        `Agent: ${agentName}`,
        // ...
    ].join('\n');
}
```

An attacker could set `agentName` to:
- XSS payload: `<script>alert('xss')</script>`
- SQL injection: `'; DROP TABLE agents;--`
- Very long strings (DoS)
- Unicode/RTL override characters (display manipulation)

**Fix:** Validate agent name: alphanumeric + limited special chars, max 64 characters, sanitize for HTML output.

---

### LOW-02: No Security Headers Defined
**Severity:** Low
**CVSS:** 3.0

No security headers are specified for the web application.

**Fix:** Add to all responses:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://mempool.space https://api.hiro.so; img-src 'self' data:; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

### LOW-03: Badge SVG Allows Content Injection
**Severity:** Low
**CVSS:** 4.0

```javascript
generateBadgeSVG(agent, theme = 'dark') {
    return `<svg ...>
      <text ...>✓ Verified • Block #${agent.blockHeight.toLocaleString()}</text>
      <text ...>Genome: ${agent.genome.slice(0, 16)}… • Trust: ${agent.trustScore}/100</text>
    </svg>`;
}
```

If `agent.blockHeight` or `agent.genome` contains SVG/XML special characters, this enables SVG injection.

**Fix:** Escape XML special characters (`<`, `>`, `&`, `"`, `'`) in all interpolated values.

---

## Section 5: Delegation System

### HIGH-08: Delegation Has No Cryptographic Binding
**Severity:** High
**CVSS:** 7.5

The delegation system creates child agents without any cryptographic proof:

```javascript
async createDelegation(parentAgent, childAgentName, tier = 3) {
    // No signature from parent agent
    // No on-chain record
    // Just creates a JavaScript object
    const delegation = {
        delegationId: delegationId.slice(0, 20),
        parentAgentId: parentAgent.id,
        // ...
        status: 'active',
    };
    const childAgent = { ... };
    return { delegation, childAgent };
}
```

**Attacks:**
1. **Impersonation:** Anyone can create a delegation claiming to be authorized by any parent
2. **Tier escalation:** A Tier 3 agent could create another delegation claiming Tier 1 authority
3. **Unauthorized delegation:** No proof the parent agent actually authorized the delegation

**Fix:**
1. Parent must sign the delegation with their wallet: `sign({ action: 'delegate', childAgent, tier, expiry })`
2. Delegation record must include parent's signature
3. Verification of a delegated agent requires verifying the full chain back to Tier 1

---

### MED-09: No Delegation Revocation Mechanism
**Severity:** Medium
**CVSS:** 6.0

The schema has `DelegationStatus` (ACTIVE/REVOKED/EXPIRED) but the app code has no revocation function. There's also no propagation — revoking a Tier 2 delegation should cascade to all Tier 3 delegations under it.

**Fix:**
1. Add `revokeDelegation(delegationId, parentSignature)` endpoint
2. Revocation must propagate: revoking parent → revokes all children
3. Verification of delegated agents must check the full chain is still active
4. Consider a revocation list (CRL) or OCSP-style real-time check

---

### MED-10: Trust Score Reduction for Delegation is Insufficient
**Severity:** Medium
**CVSS:** 4.5

```javascript
const trustReduction = tier === 2 ? 0.8 : 0.6;
const childTrustScore = Math.round(parentAgent.trustScore * trustReduction);
```

A Tier 1 agent with trust score 100 produces:
- Tier 2: 80
- Tier 3: 60

60 is still a high trust score. A chain of delegations (Tier 1 → Tier 2 → Tier 3) compounds to 48, which is still moderate. There's no depth limit on delegation chains.

**Fix:**
1. Tier 3 should be capped at a maximum (e.g., 50)
2. Add a maximum delegation chain depth (e.g., 2 hops max)
3. Make trust score decay more aggressively per tier

---

### LOW-04: Child Agent Gets Parent's Genome
**Severity:** Low
**CVSS:** 3.5

```javascript
const childAgent = {
    genome: parentAgent.genome,  // Same genome as parent!
```

Delegated agents share the parent's genome. This means the genome isn't a unique identifier — multiple agents can have the same genome.

**Fix:** Generate a derived genome for delegated agents: `genome = sha256(parentGenome + childAgentName + delegationId)`. This preserves the chain while ensuring uniqueness.

---

## Section 6: Privacy Concerns

### MED-11: Genome-to-Address Deanonymization
**Severity:** Medium
**CVSS:** 6.5

The agent record stores:
```javascript
const agent = {
    walletAddress: this.wallet.address,
    blockHeight: blockHeight,
    genome: genomeResult.genome,
    // ...
};
```

The genome is intended to be public (displayed on badges). The wallet address is stored in the same record. Since the block height is public and the genome is deterministic, anyone can:
1. See a badge with genome `7a3f...`
2. Look up which block produces that genome
3. Look up who owns the Bitmap inscription for that block
4. Determine the wallet address

**Impact:** The verification badge effectively deanonymizes the wallet address.

**Fix:**
1. Document this as a design feature, not a bug (users should know)
2. Offer optional privacy mode where the badge shows the genome but the block height is not directly linked
3. Consider zero-knowledge proofs for ownership (ZK-proof that "I own a Bitmap" without revealing which one) — future enhancement

---

### LOW-05: Public API Exposes Agent Data
**Severity:** Low
**CVSS:** 3.0

The API spec includes:
```
GET /api/v1/agent/{agentId} → Agent profile
GET /api/v1/block/{height}/agents → All agents verified under this block
```

This allows enumeration of all agents and their associated blocks/wallets.

**Fix:** Require authentication for full agent profiles. Public endpoint returns only: `{ verified, tier, trustScore, genome }`. Wallet address is never returned publicly.

---

### LOW-06: GDPR Implications of Immutable Verification Records
**Severity:** Low
**CVSS:** 2.5

Verification records store signatures and wallet addresses. Under GDPR, a user has the right to erasure. Bitcoin addresses may qualify as personal data (linkable to identity).

**Fix:** Design for deletability from the start:
1. Allow users to request verification deletion
2. Keep anonymized statistical data only
3. Document data retention policy
4. Implement right-to-erasure endpoint

---

### INFO-01: Inscription Content Leaks Browsing Behavior
**Severity:** Info

Fetching inscription content from `api.hiro.so` exposes which addresses the app is interested in. Hiro could build a profile of Block Genomics users.

**Fix:** Run your own Ordinals indexer in production.

---

### INFO-02: Wallet Balance Fetched but Not Needed
**Severity:** Info

```javascript
const balance = await window.unisat.getBalance();
this.wallet.balance = balance;
```

The balance has no role in verification but is stored in the wallet state.

**Fix:** Don't fetch or store data that isn't needed. Minimizes attack surface and privacy exposure.

---

## Section 7: Recommendations

### P0 — Critical (Must Fix Before Any Beta)

| # | Finding | Effort | Fix |
|---|---------|--------|-----|
| 1 | CRIT-01: Client-side verification | High | Move entire verify flow to server |
| 2 | CRIT-02: No signature verification | Medium | Use `bitcoinjs-message.verify()` server-side |
| 3 | CRIT-03: Client-side challenge generation | Medium | Server generates + stores challenges in Redis |
| 4 | CRIT-04: Non-deterministic genomes | High | Use only immutable block header data |
| 5 | HIGH-02: No ownership check at verify time | Medium | Query indexer to confirm Bitmap ownership |
| 6 | HIGH-08: No cryptographic delegation binding | Medium | Require parent wallet signature for delegation |

### P1 — High (Must Fix Before Production)

| # | Finding | Effort | Fix |
|---|---------|--------|-----|
| 7 | CRIT-05: localStorage data store | High | Migrate to PostgreSQL |
| 8 | HIGH-01: No session management | Medium | JWT-based sessions |
| 9 | HIGH-04: Transaction sampling | Medium | Exclude txs from genome or fetch all |
| 10 | HIGH-05: Blind trust in mempool.space | High | Run own Bitcoin node or cross-reference |
| 11 | HIGH-06: Client-side trust score | Low | Move calculation to server |
| 12 | HIGH-07: No CORS | Low | Add CORS headers |
| 13 | HIGH-03: Wallet provider impersonation | Low | Mitigated by server-side sig verification |

### P2 — Medium (Fix Before Scale)

| # | Finding | Effort | Fix |
|---|---------|--------|-----|
| 14 | MED-01 – MED-03: Challenge/rate/multi-wallet | Medium | Server-side enforcement |
| 15 | MED-06 – MED-08: API security | Medium | Rate limiting + input validation |
| 16 | MED-09 – MED-10: Delegation gaps | Medium | Revocation cascade + depth limits |
| 17 | MED-11: Privacy deanonymization | Low | Document + optional privacy mode |

### P3 — Nice to Have

| # | Finding | Effort | Fix |
|---|---------|--------|-----|
| 18 | LOW-01 – LOW-06 | Low | Various small fixes |
| 19 | INFO-01 – INFO-02 | Low | Data minimization |

### Architecture Improvements

1. **Run a Bitcoin full node** — Eliminates dependency on mempool.space for block data
2. **Run an Ordinals indexer** (e.g., ord) — Eliminates dependency on Hiro API
3. **Add a message queue** (e.g., BullMQ + Redis) — For async genome generation
4. **Add monitoring** — Alert on failed verifications, unusual patterns
5. **Add audit logging** — Every verification attempt logged with IP, timestamp, result

### Production Hardening Checklist

- [ ] Server-side challenge/verify flow
- [ ] PostgreSQL for all data
- [ ] Redis for sessions, rate limiting, nonce store
- [ ] JWT authentication
- [ ] HTTPS only (HSTS)
- [ ] Security headers (see LOW-02)
- [ ] Rate limiting on all endpoints
- [ ] Input validation + sanitization
- [ ] CORS policy
- [ ] CSP policy
- [ ] DDoS protection (Cloudflare or similar)
- [ ] Logging + monitoring (Sentry, Datadog)
- [ ] Automated dependency scanning (Dependabot, Snyk)
- [ ] Penetration testing before launch

### Recommended CSP Policy

```
Content-Security-Policy:
    default-src 'none';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    connect-src 'self' https://mempool.space/api https://api.hiro.so;
    img-src 'self' data: blob:;
    font-src 'self';
    frame-src 'none';
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
    upgrade-insecure-requests;
```

Note: `'unsafe-inline'` for styles may be needed for the DNA visualizer but should be replaced with nonce-based CSP when possible.

---

*End of Security Audit Report*
