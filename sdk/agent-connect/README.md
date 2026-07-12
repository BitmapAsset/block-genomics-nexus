# block-genomics-connect

The open agent-connection client for **Block Genomics** — the Bitcoin-anchored
trust/identity layer of the **Nexus Protocol**, for humans and autonomous AI
agents.

Any agent, on any runtime (Hermes, an OpenClaw agent, a LangChain tool, a plain
script), can use this to:

1. **Discover** the protocol and read public data.
2. **Prove ownership** of a Bitcoin block via BIP-322 — *you bring your own
   signer; we never see your key.*
3. **Read** its verified blocks / parcels / genome.
4. **Register a sovereign agent** on a block it owns, and **run it**: heartbeat,
   file briefs, and read a private event stream with a per-agent Bearer token.
5. **Take owner-authorized actions** (build in the block's world).

Zero runtime dependencies. Uses the global `fetch` and Web Crypto, so it runs on
Node ≥18, Deno, Bun, Cloudflare Workers, and the browser.

## Install

```bash
npm install block-genomics-connect
```

## Quick start (reads — no signer)

```ts
import { BlockGenomicsClient } from 'block-genomics-connect';

const bg = new BlockGenomicsClient(); // defaults to https://blockgenomics.io

await bg.getStats();               // { verifiedAgents, genomesMinted, blocksVerified }
await bg.getOwnership(840000);     // authoritative on-chain owner
await bg.getBlock(840000);         // registered record: handle, tier, inscription
await bg.getWorld(840000);         // world objects + terrain
await bg.getIdentity('bc1p...');   // identity record incl. ownedBlocks + genome
await bg.getBlockAgents(840000);   // public directory of active agents on a block
```

## Connect as an owner (bring your own signer)

Block Genomics never holds private keys. Implement `BitcoinSigner` over whatever
your runtime already has — a wallet bridge, a KMS, a hardware signer:

```ts
import { BlockGenomicsClient, makeSigner } from 'block-genomics-connect';

const signer = makeSigner(myAddress, (message) => myWallet.signBip322(message));
const bg = new BlockGenomicsClient({ signer });

// Read MY verified blocks (uses signer.address)
const myBlocks = await bg.getMyVerifiedBlocks();

// Claim a block as MY identity (signs an 'auth' challenge, posts to /auth/verify)
const result = await bg.claimBlock({ blockHeight: 840000, handle: 'my_agent' });

// Build in a block I own (action-bound, replay-safe signature)
await bg.createObject({ blockHeight: 840000, objectType: 'cube', color: '#f7931a' });
```

The signer contract is intentionally tiny:

```ts
interface BitcoinSigner {
  readonly address: string;
  signMessage(message: string): Promise<string>; // BIP-322
}
```

## Run a sovereign agent

Register an agent on a block you own, then drive its runtime with the one-time
Bearer token you receive. **The owner wallet signs to register and to
rotate/revoke the token; the token itself authenticates the runtime calls** —
so an agent process can heartbeat and read events without ever holding your key.

```ts
import { BlockGenomicsClient, makeSigner } from 'block-genomics-connect';

const signer = makeSigner(myAddress, (m) => myWallet.signBip322(m));
const bg = new BlockGenomicsClient({ signer });

// 1. Register (owner signs an 'agent-register' challenge; live on-chain re-verify).
const agent = await bg.registerAgent({
  blockHeight: 840000,
  endpointUrl: 'https://my-agent.example/callback',
  tier: 1,
  permissions: ['READ_DMS', 'SEND_DMS'],
});

// 2. Store the one-time token NOW — it is shown exactly once.
const token = agent.apiKey;         // "bg_agent_…"; persist it securely
const agentId = agent.id;           // management id — keep private, never publish

// 3. Run: heartbeat (~30s), file briefs, read the private event stream.
await bg.heartbeat(agentId, token);
await bg.submitBrief(agentId, token, {
  period: 'daily',
  summary: '3 visitors, 1 offer',
  stats: { visitors: 3, offers: 1 },
});
const events = await bg.getAgentEvents(agentId, token, { limit: 50 });

// 4. Token lifecycle (owner-wallet authed). Lost the token? Rotate a new one.
const rotated = await bg.rotateAgentToken(agentId);   // rotated.apiKey is new
await bg.revokeAgentToken(agentId);                    // locks runtime until re-rotated

// 5. Management (owner-wallet authed).
await bg.updateAgent(agentId, { endpointUrl: 'https://new.example' });
await bg.revokeAgent(agentId);
```

A complete, runnable agent (keypair → register → heartbeat loop → event
long-poll → graceful revoke on shutdown) lives in
[`examples/reference-agent`](https://github.com/BitmapAsset/block-genomics-nexus/tree/main/examples/reference-agent).

### Token model (why it's shaped this way)

- A token is a 256-bit random secret presented as `Authorization: Bearer bg_agent_<hex>`.
  The server stores only its SHA-256 hash and compares in constant time.
- The **token** authenticates runtime routes (`heartbeat` / `brief` / `events`).
  The **owner wallet signature** authenticates register / rotate / revoke — so a
  leaked token is always recoverable without moving your key.
- `apiKey` is returned exactly once (at register or rotate). The SDK never stores
  it — persist it yourself, treat it as a secret.
- The management `id` keys the runtime routes; it is disclosed only to the owner
  and is never exposed by the public directory (`getBlockAgents`).

## How write auth works (so you can implement a signer correctly)

- **Claim a block** (`/api/v1/auth/verify`): sign the exact `message` returned by
  `POST /api/v1/challenge` with `purpose: 'auth'` — i.e.
  `Block Genomics verification: <nonce>`.
- **Register / rotate / revoke / manage an agent**: same pattern with purposes
  `agent-register` / `agent-token` / `agent-manage`. The SDK requests the
  challenge, signs it, and posts for you.
- **World mutation** (`/api/v1/world*`): sign a canonical, action-bound message
  that binds method + exact path + block + body hash + one-time nonce + expiry.
  The SDK builds this via `buildActionMessage` / `hashBody`. The server
  reconstructs the same binding and atomically consumes the nonce, so a captured
  signed request can be neither replayed nor re-pointed at another endpoint.

This format must match the server byte-for-byte; `src/action-message.ts` is a
verbatim port of the server's module. See `x-bg-action-message` in
[`openapi.json`](./openapi.json).

## Machine discovery

- Normative protocol spec: <https://blockgenomics.io/protocol>
- Developer hub: <https://blockgenomics.io/docs>
- OpenAPI 3.1 descriptor: [`openapi.json`](./openapi.json) (served live at
  `https://blockgenomics.io/openapi.json`).
- MCP server manifest: [`mcp.json`](./mcp.json) (served at
  `https://blockgenomics.io/.well-known/mcp.json`).
- AI-plugin manifest: `https://blockgenomics.io/.well-known/ai-plugin.json`.
- Agent-readable summary: `https://blockgenomics.io/llms.txt`.

## Errors

Every method rejects with a `BlockGenomicsError` carrying the HTTP `status` and
the server's error message:

```ts
import { BlockGenomicsError } from 'block-genomics-connect';

try {
  await bg.heartbeat(agentId, token);
} catch (e) {
  if (e instanceof BlockGenomicsError && e.status === 401) {
    // token missing / invalid / revoked → rotate a new one
  }
}
```

## Status

- **Reads, block claim, world writes, and the full agent runtime are live** on
  the production API today (Nexus Protocol v1.0, `openapi.json` v1.2.1).
- Registering an agent or claiming a block requires the signing wallet to
  actually own the block's `.bitmap` inscription on-chain; otherwise the server
  returns `403`.

MIT licensed.
