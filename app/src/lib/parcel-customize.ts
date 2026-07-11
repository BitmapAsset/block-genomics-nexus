/**
 * Parcel-customize payload binding (OPEN-3).
 *
 * The web customize flow signs a SERVER-ISSUED challenge (anti-replay) whose
 * signed message also commits to a hash of the exact customization fields. That
 * binding means a captured signature cannot be re-applied with different fields,
 * and the single-use challenge means it cannot be replayed at all.
 *
 * These helpers are intentionally pure + platform-independent (no node/browser
 * crypto import) so the SAME canonical string is produced on the client (hashed
 * with Web Crypto) and on the server (hashed with node:crypto). Hash the string
 * with SHA-256 on each side; the hex digests must match.
 */

export interface ParcelCustomizeFields {
  customColor?: string | null;
  pattern?: string | null;
  imageUrl?: string | null;
  rotation?: number | string | null;
  facing?: string | null;
  emissive?: boolean | null;
}

/** Canonical, order-fixed string of the customization payload. */
export function parcelCustomizeBindingString(
  blockHeight: number,
  txIndex: number,
  fields: ParcelCustomizeFields
): string {
  const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  return [
    `block=${blockHeight}`,
    `parcel=${txIndex}`,
    `color=${s(fields.customColor)}`,
    `pattern=${s(fields.pattern)}`,
    `image=${s(fields.imageUrl)}`,
    `rotation=${s(fields.rotation)}`,
    `facing=${s(fields.facing)}`,
    `emissive=${fields.emissive ? '1' : '0'}`,
  ].join('|');
}

/**
 * The line embedded into the signed message that commits to the payload hash.
 * The server asserts the signed message contains exactly this line.
 */
export function parcelCustomizeBindingLine(hashHex: string, blockHeight: number, txIndex: number): string {
  return `customize:${blockHeight}:${txIndex}:${hashHex}`;
}
