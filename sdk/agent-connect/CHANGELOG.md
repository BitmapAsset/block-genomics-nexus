# Changelog

All notable changes to `block-genomics-connect` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this package
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
