# World Builder Quickstart

This guide shows the minimum flow for reading and writing a world on a verified Bitmap block.

## 1. Install The App Locally

```bash
git clone https://github.com/BitmapAsset/block-genomics-nexus.git
cd block-genomics-nexus/app
npm ci
npm run dev
```

Use `http://localhost:3000` as the API origin while developing.

## 2. Verify Block Ownership

```bash
curl "http://localhost:3000/api/v1/ownership/verify?blockHeight=720143"
```

The response includes the database owner, on-chain owner, match status, inscription id, and recommended action.

## 3. Read World State

```bash
curl "http://localhost:3000/api/v1/world?blockHeight=720143"
```

The response returns:

- `objects` - visible world objects ordered by creation time.
- `terrain` - the block terrain settings, if configured.

## 4. Sign An Owner Message

World mutations require wallet authorization. The app expects:

- `ownerAddress` - the Bitcoin wallet address.
- `message` - the exact signed message.
- `signature` - wallet signature over the message.

Recommended message format:

```text
Block Genomics world update
blockHeight: 720143
action: create-object
nonce: <client-generated nonce>
timestamp: <ISO timestamp>
```

The exact message must be stored client-side until the API request is sent.

## 5. Create A World Object

```bash
curl -X POST "http://localhost:3000/api/v1/world" \
  -H "Content-Type: application/json" \
  -d '{
    "blockHeight": 720143,
    "ownerAddress": "bc1p...",
    "message": "Block Genomics world update...",
    "signature": "<wallet-signature>",
    "objectType": "monolith",
    "name": "Genesis Monolith",
    "geometry": "box",
    "color": "#f7931a",
    "posX": 0,
    "posY": 0,
    "posZ": 0,
    "scaleX": 1,
    "scaleY": 4,
    "scaleZ": 1
  }'
```

## 6. Update Terrain

```bash
curl -X POST "http://localhost:3000/api/v1/world/terrain" \
  -H "Content-Type: application/json" \
  -d '{
    "blockHeight": 720143,
    "ownerAddress": "bc1p...",
    "message": "Block Genomics terrain update...",
    "signature": "<wallet-signature>",
    "groundColor": "#101018",
    "skyColor": "#05070c",
    "fogEnabled": true,
    "fogColor": "#1d2a3a",
    "weather": "clear",
    "surfaceType": "basalt"
  }'
```

## 7. Render In Your Client

Use the world response as renderer-neutral scene data. A game engine, web client, or agent interface can map object records into meshes, prefabs, voxels, tiles, or semantic landmarks.

See [examples/world-builder.ts](examples/world-builder.ts).
