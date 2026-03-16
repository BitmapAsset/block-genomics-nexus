# Block Genomics Security Audit Report

**Date:** 2026-03-16
**Scope:** Full codebase — 216 TypeScript files, 89 API routes, wallet integrations, Guardian AI, Brain engine, RuneBolt bridge
**Auditor:** Automated deep audit (Claude Opus 4.6)

---

## Executive Summary

The Block Genomics platform has **5 CRITICAL**, **11 HIGH**, **8 MEDIUM**, and **7 LOW** findings. The most urgent issues are **production secrets committed to git**, a **signature verification bypass for all taproot (bc1p) addresses**, and a **hardcoded admin backdoor**. Several API endpoints handling Bitcoin ownership, game state, and world building lack authentication entirely, allowing any caller to impersonate wallet holders.

Positive: E2E crypto design is solid (ECDH+HKDF+AES-256-GCM), RuneBolt wallet has good memory guards, Brain content moderation is conservative and well-designed, monitor tokens use timing-safe comparison, and the app never handles raw private keys.

---

## CRITICAL Findings

### C-01: Production Secrets Committed to Git
**Severity:** CRITICAL
**Files:** `.env:2-7`, `.env.local:2-14`, `.env.vercel:4-18`, `runebolt/.env:2-3`

Multiple `.env` files containing production secrets are tracked in git despite `.gitignore` rules (added before ignore was set). Exposed secrets include:
- Supabase database password (`9AUS5XLQaTh4Aehy`)
- Full PostgreSQL connection strings
- `DATABASE_SUPABASE_JWT_SECRET`, `DATABASE_SUPABASE_SECRET_KEY`, `DATABASE_SUPABASE_SERVICE_ROLE_KEY`
- `BRAIN_SCAN_SECRET`
- `VERCEL_OIDC_TOKEN`
- **Voltage LND admin macaroon** (full control of Bitcoin Lightning node)

**Impact:** Anyone with repo access has full database admin, Lightning node control, and Supabase service role access. If the repo has ever been public or forked, all infrastructure is compromised.

**Fix:**
```bash
git rm --cached .env .env.local .env.vercel runebolt/.env .env.sqlite.bak
```
Then **immediately rotate ALL secrets**: DB passwords, JWT secrets, Supabase keys, Voltage macaroon, BRAIN_SCAN_SECRET, OIDC tokens. Audit git history with `git log --all --diff-filter=A -- '*.env*'` and consider `git filter-repo` to purge from history.

---

### C-02: Taproot Signature Verification Bypass
**Severity:** CRITICAL
**Files:** `src/lib/api-helpers.ts:33-43`, `src/app/api/v1/auth/verify/route.ts:38-48`

The `verifyWalletSignature` function falls back to accepting **any base64 string ≥64 bytes** for taproot (`bc1p`) addresses when `bip322-js` throws:

```typescript
if (address.startsWith('bc1p') && signature.length >= 40) {
  const sigBytes = Buffer.from(signature, 'base64');
  return sigBytes.length >= 64; // ← No actual cryptographic verification
}
```

**Impact:** Complete authentication bypass for all taproot wallet holders. An attacker crafts a trivial 64-byte base64 string and authenticates as any `bc1p` address. This affects **18+ endpoints** including ownership verification, delegation purchase, profile management, guardian control, and world building.

**Fix:** Implement proper Schnorr signature verification for taproot addresses using `@noble/secp256k1` or equivalent. Until fixed, reject all `bc1p` authentication attempts.

---

### C-03: Hardcoded Admin Backdoor
**Severity:** CRITICAL
**File:** `src/app/api/v1/admin/cleanup-duplicates/route.ts:15`

```typescript
if (adminSecret !== process.env.ADMIN_SECRET && adminSecret !== 'cleanup-2026') {
```

The hardcoded string `'cleanup-2026'` permanently bypasses the `ADMIN_SECRET` environment variable, allowing anyone to execute admin cleanup operations.

**Fix:** Remove `&& adminSecret !== 'cleanup-2026'`. Use only `process.env.ADMIN_SECRET`.

---

### C-04: Delegation Purchase Accepts Fake Transactions
**Severity:** CRITICAL
**File:** `src/app/api/v1/delegations/purchase/route.ts:30-31`

```typescript
/* MOCK — replace with real tx verification against Bitcoin network */
// TODO: Verify txId on-chain: correct outputs, amounts, confirmations
```

The `txId` is accepted without any on-chain verification. An attacker submits a fake transaction ID and receives delegation access for free.

**Fix:** Verify the transaction on-chain before granting access: check it exists, has sufficient confirmations, pays the correct amount to the correct address.

---

### C-05: Ownership Verification Fallback Trusts Frontend
**Severity:** CRITICAL
**File:** `src/app/api/v1/auth/verify/route.ts:311-317`

When external APIs (Unisat, ordinals.com) are unavailable, `verifyInscriptionOwnership()` falls back to:
```typescript
console.warn(`Could not verify inscription content for ${inscriptionId}, accepting with wallet trust`);
return { verified: true };
```

**Impact:** An attacker times requests when APIs are down (or blocks them) and claims ownership of any block.

**Fix:** Return a temporary failure and prompt the user to retry. Never default to `verified: true`.

---

## HIGH Findings

### H-01: No Authentication on Game State Endpoints
**Severity:** HIGH
**Files:**
- `src/app/api/v1/game/state/route.ts:27` — POST: anyone sets arbitrary score/coins/xp/level for any wallet
- `src/app/api/v1/game/elements/route.ts:21` — POST: no signature, trusts `ownerAddress` from body
- `src/app/api/v1/game/elements/[id]/route.ts:4,22` — PATCH/DELETE: no signature
- `src/app/api/v1/game/quests/route.ts:21` — POST: no signature
- `src/app/api/v1/game/quests/[id]/route.ts:4,23` — PATCH/DELETE: no signature

All game endpoints trust `ownerAddress`/`walletAddress` from the request body with zero cryptographic proof.

**Fix:** Require BIP-322 signature verification on all write endpoints. Derive the wallet address from the verified signature, not the request body.

---

### H-02: No Authentication on Profile Management
**Severity:** HIGH
**Files:**
- `src/app/api/v1/profiles/create/route.ts:15` — anyone creates profiles for verified wallets
- `src/app/api/v1/profiles/update/route.ts:5` — anyone updates handle/bio/displayName
- `src/app/api/v1/profiles/set-primary/route.ts:5` — anyone changes primary block

**Fix:** Require wallet signature verification on all profile mutation endpoints.

---

### H-03: Mass Assignment via Unchecked Object Spread
**Severity:** HIGH
**Files:**
- `src/app/api/v1/game/elements/route.ts:41` — `data: { blockHeight, ownerAddress, gameType, ...rest }`
- `src/app/api/v1/game/elements/[id]/route.ts:14` — `data: updates` (raw body)
- `src/app/api/v1/game/quests/route.ts:36` — `data: { ...rest }`
- `src/app/api/v1/game/state/route.ts:37-39` — `{ ...updates }` into create/update
- `src/app/api/v1/world/[id]/route.ts:22` — `data: updates`
- `src/app/api/v1/world/batch/route.ts:35` — `{ ...op.data } as any`
- `src/app/api/v1/world/route.ts:46` — `{ ...rest }`
- `src/app/api/v1/world/terrain/route.ts:43` — `update: settings`

Attackers can set arbitrary database fields (e.g., `claimCount`, `enabled`, `maxClaims`, `score`, `level`) by including extra fields in request bodies.

**Fix:** Explicitly allowlist fields for each endpoint. Never spread raw request body into Prisma operations.

---

### H-04: Encryption Key Registration Unauthenticated (E2E MITM)
**Severity:** HIGH
**File:** `src/app/api/v1/encryption/route.ts:56-98`

POST accepts `{ walletAddress, encryptionPubKey }` with no signature verification. An attacker registers their own public key under a victim's address, intercepting all future encrypted DMs.

**Fix:** Require wallet signature to prove ownership before storing encryption public keys.

---

### H-05: Guardian Chat Owner Spoofing + Prompt Injection
**Severity:** HIGH
**File:** `src/app/api/v1/guardian/chat/route.ts:14-117`

- `visitorAddress` is client-provided with no signature check (line 79 owner check is spoofable)
- User messages pass directly to LLM with no sanitization despite a comment promising control character stripping
- Owner verification bypass allows executing world-building actions (place/delete objects, terraform)

**Fix:** Require signature verification for `visitorAddress`. Strip control characters as documented. Consider output filtering on LLM responses.

---

### H-06: Guardian Create Doesn't Verify Signatures
**Severity:** HIGH
**File:** `src/app/api/v1/guardian/route.ts:37-39`

The POST handler checks that `signature` and `signedMessage` fields are **present** but never calls `verifyWalletSignature()`. A presence check is not authentication.

**Fix:** Call `verifyWalletSignature(ownerAddress, signedMessage, signature)` and reject on failure.

---

### H-07: Challenge Nonce Anti-Replay is Optional
**Severity:** HIGH
**File:** `src/app/api/v1/auth/verify/route.ts:57-64`

```typescript
const challenge = getChallenge(walletAddress);
if (challenge) { // ← only checks if challenge exists
```

If no challenge was requested, nonce validation is skipped entirely. Combined with C-02, an attacker targeting taproot addresses needs no challenge at all.

**Fix:** Make challenge nonce mandatory. Reject verification if no challenge exists for the address.

---

### H-08: In-Memory Challenge Store (Multi-Instance Bypass)
**Severity:** HIGH
**File:** `src/lib/challenges.ts:1-22`

Challenges stored in an in-memory `Map` are invisible across serverless instances. Attacker requests challenge on instance A, verifies on instance B where no challenge exists (bypasses H-07).

**Fix:** Use Redis or database-backed challenge store. The file itself notes "replace with Redis in production."

---

### H-09: Open CORS on RuneBolt Bridge Server
**Severity:** HIGH
**File:** `runebolt/src/server.js:13`

```javascript
app.use(cors()); // Allows ALL origins
```

This server controls a Lightning node (pay/create invoices, manage channels). Any website can make cross-origin requests.

**Fix:** Restrict CORS to `blockgenomics.io` and `runebolt.blockgenomics.io`.

---

### H-10: RuneBolt Admin Endpoints Unauthenticated
**Severity:** HIGH
**File:** `runebolt/src/server.js:168-179`

`POST /api/bridge/inventory/dog` and `POST /api/bridge/inventory/bitmap` have zero authentication. Combined with open CORS, anyone can manipulate bridge inventory.

**Fix:** Add API key or signature-based authentication.

---

### H-11: Mock signMessage in AuthContext
**Severity:** HIGH
**File:** `src/context/AuthContext.tsx:199-201`

```typescript
const signMessage = useCallback(async (message: string) => {
  const nonce = Math.random().toString(36).slice(2, 10);
  return `mock_bip322_${nonce}_${btoa(message).slice(0, 12)}`;
}, []);
```

Returns a fake signature with no cryptographic proof. If any code path uses `AuthContext.signMessage` for authentication, signatures are meaningless.

**Fix:** Remove mock implementation. Delegate to actual wallet signing via `wallet-utils.ts`.

---

## MEDIUM Findings

### M-01: No Rate Limiting on Most Endpoints
**Severity:** MEDIUM
**Affected:** All write endpoints except chat (which has a 2s in-memory limiter)

Critical endpoints lacking rate limiting:
- `v1/auth/verify` — verification brute-force
- `v1/guardian/chat` — LLM calls (costs money)
- `v1/lightning/invoice` — invoice creation spam
- `v1/brain/flag` / `v1/brain/appeal` — flag/vote stuffing
- `v1/profiles/create` — profile spam
- `v1/delegations/listings` — listing spam

**Fix:** Implement rate limiting middleware (e.g., `@upstash/ratelimit` with Redis) on all write endpoints.

---

### M-02: CSP Allows `unsafe-eval` and `unsafe-inline`
**Severity:** MEDIUM
**File:** `next.config.ts:31`

The Content Security Policy includes `'unsafe-eval'` and `'unsafe-inline'` for scripts, significantly weakening XSS protections.

**Fix:** Remove `unsafe-eval` if possible (may require Three.js adjustments). Use nonce-based CSP for inline scripts.

---

### M-03: No CSRF Protection
**Severity:** MEDIUM
**Affected:** All POST/PATCH/DELETE endpoints without signature verification

Endpoints with BIP-322 signatures have implicit CSRF protection, but the ~50% of write endpoints without signatures are fully vulnerable.

**Fix:** Add CSRF tokens or require signature verification on all mutation endpoints.

---

### M-04: Error Information Disclosure
**Severity:** MEDIUM
**Files:**
- `v1/block-thumbnail/[height]/route.ts:114` — `error: err.message`
- `v1/delegations/listings/route.ts:63` — leaks DB owner address
- `v1/guardian/chat/route.ts:414` — `error: String(e)` exposes internals
- `v1/world/batch/route.ts:56` — `error: String(e)`
- `v1/heartbeat/route.ts:48` — `detail: err?.message`

**Fix:** Use the existing `error()` helper from `api-helpers.ts` consistently. Never pass raw error objects/messages to clients.

---

### M-05: Secrets Passed as Query Parameters
**Severity:** MEDIUM
**Files:**
- `v1/ownership/cron/route.ts:19` — `?secret=...` in URL
- `v1/guardian/[id]/route.ts:72-75` — signature/address in query params

Query parameters are logged in access logs, CDN logs, browser history, and Referer headers.

**Fix:** Move secrets and signatures to request headers or POST body.

---

### M-06: Weak Bitcoin Address Validation
**Severity:** MEDIUM
**File:** `src/lib/api-helpers.ts:19-22`

Regex-only validation without Bech32/Bech32m checksum verification. Malformed addresses pass validation.

**Fix:** Use `bitcoinjs-lib` address validation which checks actual checksums.

---

### M-07: Guardian Sensitive Fields Exposed
**Severity:** MEDIUM
**File:** `src/app/api/v1/guardian/[id]/route.ts:14`

GET returns the full guardian object (only `llmApiKey` masked). Exposes `escalateTelegram`, `escalateEmail`, `monitorTokenHash`, `agentEndpoint` to any unauthenticated caller.

**Fix:** Return only public fields. Require authentication for sensitive configuration data.

---

### M-08: Brain Appeal/Vote Stuffing
**Severity:** MEDIUM
**File:** `src/app/api/v1/brain/appeal/route.ts:12`

No signature verification for appeals or votes. Anyone can appeal content or stuff votes using any `walletAddress`.

**Fix:** Require signature verification. Implement one-vote-per-wallet enforcement.

---

## LOW Findings

### L-01: Unbounded In-Memory Caches
**Files:** `v1/bitmap-image/[height]/route.ts:13` (inscriptionCache), `v1/chat/[blockHeight]/route.ts:77` (rateLimitMap cleaned at 1000)

In-memory caches grow without bound, potential memory exhaustion under sustained load.

### L-02: User Data Exposed Without Auth
**Files:** `v1/users/[address]/route.ts`, `v1/users/by-wallet/[address]/route.ts`, `v1/users/by-handle/[handle]/route.ts`

Full user profiles (wallet, genome hash, handle, tier, block counts) returned to unauthenticated callers. May be by design for public profiles but worth reviewing for PII exposure.

### L-03: Search Query Not Length-Limited
**File:** `v1/search/route.ts:10`

Has minimum length check but no maximum. Very long search strings could stress database `LIKE` queries.

### L-04: Non-Deterministic Signature Key Derivation
**File:** `src/lib/e2e-crypto.ts:113-140`

Some wallet implementations produce non-deterministic BIP-322 signatures. If a user gets a different signature on re-derivation, they lose access to previously encrypted messages.

### L-05: Analytics Admin Auth via Query Param
**File:** `v1/analytics/route.ts:9-11`

Admin wallet addresses checked via `?wallet=` query parameter with no signature verification. Anyone who knows an admin address gets analytics access.

### L-06: Unbounded Date Parsing
**Files:** `v1/agents/[agentId]/events/route.ts:20`, `v1/chat/[blockHeight]/route.ts:26`

`new Date(since)` with no validation. Invalid date strings create `Invalid Date` objects causing undefined Prisma behavior.

### L-07: RuneBolt Incomplete Memory Zeroing
**File:** `runebolt/src/wallet/KeyManager.ts:140-147`

`lock()` sets `masterKey = null` but doesn't zero the BIP32 internal private key bytes before releasing the reference.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL | 5 | Committed secrets, signature bypass, admin backdoor, fake tx acceptance, ownership fallback |
| HIGH | 11 | Missing auth on mutations, mass assignment, MITM on E2E, prompt injection, open CORS |
| MEDIUM | 8 | No rate limiting, weak CSP, no CSRF, error leaks, query param secrets |
| LOW | 7 | Memory leaks, public data exposure, input validation gaps |

## Priority Remediation Order

1. **Rotate all secrets** and remove `.env` files from git (C-01)
2. **Fix taproot signature verification** — proper Schnorr verification (C-02)
3. **Remove hardcoded admin bypass** (C-03)
4. **Implement on-chain tx verification** for delegation purchases (C-04)
5. **Remove ownership verification fallback** (C-05)
6. **Add signature verification** to all unauthenticated write endpoints (H-01 through H-06)
7. **Make challenge nonce mandatory** and move to Redis (H-07, H-08)
8. **Restrict RuneBolt CORS** and add auth to admin endpoints (H-09, H-10)
9. **Add rate limiting** across all endpoints (M-01)
10. **Allowlist fields** in all Prisma operations using request body spread (H-03)

---

*Report generated 2026-03-16. This handles real Bitcoin wallets — all CRITICAL items should be addressed before any public deployment.*
