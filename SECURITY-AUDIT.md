# Block Genomics — Security Audit Report

**Date:** 2026-02-15  
**Auditor:** Pepe (automated, code-level review)  
**Scope:** Full application at `src/` — API routes, auth, encryption, client-side  
**Target:** blockgenomics.io (production)

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 3 |
| 🟠 HIGH | 7 |
| 🟡 MEDIUM | 8 |
| 🔵 LOW | 5 |
| ℹ️ INFO | 4 |

---

## 🔴 CRITICAL

### C1: Wallet Signature Verification is a No-Op (MOCK)

**Location:** `src/lib/api-helpers.ts:18-22`  
**Description:** `verifyWalletSignature()` accepts ANY non-empty string as a valid signature. The function body is `return !!signature && signature.length > 0`. This means **any attacker can impersonate any wallet address** — no cryptographic verification occurs.

**Impact:** Complete authentication bypass. An attacker can:
- Claim any handle as any wallet
- Create/modify guardians for any block
- Create delegation listings for blocks they don't own
- Trigger ownership sync as any address
- Purchase delegations as any wallet

**Routes affected:** `/api/v1/auth/verify`, `/api/v1/guardian` (POST), `/api/v1/guardian/monitor` (POST/DELETE), `/api/v1/ownership/sync`, `/api/v1/delegations/purchase`, `/api/v1/delegations/listings` (POST), `/api/v1/estates` (POST)

**Fix:** Implement real BIP-322 verification. The auth/verify route has a partial implementation using `bip322-js` with a fallback that accepts base64 strings ≥30 bytes — this fallback is also trivially bypassed. Remove the fallback entirely and make `bip322-js` a hard dependency.

---

### C2: BIP-322 Fallback in auth/verify Accepts Any Base64

**Location:** `src/app/api/v1/auth/verify/route.ts:33-38`  
**Description:** When `bip322-js` library fails to load (which the `catch` block handles), the fallback accepts any base64 string ≥30 bytes decoded length and ≥40 chars. This is trivially forged.

**Impact:** Even if BIP-322 is installed, any import failure (version mismatch, dependency issue) silently degrades to no-auth. An attacker who can trigger the library to fail (e.g., resource exhaustion) bypasses auth.

**Fix:** Remove the fallback. If BIP-322 verification fails to load, return a 500 error, not a permissive fallback.

---

### C3: Guardian PATCH/DELETE Has No Authentication

**Location:** `src/app/api/v1/guardian/[id]/route.ts:28-56 (PATCH), :58-66 (DELETE)`  
**Description:** The PATCH and DELETE endpoints for guardians require **no authentication whatsoever**. Anyone who knows (or guesses) a guardian ID can:
- Change the guardian's soul, personality, agent rules, auto-responses
- Replace the LLM API key with their own (the old one is encrypted, but the new one replaces it)
- Change the guardian's status to stopped
- Modify escalation settings

**Impact:** Complete guardian takeover. Guardian IDs are CUIDs which are semi-predictable. An attacker can hijack any guardian agent, inject malicious system prompts, exfiltrate the owner's LLM API key usage, or shut down guardians.

**Fix:** Require wallet signature verification (from `ownerAddress`) on PATCH and DELETE, or use the monitor token auth system already built for the monitor routes.

---

## 🟠 HIGH

### H1: Guardian Heartbeat Has No Signature Verification

**Location:** `src/app/api/v1/guardian/heartbeat/route.ts:14-17`  
**Description:** The `TODO` comment says "Verify signature against ownerAddress + challenge" but it accepts any request with a guardianId. Any attacker can send heartbeats for any guardian, marking it as `endpointVerified: true`.

**Impact:** Spoofed heartbeats make offline/compromised guardians appear healthy. Could be used to mask a guardian takeover.

**Fix:** Implement signature verification or use monitor token auth.

---

### H2: Challenge Nonce Not Validated During Auth Verification

**Location:** `src/app/api/v1/auth/verify/route.ts` (entire POST handler)  
**Description:** The challenge route (`/api/v1/challenge`) generates a nonce and stores it in memory via `setChallenge()`. However, the auth verify route (`/api/v1/auth/verify`) **never calls `getChallenge()` or `deleteChallenge()`** to validate that the signed message contains a valid, unexpired nonce. The nonce system exists but is completely unused during verification.

**Impact:** Signature replay attacks. An intercepted valid signature can be replayed indefinitely since no nonce is consumed. The challenge system provides no anti-replay protection.

**Fix:** In the auth/verify POST handler, extract the nonce from the signed message, validate it against the challenge store, and delete it after use (one-time use).

---

### H3: Chat Messages Require No Wallet Signature

**Location:** `src/app/api/v1/chat/[blockHeight]/route.ts:52-53`  
**Description:** The POST endpoint accepts `senderAddress` as a plain string in the request body with no signature verification. Anyone can post messages as any wallet address.

**Impact:** Message impersonation. An attacker can post messages appearing to come from any wallet/handle, enabling social engineering, reputation attacks, and trust erosion.

**Fix:** Require wallet signature on chat POST, or at minimum require a valid session token tied to a verified wallet.

---

### H4: Game Claim Route Has No Authentication

**Location:** `src/app/api/v1/game/claim/route.ts`  
**Description:** The claim endpoint accepts `walletAddress` in the body with no verification. An attacker can claim game elements and accumulate score/XP/coins for any wallet.

**Impact:** Game state manipulation, leaderboard fraud.

**Fix:** Require wallet signature verification.

---

### H5: World Object/Terrain Ownership Check is DB-Only

**Location:** `src/app/api/v1/world/route.ts:25-28`, `src/app/api/v1/world/terrain/route.ts:22-25`  
**Description:** Ownership is verified by checking `block.ownerAddress === ownerAddress` from the request body. Since `ownerAddress` is user-supplied and there's no wallet signature, an attacker just needs to know the current owner's address (public info) to place objects or modify terrain.

**Impact:** Unauthorized world modification — any block's 3D world can be vandalized.

**Fix:** Require wallet signature to prove the caller actually controls the owner address.

---

### H6: Brain Scan Secret Has Hardcoded Fallback

**Location:** `src/app/api/v1/brain/scan/route.ts:28`  
**Description:** `const BRAIN_SECRET = process.env.BRAIN_SCAN_SECRET || 'nexus_brain-dev-secret'`. If the env var is missing in production, the secret defaults to a hardcoded value visible in source code.

**Impact:** Any attacker can trigger brain scans and potentially manipulate content moderation.

**Fix:** Remove the fallback. Throw an error if `BRAIN_SCAN_SECRET` is not set.

---

### H7: Ownership Cron Secret Has Hardcoded Fallback

**Location:** `src/app/api/v1/ownership/cron/route.ts:6`  
**Description:** `const OWNERSHIP_SYNC_SECRET = process.env.OWNERSHIP_SYNC_SECRET || 'ownership2026'`. Same issue as H6.

**Impact:** Any attacker can trigger ownership sync cron, potentially causing DoS via excessive API calls to on-chain verification.

**Fix:** Remove the fallback. Require the env var.

---

## 🟡 MEDIUM

### M1: Guardian Chat — LLM Prompt Injection via User Messages

**Location:** `src/app/api/v1/guardian/chat/route.ts:57-65`  
**Description:** User messages are passed directly into the LLM conversation history without sanitization. The system prompt includes world-building tool instructions. A malicious user could craft messages to:
- Extract the system prompt (soul, agent rules)
- Trick the guardian into executing world-building actions (place_object, modify_terrain)
- Override the guardian's personality/boundaries

**Impact:** Prompt injection can cause guardians to execute unauthorized world modifications or leak configuration.

**Fix:** Sanitize user input, consider separating tool-use from chat responses, add output validation before executing world actions.

---

### M2: World Actions Executed via Internal Fetch Without Auth

**Location:** `src/app/api/v1/guardian/chat/route.ts:109-137` (`executeWorldActions`)  
**Description:** When the LLM response contains JSON tool calls, the server makes internal HTTP requests to `/api/v1/world` and `/api/v1/world/terrain` using the guardian's `ownerAddress`. These internal requests pass the ownership check because they provide the correct `ownerAddress`. This means LLM prompt injection (M1) directly leads to world modification.

**Impact:** Chained with M1, allows unauthenticated world modification via prompt injection.

**Fix:** Add a signed internal token for server-to-server calls, or call the database layer directly instead of HTTP.

---

### M3: User Profile PATCH Auth is Wallet Address Comparison Only

**Location:** `src/app/api/v1/users/by-handle/[handle]/route.ts` (PATCH handler)  
**Description:** Profile updates verify ownership by checking `user.walletAddress !== walletAddress` where `walletAddress` comes from the request body. No signature verification. Since wallet addresses are public, anyone can update any profile's displayName and bio.

**Impact:** Profile defacement, social engineering via modified display names.

**Fix:** Require wallet signature verification.

---

### M4: In-Memory Challenge Store Doesn't Survive Restarts

**Location:** `src/lib/challenges.ts`  
**Description:** Challenges are stored in a `Map<>` in server memory. On Vercel (serverless), each function invocation may be a new instance, meaning challenges could be lost between the challenge request and verification. In multi-instance deployments, the challenge is only in one instance's memory.

**Impact:** Intermittent auth failures (UX issue) and potential bypass if an attacker can route requests to different instances.

**Fix:** Use Redis, database, or a distributed cache for challenge storage.

---

### M5: Ownership Cron Secret Accepted via Query Parameter

**Location:** `src/app/api/v1/ownership/cron/route.ts:17`  
**Description:** `const cronSecret = req.nextUrl.searchParams.get('secret')` — the secret can be passed as a URL query parameter. Query parameters are logged in server logs, browser history, CDN logs, and referrer headers.

**Impact:** Secret leakage via logs, enabling unauthorized cron triggers.

**Fix:** Accept authentication only via the `Authorization` header.

---

### M6: VPS Health Endpoint Has No Authentication

**Location:** `src/app/api/v1/vps/[linkId]/health/route.ts`  
**Description:** Anyone who knows a VPS link ID can send health check pings, marking links as healthy and updating `lastHealthCheck`.

**Impact:** Spoofed health status for VPS links.

**Fix:** Require authentication (wallet signature or bearer token).

---

### M7: Error Messages Leak Internal Details

**Location:** Multiple routes — `catch (e: any) { return error(e.message, 500); }`  
**Description:** Raw error messages from Prisma, Node.js, and other libraries are returned to clients in 500 responses. This can leak database schema info, file paths, and internal state.

**Affected routes:** Nearly all — `auth/verify`, `chat`, `guardian`, `agents/register`, `delegations/*`, `ownership/*`, `world/*`, `game/*`, etc.

**Fix:** Return generic error messages in production. Log detailed errors server-side only.

---

### M8: LLM API Error Responses Leak Provider Details

**Location:** `src/lib/llm-proxy.ts:58,72`  
**Description:** `callLLM` returns error messages including provider API response text (up to 200 chars) directly to the user via the guardian chat: `return \`[Guardian is temporarily unavailable. Error: ${message}]\``. This can expose API response details and provider-specific error info.

**Fix:** Return a generic error to the user. Log details server-side.

---

## 🔵 LOW

### L1: AES-256-GCM IV Size is 16 Bytes Instead of 12

**Location:** `src/lib/key-encryption.ts:4`  
**Description:** `const IV_LENGTH = 16` — AES-256-GCM's recommended IV size is 12 bytes (96 bits) per NIST SP 800-38D. Using 16 bytes requires an additional internal hash step which slightly reduces efficiency but is not insecure. The E2E crypto module correctly uses 12 bytes.

**Impact:** Negligible security impact, but deviates from best practice.

**Fix:** Change `IV_LENGTH` to 12 for consistency with NIST recommendations.

---

### L2: Chat Rate Limiter is In-Memory and Per-Instance

**Location:** `src/app/api/v1/chat/[blockHeight]/route.ts:49-58`  
**Description:** Rate limiting uses an in-memory `Map`. On serverless (Vercel), each cold start creates a new map, effectively making rate limiting unreliable. An attacker can spam by hitting different instances.

**Impact:** Rate limiting can be bypassed, enabling chat spam.

**Fix:** Use Redis or Vercel KV for distributed rate limiting.

---

### L3: LLM Proxy Rate Limiter is In-Memory

**Location:** `src/lib/llm-proxy.ts:3-4`  
**Description:** Same issue as L2 — the 60 calls/hour rate limit for guardian LLM usage is in-memory and won't persist across serverless invocations.

**Impact:** Rate limit bypass, potential cost exhaustion on owner's LLM API key.

**Fix:** Use distributed rate limiting (Redis/KV).

---

### L4: User List Endpoint Returns All Verified Users

**Location:** `src/app/api/v1/users/list/route.ts`  
**Description:** Returns all verified users with no pagination limit or authentication. Includes wallet addresses, handles, and bios.

**Impact:** Data harvesting, wallet address enumeration.

**Fix:** Add pagination limits and consider whether wallet addresses should be returned in bulk.

---

### L5: No CORS Configuration on API Routes

**Location:** All API routes  
**Description:** No explicit CORS headers are set on API routes. Next.js defaults may allow requests from any origin depending on deployment configuration.

**Impact:** Potential cross-origin abuse of state-changing endpoints.

**Fix:** Add explicit CORS middleware restricting origins to `blockgenomics.io`.

---

## ℹ️ INFO

### I1: E2E Encryption Implementation is Solid

**Location:** `src/lib/e2e-crypto.ts`  
**Description:** The E2E encryption is well-implemented:
- Proper ECDH on secp256k1 with HKDF-SHA512 key derivation
- AES-256-GCM with 96-bit random nonce (CSPRNG)
- AAD includes version, timestamp, and sorted pubkeys (prevents replay and misdirection)
- Domain-separated HKDF salt and info
- Key wiping (best-effort in JS)
- Message size limits
- Future timestamp rejection (5 min window)

No significant issues found. The deterministic keypair derivation from wallet signatures is a reasonable design.

---

### I2: Monitor Token System is Well-Designed

**Location:** `src/lib/monitor-tokens.ts`  
**Description:** Good practices:
- Tokens are SHA-256 hashed before storage (DB never sees raw token)
- `timingSafeEqual` used for comparison (prevents timing attacks)
- 32 bytes of randomness (256-bit entropy)
- Revocation support

---

### I3: Security Headers are Configured

**Location:** `next.config.*`  
**Description:** Good security headers present: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. No CSP header observed — consider adding one.

---

### I4: No Private Keys or Seeds Found in Source

**Location:** Entire `src/` directory  
**Description:** Searched for patterns: `sk-`, hardcoded keys, private keys, seed phrases. No secrets found in source code. API keys are properly loaded from `process.env` and encrypted at rest (guardian LLM keys via AES-256-GCM).

---

## Prioritized Remediation Plan

1. **Immediate (before any more users):**
   - C1/C2: Implement real BIP-322 signature verification — this is the single biggest vulnerability
   - C3: Add auth to guardian PATCH/DELETE

2. **This week:**
   - H1-H5: Add signature verification to heartbeat, chat, game, world routes
   - H6-H7: Remove hardcoded secret fallbacks

3. **Next sprint:**
   - M1-M2: Sanitize LLM inputs, add internal auth for world actions
   - M3-M8: Fix remaining medium issues
   - Add CSP header, CORS middleware, distributed rate limiting

4. **Ongoing:**
   - Replace all in-memory stores (challenges, rate limits) with Redis
   - Add request logging/monitoring for anomaly detection
   - Implement session tokens to avoid per-request signature verification
