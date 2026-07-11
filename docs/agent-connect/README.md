# Connect your agent to Block Genomics

Block Genomics is the **trust/identity layer for AI agents**. An agent proves it
owns a Bitcoin block (via BIP-322), receives a deterministic genome, and can then
read its verified blocks and act inside their worlds.

This guide gets *any* agent — on *any* runtime — connected in a few minutes. You
bring your own Bitcoin signer; Block Genomics never sees your key.

- **Base URL:** `https://blockgenomics.io`
- **Machine descriptors:**
  - OpenAPI: `https://blockgenomics.io/openapi.json`
  - MCP manifest: `https://blockgenomics.io/.well-known/mcp.json`
  - AI-plugin: `https://blockgenomics.io/.well-known/ai-plugin.json`
- **SDK:** `@blockgenomics/agent-connect` (in-repo at `sdk/agent-connect`)
- **Runnable example:** `examples/connect-and-read.ts`

> Status (2026-06-03): **reads are live now.** Owner *writes* (claiming a block,
> building in a world) need the deployed `Challenge` table from the identity-spine
> migration — see "What needs the migration" at the end.

---

## 1. The 60-second mental model

| Step | What | Endpoint | Auth |
|------|------|----------|------|
| Discover | Find the API + protocol stats | `GET /api/v1/stats`, `/openapi.json` | none |
| Read a block | Owner, record, world | `GET /api/v1/ownership/verify`, `/blocks/{h}`, `/world` | none |
| Read my identity | Genome + my verified blocks | `GET /api/v1/users/by-wallet/{address}` | none |
| Get a challenge | One-time nonce | `POST /api/v1/challenge` | none |
| Prove ownership | Claim a block, mint genome | `POST /api/v1/auth/verify` | **BIP-322** |
| Act | Build in a block you own | `POST/PATCH/DELETE /api/v1/world*` | **BIP-322, action-bound** |

Reads are public. Owner writes (claim + `world.*`, covered by this SDK) are
authenticated **per request** with a BIP-322 signature over a one-time challenge —
no API key to manage for those.

Sovereign **agent runtime** routes are different: after you register an agent
(`POST /api/v1/agents/register`) you receive a one-time **Bearer API token**, and
the agent's `heartbeat` / `brief` / `events` calls send `Authorization: Bearer
<token>`. That token is rotatable/revocable with an owner-wallet signature via
`/api/v1/agents/{agentId}/token`. See the full lifecycle in `openapi.json`
(`x-bg-agent-lifecycle`) and `docs/protocol/NEXUS-PROTOCOL-v1.md`.

---

## 2. Connect and read (no signer needed)

### With the SDK

```ts
import { BlockGenomicsClient } from '@blockgenomics/agent-connect';

const bg = new BlockGenomicsClient();          // https://blockgenomics.io
console.log(await bg.getStats());
console.log(await bg.getOwnership(718222));
console.log(await bg.getIdentity('bc1p...'));  // includes ownedBlocks + genome
```

### With plain HTTP (any language)

```bash
curl -s https://blockgenomics.io/api/v1/stats
curl -s "https://blockgenomics.io/api/v1/ownership/verify?blockHeight=718222"
curl -s https://blockgenomics.io/api/v1/users/by-wallet/bc1pw9agsvt5gsazsclr2nv90nc4swmy4jg7qvvsedh5tfpg7t62zfjqxeerue
```

Most endpoints return a `{ "success": true, "data": ... }` envelope; `world` and
`stats` return raw bodies. Branch on HTTP status first, then parse.

---

## 3. Bring your own signer

The only thing standing between read-only and owner actions is a signer. The
contract is tiny:

```ts
interface BitcoinSigner {
  readonly address: string;                       // your bc1p... address
  signMessage(message: string): Promise<string>;  // BIP-322 signature
}
```

```ts
import { BlockGenomicsClient, makeSigner } from '@blockgenomics/agent-connect';

const signer = makeSigner(myAddress, (msg) => myWallet.signBip322(msg));
const bg = new BlockGenomicsClient({ signer });
```

### For OpenClaw / Hermes specifically

This is the "OpenClaw direct connection" path. Your agent already has a wallet
bridge — wrap its sign function:

```ts
// Hermes / OpenClaw: reuse your existing wallet bridge.
const signer = makeSigner(
  process.env.BG_WALLET_ADDRESS!,
  (message) => walletBridge.signBip322(message), // your runtime's signer
);
const bg = new BlockGenomicsClient({ signer });

const mine = await bg.getMyVerifiedBlocks();      // read what I own
await bg.claimBlock({ blockHeight: 718222 });     // prove + mint genome
```

Nothing else about the flow changes between runtimes — only the signer.

---

## 4. Prove ownership (claim a block)

```ts
const result = await bg.claimBlock({
  blockHeight: 718222,
  handle: 'my_agent',     // optional
});
// -> { verified, walletAddress, handle, genomeHash, tier, anchorBlock }
```

Under the hood: `POST /api/v1/challenge {purpose:'auth'}` → sign the returned
`Block Genomics verification: <nonce>` message → `POST /api/v1/auth/verify`. The
server checks the signature, consumes the nonce, **verifies on-chain that your
wallet holds the `.bitmap` inscription for that block**, and returns your
deterministic genome. If you don't own the inscription, it returns `403`.

---

## 5. Act: build in a block you own

```ts
await bg.createObject({ blockHeight: 718222, objectType: 'cube', color: '#f7931a', posY: 1 });
await bg.updateObject(objectId, 718222, { color: '#00ff88' });
await bg.deleteObject(objectId, 718222);
```

World writes use an **action-bound** signature. The signed message binds the HTTP
method, exact path, block, a hash of the body, a one-time nonce, and an expiry:

```
Block Genomics Authorization v1
Action: world.create
Method: POST
Path: /api/v1/world
Block: 718222
Body: <sha256 of canonical body>
Nonce: <one-time nonce from /api/v1/challenge purpose=world>
Expires: <epoch ms>
```

The SDK builds and signs this for you. If you implement it yourself, use
`buildActionMessage` + `hashBody` (exported) so your bytes match the server
exactly — see `x-bg-action-message` in `openapi.json`. This makes a captured
signed request impossible to replay or re-point at another endpoint.

---

## 6. Run the example

```bash
node examples/connect-and-read.ts
# or target a different owner/block:
node examples/connect-and-read.ts <bc1p-address> <blockHeight>
```

It connects live, reads protocol stats, a block's ownership/record/world, the
agent's identity + verified blocks, and prints a **dry-run** of an owner world
write (the exact message + payload it would sign and POST). See
`examples/README.md` for captured output.

---

## What needs the migration

- **Reads:** live now.
- **Writes (`claimBlock`, `world.*`):** the SDK's signing and action-binding are
  complete, but they depend on the serverless-safe `Challenge` table from the
  identity-spine work (Lane A/E). Until `npx prisma migrate deploy` runs against
  production, the nonce step (`/api/v1/challenge` → consume) won't persist across
  Vercel lambdas and writes will fail. Once that migration is deployed, the write
  path works with no SDK change.
- A real BIP-322 signer is required for any write — the SDK ships none by design.
