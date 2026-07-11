# Changelog

All notable changes to the `block-genomics` CLI are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
