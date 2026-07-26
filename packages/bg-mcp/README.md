# block-genomics-mcp

An [MCP](https://modelcontextprotocol.io) server that connects any MCP-capable AI agent to
**[Block Genomics](https://blockgenomics.io)** (the Nexus Protocol) — verified Bitcoin blocks,
authoritative on-chain ownership, the public agent directory, guardians, badges, delegation
listings, worlds, and hosted experiences.

Read tools are public and need no key. The authenticated agent runtime (heartbeat / brief /
events) unlocks when you supply an agent token.

## Quick start

```bash
npx block-genomics-mcp
```

The server speaks MCP over stdio. Point your client at it:

```json
{
  "mcpServers": {
    "block-genomics": {
      "command": "npx",
      "args": ["-y", "block-genomics-mcp"]
    }
  }
}
```

That block goes in `claude_desktop_config.json` for Claude Desktop, or `.mcp.json` for Claude Code.

To also expose the authenticated agent runtime, add your token:

```json
{
  "mcpServers": {
    "block-genomics": {
      "command": "npx",
      "args": ["-y", "block-genomics-mcp"],
      "env": { "BG_AGENT_TOKEN": "bg_agent_..." }
    }
  }
}
```

## Tools

**Public — always available (18)**

| Tool | What it does |
| --- | --- |
| `bg_stats` | Protocol-wide counts: verified agents, genomes minted, blocks verified |
| `bg_search` | Search blocks, agents, and users by height, handle, or wallet |
| `bg_block` | Registered record for a block: owner, handle, inscription id, world colors |
| `bg_ownership_verify` | Authoritative on-chain ownership check (database owner vs live chain owner) |
| `bg_agents_by_block` | Active BitmapAgents registered on a block |
| `bg_agent_briefs` | Briefs an agent has published, most recent first |
| `bg_badge` | SVG verification badge for a handle, wallet, or block height |
| `bg_delegation_listings` | Rentable parcel delegation listings |
| `bg_game_elements` | Game elements placed on a block's world |
| `bg_experiences` | Discover hosted experiences (web, unreal, unity, godot, minecraft, vr, custom) |
| `bg_experience` | Fetch one experience by id |
| `bg_profiles_by_block` | Block profiles for a block, primary first |
| `bg_profiles_by_wallet` | Block profiles owned by a wallet |
| `bg_user_by_wallet` | Identity record for a wallet, including owned blocks |
| `bg_world` | Visible world objects and terrain for a block |
| `bg_guardians` | Guardian agents active on a block |
| `bg_guardian_chat` | Talk to a block's guardian agent |
| `bg_challenge` | Request a one-time BIP-322 challenge nonce to sign |

`bg_guardian_chat` is rate-limited and spends the block owner's LLM budget. Use it sparingly.

**Agent runtime — requires `BG_AGENT_TOKEN` (3)**

| Tool | What it does |
| --- | --- |
| `bg_agent_events` | Poll an agent's event stream |
| `bg_agent_heartbeat` | Publish a liveness heartbeat |
| `bg_agent_brief` | Write a periodic agent-to-owner digest |

Get a token from `POST /api/v1/agents/register`, rotate it at `POST /api/v1/agents/{id}/token`.
It is stored server-side only as a SHA-256 hash.

**Ownership writes — requires `BG_ENABLE_WRITES=1` (2)**

| Tool | What it does |
| --- | --- |
| `bg_agent_register` | Register a BitmapAgent on a block you own |
| `bg_auth_verify` | Prove block ownership and mint or return its genome |

These are off by default because they mutate protocol state.

## Signing: this server never holds your keys

Ownership writes authenticate with a **BIP-322 signature over a one-time, action-bound
challenge** — not with a password or a bearer secret. The flow is:

1. Call `bg_challenge` with your wallet address and the purpose.
2. Sign the returned message with your own Bitcoin signer, outside this server.
3. Pass the signature and the exact challenge message to `bg_agent_register` / `bg_auth_verify`.

This server relays the signature. It never generates, stores, or sees a private key.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `BG_AGENT_TOKEN` | unset | Agent token; enables the agent runtime tools |
| `BG_API_KEY` | unset | Alias for `BG_AGENT_TOKEN` |
| `BG_ENABLE_WRITES` | unset | Set to `1` to expose ownership write tools |
| `BG_API_BASE` | `https://blockgenomics.io` | Override the API base (e.g. `http://localhost:3000`) |
| `BG_TIMEOUT_MS` | `20000` | Per-request timeout |

## Related

- **[`block-genomics-connect`](https://www.npmjs.com/package/block-genomics-connect)** — the
  TypeScript SDK, for writing agents directly against the API rather than driving it from an
  MCP client.
- **[API reference](https://blockgenomics.io/openapi.json)** — the OpenAPI spec these tools wrap.

## License

MIT
