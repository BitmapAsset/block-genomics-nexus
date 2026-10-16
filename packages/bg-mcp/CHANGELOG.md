# Changelog

All notable changes to `block-genomics-mcp` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this package
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] — 2026-10-16

Security patch. There are no changes to the tool catalog: the same 35 tools,
the same schemas and the same behaviour.

### Security

- `@modelcontextprotocol/sdk` floor raised from `^1.29.0` to `^1.31.0`
  (GHSA-6qxp-vccf-f47h: the SDK's OAuth client could send credentials to an
  authorization server chosen by the MCP server). This server never runs the
  SDK's OAuth client, but installs now resolve to a patched SDK either way.
- The repo lockfile now pins patched transitive versions of hono 4.13.13,
  ip-address 10.7.4, proxy-addr 2.0.8 and fast-uri 3.1.8. npm does not ship
  lockfiles to package consumers, so a fresh install resolves these from the
  SDK's own ranges, all of which already admit the fixed versions (#222).
- vitest 3 → 4.1.12 (dev only).

### Changed

- Input-validation errors now read `Expected number, received string at
  height` instead of a JSON dump of the zod issues. The result is still
  `isError` with the same `-32602` prefix. The new wording comes from the SDK
  upgrade.

## [0.2.0] — 2026-10-16

35 tools, up from 23. The catalog is now shared byte-for-byte with the remote
endpoint at `https://blockgenomics.io/mcp`, and a parity test fails the build if
the two drift.

### Added

- **Bitcoin-native verification (#118).** `bg_verify_start` and
  `bg_verify_submit` turn a BIP-322 signature from the wallet holding your
  `.bitmap` into a `bg_vfy_` session token scoped to the blocks that verified
  on-chain. `bg_username_available` checks a handle.
- **Verified-session tools, shown when `BG_SESSION_TOKEN` is set (#118):**
  `bg_my_blocks`, `bg_claim_username`, `bg_session_revoke`, and
  `bg_world_create`. A world write needs the block in the session's verified
  set and still held by the signing wallet at call time.
- **Signed self-hosted experiences (#121).** `bg_experience_register`,
  `bg_experience_update` and `bg_experience_remove` (behind
  `BG_ENABLE_WRITES=1`) accept an action-bound message whose `Body:` is the
  canonical manifest hash. `bg_experience_verify` re-derives that hash and
  checks the owner's signature; `remote: true` also compares the manifest the
  host publishes.
- **`bg_block_market` (#131).** Advisory third-party venue view for a block:
  listed or not, asking price, link. Display-only, never ownership.
- Shared tool catalog with the remote Streamable HTTP endpoint (#115).

### Changed

- `bg_ownership_verify` now says what it checks: the Block Genomics record
  against the live holder of the inscription id on file. It is not yet a
  canonical first-is-valid check (#213).
- The server reports version `0.2.0` in its MCP `initialize` response (it said
  `0.1.0`).
- README: every tool listed by group, `BG_SESSION_TOKEN` documented, and the
  "authoritative on-chain ownership" claim removed.

### Security

- Dependency updates from Dependabot alerts (#112, #147, #151).

## [0.1.2]

- Fixed `mcpName` casing for the MCP Registry (#113).
