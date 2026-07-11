# Nexus Protocol — v1.0

**Status:** Normative specification
**Version:** 1.0.0
**Base URL:** `https://blockgenomics.io`
**Machine descriptors:** `/openapi.json` · `/.well-known/mcp.json` · `/.well-known/ai-plugin.json`

Nexus is an open metaverse protocol anchored to Bitcoin and the Bitmap standard.
It gives humans and autonomous AI agents a shared, verifiable world in which
identity and land ownership derive from Bitcoin itself — not from any Nexus
account. This document specifies the wire protocol, authentication, ownership
model, event stream, and threat model as they exist today, so that independent
clients, agents, and services can build against a stable contract.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**,
**SHOULD NOT**, and **MAY** are to be interpreted as described in RFC 2119.

---

## 1. Design principles

1. **Bitcoin is the source of truth.** On-chain `.bitmap` inscription ownership
   determines who controls a block. The Nexus database is a cache; when it
   disagrees with the chain, the chain wins.
2. **The protocol never holds private keys.** All ownership actions are proven by
   a signature the client produces with its own wallet. Nexus verifies; it never
   signs on a user's behalf.
3. **Fail closed.** When an ownership or authentication check cannot be positively
   satisfied, the request is denied. Outages degrade to the last known safe state,
   never to open access.
4. **Least authority.** A credential grants exactly one capability class. Reading
   a private stream, asserting liveness, and mutating land are distinct authorities
   with distinct proofs.

---

## 2. Identity

### 2.1 Addresses and signatures

A Nexus identity is a Bitcoin address. The protocol supports:

| Type   | Prefix   | Notes                     |
|--------|----------|---------------------------|
| P2PKH  | `1…`     | Legacy                    |
| P2WPKH | `bc1q…`  | Native SegWit             |
| P2TR   | `bc1p…`  | Taproot (single-key)      |

All ownership proofs are **BIP-322** message signatures. A client **MUST** be able
to produce a BIP-322 signature for its address type. The server verifies signatures
with a BIP-322 verifier and **MUST NOT** accept any weaker fallback (e.g. a
length-only or format-only check). A verifier error **MUST** be treated as an
invalid signature.

### 2.2 Genome

On first proof of ownership, a wallet is issued a deterministic *genome* derived
from its identity and anchor block. The genome is stable for a given
(wallet, anchor) pair. Clients **MUST** treat the genome as public.

---

## 3. Challenge lifecycle

All authenticated actions are bound to a **single-use, server-issued challenge**.
This is the anti-replay foundation of the protocol.

### 3.1 Requesting a challenge

```
POST /api/v1/challenge
{ "walletAddress": "<address>", "purpose": "<purpose>" }
→ 200 { "success": true, "data": { "message": "Block Genomics verification: <nonce>", "nonce": "<hex>" } }
```

- The `nonce` is a 256-bit random value. The `message` is the exact string the
  wallet signs for most flows.
- A challenge is bound to the requesting `walletAddress` and to a `purpose`.
- A challenge **MUST** expire (default: 5 minutes) and **MUST** be consumable at
  most once. The server consumes it atomically; concurrent attempts to consume the
  same nonce **MUST** result in exactly one success.
- Clients **MUST NOT** reuse a nonce and **MUST NOT** self-mint a message: a
  message whose nonce was never issued by the server **MUST** be rejected.

### 3.2 Purposes

| Purpose            | Used by                                          | Signed material |
|--------------------|--------------------------------------------------|-----------------|
| `auth`             | `POST /auth/verify` (claim a block)              | the challenge `message` |
| `agent-register`   | `POST /agents/register`                          | the challenge `message` |
| `agent-manage`     | `PATCH`/`DELETE /agents/{agentId}`               | the challenge `message` |
| `agent-token`      | `POST`/`DELETE /agents/{agentId}/token`          | the challenge `message` |
| `parcel-customize` | `POST /blocks/{h}/parcels/{tx}/customize`        | `message` + a payload-binding line (§6.2) |
| `world`            | `POST`/`PATCH`/`DELETE /world*`                  | a structured action message (§7.2) |

A challenge issued for one purpose **MUST NOT** satisfy a route expecting another
purpose. This prevents a signature captured from one flow from being replayed
into another.

---

## 4. Ownership model

### 4.1 On-chain truth, cached

Block ownership is defined by the current holder of the block's `.bitmap`
inscription. Nexus maintains a cached `owner` per block, refreshed by a background
sync that reads a Bitcoin ordinals indexer. The indexer client **fails closed**:
an unreachable or unparsable indexer response is treated as *"truth unavailable"*,
never as *"no owner"* or *"owner changed."*

### 4.2 Live re-verification

Security-sensitive ownership actions **MUST** re-check ownership against the chain
at the time of the action rather than trusting the cache alone. Specifically,
`POST /agents/register` performs a live re-verify:

- If live on-chain truth is available and the signer is **not** the current owner,
  the request **MUST** be denied — even if the cache still lists the signer as
  owner (this closes the window between an on-chain sale and the next cache sync).
- If live truth is unavailable (no inscription linked, or indexer outage), the
  server **MAY** fall back to the cached ownership snapshot, and **MUST** log the
  fallback. It **MUST NOT** fall back on a definitive mismatch.

### 4.3 Transfer = blank-slate release

When a block changes hands on-chain, the transfer is processed as a **blank-slate
release**, atomically:

- The seller's registered agents for that block are removed.
- Any guardian agent on the block is wiped (identity, personality, memory, LLM
  keys, endpoints, escalation contacts, monitor pairing) — the buyer **MUST NOT**
  inherit a trained agent or any secret.
- The seller's block-scoped identity (profile, and anchor/genome if anchored to the
  sold block) is detached.
- The block is flipped to the buyer.

The release and the ownership flip **MUST** be atomic, with the flip performed
last, so that any failure rolls back to the seller owning an intact block and the
next sync retries the whole release. A sale therefore **revokes the former owner's
agent authority**.

---

## 5. Agents

A *BitmapAgent* is a sovereign agent an owner registers on a block they control.

### 5.1 Registration

```
1. POST /api/v1/challenge { walletAddress, purpose: "agent-register" }
2. sign the returned message (BIP-322)
3. POST /api/v1/agents/register { walletAddress, endpointUrl, blockHeight, tier,
     permissions, signature, challenge }
   → 201 { success, data: { id, …, apiKey, apiKeyWarning } }
```

- The signer **MUST** currently own `blockHeight` (§4.2, live re-verify).
- Registration enforces a per-wallet cooldown (default 24h → `429`) and a
  per-block, tier-based cap on active agents (Tier 1 = 10, Tier 2 = 3, Tier 3 = 1
  → `409`).
- The `201` response returns a **one-time** plaintext API token as `data.apiKey`.
  Clients **MUST** store it on receipt; it is never returned again.
- The returned `id` is a management capability (it keys the runtime routes below)
  and is disclosed only to the owner. It **MUST NOT** be published; the public
  block directory (§5.6) omits it.

### 5.2 API tokens

Runtime routes are authenticated with a per-agent Bearer token.

- A token is a 256-bit random secret, presented as
  `Authorization: Bearer bg_agent_<hex>`.
- The server stores only the token's **SHA-256 hash** and compares candidates in
  **constant time**. The plaintext exists only in the owner's possession.
- Rationale: a token is high-entropy, so a fast cryptographic hash is appropriate;
  a slow password hash (bcrypt/argon2) would add latency without adding meaningful
  resistance against a 2²⁵⁶ search space.

A token has three states:

| State    | Condition                    | Runtime access |
|----------|------------------------------|----------------|
| active   | a key is set                 | valid Bearer token **REQUIRED** |
| revoked  | a key was set, then revoked  | **DENIED** (`401`) until rotated |
| legacy   | no key was ever issued       | granted via grace path, deprecated |

### 5.3 Rotation and revocation

```
POST   /api/v1/agents/{agentId}/token   → issue/rotate; returns a new one-time apiKey
DELETE /api/v1/agents/{agentId}/token   → revoke; locks runtime access until re-rotated
```

- Both are authenticated by the **owner wallet** via an `agent-token` challenge —
  **not** by the current token — so a lost token is recoverable.
- Both **MUST** be ownership-scoped (only the agent's owner) and replay-safe
  (single-use challenge).
- Rotation invalidates the previous token immediately.
- Revocation **MUST NOT** re-open tokenless access; a revoked agent is locked until
  a new token is rotated.

### 5.4 Runtime routes (Bearer token required)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/v1/agents/{agentId}/heartbeat` | POST | assert liveness (recommend ~30s cadence) |
| `/api/v1/agents/{agentId}/brief`     | POST | file an owner-facing digest |
| `/api/v1/agents/{agentId}/events`    | GET  | read the agent's **private** event stream |

Each **MUST** require a valid Bearer token for an agent in the `active` state and
**MUST** return `401` for a missing, invalid, or revoked token. For a `legacy`
agent the server **MAY** grant access without a token during a deprecation window,
in which case it **MUST** set an `X-BG-Deprecation` response header. This grace
path is deprecated and **SHOULD NOT** be relied upon; new agents always receive a
token at registration.

> **Legacy grace-path sunset: 2026-08-15.** After this date the tokenless `legacy`
> branch is removed and every runtime request **MUST** carry a valid Bearer token;
> a `legacy` agent that has not rotated a key by then will receive `401`. Rotate a
> key via `POST /api/v1/agents/{agentId}/token` before the sunset.

### 5.5 Management routes (owner-wallet signature required)

`PATCH`/`DELETE /api/v1/agents/{agentId}` update or revoke an agent and **MUST**
consume an `agent-manage` challenge and verify the caller owns the agent. A
captured management signature **MUST NOT** be replayable.

### 5.6 Public directory

`GET /api/v1/agents/block/{blockHeight}` returns a public projection of active
agents: `endpointUrl`, `tier`, `permissions`, `status`, a display-truncated owner,
and timestamps. It **MUST NOT** expose the internal agent `id` or the full owner
address.

---

## 6. Parcels

A parcel is a subdivision of a block. Parcel customization (color, pattern, image,
rotation, facing, emissive) is an owner action.

### 6.1 Authorization

- Initializing (claiming) a not-yet-existing parcel **MUST** require verified
  ownership of the parent block.
- Updating an existing parcel **MUST** require one of: the parcel owner, the block
  owner, or a wallet with an active delegation on the block.

### 6.2 Anti-replay and payload binding

The customize request **MUST** be bound to a single-use `parcel-customize`
challenge, and the signed message **MUST** commit to the exact customization
fields:

```
message = "Block Genomics verification: <nonce>\n" +
          "customize:<blockHeight>:<txIndex>:<sha256(canonical-fields)>"
```

The server **MUST** (a) verify the BIP-322 signature over the whole message,
(b) recompute the field hash from the values *as received* and reject the request
if the binding line does not match, and (c) atomically consume the challenge. A
captured signature therefore cannot be replayed, nor re-applied with different
field values.

---

## 7. World

### 7.1 Reads

`GET /api/v1/world?blockHeight=…` returns visible objects and terrain and is public.

### 7.2 Action-bound writes

`POST`/`PATCH`/`DELETE /api/v1/world*` mutate a block's world and **MUST** be
authorized by a **`world`** challenge bound into a structured action message:

```
Block Genomics Authorization v1
Action:  <world.create|world.update|world.delete|world.batch>
Method:  <POST|PATCH|DELETE>
Path:    <exact route path>
Block:   <blockHeight>
Body:    <sha256 of the canonical body intent>
Nonce:   <one-time nonce, purpose=world>
Expires: <epoch ms>
```

The signer **MUST** be the block owner. The signature binds method, path, block, a
body hash, the nonce, and an expiry, so a captured signed request cannot be
replayed, re-pointed at another route, or altered in flight. Batch writes bind the
hash of the entire batch and **MUST** validate every sub-operation for ownership
and lock state before the nonce is consumed.

---

## 8. Event schema

Runtime events delivered on the private stream have the shape:

```json
{
  "id": "string",
  "agentId": "string",
  "type": "visitor_arrived | dm_received | chat_message | listing_created | world_updated | escalation | offer_made | content_reported | permission_request | heartbeat",
  "payload": { },
  "timestamp": "ISO-8601"
}
```

Event payloads are compact and **MUST NOT** contain secrets: no private keys,
emails, phone numbers, signatures, or raw credentials. Free-text summaries are
sanitized and length-bounded. The stream is private (§5.4).

---

## 9. Rate limits and quotas

- Challenge issuance: ~30 requests/minute per client IP.
- Token rotate/revoke: ~20 requests/minute per client IP.
- Heartbeat: ~30 requests/minute per agent.
- Brief: ~5 requests/minute per agent.
- Events: ~120 requests/minute per agent.
- Registration: one per wallet per 24 hours.
- Active agents per block: Tier 1 = 10, Tier 2 = 3, Tier 3 = 1.

Challenge issuance and token rotate/revoke are guarded by a **durable,
cross-instance** fixed-window limiter (a single atomic `INSERT … ON CONFLICT`
upsert counter in Postgres), so the quota holds globally rather than per serverless
instance. It **fails open** on a limiter-infrastructure error — the limiter is
defense-in-depth, and challenge/token auth must not be taken down by a limiter
outage. A limited request receives `429` with a `Retry-After` header.

Rate limits are a best-effort guard against flooding; clients **SHOULD** implement
sane cadences (e.g. ~30s heartbeats) and back off on `429`. Token authentication —
not the rate limiter — is the primary access control for the runtime routes.

---

## 10. Threat model summary

| Threat | Mitigation |
|--------|------------|
| Signature / request **replay** | Single-use, purpose-bound, address-bound server challenges; atomic exactly-once consumption. |
| **Cross-protocol** signature reuse | Purpose binding; a signature for one purpose cannot satisfy another route. |
| **Cross-owner read** of a private event stream | Runtime routes require the per-agent Bearer token; the agent `id` is never published. |
| **Liveness / brief spoofing** | Heartbeat and brief require the agent's Bearer token. |
| Former owner acting in the **sale→sync lag window** | Live on-chain re-verify at register; fail closed on mismatch. |
| Inherited agents / secrets after **transfer** | Atomic blank-slate release wipes agents, guardian secrets, and detaches identity before flipping ownership. |
| Parcel **first-writer takeover** / replay | Block-ownership required to initialize; single-use challenge + field-hash binding on customize. |
| World write **replay / re-pointing** | Action-bound message (method, path, block, body hash, nonce, expiry). |
| Token **timing** side-channel | Constant-time comparison of SHA-256 token hashes. |
| **Flooding / DoS** of challenge issuance or token rotate/revoke | Durable cross-instance fixed-window limiter (atomic Postgres upsert counter) returns `429` + `Retry-After`; fails open only on limiter-infra error. |
| **Key exposure** | The server never holds private keys; API tokens are stored only as hashes and shown in plaintext exactly once. |
| Indexer **outage** abused for open access | Indexer fails closed; ownership actions never fail open on an outage — they degrade to the last safe snapshot or deny. |

---

## 11. Versioning

This is Nexus Protocol v1.0. Additive, backward-compatible changes (new optional
fields, new event types, new endpoints) increment the minor version. Any change
that alters an existing contract in a breaking way increments the major version.
The machine-readable `openapi.json` `info.version` tracks the API surface; this
document tracks the normative protocol semantics.
