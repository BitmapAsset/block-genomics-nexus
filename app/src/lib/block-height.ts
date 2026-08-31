/**
 * One definition of "is this a block height", shared by every surface that
 * accepts one.
 *
 * Two failure modes motivated this, both of which were live:
 *
 *   OVERFLOW — `Block.height` is a Postgres `integer`. A route that only checked
 *   `isNaN(h) || h < 0` happily passed `99999999999` to Prisma, which raised an
 *   int4 range error the route caught as a 500. A caller could turn any
 *   height-taking endpoint into an error with one query param, so the ceiling
 *   belongs in validation, not in the database driver.
 *
 *   FALSY ZERO — block 0 is the genesis block and a real, ownable bitmap. Guards
 *   written as `if (!blockHeight)` or `h <= 0` rejected it while `/blocks/0`
 *   served it, so the same height was simultaneously valid and invalid depending
 *   on which endpoint was asked.
 *
 * Strict on input by design: `parseInt` reads `"840000junk"` as `840000`, which
 * silently redirects a malformed request to a real block instead of rejecting it.
 */

/** Sanity ceiling — well past any real Bitcoin height, and inside int4. */
export const MAX_BLOCK_HEIGHT = 10_000_000;

/**
 * Parse a block height from an untrusted string.
 *
 * @returns The height, or `null` when the input is not a plain decimal integer
 *   in `[0, MAX_BLOCK_HEIGHT]`. Zero is valid.
 */
export function parseBlockHeight(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const height = Number(trimmed);
  if (!Number.isSafeInteger(height) || height > MAX_BLOCK_HEIGHT) return null;
  return height;
}

/** Same bounds check for a height that arrived as a number (JSON body, query cast). */
export function isValidBlockHeight(height: unknown): height is number {
  return Number.isInteger(height) && (height as number) >= 0 && (height as number) <= MAX_BLOCK_HEIGHT;
}

/** The message every surface returns for a rejected height, so the API reads the same everywhere. */
export const INVALID_BLOCK_HEIGHT_MESSAGE = `Invalid block height — expected an integer between 0 and ${MAX_BLOCK_HEIGHT}`;
