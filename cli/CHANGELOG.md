# Changelog

All notable changes to the `block-genomics` CLI are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- `bg experience register` and `bg experience remove` now sign the **manifest**,
  not just a bare challenge. Both send an action-bound `message` whose `Body:`
  field is the canonical manifest hash, so the write commits to the exact
  manifest bytes and the stored record becomes verifiable by a third party via
  `GET /api/v1/experiences/{id}/verify`. Previously these commands used the
  legacy bare-challenge flow, which proved wallet ownership but left the record
  un-tamper-evident (`signed: false`).

  How you supply a signature is unchanged (`--sig` / `BG_SIGNATURE` /
  `BG_SIGNATURE_CMD`) — the CLI still never holds a key. What it asks you to
  sign is now the action-bound message rather than the raw challenge.

### Added
- `npm run sync:canon` — regenerates `src/lib/action-message.ts` and
  `src/lib/experience-manifest.ts` from the SDK source. These are **generated
  mirrors**: the canonicalizer decides which bytes a signature commits to, so it
  gets exactly one editable copy. `npm run build` and the test suite both fail
  if they drift.

## [0.4.0] — 2026-07-15

Experience hosting — attach a self-hosted world (web / unreal / unity / godot /
minecraft / vr / custom) to a block you own. Nexus registers, discovers, and
probes health; it never hosts your world.

### Added
- `bg experience register [--manifest ./manifest.json] --address <bc1p>` — reads
  the manifest, fetches a single-use `experience-register` challenge, signs it
  (BIP-322), and registers the experience. Same fail-closed ownership path as
  `bg register-agent` (live on-chain re-verify server-side). The CLI never holds
  a key — signature comes from `--sig` / `BG_SIGNATURE` / `BG_SIGNATURE_CMD`.
- `bg experience list [--block <h>] [--type <t>] [--status <s>] [--limit <n>]` —
  public discovery, paginated.
- `bg experience status --id <expId> [--probe]` — show an experience's manifest
  and last probed health; `--probe` triggers a fresh server-side health probe.
- `bg experience remove --id <expId> --address <bc1p>` — terminally remove an
  experience you own (single-use `experience-manage` challenge).

## [0.3.0] — 2026-07-11

Agent API token lifecycle. Runtime calls are now authenticated with a per-agent
bearer token instead of relying on the agent id alone.

### Added
- `bg agent token rotate --agent <id> --address <bc1p>` — issues (or re-issues) an
  agent's API token and prints the new secret exactly once.
- `bg agent token revoke --agent <id> --address <bc1p>` — revokes the active token;
  runtime calls return `401` until a new token is rotated in.
- `--token` flag and `BG_AGENT_TOKEN` environment variable on `bg heartbeat` and
  `bg events poll`, sent as `Authorization: Bearer <token>`.
- `bg register-agent` now surfaces the one-time API token in a boxed panel (and in the
  `--json` output) with a "shown only once" warning. The CLI never writes the token to disk.

### Changed
- `bg heartbeat` / `bg events poll` attach the bearer token when present. Legacy agents
  registered before token auth still work via a deprecation grace path (sunsets 2026-08-15).
- Token rotate/revoke are owner-wallet authenticated: the CLI fetches a single-use
  `agent-token` challenge, signs it with your wallet, and the server verifies both the
  BIP-322 signature and that you own the agent. A captured signature cannot be replayed.

## [0.2.1] — 2026-07-10

Owner tooling for managing agents and blocks from the terminal. (Repo-tagged; the first
public npm release carrying these commands is 0.3.0.)

### Added
- `bg my-blocks` — lists the blocks your wallet owns (public read; no signature needed).
- `bg whoami` — shows your configured wallet, verified tier, and the agents registered
  from this machine.
- `bg agent list` — lists agents you registered from this machine.
- `bg agent update --agent <id> --endpoint <url> [--permissions csv]` — rotates an
  agent's endpoint/permissions. Ownership-scoped via a single-use `agent-manage` challenge.
- `bg agent revoke --agent <id>` — retires an agent you own (same `agent-manage` flow).

## [0.2.0] — 2026-07-10

First real, network-backed CLI. Every write is a wallet-signed BIP-322 flow — the CLI
never holds a private key.

### Added
- `bg verify --block <h>` — challenge → sign → verify block ownership against the live API.
- `bg register-agent --block <h> --endpoint <url>` — registers a BitmapAgent on a block you own.
- `bg events poll --agent <id>` — long-polls the agent event stream and emits JSON lines,
  tracking a cursor so an event is never printed twice.
- `bg heartbeat --agent <id> [--loop]` — sends agent heartbeats.
- Pluggable signer: `--sig`, `BG_SIGNATURE`, or `BG_SIGNATURE_CMD` (Sparrow, an HSM helper,
  a hardware-wallet script, or `bip322-cli`).

## [0.1.0]

Initial CLI scaffold — the interactive shell and offline demo surface (`init`, `verify-demo`,
`explore`, `build`, `connect`, `profile`, `wallet`, `market`, `status`, and the DNA/genome
visualizers). These commands run entirely offline and predate the live API integration.

[0.3.0]: https://github.com/BitmapAsset/block-genomics-nexus/releases/tag/cli-v0.3.0
[0.2.0]: https://www.npmjs.com/package/block-genomics/v/0.2.0
