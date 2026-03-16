# Block Genomics Test Coverage Report

## Summary

| Metric | Value |
|--------|-------|
| Test Suites | 12 passed |
| Total Tests | 276 passed |
| Test Run Time | ~0.5s |
| Framework | Jest + ts-jest |

## Coverage by Tested Library Module

| File | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| **agent-protocol.ts** | 100% | 94% | 100% | 100% |
| **api-helpers.ts** | 100% | 93% | 100% | 100% |
| **monitor-tokens.ts** | 100% | 100% | 100% | 100% |
| **game-logic.ts** | 100% | 90% | 100% | 100% |
| **runebolt-utils.ts** | 100% | 78% | 100% | 100% |
| **square-packing.ts** | 95% | 82% | 100% | 100% |
| **challenges.ts** | 92% | 50% | 100% | 100% |
| **auth-storage.ts** | 91% | 67% | 100% | 100% |
| **llm-proxy.ts** | 89% | 89% | 67% | 95% |
| **genome-utils.ts** | 82% | 52% | 81% | 85% |
| **blockchainApi.ts** | 60% | 52% | 67% | 64% |

**Average on tested modules: ~92% statements, ~77% branches**

## Test Suite Breakdown

### 1. API Helpers (`__tests__/lib/api-helpers.test.ts`) — 30 tests
- `success()` — response format, status codes, null/array data
- `error()` — error format, 500 masking in production, 4xx passthrough
- `sanitizeString()` — XSS removal, HTML stripping, length limits
- `isValidBitcoinAddress()` — bc1q/bc1p/1.../3... validation, rejection of invalid formats
- `verifyWalletSignature()` — BIP-322 delegation, empty input rejection, **taproot bypass prevention**

### 2. Challenges (`__tests__/lib/challenges.test.ts`) — 11 tests
- CRUD operations (set/get/delete)
- Challenge isolation per wallet
- Cleanup of fresh vs expired challenges
- Anti-replay protection (one-time use)

### 3. Genome Utils (`__tests__/lib/genome-utils.test.ts`) — 38 tests
- `formatBytes()` — B/KB/MB/GB formatting
- `formatWeight()` — WU/kWU/MWU boundaries
- `parseGenomeTraits()` — 8 traits, percentage format, zero/max genomes
- `truncateHash()` — long/short hashes, custom length
- `hexPairToColor()` — HSL color mapping
- `dnaBaseColor()/dnaBaseHex()` — DNA color mapping
- `genomeToDNA()` — hex→ATCG determinism
- `genomeToColors()` — 32-color array
- `generateGenome()` — deterministic SHA-256 genome, integrity/complexity bounds
- `genomeToVisual()` — 16 segments with nucleotide/color/strength
- `createChallenge()` — nonce uniqueness, message format
- `calculateTrustScore()` — edge cases (0 verifications, perfect, all failures, volume cap)

### 4. Game Logic (`__tests__/lib/game-logic.test.ts`) — 40 tests
- `GAME_ELEMENT_TYPES` — field completeness, category coverage
- `checkTrigger()` — proximity/click/score_threshold triggers, 3D distance, boundary conditions, null handling
- `processReward()` — points/coins/sats/xp/item/badge reward types, null defaults
- `calculateLevel()` — progressive XP curve (levels 1-5)
- `xpForNextLevel()` — next level requirements
- `xpProgress()` — current/needed/percent calculations
- `checkAchievements()` — all 10 achievement definitions, already-earned filtering, speed_demon manual check
- `ACHIEVEMENT_DEFS` — field validation, unique IDs

### 5. Square Packing (`__tests__/lib/square-packing.test.ts`) — 18 tests
- `txToSquareSize()` — sqrt scaling, minimum size, custom scale factor
- `packSquares()` — empty/single/multi packing, no overlaps, grid bounds, determinism, stress test (100 items)
- `packSquaresToWorldSpace()` — centering, gap reduction, minimum dimension, empty input

### 6. Agent Protocol (`__tests__/lib/agent-protocol.test.ts`) — 28 tests
- Constants — tier limits, intervals, cooldowns
- `maxAgentsForTier()` — all tiers + invalid
- `validatePermissions()` — known/unknown, case sensitivity, empty, all enum values
- `canPerformAction()` — exact match, FULL_AUTONOMY, empty permissions
- `generateAgentChallenge()` — format, UUID, timestamp, uniqueness
- `verifyAgentSignature()` — empty inputs, BIP-322 delegation, **taproot bypass prevention**

### 7. LLM Proxy (`__tests__/lib/llm-proxy.test.ts`) — 13 tests
- Provider routing — OpenAI, Anthropic, xAI, Google, custom endpoint
- Error handling — API errors, network errors, empty responses
- Rate limiting — 60/hour cap, no limit without guardianId
- Message formatting — system prompt inclusion, Anthropic role mapping

### 8. Monitor Tokens (`__tests__/lib/monitor-tokens.test.ts`) — 13 tests
- `generateMonitorToken()` — hex format, DB hash storage, uniqueness
- `validateMonitorToken()` — valid/invalid/missing tokens, timing-safe comparison
- `revokeMonitorToken()` — DB field clearing
- `validateMonitorAuth()` — Bearer extraction, null/empty handling, end-to-end flow

### 9. Blockchain API (`__tests__/lib/blockchainApi.test.ts`) — 7 tests
- Cache hit/miss behavior
- Mempool.space → blockchain.info fallback
- Both-APIs-fail returns null
- Estimated TX generation (deterministic PRNG)
- `isBlockCached()/getCachedBlock()` — uncached returns

### 10. RuneBolt Utils (`__tests__/lib/runebolt-utils.test.ts`) — 9 tests
- `formatSats()` — sats/BTC formatting, boundary at 100M
- `truncateAddress()` — standard/custom/short/empty address handling
- `cn()` — class merging, conditionals, Tailwind conflict resolution

### 11. Auth Storage (`__tests__/lib/auth-storage.test.ts`) — 9 tests
- `readStorage()` — JSON parsing, fallback on error/missing
- `writeStorage()` — JSON stringification
- Handle/profile registry round-trip

### 12. Security Tests (`__tests__/security/auth-bypass.test.ts`) — 21 tests
**Critical audit finding coverage:**
- Taproot signature bypass — multiple crafted 64-byte payloads rejected
- Agent signature taproot bypass — same fix verified
- Challenge replay attacks — one-time use, cross-wallet isolation
- XSS prevention — script tags, event handlers, nested tags, length limits
- Address validation — Ethereum rejection, SQL injection, path traversal, null bytes
- Permission escalation — unknown permissions, case sensitivity, FULL_AUTONOMY scope
- Empty/null input handling — all signature functions

## Security-Critical Tests

These tests directly verify fixes for vulnerabilities found in the security audit:

| Vulnerability | Test | Status |
|--------------|------|--------|
| Taproot signature bypass (auth bypass) | `auth-bypass.test.ts: Taproot signature bypass` | FIXED & TESTED |
| Challenge replay attack | `auth-bypass.test.ts: Challenge replay attacks` | FIXED & TESTED |
| XSS via unsanitized input | `auth-bypass.test.ts: Input validation — XSS prevention` | FIXED & TESTED |
| Permission escalation | `auth-bypass.test.ts: Permission escalation prevention` | FIXED & TESTED |
| Monitor token timing attack | `monitor-tokens.test.ts: timing-safe comparison` | FIXED & TESTED |
| LLM rate limit bypass | `llm-proxy.test.ts: rate limiting` | TESTED |

## Not Yet Covered

The following areas have 0% coverage and would benefit from future test development:

### High Priority
- `bitcoin-heartbeat.ts` — Guardian health check protocol (DB-heavy, needs integration tests)
- `ownership-sync.ts` — On-chain ownership verification (external API dependent)
- `tier-resolver.ts` — Tier calculation logic
- `lightning.ts` — Lightning Network invoice handling

### Medium Priority
- `e2e-crypto.ts` — End-to-end encryption
- `bitmap-renderer.ts` — Canvas-based bitmap rendering
- `wallet-utils.ts` — Wallet connection utilities
- API route handlers (87 routes) — Require request/response mocking

### Lower Priority
- `brain/` module — Computation engine, runtime, inscription handling
- `guardian-notify.ts` / `guardian-templates.ts` — Notification templates
- `protocol.ts` — Protocol state machine
- `pwa-utils.ts` — PWA utilities

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run specific test file
npx jest __tests__/lib/api-helpers.test.ts
```
