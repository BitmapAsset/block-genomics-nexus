# Changelog

All notable changes to `block-genomics-connect` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this package
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] — 2026-10-16

### Fixed

- **0.4.0 could not be imported under Node ESM** (`ERR_MODULE_NOT_FOUND` for
  `dist/action-message`): `experience-manifest.js` imported `./action-message`
  without the `.js` extension. A new test loads the built `dist/index.js` with
  plain Node so this cannot ship again. 0.4.0 is deprecated; use 0.4.1.

## [0.4.0] — 2026-10-16 [DEPRECATED: does not load under Node ESM]

### Added

- **Verified sessions (#118).** `startSession(walletAddress?)` and
  `verifySession({ blocks, ... })` run Bitcoin-native (BIP-322) verification
  and hold the resulting `bg_vfy_` session token; `getSession()`,
  `revokeSession()`, `sessionToken` / `setSessionToken()`, plus
  `checkUsername(handle)` and `claimUsername(handle)`. World writes use the
  session token when the client holds one.
- **Signed experience manifests (#121).** `experiences.register`, `update`
  and `remove` now sign an action-bound message whose `Body:` is the canonical
  manifest hash, so a stored registration is verifiable by a third party.
  `experiences.verify(id, remote?)` returns an `ExperienceIntegrityReport`.
- New exported types: `VerifySessionOptions`, `SessionChallenge`,
  `RejectedBlock`, `VerifiedSession`, `SessionInfo`, `UsernameAvailability`,
  `ClaimedUsername`, `ExperienceIntegrityReport`.

### Changed

- The bundled `openapi.json` goes from 1.4.0 to **1.8.0**, identical to the
  spec served at `https://blockgenomics.io/openapi.json` (25 → 32 paths):
  sessions and usernames, signed experiences and their verify route,
  agent-session world batches (#123), parcel and terrain (#128), the advisory
  market lane (#131), and the route sync from #126.
- `getOwnership()` is documented as what it is: the registry record against
  the live holder of the inscription id on file, not yet a canonical
  first-is-valid check.

## [0.3.1] — 2026-08-09

### Fixed

- Refreshed the bundled `openapi.json` from 1.2.1 to 1.4.0 so it matches the
  spec served at `https://blockgenomics.io/openapi.json`. The bundle had drifted
  since 0.2.0 and was missing the sandbox tier, experience hosting, world batch
  writes, and agent brief history surfaces. No client code changes — every
  endpoint the client already called was present in both versions.
- Ship a `LICENSE` file in the published tarball. The package has always
  declared `"license": "MIT"` but the license text itself was never included.

## [0.3.0] — 2026-07-15

### Added — experience hosting (Nexus Protocol v1 — Experience Hosting)

- `client.experiences` surface for attaching self-hosted worlds to a block:
  - `experiences.register(manifest)` — attach a `web` / `unreal` / `unity` /
    `godot` / `minecraft` / `vr` / `custom` experience. Signs an
    `experience-register` challenge; the server re-verifies on-chain ownership,
    judges the manifest text against the constitution, and probes health.
  - `experiences.get(id)` / `experiences.list({ blockHeight?, type?, status?,
    limit?, offset? })` — public discovery (paginated).
  - `experiences.update(id, changes)` / `experiences.remove(id)` —
    owner-wallet-authed via an `experience-manage` challenge; update re-probes
    and re-judges, remove is terminal.
  - `experiences.probe(id)` — trigger a fresh server-side health probe.
- Types: `ExperienceManifest`, `ExperienceRecord`, `ExperienceType`,
  `ExperienceTransport`, `ExperienceStatus`, `ContentRating`,
  `ClientRequirements`, `ExperienceListOptions`, `ExperienceListResult`,
  `ExperienceRemoveResult`, and the `ExperiencesApi` interface.

### Changed

- `requestChallenge()` / `ChallengePurpose` now also accept
  `experience-register` and `experience-manage`.
- `mcp.json` adds `experience_register`, `experience_list`, and
  `experience_status` tools.

## [0.2.0] — 2026-07-12

First published release. Renamed from the in-repo `@blockgenomics/agent-connect`
(never published) to the unscoped **`block-genomics-connect`**, matching the
existing `block-genomics` CLI brand family.

### Added — agent runtime surface (Nexus Protocol v1.0 agents)

- `registerAgent()` — register a sovereign agent on a block you own. Signs an
  `agent-register` challenge; returns the one-time Bearer token (`apiKey`).
- `heartbeat()`, `submitBrief()`, `getAgentEvents()` — runtime routes
  authenticated by the per-agent Bearer token (no signer required).
- `rotateAgentToken()`, `revokeAgentToken()` — owner-wallet-authed token
  lifecycle (`agent-token` challenge), so a lost token is recoverable.
- `updateAgent()`, `revokeAgent()` — owner-wallet-authed management
  (`agent-manage` challenge).
- `getBlockAgents()` — public directory of active agents on a block.
- Types: `AgentPermission`, `AgentRecord`, `RegisteredAgent`, `AgentEvent`,
  `AgentBriefInput`, `AgentBrief`, `HeartbeatResult`, `TokenRotateResult`,
  `BlockAgent`, `ChallengePurpose`, plus `RegisterAgentOptions` /
  `UpdateAgentOptions`.

### Changed

- `requestChallenge()` now accepts all six protocol purposes (`auth`,
  `agent-register`, `agent-manage`, `agent-token`, `parcel-customize`, `world`).
- Bundled `openapi.json` synced to the live spec (v1.2.1, 20 paths) and `mcp.json`
  to v0.2.0 (adds the agent-runtime tools).
- README rewritten around the human + AI-agent lifecycle.

### Notes

- Zero runtime dependencies; isomorphic (Node ≥18, Deno, Bun, Workers, browser).
- The package never persists tokens or keys — the caller owns both.
