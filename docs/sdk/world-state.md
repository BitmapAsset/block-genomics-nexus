# World State Model

Block Genomics world state is renderer-neutral. The API stores semantic scene data; clients decide how to render it.

## Terrain

Terrain belongs to one block height.

Fields currently accepted by `POST /api/v1/world/terrain`:

- `groundColor`
- `fogEnabled`
- `fogColor`
- `skyColor`
- `weather`
- `surfaceType`

Clients may map these values to WebGL, Three.js, Unity, Unreal, voxel, 2D map, or agent simulation environments.

## Objects

Objects represent owner-created entities inside a block world.

Fields currently accepted by `POST /api/v1/world` and `PATCH /api/v1/world/{id}`:

- `objectType`
- `geometry`
- `color`
- `material`
- `posX`, `posY`, `posZ`
- `rotX`, `rotY`, `rotZ`
- `scaleX`, `scaleY`, `scaleZ`
- `name`
- `visible`
- `locked`

## Locking

Locked objects cannot be updated or deleted through the standard mutation endpoints. Use locking for canonical landmarks, protocol-owned markers, or owner-approved world anchors.

## Coordinate System

The current API stores numeric transform fields without forcing a renderer-specific coordinate convention. Recommended default:

- `posX` - east/west.
- `posY` - vertical height.
- `posZ` - north/south.
- rotations in radians.
- scale values as unit multipliers.

## Client Rule

Treat unknown fields as future protocol extensions. Do not assume every object can be rendered by every client. A robust client should ignore unsupported object types and preserve raw records for round-trip compatibility.
