# Block Genomics Nexus

Block Genomics Nexus is a Bitcoin-native world stack for verified Bitmap block owners. It turns block ownership into programmable land, identity, agent reputation, and 3D world state that can be inspected, extended, and verified from public Bitcoin data.

The core promise is simple: if you can prove ownership of a Bitmap block, you can build a sovereign world on that block.

## What This Repo Contains

- `app/` - the production Next.js application for block profiles, verification, Nexus world views, Guardian agents, and API routes.
- `engine/` - genome and Bitmap resolution primitives.
- `auth/` - wallet challenge, BIP-322, and token protocol notes.
- `claims/` - identity claim verification helpers.
- `sdk/` - embeddable badge and API client assets.
- `docs/` - protocol, product, wallet, security, and SDK documentation.

## Product Surface

- Verified Bitmap ownership for Bitcoin block holders.
- Genome fingerprints generated from block and wallet provenance.
- Block and agent profiles with badges, trust state, and history.
- Nexus world APIs for block terrain, objects, and programmable scenes.
- Guardian agents and Monitor APIs for owner-controlled block intelligence.
- Developer-facing SDK docs for building worlds on top of verified blocks.

## Quick Start

```bash
git clone https://github.com/BitmapAsset/block-genomics-nexus.git
cd block-genomics-nexus/app
npm ci
npm run build
npm run dev
```

Open `http://localhost:3000`.

The production app expects database and provider environment variables at deploy time. Do not commit local environment files.

## Build Worlds On Verified Blocks

Developers can use the Nexus world APIs to read and write block-level scene state after ownership verification:

- Read world state for a block: `GET /api/v1/world?blockHeight=720143`
- Create a world object: `POST /api/v1/world`
- Update or delete an object: `PATCH|DELETE /api/v1/world/{objectId}`
- Read terrain: `GET /api/v1/world/terrain?blockHeight=720143`
- Update terrain: `POST /api/v1/world/terrain`
- Verify on-chain ownership: `GET /api/v1/ownership/verify?blockHeight=720143`

Start with [docs/sdk/README.md](docs/sdk/README.md).

## Documentation

- [SDK Overview](docs/sdk/README.md)
- [World Builder Quickstart](docs/sdk/quickstart.md)
- [Verified Block Ownership](docs/sdk/verified-blocks.md)
- [World State Model](docs/sdk/world-state.md)
- [API Reference](docs/sdk/api-reference.md)
- [Security Model](docs/sdk/security.md)
- [Protocol Documentation](docs/VERIFICATION-PROTOCOL.md)
- [White Paper](docs/WHITE-PAPER.md)

## Development

```bash
cd app
npm ci
npm run build
```

Useful app scripts:

- `npm run dev` - run the Next.js development server.
- `npm run build` - generate Prisma client and build the production app.
- `npm run start` - run the built app.
- `npm run test` - run Jest tests.

## Security

Block Genomics treats Bitcoin as the source of truth and local wallet signatures as authority for write actions. World mutation endpoints require an owner address, signed message, and signature; the API verifies the signature and checks the block owner before accepting changes.

Never commit secrets, local database files, generated build output, dependency directories, or private agent/memory files.

## License

The app currently carries the Business Source License 1.1 in `app/LICENSE`.

## Status

Active product build. Current app version: `21.0.0`, a tribute to Bitcoin's 21 million supply cap.
