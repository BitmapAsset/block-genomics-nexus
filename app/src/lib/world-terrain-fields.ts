/**
 * The terrain settings `POST /api/v1/world/terrain` will persist.
 *
 * Exported rather than inlined in the route so the contract suite can assert
 * two things the route cannot assert about itself: every name here is a real
 * `BlockTerrain` column, and the set matches `TerrainUpdateRequest` in
 * `public/openapi.json`. An entry that is neither -- `surfaceType` was one --
 * reaches Prisma as an unknown argument and the write fails at runtime.
 */
export const TERRAIN_WRITABLE_FIELDS = [
  'groundColor',
  'fogEnabled',
  'fogColor',
  'skyColor',
  'weather',
] as const;
