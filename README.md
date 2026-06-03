# Block Genomics Nexus

[![License: BUSL-1.1](https://img.shields.io/badge/license-BUSL--1.1-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](app/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](app/package.json)
[![Bitcoin](https://img.shields.io/badge/Bitcoin-Bitmap-f7931a.svg)](docs/VERIFICATION-PROTOCOL.md)

Block Genomics Nexus is a Bitcoin-native world stack for verified Bitmap block owners. It turns block ownership into programmable land, identity, agent reputation, and renderer-neutral world state that can be inspected, extended, and verified from public Bitcoin data.

The product thesis is simple: if a wallet can prove ownership of a Bitmap block, it can author a sovereign world on that block.

## What This Repo Contains

- app/ - production Next.js application, API routes, Prisma schema, ownership verification, block profiles, Nexus world views, and Guardian interfaces.
- docs/ - protocol, product, wallet, security, white paper, and SDK documentation.
- docs/sdk/ - developer guide for building external clients on verified Bitmap blocks.
- engine/ - block genome and Bitmap resolution primitives.
- auth/ - wallet challenge, BIP-322, and token protocol notes.
- claims/ - identity claim verification helpers.
- sdk/ - embeddable badge and client-side integration assets.

## Product Surface

- Verify Bitmap block ownership using Bitcoin wallet signatures.
- Resolve block provenance into genome fingerprints and trust state.
- Render block, owner, agent, and world profiles from verified data.
- Read and mutate block-level terrain and object state through /api/v1/world.
- Build external worlds using signed owner actions and renderer-neutral scene records.

## Quick Start

    git clone https://github.com/BitmapAsset/block-genomics-nexus.git
    cd block-genomics-nexus/app
    npm ci
    npm run build
    npm run dev

Open http://localhost:3000.

Production deployments require database, wallet/provider, and operational environment variables. Do not commit local .env files.

## Build On Verified Blocks

External clients can treat Block Genomics as a verified ownership and world-state layer:

    GET    /api/v1/ownership/verify?blockHeight=720143
    GET    /api/v1/world?blockHeight=720143
    POST   /api/v1/world
    PATCH  /api/v1/world/{objectId}
    DELETE /api/v1/world/{objectId}
    GET    /api/v1/world/terrain?blockHeight=720143
    POST   /api/v1/world/terrain

Start with the [SDK docs](docs/sdk/README.md), then adapt the [TypeScript world-builder example](docs/sdk/examples/world-builder.ts).

## Architecture Overview

    Bitcoin + Bitmap ownership
            |
            v
    BIP-322 wallet signature
            |
            v
    Block Genomics verification API
            |
            v
    Prisma world-state records
            |
            v
    Next.js app, SDK clients, game engines, agents, renderers

Bitcoin remains the source of truth for block provenance. Wallet signatures authorize owner intent. Block Genomics stores renderer-neutral world state so owners can build in web, game, agent, and simulation clients without surrendering block authority.

## Documentation

- [SDK Overview](docs/sdk/README.md)
- [World Builder Quickstart](docs/sdk/quickstart.md)
- [Verified Block Ownership](docs/sdk/verified-blocks.md)
- [World State Model](docs/sdk/world-state.md)
- [API Reference](docs/sdk/api-reference.md)
- [SDK Security Notes](docs/sdk/security.md)
- [Verification Protocol](docs/VERIFICATION-PROTOCOL.md)
- [Threat Model](docs/THREAT-MODEL.md)
- [White Paper](docs/WHITE-PAPER.md)

## Development

    cd app
    npm ci
    npm run build

Useful app scripts:

- npm run dev - run the Next.js development server.
- npm run build - generate Prisma client and build the production app.
- npm run start - run the built app.
- npm run test - run Jest tests.
- npm run db:generate - regenerate Prisma client.

## Security

World mutation endpoints require ownerAddress, message, and signature. The API verifies the wallet signature and checks that the signer owns the target block before accepting object or terrain changes.

Report vulnerabilities through the process in [SECURITY.md](SECURITY.md). Never open a public issue for an active vulnerability.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Contributions are licensed under the same terms as the repository.

## License

Block Genomics Nexus is licensed under the Business Source License 1.1. See [LICENSE](LICENSE).
