# Verified Claims System — Technical Specification

## Overview

The Verified Claims system extends Block Genomics' genome-based identity with **optional, cryptographically-verified real-world anchors**. Think of the genome as an IMEI number — permanent and Bitcoin-derived. Claims are like SIM cards, email accounts, and domain registrations you attach to that identity.

```
GENOME (permanent, Bitcoin-derived — the "IMEI")
  ├── ⚓ Bitmap Block (required — primary anchor, existing system)
  ├── 🔗 X/Twitter handle (optional, verified via OAuth)
  ├── 📧 Email (optional, verified via challenge-response)
  ├── 🌐 Domain (optional, verified via DNS TXT record)
  ├── 🤖 API Endpoint (optional, verified via challenge-response)
  ├── 🆔 Nostr npub (optional, verified via signed event)
  └── 🔑 Signing Key / DID (optional, cryptographic anchor)
```

## Philosophy

**"PGP Web of Trust meets SSL Certificate Authority, on Bitcoin."**

1. **Claims are OPTIONAL** — A genome is fully functional without any claims. Claims add _trust layers_, not requirements.
2. **Privacy-first** — Attaching a claim is opt-in disclosure. Users control what's visible.
3. **Revocable** — Any claim can be revoked by its owner at any time. Expired claims are auto-flagged.
4. **Multi-claim** — An agent can have multiple claims of the same type (e.g., 3 domains, 2 emails).
5. **Independently verifiable** — Each claim carries its own cryptographic proof. Third parties can verify without trusting Block Genomics.
6. **Composable trust** — More verified claims = higher trust signal. The system doesn't prescribe _which_ claims matter — consumers decide.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ClaimManager                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │ Email   │ │ Twitter │ │ Domain  │ │ Nostr   │      │
│  │Verifier │ │Verifier │ │Verifier │ │Verifier │      │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘      │
│       │           │           │           │            │
│  ┌────┴────┐ ┌────┴────┐                              │
│  │API Endpt│ │ Signing │                              │
│  │Verifier │ │  Key    │                              │
│  └─────────┘ └─────────┘                              │
├─────────────────────────────────────────────────────────┤
│              Verification Engine                        │
│  Challenge Generation → Proof Collection → Validation  │
│  → Storage → Periodic Re-verification                  │
├─────────────────────────────────────────────────────────┤
│              Database (Prisma)                          │
│  VerifiedClaim → ClaimProof → VerificationAttempt      │
├─────────────────────────────────────────────────────────┤
│              Existing Genome System                     │
│  Agent → Block → Verification → Delegation             │
└─────────────────────────────────────────────────────────┘
```

## Claim Types

| Type | Identifier | Verification Method | Re-verification | TTL |
|------|-----------|---------------------|-----------------|-----|
| `EMAIL` | `user@example.com` | Challenge code sent to inbox | Every 90 days | 90d |
| `TWITTER` | `@handle` | OAuth 2.0 PKCE + profile check | Every 30 days | 30d |
| `DOMAIN` | `example.com` | DNS TXT record (`_blockgenomics.example.com`) | Every 30 days | 30d |
| `NOSTR` | `npub1...` | NIP-05 cross-reference + signed kind:30078 event | Every 90 days | 90d |
| `API_ENDPOINT` | `https://api.example.com/agent` | Challenge-response to endpoint | Every 7 days | 7d |
| `SIGNING_KEY` | `did:key:z...` or hex pubkey | Sign a challenge with the claimed key | Every 365 days | 365d |

## Verification Flow (Generic)

```
Agent                   Block Genomics              External Service
  │                          │                            │
  ├──► initiate(claimType,   │                            │
  │    claimValue)           │                            │
  │                          │                            │
  │    ◄── challenge ────────┤                            │
  │    (nonce, expiry,       │                            │
  │     instructions)        │                            │
  │                          │                            │
  │    ─── proof ───────────►│                            │
  │    (type-specific)       │                            │
  │                          ├───► verify(proof) ────────►│
  │                          │                            │
  │                          │◄──── result ───────────────┤
  │                          │                            │
  │    ◄── claim record ─────┤                            │
  │    (id, status, expiry)  │                            │
  │                          │                            │
```

## Security Model

### Per-Claim Attack Vectors & Mitigations

**Email:**
- _Attack:_ Temporary email services → _Mitigation:_ Disposable domain blocklist, rate limiting
- _Attack:_ Email forwarding to claim someone else's → _Mitigation:_ Challenge codes expire in 10 minutes, single-use
- _Attack:_ Replay of old challenge → _Mitigation:_ Nonce + timestamp binding to agent genome

**Twitter/X:**
- _Attack:_ OAuth token theft → _Mitigation:_ Short-lived tokens, PKCE flow, periodic re-verification
- _Attack:_ Handle change after verification → _Mitigation:_ 30-day re-verification checks current handle
- _Attack:_ Suspended/deactivated account → _Mitigation:_ Active account check during re-verification

**Domain:**
- _Attack:_ Domain transfer after verification → _Mitigation:_ 30-day re-verification, DNS polling
- _Attack:_ DNS hijacking → _Mitigation:_ DNSSEC validation where available, historical consistency checks
- _Attack:_ Wildcard subdomain abuse → _Mitigation:_ Only verify apex domains and explicit subdomains

**Nostr:**
- _Attack:_ Key compromise → _Mitigation:_ Re-verification, cross-check with NIP-05
- _Attack:_ NIP-05 server spoofing → _Mitigation:_ HTTPS-only, verify response format strictly

**API Endpoint:**
- _Attack:_ MITM on challenge delivery → _Mitigation:_ HTTPS required, HMAC-signed challenges
- _Attack:_ Endpoint goes rogue after verification → _Mitigation:_ 7-day re-verification (shortest TTL)
- _Attack:_ Replay challenge response → _Mitigation:_ Nonce + timestamp, single-use

**Signing Key:**
- _Attack:_ Stolen key used for impersonation → _Mitigation:_ Key can be revoked, new key can be claimed
- _Attack:_ Weak key generation → _Mitigation:_ Minimum key strength requirements (256-bit)

### Global Security Properties

1. **Challenge binding** — Every challenge is bound to: agent ID, genome hash, claim value, nonce, timestamp, and block height. Replaying a challenge against a different agent/claim is impossible.
2. **Proof non-transferability** — Proofs reference the specific genome and cannot be reused by another agent.
3. **Expiration enforcement** — Expired claims are automatically flagged. Re-verification is required to maintain ACTIVE status.
4. **Rate limiting** — Max 5 verification attempts per claim type per hour. Max 20 claims per agent.
5. **Audit trail** — Every verification attempt (success or failure) is logged with full context.

## Data Model

See `prisma-additions.prisma` for the full schema. Key models:

- **VerifiedClaim** — The claim record itself (type, value, status, proofs, expiry)
- **ClaimProof** — Cryptographic evidence for a claim (signatures, DNS records, OAuth tokens)
- **VerificationAttempt** — Audit log of every verification attempt

## API Surface

```
POST   /api/v1/claims/initiate          — Start a claim verification
POST   /api/v1/claims/verify            — Submit proof for a pending claim
GET    /api/v1/claims/:agentId          — List all claims for an agent
GET    /api/v1/claims/:agentId/:claimId — Get specific claim details
DELETE /api/v1/claims/:claimId          — Revoke a claim
POST   /api/v1/claims/:claimId/refresh  — Trigger re-verification
GET    /api/v1/claims/lookup?type=DOMAIN&value=example.com — Reverse lookup
```

## File Structure

```
claims/
├── README.md                  ← This file
├── INTEGRATION.md             ← Integration with existing system
├── prisma-additions.prisma    ← New database models
├── types.ts                   ← TypeScript type definitions
├── claim-manager.ts           ← Core ClaimManager class
├── verify-email.ts            ← Email verification module
├── verify-twitter.ts          ← Twitter/X verification module
├── verify-domain.ts           ← Domain verification module
├── verify-nostr.ts            ← Nostr npub verification module
├── verify-api-endpoint.ts     ← API endpoint verification module
└── verify-signing-key.ts      ← (Future) Signing key verification
```

## Status

- [x] Technical specification (this document)
- [x] Database schema design
- [x] Type definitions
- [x] Email verification module
- [x] Twitter/X verification module
- [x] Domain verification module
- [x] Nostr verification module
- [x] API endpoint verification module
- [x] ClaimManager core
- [x] Integration guide
- [ ] Signing key / DID verification (future phase)
- [ ] REST API routes
- [ ] Admin dashboard for claim management
- [ ] On-chain anchoring of claim proofs
