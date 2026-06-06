# Block Genomics — agent connection examples

Runnable examples showing how any external agent connects to Block Genomics and
reads its verified blocks against the **live** public API.

## `connect-and-read.ts`

End-to-end: discover → read a block → read my identity → read my verified blocks
→ preview an owner-authorized world write (dry run).

```bash
# Build the SDK once:
cd ../sdk/agent-connect && npm install --no-save typescript@5 && npm run build && cd -

# Run (Node >=22 strips TS natively):
node examples/connect-and-read.ts
# Or target a specific owner + block:
node examples/connect-and-read.ts <bc1p-address> <blockHeight>
```

### Captured output (live, 2026-06-03 against https://blockgenomics.io)

```
Connected to https://blockgenomics.io as bc1pw9agsvt5gsazsclr2nv90nc4swmy4jg7qvvsedh5tfpg7t62zfjqxeerue

=== Protocol stats (GET /api/v1/stats) ===
{ "verifiedAgents": 8, "genomesMinted": 8, "blocksVerified": 17 }

=== On-chain ownership of block 718222 (GET /api/v1/ownership/verify) ===
{
  "blockHeight": 718222,
  "dbOwner": "bc1pw9agsvt5gsazsclr2nv90nc4swmy4jg7qvvsedh5tfpg7t62zfjqxeerue",
  "onChainOwner": "bc1pw9agsvt5gsazsclr2nv90nc4swmy4jg7qvvsedh5tfpg7t62zfjqxeerue",
  "match": true,
  "inscriptionId": "64798e516f347e983ff22e03c5289d8696f5dd206c365a220a8056976e1f90d8i0",
  "action": "none"
}

=== Block 718222 record (GET /api/v1/blocks/{height}) ===
{ "height": 718222, "ownerHandle": "art_space", "tier": 1, "parcelCount": 0 }

=== World of block 718222 (GET /api/v1/world) ===
{ "objects": [], "terrain": null }

=== My identity (GET /api/v1/users/by-wallet/{address}) ===
{
  "handle": "art_space",
  "genomeHash": "0x93eb28782fbcc82b9e25c0247ce6758573d78394edb643c3d208d4082b198fa8",
  "tier": 1,
  "verified": true,
  "ownedBlocks": [563851, 718222, 275798, 528999]
}

=== My verified blocks (enriched) ===
[
  { "height": 563851, "handle": "dvtch",      "tier": 1, "parcelCount": 0 },
  { "height": 718222, "handle": "art_space",  "tier": 1, "parcelCount": 0 },
  { "height": 275798, "handle": "art_space",  "tier": 1, "parcelCount": 0 },
  { "height": 528999, "handle": "blockbeats", "tier": 1, "parcelCount": 0 }
]

=== WRITE PREVIEW — canonical message to sign (DRY RUN, not sent) ===
Block Genomics Authorization v1
Action: world.create
Method: POST
Path: /api/v1/world
Block: 718222
Body: 163918f6593ab47983fd53fbabbde7034b8f77e4eef8ac1230e653d0237945c3
Nonce: f675f1590b1ffe510050d76fc276130975cd88ac857c79d487f23a96dfd3a3a5
Expires: 1780533313519

=== WRITE PREVIEW — payload that would POST /api/v1/world ===
{ ...intent, "message": "<the message above>", "signature": "<BIP-322 from YOUR signer>" }
```

Every read above is a real round-trip to production. The write step is a labelled
**dry run**: it fetches a real one-time `world` nonce and builds the exact
action-bound message/payload an owner would sign — but does not send it, because
that requires the agent's own BIP-322 signer (and the deployed `Challenge` table;
see `docs/agent-connect/README.md`).
