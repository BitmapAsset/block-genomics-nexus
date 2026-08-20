# World State Model

Block Genomics stores world state as renderer-neutral records. The API describes what exists in a block world; clients decide how to render it.

## World Response

    {
      "objects": [],
      "terrain": null
    }

- objects contains visible block objects ordered by creation time.
- terrain contains the block terrain record, or null when unset.

## Terrain

Terrain belongs to one block height.

Accepted terrain fields:

- groundColor
- fogEnabled
- fogColor
- skyColor
- weather

Clients may map these values to WebGL, Three.js, Unity, Unreal, voxel, 2D map, or agent simulation environments.

## Objects

Objects represent owner-created entities inside a block world.

Accepted object fields:

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

Mutation endpoints allowlist fields before writing to the database. Unknown fields should be ignored by clients and should not be relied on for persistence.

## Coordinate System

The API stores numeric transforms without forcing a renderer-specific convention. Recommended default:

- posX - east/west.
- posY - vertical height.
- posZ - north/south.
- rotations in radians.
- scale values as unit multipliers.

## Locking

Locked objects cannot be updated or deleted through standard mutation endpoints. Use locking for canonical landmarks, protocol-owned markers, or owner-approved world anchors.

## Visibility

The read endpoint returns visible objects. Hidden objects remain part of owner state but should not be treated as public scene content by default.

## Forward Compatibility

Treat unknown fields as future protocol extensions. A robust client should ignore unsupported object types and preserve raw records for debugging and future round-trip compatibility.
