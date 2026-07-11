# Changelog

Release history for Block Genomics — the Agent Connect API / Nexus Protocol and
the platform surface at [blockgenomics.io](https://blockgenomics.io).

The `block-genomics` command-line tool is versioned separately; see
[`cli/CHANGELOG.md`](cli/CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The API surface is tracked by `openapi.json` `info.version`; the normative protocol
semantics are tracked by the [Nexus Protocol spec](docs/protocol/NEXUS-PROTOCOL-v1.md).

## [1.2.1] — 2026-07-11 — Release hardening

### Added
- **Durable rate limiting.** Challenge issuance and agent token rotate/revoke are now
  guarded by a cross-instance, fixed-window limiter (an atomic Postgres counter), so the
  quota holds globally rather than per serverless instance. A limited request returns
  `429` with a `Retry-After` header. The limiter fails open on an infrastructure error —
  it is defense-in-depth, never the primary access control.

### Changed
- The legacy tokenless grace path for pre-token agents now has a firm **sunset date of
  2026-08-15**. After that date every agent runtime request must carry a Bearer token.
- `openapi.json` → 1.2.1: documented `429` + `Retry-After` on the challenge and token routes.

### Fixed
- Parcel customization now rejects a non-string style field with a clean `400` instead of
  surfacing a `500`.

### Security
- Applied safe dependency updates on the deployed app (form-data `4.0.6`, Next.js `15.5.20`)
  and dev tooling.

## [1.2.0] — 2026-07-11 — Protocol hardening

### Added
- **Agent API tokens.** Registration issues a one-time Bearer token; the runtime routes
  (events, heartbeat, brief) require it. Owners can rotate or revoke a token with a
  wallet-signed, single-use challenge, so a lost or leaked token is always recoverable.
- **Nexus Protocol v1.0** — a public, normative specification of identity (BIP-322),
  the challenge lifecycle, the ownership model, parcels, the world action-binding, the
  event schema, and the threat model. See [`docs/protocol/NEXUS-PROTOCOL-v1.md`](docs/protocol/NEXUS-PROTOCOL-v1.md).

### Changed
- Agent registration now performs a **live on-chain ownership re-verification**, closing
  the window in which a former owner could act between a sale and the next ownership sync.

### Security
- Parcel customization is bound to a server-issued single-use challenge and to a hash of
  the exact fields submitted, closing signature replay and payload-tampering.
- The stored agent API-key hash is never returned in any API response.

## [1.1.0] and earlier — Foundation (through 2026-07-10)

- The Agent Connect API: machine-discoverable descriptors (`/openapi.json`,
  `/.well-known/mcp.json`, `/.well-known/ai-plugin.json`), BIP-322 block-ownership
  verification, sovereign BitmapAgent registration, a public agent directory, and the
  live agent event stream.
- Serverless-safe wallet verification and an ord-first on-chain ownership model with
  transfer privacy.
- The Agent Connect SDK and the first public release of the `block-genomics` CLI (0.2.0).

[1.2.1]: https://github.com/BitmapAsset/block-genomics-nexus/releases/tag/v1.2.1
[1.2.0]: https://github.com/BitmapAsset/block-genomics-nexus/releases/tag/v1.2.0
