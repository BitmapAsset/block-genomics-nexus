# World Builder Quickstart

This guide shows the minimum flow for reading and writing a world on a verified Bitmap block.

## 1. Run The App Locally

    git clone https://github.com/BitmapAsset/block-genomics-nexus.git
    cd block-genomics-nexus/app
    npm ci
    npm run dev

Use http://localhost:3000 as the API origin while developing.

## 2. Verify Block Ownership

    curl "http://localhost:3000/api/v1/ownership/verify?blockHeight=720143"

The response includes local owner state, on-chain owner state, match status, inscription id, and recommended sync action.

## 3. Read World State

    curl "http://localhost:3000/api/v1/world?blockHeight=720143"

The response returns:

- objects - visible world objects ordered by creation time.
- terrain - block terrain settings, or null when unset.

## 4. Build A Signed Action Message

Every mutation should ask the wallet to sign a human-readable message. Include enough detail that the owner can understand the action:

    Block Genomics world update
    blockHeight: 720143
    action: create-object
    objectId: optional-object-id
    nonce: client-generated-random-value
    timestamp: 2026-02-07T12:00:00.000Z

Keep the exact message string until the API request is submitted. The server verifies the supplied signature against ownerAddress.

## 5. Create A World Object

    curl -X POST "http://localhost:3000/api/v1/world" \
      -H "Content-Type: application/json" \
      -d '{
        "blockHeight": 720143,
        "ownerAddress": "bc1p...",
        "message": "Block Genomics world update\nblockHeight: 720143\naction: create-object\nnonce: 2ab8f...\ntimestamp: 2026-02-07T12:00:00.000Z",
        "signature": "<wallet-signature>",
        "objectType": "monolith",
        "name": "Genesis Monolith",
        "geometry": "box",
        "color": "#f7931a",
        "material": "emissive-stone",
        "posX": 0,
        "posY": 0,
        "posZ": 0,
        "scaleX": 1,
        "scaleY": 4,
        "scaleZ": 1
      }'

## 6. Update Terrain

    curl -X POST "http://localhost:3000/api/v1/world/terrain" \
      -H "Content-Type: application/json" \
      -d '{
        "blockHeight": 720143,
        "ownerAddress": "bc1p...",
        "message": "Block Genomics world update\nblockHeight: 720143\naction: update-terrain\nnonce: 91ce7...\ntimestamp: 2026-02-07T12:02:00.000Z",
        "signature": "<wallet-signature>",
        "groundColor": "#101018",
        "skyColor": "#05070c",
        "fogEnabled": true,
        "fogColor": "#1d2a3a",
        "weather": "clear"
      }'

## 7. Render In Your Client

Map the world response into your renderer of choice:

- Three.js or React Three Fiber: objects become meshes, terrain becomes scene environment.
- Unity, Unreal, or Godot: objects become prefabs or actors.
- Voxel clients: objects become block markers and terrain becomes biome settings.
- Agent runtimes: objects become semantic landmarks.

See [examples/world-builder.ts](examples/world-builder.ts) for a working TypeScript client shape.
