# Verified Bitmap Blocks

Verified blocks are the authority layer for Block Genomics world building.

## Authority Chain

1. A Bitcoin block exists.
2. Bitmap ownership maps that block to a wallet address.
3. The wallet signs a specific action message.
4. Block Genomics verifies the signature.
5. The API checks that the signer owns the target block.
6. The world mutation is accepted or rejected.

## Ownership Endpoint

    GET /api/v1/ownership/verify?blockHeight=720143

Response fields:

- blockHeight - requested Bitcoin block height.
- dbOwner - owner currently recorded by Block Genomics.
- onChainOwner - owner resolved from the on-chain source.
- match - whether local and on-chain ownership agree.
- inscriptionId - Bitmap inscription identifier when available.
- action - recommended sync or resolution action.
- lastChecked - response timestamp.

## Signature Requirements

Mutation endpoints require:

- ownerAddress
- message
- signature

The signature must be produced by the wallet address that owns the target block. Clients should include action, block height, nonce, timestamp, and object id when relevant.

## Ownership Model

Block-level world writes currently enforce direct ownership against the stored block owner. Delegated or parcel-level authority should be treated as a future extension unless the target endpoint explicitly documents support for it.

Recommended client behavior:

- Verify ownership before presenting world-edit controls.
- Re-check ownership when a write fails with 403.
- Ask for a fresh signature per mutation.
- Never reuse signatures across actions or block heights.
