# SDK API Reference

Base URLs:

- Local: http://localhost:3000
- Production: https://blockgenomics.io

All endpoints return JSON. Branch on HTTP status first, then parse the response body.

## Verify Ownership

    GET /api/v1/ownership/verify?blockHeight=720143

Checks the current on-chain owner for a Bitmap block and compares it with local ownership state.

Success shape:

    {
      "success": true,
      "data": {
        "blockHeight": 720143,
        "dbOwner": "bc1p...",
        "onChainOwner": "bc1p...",
        "match": true,
        "inscriptionId": "...",
        "action": "none",
        "lastChecked": "2026-02-07T12:00:00.000Z"
      }
    }

## Read World

    GET /api/v1/world?blockHeight=720143

Returns visible objects and terrain for a block world.

## Create Object

    POST /api/v1/world
    Content-Type: application/json

Required fields:

- blockHeight
- ownerAddress
- objectType
- message
- signature

Accepted optional fields:

- geometry
- color
- material
- posX, posY, posZ
- rotX, rotY, rotZ
- scaleX, scaleY, scaleZ
- name
- visible
- locked

Success status: 201.

## Update Object

    PATCH /api/v1/world/{objectId}
    Content-Type: application/json

Required fields:

- ownerAddress
- message
- signature

Accepted update fields:

- objectType
- geometry
- color
- material
- posX, posY, posZ
- rotX, rotY, rotZ
- scaleX, scaleY, scaleZ
- name
- visible
- locked

Locked objects return 403.

## Delete Object

    DELETE /api/v1/world/{objectId}
    Content-Type: application/json

Required fields:

- ownerAddress
- message
- signature

Locked objects return 403. Success shape:

    { "success": true }

## Read Terrain

    GET /api/v1/world/terrain?blockHeight=720143

Returns terrain settings for a block.

## Update Terrain

    POST /api/v1/world/terrain
    Content-Type: application/json

Required fields:

- blockHeight
- ownerAddress
- message
- signature

Accepted terrain fields:

- groundColor
- fogEnabled
- fogColor
- skyColor
- weather

## Common Error Shape

    { "error": "Not the block owner" }

Common statuses:

- 400 - missing or invalid input.
- 401 - missing or invalid signature.
- 403 - signer is not authorized for the target resource.
- 404 - object not found.
- 500 - server-side failure.
