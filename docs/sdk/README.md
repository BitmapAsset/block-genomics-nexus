# Block Genomics SDK

The SDK documentation is for builders creating clients, games, simulations, tools, or agent runtimes on top of verified Bitmap blocks.

The current SDK surface is REST-first and intentionally small:

1. Resolve a Bitcoin block height to Bitmap ownership state.
2. Ask the owner wallet to sign a specific action message.
3. Submit the signed action to a world mutation endpoint.
4. Read renderer-neutral terrain and object records.
5. Render or simulate those records in your own client.

## Start Here

- [Quickstart](quickstart.md) - build and mutate a first verified block world.
- [Verified Blocks](verified-blocks.md) - ownership, signatures, and Bitmap authority.
- [World State](world-state.md) - terrain, objects, transforms, locking, and visibility.
- [API Reference](api-reference.md) - endpoint contracts and example payloads.
- [Security Notes](security.md) - signature handling, trust boundaries, and safe integration.
- [Examples](examples/README.md) - TypeScript starter files for external builders.

## Sovereign Stack Model

Block Genomics is not a closed metaverse. It is a verification and state layer for sovereign block owners:

- Bitcoin provides the proof-of-work history.
- Bitmap defines the block ownership primitive.
- Wallet signatures authorize owner intent.
- Block Genomics verifies the owner and stores world state.
- External clients render, simulate, and extend worlds.
- Owners can change clients without changing the underlying authority model.

## Current Surfaces

- REST APIs under /api/v1.
- Embeddable badge assets in sdk/.
- TypeScript examples in docs/sdk/examples/.
- Protocol documentation in docs/, auth/, engine/, and claims/.

Future packaged SDKs should wrap these APIs with typed clients, wallet adapters, payload validation, nonce helpers, and renderer-neutral world-state utilities.
