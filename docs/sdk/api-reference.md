# SDK API Reference

Base URL:

- Local: `http://localhost:3000`
- Production: `https://blockgenomics.io`

## Verify Ownership

```http
GET /api/v1/ownership/verify?blockHeight=720143
```

Checks the current on-chain owner for a Bitmap block and compares it with local ownership state.

## Read World

```http
GET /api/v1/world?blockHeight=720143
```

Returns visible objects and terrain for a block world.

## Create Object

```http
POST /api/v1/world
```

Required fields:

- `blockHeight`
- `ownerAddress`
- `objectType`
- `message`
- `signature`

Optional object fields are listed in [World State](world-state.md).

## Update Object

```http
PATCH /api/v1/world/{objectId}
```

Required fields:

- `ownerAddress`
- `message`
- `signature`

Only allowlisted object fields are accepted.

## Delete Object

```http
DELETE /api/v1/world/{objectId}
```

Required fields:

- `ownerAddress`
- `message`
- `signature`

Locked objects cannot be deleted through this endpoint.

## Read Terrain

```http
GET /api/v1/world/terrain?blockHeight=720143
```

Returns terrain settings for a block.

## Update Terrain

```http
POST /api/v1/world/terrain
```

Required fields:

- `blockHeight`
- `ownerAddress`
- `message`
- `signature`

Accepted terrain fields are listed in [World State](world-state.md).

## Error Shape

Most endpoints return JSON with an `error` field on failure:

```json
{ "error": "Not the block owner" }
```

Clients should branch on HTTP status first, then parse the error string for display or telemetry.
