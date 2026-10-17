/**
 * The public handle to show for a wallet.
 *
 * Two records hold one:
 *   - `User.handle`, set through auth/verify (the retired /verify page did it);
 *   - `BlockProfile.handle`, set by "Give it a public handle" in My Bitmaps
 *     (`POST /api/v1/profiles/create`), which never touches `User.handle`.
 *
 * Account, the wallet menu and the badge read both, through this one rule:
 * the account handle first, else the block profile on the lowest height, else
 * none. `GET /api/v1/users/by-wallet/{addr}` returns both.
 */

export interface BlockProfileHandle {
  blockHeight: number;
  handle: string;
}

export interface PublicHandle {
  handle: string;
  /** `user`: `User.handle`. `block`: a block profile's handle. */
  source: 'user' | 'block';
  /** The block profile's height when `source` is `block`, else null. */
  blockHeight: number | null;
}

const present = (h: unknown): h is string => typeof h === 'string' && h.trim().length > 0;

export function resolvePublicHandle(
  user: { handle?: string | null; blockProfiles?: readonly BlockProfileHandle[] | null } | null | undefined,
): PublicHandle | null {
  if (!user) return null;
  if (present(user.handle)) return { handle: user.handle.trim(), source: 'user', blockHeight: null };
  const first = (user.blockProfiles ?? [])
    .filter((p) => present(p?.handle) && Number.isInteger(p.blockHeight) && p.blockHeight >= 0)
    .sort((a, b) => a.blockHeight - b.blockHeight)[0];
  return first ? { handle: first.handle.trim(), source: 'block', blockHeight: first.blockHeight } : null;
}

/**
 * The id for `/api/v1/badge/{id}.svg`. That route resolves an account handle
 * or a wallet address, not a block-profile handle (which would render the grey
 * unverified shield), so a block-profile handle badges by address.
 */
export function badgeId(publicHandle: PublicHandle | null, walletAddress: string): string {
  return publicHandle?.source === 'user' ? publicHandle.handle : walletAddress;
}
