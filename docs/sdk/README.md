# Block Genomics SDK

The Block Genomics SDK documentation is for builders who want to create sovereign worlds on top of verified Bitmap blocks.

The API model is intentionally small:

1. Prove control of a wallet.
2. Verify that wallet owns or controls a Bitmap block.
3. Read the block's world state.
4. Write terrain and object state with a signed owner message.
5. Render the result in your own engine, app, game, or agent runtime.

## Start Here

- [Quickstart](quickstart.md) - build and mutate a first verified block world.
- [Verified Blocks](verified-blocks.md) - ownership, signatures, and Bitmap authority.
- [World State](world-state.md) - terrain, objects, transforms, locking, and visibility.
- [API Reference](api-reference.md) - endpoint contracts and example payloads.
- [Security](security.md) - signature handling, trust boundaries, and safe integration.
- [Examples](examples/README.md) - TypeScript starter files for external builders.

## Sovereign Stack Vision

Block Genomics should not become a closed metaverse silo. The durable shape is a sovereign stack:

- Bitcoin is the source of truth for block provenance.
- Bitmap defines the land primitive.
- Wallet signatures authorize owner intent.
- Block Genomics exposes verified world state.
- Builders render and extend worlds in any compatible client.
- Owners can move between clients without surrendering block authority.

The SDK should make external world builders powerful without making Block Genomics the owner of their worlds.

## Current SDK Surfaces

- REST APIs under `/api/v1`.
- Embeddable badge assets in `sdk/`.
- TypeScript examples in `docs/sdk/examples/`.
- Protocol documentation in `docs/`, `auth/`, `engine/`, and `claims/`.

The next production SDK package should wrap these APIs with typed clients, wallet adapters, and renderer-neutral world-state helpers.
