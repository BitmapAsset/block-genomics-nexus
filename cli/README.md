# block-genomics

The official CLI for [Block Genomics](https://blockgenomics.io). Bitcoin-anchored identity for AI agents and humans — verify block ownership, register sovereign BitmapAgents, and stream real user events into your local agent runtime, all with your own wallet as the signer.

## Install

```bash
npm install -g block-genomics    # or
npx block-genomics --help
```

## The 60-second story

You own a Bitcoin block via a `.bitmap` inscription. You want an autonomous agent that lives on that block, hears when visitors arrive, gets chat DMs, and reacts to the block owner's world changes.

```bash
# 1) Prove you own the block (challenge → sign → verify)
BG_WALLET_ADDRESS=bc1p... \
BG_SIGNATURE_CMD='sparrow sign-message --address bc1p...' \
block-genomics verify --block 840128

# 2) Register your agent (same challenge/sign flow, different purpose)
#    Registration prints a one-time API token — store it now, it is shown only once.
block-genomics register-agent \
  --block 840128 \
  --endpoint https://agent.example.com \
  --tier 1 \
  --permissions READ_DMS,SEND_DMS

# 3) Long-poll the event stream — JSON lines to stdout (bearer token required)
export BG_AGENT_TOKEN=<the token from step 2>
block-genomics events poll --agent <agentId> | jq .

# 4) Heartbeat forever
block-genomics heartbeat --agent <agentId> --loop --interval 30
```

Runtime calls (`events poll`, `heartbeat`) authenticate with the per-agent API token as
`Authorization: Bearer <token>`. Pass it with `--token` or `BG_AGENT_TOKEN`. Lost the token?
Rotate a fresh one with `bg agent token rotate` (below).

Payloads are small JSON with `actor`, a short `summary`, and resource ids — never LLM keys, emails, or private fields. The full schema lives in `/openapi.json` on the site.

## Real commands (v0.3.0+)

| Command | What it does |
|---|---|
| `block-genomics verify --block <h>` | Fetches a challenge, signs it with your wallet, and claims block ownership. |
| `block-genomics register-agent --block <h> --endpoint <url>` | Same auth flow with `purpose=agent-register`, then registers a BitmapAgent. Prints the one-time API token. |
| `block-genomics events poll --agent <id> [--token <t>]` | Long-polls `/api/v1/agents/<id>/events`, emits JSON lines. Sends the bearer token; tracks a cursor so you never see an event twice. |
| `block-genomics heartbeat --agent <id> [--loop] [--token <t>]` | Sends a heartbeat with the bearer token (`--loop` runs every 30s until Ctrl+C). |
| `block-genomics agent token rotate --agent <id>` | Issues (or re-issues) the agent's API token and prints it once. Ownership-scoped via a single-use `agent-token` challenge. |
| `block-genomics agent token revoke --agent <id>` | Revokes the active token — runtime calls `401` until you rotate a new one. |
| `block-genomics my-blocks` | Lists the blocks your wallet owns (public read; no signature needed). |
| `block-genomics whoami` | Shows your configured wallet, verified tier, and the agents registered from this machine. |
| `block-genomics agent list` | Lists agents you registered from this machine. |
| `block-genomics agent update --agent <id> --endpoint <url> [--permissions csv]` | Rotates an agent's endpoint/permissions. Ownership-scoped: fetches a `purpose=agent-manage` challenge, signs it (single-use), and the server verifies you own the agent. |
| `block-genomics agent revoke --agent <id>` | Retires an agent you own (same `agent-manage` challenge flow, kills active sessions). |
| `block-genomics status` | Local status (config + last-known agent ids). |
| `block-genomics init` | Interactive setup wizard. |

Runtime auth: `events poll` and `heartbeat` send the per-agent API token as a bearer header.
Get the token from `register-agent` (shown once) or `agent token rotate`, then pass it with
`--token` or `BG_AGENT_TOKEN`. `agent token rotate|revoke` are owner-wallet signed and single-use.

`agent update` / `agent revoke` / `my-blocks` / `whoami` all require `--address` (or `BG_WALLET_ADDRESS`) and use the same signer as `verify`. Because the manage challenge is single-use, a captured signature cannot be replayed against your agents.

Legacy demo commands (`verify-demo`, `explore`, `build`, `market`, `wallet`, `profile`, `connect`, and `agent verify` / `agent start`) are still available but do NOT hit the network — they exist for offline demos of the CLI shell only.

## Signing

The CLI never holds private keys. It gets a BIP-322 signature from one of:

1. `--sig <bip322>` flag (one-shot).
2. `BG_SIGNATURE=<sig>` env var (one-shot).
3. `BG_SIGNATURE_CMD` env var — a shell command that reads the message on stdin and prints the signature on stdout. Plug in Sparrow, an HSM helper, a hardware wallet script, or `bip322-cli`.

Example with a bip322 CLI:

```bash
export BG_WALLET_ADDRESS=bc1p...
export BG_SIGNATURE_CMD='bip322-cli sign --address "$BG_WALLET_ADDRESS" --key ~/.wallets/key.wif'
block-genomics verify --block 840128
```

## Environment

| Env | Default | Purpose |
|---|---|---|
| `BG_API_URL` | `https://blockgenomics.io` | Base URL. Point at localhost for dev. |
| `BG_WALLET_ADDRESS` | — | Default owner address. |
| `BG_AGENT_ID` | — | Default agent id for `events` / `heartbeat`. |
| `BG_AGENT_TOKEN` | — | Per-agent API token (bearer) for `events` / `heartbeat`. |
| `BG_SIGNATURE` | — | Pre-supplied BIP-322 signature (one-shot). |
| `BG_SIGNATURE_CMD` | — | Shell command that signs stdin → prints sig on stdout. |

## Development

```bash
npm install
npm run build          # tsc → dist/
node dist/bin/bg.js --help
npm run dev -- --help  # tsx, no build step
```

Config is stored at `~/.block-genomics/config.json`. It records the last-registered agent id so you can drop the `--agent` flag on subsequent commands.

## License

MIT.
