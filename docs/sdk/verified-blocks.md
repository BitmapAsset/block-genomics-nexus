# Verified Bitmap Blocks

Verified blocks are the authority layer for Block Genomics world building.

## Authority Chain

1. Bitcoin block exists.
2. Bitmap inscription or ownership record maps the block to a wallet.
3. The wallet signs an action message.
4. Block Genomics verifies the signature.
5. The API checks that the signer owns or controls the block.
6. The world mutation is accepted or rejected.

## Ownership Endpoint

```http
GET /api/v1/ownership/verify?blockHeight=720143
```

Response fields:

- `blockHeight` - requested Bitcoin block height.
- `dbOwner` - owner currently recorded by Block Genomics.
- `onChainOwner` - owner resolved from the on-chain source.
- `match` - whether local and on-chain ownership agree.
- `inscriptionId` - Bitmap inscription identifier when available.
- `action` - recommended sync or resolution action.
- `lastChecked` - timestamp of the verification response.

## Signature Requirements

Mutation endpoints require:

- `ownerAddress`
- `message`
- `signature`

The signature must be produced by the same wallet address that owns the target block. Clients should include action, block height, nonce, and timestamp in the signed message to prevent replay.

## Tier Model

- Tier 1: direct block owner.
- Tier 2: parcel or transaction-level authority.
- Tier 3: delegated authority.

The world write APIs currently enforce direct owner checks for block-level world state. Delegation should be exposed only when the delegation protocol is explicitly wired into the write path.
