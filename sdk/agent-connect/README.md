# @blockgenomics/agent-connect

The open agent-connection client for **Block Genomics** — the trust/identity
layer for AI agents, anchored to Bitcoin blocks.

Any agent, on any runtime (Hermes, an OpenClaw agent, a LangChain tool, a random
script), can use this to:

1. **Discover** the protocol and read public data.
2. **Prove ownership** of a Bitcoin block via BIP-322 — *you bring your own
   signer; we never see your key.*
3. **Read its verified blocks / parcels / genome.**
4. **Take owner-authorized actions** (build in the block's world).

Zero runtime dependencies. Uses the global `fetch` and Web Crypto, so it runs on
Node ≥18, Deno, Bun, Cloudflare Workers, and the browser.

## Install / build

This package lives in-repo at `sdk/agent-connect`. To build it:

```bash
cd sdk/agent-connect
npm install --no-save typescript@5
npm run build      # emits dist/
```

## Quick start (reads — no signer)

```ts
import { BlockGenomicsClient } from '@blockgenomics/agent-connect';

const bg = new BlockGenomicsClient(); // defaults to https://blockgenomics.io

await bg.getStats();               // { verifiedAgents, genomesMinted, blocksVerified }
await bg.getOwnership(718222);     // authoritative on-chain owner
await bg.getBlock(718222);         // registered record: handle, tier, inscription
await bg.getWorld(718222);         // world objects + terrain
await bg.getIdentity('bc1p...');   // identity record incl. ownedBlocks + genome
```

## Connecting as an owner (your pluggable signer)

Block Genomics never holds private keys. Implement `BitcoinSigner` over whatever
your runtime already has — a wallet bridge, a KMS, a hardware signer:

```ts
import { BlockGenomicsClient, makeSigner } from '@blockgenomics/agent-connect';

const signer = makeSigner(myAddress, (message) => myWallet.signBip322(message));
const bg = new BlockGenomicsClient({ signer });

// Read MY verified blocks (uses signer.address)
const myBlocks = await bg.getMyVerifiedBlocks();

// Claim a block as MY identity (signs an 'auth' challenge, posts to /auth/verify)
const result = await bg.claimBlock({ blockHeight: 718222, handle: 'my_agent' });

// Build in a block I own (action-bound, replay-safe signature)
await bg.createObject({ blockHeight: 718222, objectType: 'cube', color: '#f7931a' });
```

The signer contract is intentionally tiny:

```ts
interface BitcoinSigner {
  readonly address: string;
  signMessage(message: string): Promise<string>; // BIP-322
}
```

## How write auth works (so you can implement a signer correctly)

- **Claim a block** (`/api/v1/auth/verify`): sign the exact `message` returned by
  `POST /api/v1/challenge` with `purpose: 'auth'` — i.e.
  `Block Genomics verification: <nonce>`.
- **World mutation** (`/api/v1/world*`): sign a canonical, action-bound message
  that binds method + exact path + block + body hash + one-time nonce + expiry.
  The SDK builds this for you via `buildActionMessage` / `hashBody`. The server
  reconstructs the same binding and atomically consumes the nonce, so a captured
  signed request can be neither replayed nor re-pointed at another endpoint.

This format must match the server byte-for-byte; `src/action-message.ts` is a
verbatim port of the server's module. See `x-bg-action-message` in
[`openapi.json`](./openapi.json).

## Machine discovery

- OpenAPI 3.1 descriptor: [`openapi.json`](./openapi.json) (served live at
  `https://blockgenomics.io/openapi.json` after deploy).
- MCP server manifest: [`mcp.json`](./mcp.json) (served at
  `https://blockgenomics.io/.well-known/mcp.json`).
- AI-plugin manifest: `https://blockgenomics.io/.well-known/ai-plugin.json`.

## Honesty / current limits

- **Reads are live today.** Every read method hits the production API now.
- **Writes depend on the deployed `Challenge` table** (the Lane A/E identity-spine
  migration). Until `prisma migrate deploy` runs in prod, `claimBlock` and the
  `world.*` methods will fail at the nonce step. The signing/binding code is
  correct and ready.
- Claiming a block requires the signing wallet to actually own the `.bitmap`
  inscription for that block; otherwise the server returns 403.

MIT licensed.
