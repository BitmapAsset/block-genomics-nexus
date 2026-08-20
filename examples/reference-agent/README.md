# Nexus reference agent

The hello-world agent for the [Nexus Protocol](https://blockgenomics.io/protocol).
It does the whole lifecycle, minimally and readably, on top of the
[`block-genomics-connect`](https://www.npmjs.com/package/block-genomics-connect) SDK:

1. Loads a keypair and builds a BIP-322 signer — **the SDK never sees your key**.
2. Registers a sovereign agent on a block you own (one-time API token).
3. Heartbeats on an interval so the network sees it as alive.
4. Long-polls its **private** event stream and logs each event.
5. On `Ctrl-C`, gracefully revokes the token and exits.

Copy it, change the four env vars, and you have your own agent.

## 5-minute setup

```bash
cd examples/reference-agent
npm install
cp .env.example .env
```

Bring your own wallet, or mint a throwaway one for a dry run:

```bash
npm run keygen           # prints a throwaway address + WIF (p2wpkh by default)
```

Edit `.env`:

- `BG_WALLET_WIF` — the WIF private key of the wallet that owns your block.
- `BG_BLOCK_HEIGHT` — the block you own (its `.bitmap` inscription is under that wallet).
- `BG_ENDPOINT_URL` — where your agent serves.
- `BG_ADDRESS_TYPE` — `p2wpkh` (bc1q…), `p2tr` (bc1p…), or `p2pkh` (1…), matching the owning address.

Run it:

```bash
npm start
```

You should see the agent register, then a heartbeat and event-poll loop. Press
`Ctrl-C` to revoke the token and shut down cleanly.

## What "you own the block" means

Registration re-verifies ownership **on-chain** and fails closed. If the wallet
behind `BG_WALLET_WIF` does not currently hold the block's `.bitmap` inscription,
the server returns **403** and the agent prints a clear message and exits — this
is expected. A throwaway key from `npm run keygen` will always get the 403: it
proves your signing works (a bad signature would be rejected earlier, with a 401)
but you don't own the block. To go all the way through, use the key for a block
you actually own.

## How it behaves

- **Token storage.** The one-time token is written to `./.agent.creds.json`
  (owner-only, git-ignored). Restarting resumes the same agent instead of hitting
  the 24h registration cooldown.
- **Self-healing token.** If a runtime call ever returns `401` (the token was
  revoked or rotated elsewhere), the agent rotates a fresh token with the owner
  wallet and carries on.
- **Graceful shutdown.** `Ctrl-C` revokes the token (set `BG_REVOKE_ON_EXIT=false`
  to keep it and resume next time) and deletes the local creds file.

## Files

| File | Role |
|------|------|
| `src/index.ts` | The agent: register/resume → heartbeat → event poll → graceful revoke. |
| `src/signer.ts` | BIP-322 signer over a WIF key (the only place the key is touched). |
| `src/bip322.ts` | The BIP-322 signing primitives, on `@noble/curves` + `@scure/btc-signer`. Copy this if you are writing your own agent. |
| `src/config.ts` | Reads + validates env once, fails fast with clear errors. |
| `src/token-store.ts` | Reads/writes the one-time token file (0600, git-ignored). |
| `src/keygen.ts` | `npm run keygen` — mint a throwaway test keypair. |

## Learn more

- SDK reference and quickstarts: <https://blockgenomics.io/docs>
- Normative protocol spec: <https://blockgenomics.io/protocol>
- CLI (same flows from the terminal): `npx block-genomics --help`

MIT licensed.
