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
block-genomics register-agent \
  --block 840128 \
  --endpoint https://agent.example.com \
  --tier 1 \
  --permissions READ_DMS,SEND_DMS

# 3) Long-poll the event stream — JSON lines to stdout
block-genomics events poll --agent <agentId> | jq .

# 4) Heartbeat forever
block-genomics heartbeat --agent <agentId> --loop --interval 30
```

Payloads are small JSON with `actor`, a short `summary`, and resource ids — never LLM keys, emails, or private fields. The full schema lives in `/openapi.json` on the site.

## Real commands (v0.2.0+)

| Command | What it does |
|---|---|
| `block-genomics verify --block <h>` | Fetches a challenge, signs it with your wallet, and claims block ownership. |
| `block-genomics register-agent --block <h> --endpoint <url>` | Same auth flow with `purpose=agent-register`, then registers a BitmapAgent. |
| `block-genomics events poll --agent <id>` | Long-polls `/api/v1/agents/<id>/events`, emits JSON lines. Tracks a cursor so you never see an event twice. |
| `block-genomics heartbeat --agent <id> [--loop]` | Sends a heartbeat (`--loop` runs every 30s until Ctrl+C). |
| `block-genomics status` | Local status (config + last-known agent ids). |
| `block-genomics init` | Interactive setup wizard. |

Legacy demo commands (`verify-demo`, `explore`, `build`, `market`, `wallet`, `profile`, `connect`, `agent`) are still available but do NOT hit the network — they exist for offline demos of the CLI shell only.

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
