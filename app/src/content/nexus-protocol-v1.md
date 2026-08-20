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
| `experience-register` | `POST /experiences`                           | a structured action message binding the manifest hash (§8.7), or the challenge `message` (legacy) |
| `experience-manage`   | `PATCH`/`DELETE /experiences/{id}`            | a structured action message binding the manifest hash (§8.7), or the challenge `message` (legacy) |

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

Implementations **MUST** distinguish two uses of an ownership answer, because
they tolerate very different staleness:

- **Display** — rendering or reporting who owns a block. Authorizes nothing.
- **Authorization** — deciding whether a caller may mutate a block. Here
  staleness *is* the security bound, so §4.3 governs.

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

World writes (§4.4) are stricter and allow no fallback at all: they **MUST** answer
`503` when live truth is unavailable. The cached `owner` is **never** consulted to
authorize one.

### 4.3 Freshness guarantee

§4.2 says an authorization must not trust "the cache alone." That is only
meaningful if the ownership lookup performed *during* the authorization is
itself uncached — otherwise a display read moments earlier can fill a memo and
the "live" re-verify silently answers from it.

**Normative rule.** An ownership lookup made for an authorization decision
**MUST NOT** be served from a stored ownership observation. The implementation
**MUST** issue an indexer query, or join a query already in flight, at decision
time. Joining an in-flight query is permitted — it is live by construction, and
it is what keeps a burst of writes against one block to a single round-trip.

Servers **MAY** cache ownership observations for display reads. This profile
uses **5 minutes**. An observation **MUST** be invalidated once a transfer has
been processed for that inscription.

**What this does and does not promise.** The guarantee is that *the server holds
no stale answer*. It is deliberately **not** a claim of instantaneous truth, and
implementations **MUST NOT** describe it as one. Two sources of lag remain and
are outside the server's control:

1. The answer arrives in an HTTP response, so it reflects indexer state from up
   to one request duration ago (this profile times out at **8 seconds**).
2. The indexer itself propagates. A public `ord` instance may serve holder data
   from a CDN-cached endpoint, so a very recent transfer can lag there
   regardless of server behavior. Operators who need the tightest bound
   available **SHOULD** point the client at a self-hosted `ord` instance.

So the honest statement of the bound is: **an authorization decision is made
against an indexer query issued at decision time; residual staleness is the
indexer's own propagation delay, not a server-side cache window.** Before this
rule, the observable guarantee was "within the cache TTL of a sale" — a former
owner retained write authority for the remainder of the window.

**Load.** Querying live per authorization does not imply hammering the indexer.
Authorization volume is write volume, which is small next to read volume; the
indexer client **SHOULD** self-throttle, and per-inscription request coalescing
**SHOULD** be used so concurrent checks share one query.

### 4.4 Content authority follows the deed

The block is the unit of ownership; objects are not separately owned. The wallet
that currently holds a block's `.bitmap` inscription has **full authority over
every object on that block**, including objects placed by previous owners.

- Create, update, and delete on `/world`, `/world/{id}`, `/world/batch`, and
  `/world/terrain` **MUST** authorize on live block ownership at the time of the
  action, by either credential path (a `bg_vfy_` session token, or an action-bound
  BIP-322 signature). Both paths end at the same live check.
- An object's stored creator address is **provenance only**. Servers **MUST NOT**
  compare it against the caller to decide whether a write is allowed.
- Servers **MUST** verify that the target object belongs to the block whose
  ownership was proved. Ownership of one block confers nothing on another.
- The effect follows the transfer on both sides: once the inscription move is
  visible to the indexer, the seller loses write access to everything on the
  block and the buyer gains it. There is no server-side cache window in which
  the seller can still write — authorization lookups are uncached by rule
  (§4.3). Residual lag is the indexer's own propagation, not a sync interval.
- An object's `locked` flag guards against accidental edits, not against the owner.
  The current owner **MUST** be able to clear it; a lock left behind by a previous
  owner **MUST NOT** be permanent.

Rationale: a buyer who cannot edit what they just bought does not own it, and a
seller who can still edit what they sold has not really sold it. Attribution is
worth preserving; control is not divisible from the deed.

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

The release covers *identity and secrets*, not *content*. World objects and terrain
are part of the block and transfer with it — they are **NOT** wiped, and the buyer
inherits full authority over them (§4.4). The distinction is deliberate: a trained
agent carries the seller's keys and personality, while a placed object carries only
its own geometry.

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

## 8. Experience hosting

An **experience** is a self-hosted world — web, Unreal, Unity, Godot, Minecraft,
VR, or a custom runtime — that a verified owner attaches to their block or parcel.
Nexus is the **internet layer** for these worlds: it registers them, makes them
discoverable, probes their health, and inherits them under the constitution
(§8.5). Nexus **MUST NOT** host, proxy, or relay the experience itself — the entry
and health URLs point at infrastructure the owner runs.

**Bitcoin holds only the deed.** The `.bitmap` inscription is the sole on-chain
artifact. Registering, updating, or removing an experience writes **nothing** to
Bitcoin — no inscription, no transaction, no fee. Builders stay free and fast,
and the chain stays unbloated. What binds the two is not a chain write but a
signature (§8.7).

Experiences are the first-class successor to the legacy `vps/link` primitive
(§8.6). Unlike that primitive, an experience carries a typed, versioned manifest,
is exposed in discovery, has server-verified — not owner-attested — health, and
can be cryptographically bound to its owner's deed.

### 8.1 Manifest

A registration body carries the wallet, the `signature`, and either a `message`
(signed manifest, §8.7) or a bare `challenge` (§8.3), plus the manifest:

```jsonc
{
  "manifestVersion": 1,                  // OPTIONAL, defaults to 1; envelope schema version
  "blockHeight":   840000,              // REQUIRED
  "parcelIndex":   3,                    // OPTIONAL; omit for block-level
  "name":          "Pixel Plaza",        // REQUIRED, 1..64
  "description":   "A cozy hangout",      // OPTIONAL, ..512
  "experienceType":"web",                // web|unreal|unity|godot|minecraft|vr|custom
  "entryUrl":      "https://plaza.example.com",  // REQUIRED, https|wss only
  "transport":     "https",              // https|wss|webrtc|custom
  "healthUrl":     "https://plaza.example.com/health", // OPTIONAL; defaults to entryUrl
  "clientRequirements": { "platform": "web", "minVersion": "1.0", "downloadUrl": "https://…" },
  "capabilities":  ["voice", "avatars"], // OPTIONAL, <=16 items
  "contentRating": "everyone",           // everyone|teen|mature
  "version":       "1.0.0",              // REQUIRED, semver-ish; the OPERATOR's build version
  "contentHash":   "sha256:<64 hex>"     // OPTIONAL, owner-attested content-bundle digest
}
```

`manifestVersion` describes the shape of the manifest envelope; `version` is the
operator's own build/content version and is opaque to Nexus. v1 is the only
supported `manifestVersion`; an unsupported value is a `400`.

`contentHash` is **owner-attested and never fetched or checked by the server**.
Its value is that it is stored under the owner's signature, so a client can pin
the digest it expects and detect a swapped payload on a host Nexus does not
control. It **MUST** match `sha256:` followed by 64 lowercase hex characters.

The server adds and owns: `id`, `walletAddress`, `status`
(`live`|`degraded`|`unreachable`|`pending`), `lastProbedAt`, `probeLatencyMs`,
`soulJudged`, `manifestHash`, `signed`, `signedAt`, and timestamps. Clients
**MUST NOT** set these. In particular a client-supplied `manifestHash` is
ignored — the server always derives it, or a caller could sign one manifest and
store another.

**URL safety (SSRF).** `entryUrl`, `healthUrl`, and `clientRequirements.downloadUrl`
**MUST** be `https://` or `wss://`. The server **MUST** reject `http://`, embedded
credentials, `localhost`/`*.local`, and any host that is — or resolves to — a
loopback, private, link-local, CGNAT, or otherwise non-public address (§8.4).

### 8.2 Endpoints

| Method & path | Auth | Description |
|---|---|---|
| `POST /api/v1/experiences` | owner signature (§8.3) | Register. Brain-judged (§8.5) and probed on accept. |
| `GET /api/v1/experiences?blockHeight=&type=&status=` | public | Paginated discovery. |
| `GET /api/v1/experiences/{id}` | public | Fetch one; stale reads trigger async re-probe (§8.4). |
| `PATCH /api/v1/experiences/{id}` | owner signature | Partial manifest update; re-judged + re-probed. |
| `DELETE /api/v1/experiences/{id}` | owner signature | Terminal removal. |
| `POST /api/v1/experiences/{id}/probe` | public, rate-limited | On-demand health probe (1/min per experience). |
| `GET /api/v1/experiences/{id}/verify` | public, rate-limited | Integrity report (§8.7). `?remote=1` also fetches the host's published manifest. |

`blockHeight` and `parcelIndex` are immutable after registration and are ignored
in a `PATCH` body.

A self-hosting operator **SHOULD** publish its own manifest at
`/.well-known/nexus-experience.json` on the entry URL's origin. That document is
what `verify?remote=1` reads to report whether the running world still agrees
with the registration.

### 8.3 Ownership gate

Every mutating route (`POST`/`PATCH`/`DELETE`) uses the **same fail-closed path as
agent registration** (§5.1): a BIP-322 signature over a single-use, purpose-bound
server challenge (`experience-register` or `experience-manage`), followed by a
**live on-chain ownership re-verify** (§4.2). A definitive on-chain mismatch is
denied with `403` even if a stale DB snapshot still shows the caller as owner;
only an indeterminate live result (no inscription linked / indexer outage) falls
back to the snapshot. The gate **MUST NOT** fail open on a mismatch. On block
transfer, experiences are released with the rest of the seller's attachments
(§4.3).

### 8.4 Health probe semantics

The server probes `healthUrl` (defaulting to `entryUrl`; a `wss://` target is
probed over `https://` on the same authority) with a server-side `GET`/`HEAD`:

- **Timeout** is 5s. Redirects are followed manually, at most 3 hops, and every
  hop is re-validated for scheme and address safety — a redirect that downgrades
  to `http://` or points into a private range **MUST** abort the probe.
- **Status mapping:** reachable in `< 2s` ⇒ `live`; reachable in `2–5s`, or an
  HTTP `5xx`, ⇒ `degraded`; timeout, DNS/connection failure, or an SSRF-blocked
  target ⇒ `unreachable`.
- **When probed:** on register, on `PATCH`, on-demand via the probe route
  (rate-limited to 1/min per experience), and lazily on read when the last probe
  is older than 15 minutes (an async refresh; the current read returns the
  existing snapshot).

### 8.5 Constitution inheritance

Experiences live under the same constitution as all Nexus content. On register and
on any text change, the Nexus Brain judges the manifest's human-readable text
(`name`, `description`) against the five immutable moral rules. A clear violation
is a hard **`422`** and records a Brain `ContentFlag`; the experience is **not**
created (or updated). `soulJudged` records that the gate ran. The Brain's regex
detection is deterministic and functions even in DEGRADED mode; the inscription
supplies the rule text. As elsewhere, the Brain does not censor beyond this
publication gate — ongoing visibility remains subject to community flags.

### 8.6 VPSLink deprecation

The legacy `POST /api/v1/vps/link` primitive and its `VPSLink` model are
**DEPRECATED** in favor of experiences and retained only for back-compat. A
`VPSLink { serverUrl, connectionType }` maps to an experience as
`{ entryUrl: serverUrl, transport: connectionType==='websocket' ? 'wss' : connectionType, experienceType: 'custom' }`,
gaining a typed manifest, discovery, server-verified health, and constitution
inheritance. New integrations **SHOULD** use experiences.

### 8.7 Signed manifests (federation integrity)

Ownership proves *who may write*. It does not prove *what was written*. A bare
challenge signature authenticates the caller but leaves the manifest unbound, so
a stored registration is only as trustworthy as the registry holding it. Signed
manifests close that gap **without a chain write**.

**Trust chain — three links:**

```
Bitcoin inscription (deed)  →  BIP-322 signature (action-bound)  →  manifest hash
```

**Canonical manifest hash.** The server derives `manifestHash` as the SHA-256 hex
of a deterministic JSON encoding (sorted keys, no whitespace) of the manifest's
client-supplied fields. Canonicalization rules are normative — a client and the
server **MUST** produce identical bytes:

- `healthUrl` is resolved to its **effective** value (`entryUrl` when omitted),
  because that is what is persisted.
- Absent and explicitly-null optionals are **dropped**, so both hash the same.
- An empty `capabilities` array is dropped; capability **order is preserved**
  (it is operator-chosen presentation order).
- `clientRequirements` is normalized to an object over the keys `platform`,
  `minVersion`, `downloadUrl`; empty values are dropped.
- `manifestVersion` defaults to `1` before hashing.

**Authorization.** A signed write carries `message` — a canonical action-bound
message (§7.2) whose `Body:` field is the **manifest hash**, not a request-body
hash. Using the manifest hash is what makes the signature re-checkable years
later against the stored record alone. The bound `Action` is
`experience.register`, `experience.update`, or `experience.remove`; `Path` is the
exact route; `Block` is the target block. On `PATCH` the signature **MUST**
commit to the **resulting** merged manifest, not to the delta. On `DELETE` it
commits to the manifest being removed.

The server verifies the signature, verifies the binding, re-verifies ownership
live on-chain, and only then consumes the nonce — so an indexer outage costs a
retry rather than a burnt challenge.

**One canonicalizer.** Because a client and the server **MUST** produce identical
bytes, the rules above are worth exactly one implementation. Every first-party
client — SDK and CLI — derives its canonical form from a single source, and the
copies are enforced identical by tests rather than by convention. Anyone writing
a third-party client should treat the rules above as normative and pin the golden
vector in §8.7 as a conformance test, since a divergence here does not fail
loudly: it produces signatures the server rejects, or a record that silently
stops re-verifying later.

**Back-compat.** The bare-`challenge` flow of §8.3 remains valid; such records
report `signed: false`. Mode is chosen by which field is present, never by a
client flag, so a caller cannot request a weaker check. A signature that is
present but does not verify is a hard failure — never a downgrade to unsigned.
An unsigned `PATCH` **MUST** clear any previous signature rather than leave it
attached to a manifest it no longer describes.

**Verification.** `GET /api/v1/experiences/{id}/verify` re-derives the hash from
the record's own fields and reports:

| Field | Meaning |
|---|---|
| `manifestHashMatches` | stored hash equals the re-derived hash — the record was not altered |
| `signatureValid` | BIP-322 signature verifies against the record's wallet |
| `signatureCoversManifest` | the signed `Body:` binding equals the re-derived hash |
| `verified` | all of the above, and the record is signed |

Because the signed message and signature are published on the record, this check
is reproducible by any third party with no trust in the server: altering a stored
manifest breaks `manifestHashMatches`, and altering both the manifest and the
stored hash still breaks `signatureCoversManifest`.

`?remote=1` additionally fetches the operator's `/.well-known/nexus-experience.json`
under the SSRF bounds of §8.4 plus a JSON content-type requirement and a 64 KB
response cap, and reports `remote.matchesRegistry`. Drift between host and
registry is **data, not an error** — hosts legitimately lag a re-registration.

---

## 9. Event schema

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

## 10. Rate limits and quotas

- Challenge issuance: ~30 requests/minute per client IP.
- Token rotate/revoke: ~20 requests/minute per client IP.
- Heartbeat: ~30 requests/minute per agent.
- Brief: ~5 requests/minute per agent.
- Events: ~120 requests/minute per agent.
- Registration: one per wallet per 24 hours.
- Active agents per block: Tier 1 = 10, Tier 2 = 3, Tier 3 = 1.
- Experience health probe: one per experience per minute (on-demand route).
- Experience writes (`POST /experiences`, `PATCH`/`DELETE /experiences/{id}`):
  ~20 requests/minute per identity.
- Experience verify (`GET /experiences/{id}/verify`): ~30 requests/minute per
  identity.
- World writes (`POST /world`, `PATCH`/`DELETE /world/{id}`, `POST /world/terrain`):
  ~60 requests/minute per identity.
- World batch (`POST /world/batch`): ~20 requests/minute per identity, since one
  call carries up to 100 sub-operations.

World writes are keyed per credential where one is present, falling back to client
IP. Their ceiling is lower than public reads because each write costs a live
indexer call (§4.4) before it costs a database write, so an unlimited caller could
use the ownership gate as an amplifier pointed at a third-party indexer. The
limiter runs **before** signature verification and the ownership check, so a
throttled request costs neither.

Experience writes are tighter still, because each one costs a live indexer call
**and** an outbound probe to an owner-supplied host — without a limit the registry
becomes a request amplifier aimed at a third party of the caller's choosing. The
same reasoning applies to `verify?remote=1`, which makes an outbound fetch.

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

## 11. Threat model summary

| Threat | Mitigation |
|--------|------------|
| Signature / request **replay** | Single-use, purpose-bound, address-bound server challenges; atomic exactly-once consumption. |
| **Cross-protocol** signature reuse | Purpose binding; a signature for one purpose cannot satisfy another route. |
| **Cross-owner read** of a private event stream | Runtime routes require the per-agent Bearer token; the agent `id` is never published. |
| **Liveness / brief spoofing** | Heartbeat and brief require the agent's Bearer token. |
| Former owner acting in the **sale→sync lag window** | Live on-chain re-verify at register; fail closed on mismatch. |
| Former owner acting inside the **ownership-cache window** | Authorization lookups are never served from a cached observation (§4.3); a display read cannot warm a memo that a later authorization then trusts. |
| Inherited agents / secrets after **transfer** | Atomic blank-slate release wipes agents, guardian secrets, and detaches identity before flipping ownership. |
| Parcel **first-writer takeover** / replay | Block-ownership required to initialize; single-use challenge + field-hash binding on customize. |
| World write **replay / re-pointing** | Action-bound message (method, path, block, body hash, nonce, expiry). |
| **SSRF** via experience entry/health/download URLs | Scheme restricted to `https`/`wss`; literal + DNS-resolved private/loopback/link-local ranges rejected; probe redirects re-validated per hop; 5s bounded probe. |
| **SSRF** via remote-manifest fetch (`verify?remote=1`) | Same scheme/address/redirect guards, restricted to `https`; JSON content-type required; 64 KB streamed response cap; 5s bounded fetch; rate limited. |
| **Tampering** with a stored experience manifest | Owner's BIP-322 signature binds the canonical manifest hash (§8.7); any alteration breaks `manifestHashMatches`, and altering the stored hash too still breaks `signatureCoversManifest`. Third-party reproducible. |
| Signed authorization **re-pointed** at another experience or route | Action, method, exact path, block, and manifest hash are all bound into the signed message; a `PATCH` binds the resulting manifest, a `DELETE` the one being removed. |
| **Stale signature** left attached after an unsigned edit | An unsigned `PATCH` clears the stored signature rather than leaving it attached to a manifest it no longer describes. |
| Client **downgrading** its own integrity check | Auth mode is chosen by which field is present, never by a client flag; a present-but-invalid signature is a hard failure, not a downgrade to unsigned. |
| Former owner keeping a hosted **experience** on sold land | Experiences released in the atomic blank-slate transfer alongside agents and VPS links. |
| Token **timing** side-channel | Constant-time comparison of SHA-256 token hashes. |
| **Flooding / DoS** of challenge issuance or token rotate/revoke | Durable cross-instance fixed-window limiter (atomic Postgres upsert counter) returns `429` + `Retry-After`; fails open only on limiter-infra error. |
| **Key exposure** | The server never holds private keys; API tokens are stored only as hashes and shown in plaintext exactly once. |
| Indexer **outage** abused for open access | Indexer fails closed; ownership actions never fail open on an outage — they degrade to the last safe snapshot or deny. |

---

## 12. Versioning

This is Nexus Protocol v1.0. Additive, backward-compatible changes (new optional
fields, new event types, new endpoints) increment the minor version. Any change
that alters an existing contract in a breaking way increments the major version.
The machine-readable `openapi.json` `info.version` tracks the API surface; this
document tracks the normative protocol semantics.
