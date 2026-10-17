/**
 * My Bitmaps: what a connected wallet holds, reconciled with what Block
 * Genomics has on record.
 *
 * The chain is the only source of "you own this". The wallet scan
 * (`GET /api/v1/inscriptions/scan`) lists the `.bitmap` inscriptions the address
 * holds right now; our database is a record of past verifications and can be
 * stale in both directions. So:
 *
 *   held on-chain + recorded to this wallet + verified account → verified
 *   held on-chain + recorded, no verified account               → needs one signature
 *   held on-chain + not recorded to it                          → needs one signature
 *   recorded to this wallet + not held                          → "previously linked", collapsed
 *
 * "Recorded to this wallet" alone is not enough: the ownership sync moves
 * `Block.ownerAddress` to a buyer without creating or verifying a `User`, and
 * every owner action (handle claim, world tools) needs a verified `User`.
 *
 * When the scan cannot answer, nothing is called owned: the recorded heights are
 * shown as unconfirmed, never as the wallet's bitmaps (audit P0-4).
 *
 * The scan reads at most the first SCAN_CAP inscriptions of a wallet and
 * returns only the bitmaps among them, with no "truncated" flag. When it
 * returns SCAN_CAP or more, it may have stopped early, so a recorded height it
 * didn't list is "unscanned" (maybe still held), not "previous".
 *
 * Pure functions only, so every state the page can show is unit-tested.
 */

export interface ScanInscription {
  type: 'block' | 'parcel';
  height: number;
  parcelIndex?: number;
  inscriptionId: string;
}

/** The server scan reads the content of at most this many inscriptions per wallet. */
export const SCAN_CAP = 50;

/** Outcome of `GET /api/v1/inscriptions/scan?address=…`. */
export type ChainScan =
  /**
   * `capped`: the answer listed SCAN_CAP or more bitmap inscriptions (block or
   * parcel), so the scan may have stopped before the wallet's last one.
   */
  | { status: 'ok'; inscriptions: ScanInscription[]; capped: boolean }
  /** 503 `onchain_unavailable`: no indexer could list the wallet. Retryable. */
  | { status: 'unavailable' }
  /** Anything else: rate limit, 5xx, network. Retryable, but a different message. */
  | { status: 'error'; message: string };

export interface RecordedBlock {
  height: number;
  /** `Block.ownerAddress`, or null when Block Genomics has no row for the height. */
  ownerAddress: string | null;
  /** `Block.inscriptionId`: the inscription the deed check follows. */
  inscriptionId?: string | null;
}

export interface WalletRecords {
  /** Heights Block Genomics associates with this wallet (empire-stats `ownedBlocks`). */
  recordedHeights: number[];
  /** Block rows for the heights the wallet holds (`GET /api/v1/blocks/{h}`). */
  blocks: RecordedBlock[];
  /** Block profiles (handles) for this wallet. */
  profiles: { blockHeight: number; handle: string }[];
  /** Guardians this wallet owns. */
  guardians: { blockHeight: number; status: string; name?: string | null }[];
}

export type BitmapStatus =
  /**
   * Held on-chain, the record names this wallet AND the very inscription the
   * wallet holds (the agreement the block page's deed calls "Verified"), and
   * this wallet has a verified `User`.
   */
  | 'verified'
  /** Held on-chain; Block Genomics has no record of this wallet holding it. */
  | 'unverified'
  /** Recorded to this wallet but not in it on-chain (sold, moved, or never held). */
  | 'previous'
  /** Recorded to this wallet, not among the inscriptions a capped scan read: may still be held. */
  | 'unscanned'
  /** Recorded to this wallet; the chain could not be asked. */
  | 'unconfirmed';

export interface BitmapCard {
  height: number;
  status: BitmapStatus;
  /** The `.bitmap` inscription the wallet holds; null unless held on-chain. */
  inscriptionId: string | null;
  /**
   * For an 'unscanned' card: the inscription the record names for this wallet,
   * so verifying checks that inscription's holder directly instead of another
   * capped scan. Null otherwise.
   */
  recordedInscriptionId: string | null;
  /** True when the record names someone else (a previous holder). */
  recordedToOther: boolean;
  /** True when the record names this wallet but not the inscription it holds (or none). */
  unlinked: boolean;
  /**
   * True when the record names this wallet and the held inscription, but the
   * wallet has no verified `User` (e.g. the ownership sync recorded a buyer).
   */
  recordOnly: boolean;
  handle: string | null;
  guardian: { status: string; name: string | null; online: boolean } | null;
}

export interface ParcelHolding {
  height: number;
  parcelIndex: number;
  inscriptionId: string;
}

export interface MyBitmapsView {
  /** What the scan answered. */
  scan: ChainScan['status'];
  /** The scan hit its cap: absences prove nothing (see SCAN_CAP). */
  capped: boolean;
  /** Bitmaps the wallet holds on-chain, verified first, then by height. */
  held: BitmapCard[];
  /** Recorded to this wallet but not held now (or unconfirmed when the scan failed). */
  recordedOnly: BitmapCard[];
  parcels: ParcelHolding[];
  counts: { held: number; verified: number; guardians: number };
}

const isOnline = (status: string) => status === 'active' || status === 'Online';

/**
 * Merge the chain scan with the records. Never throws; never promotes a
 * recorded height to "held" without the chain saying so.
 *
 * `verifiedUser`: this wallet has a `User` with `verified: true`
 * (`GET /api/v1/users/by-wallet/{addr}`; a 404 means no user). Without one, no
 * card is "verified", whatever the Block rows say.
 */
export function reconcileBitmaps(
  wallet: string,
  scan: ChainScan,
  records: WalletRecords,
  verifiedUser: boolean,
): MyBitmapsView {
  const ownerOf = new Map(records.blocks.map((b) => [b.height, b.ownerAddress]));
  const recordIdOf = new Map(records.blocks.map((b) => [b.height, b.inscriptionId ?? null]));
  const handleOf = new Map<number, string>();
  for (const p of records.profiles) {
    if (!handleOf.has(p.blockHeight)) handleOf.set(p.blockHeight, p.handle);
  }
  const guardianOf = new Map<number, BitmapCard['guardian']>();
  for (const g of records.guardians) {
    guardianOf.set(g.blockHeight, { status: g.status, name: g.name ?? null, online: isOnline(g.status) });
  }

  /** The record names this wallet and the inscription it holds. */
  const recordMatches = (height: number, inscriptionId: string | null) =>
    inscriptionId !== null && ownerOf.get(height) === wallet && recordIdOf.get(height) === inscriptionId;

  const card = (height: number, status: BitmapStatus, inscriptionId: string | null): BitmapCard => {
    const owner = ownerOf.get(height) ?? null;
    return {
      height,
      status,
      inscriptionId,
      recordedInscriptionId:
        status === 'unscanned' && owner === wallet ? recordIdOf.get(height) ?? null : null,
      recordedToOther: owner !== null && owner !== wallet,
      unlinked: inscriptionId !== null && owner === wallet && recordIdOf.get(height) !== inscriptionId,
      recordOnly: !verifiedUser && recordMatches(height, inscriptionId),
      handle: handleOf.get(height) ?? null,
      guardian: guardianOf.get(height) ?? null,
    };
  };

  const recorded = Array.from(new Set(records.recordedHeights)).sort((a, b) => a - b);

  if (scan.status !== 'ok') {
    const recordedOnly = recorded.map((h) => card(h, 'unconfirmed', null));
    return {
      scan: scan.status,
      capped: false,
      held: [],
      recordedOnly,
      parcels: [],
      counts: { held: 0, verified: 0, guardians: 0 },
    };
  }

  // One card per height: a wallet can hold two inscriptions naming the same
  // block, and only the first "N.bitmap" inscription is valid under the bitmap
  // first-is-valid rule. Nothing checks that yet, not this scan and not
  // auth/verify (REVIEW bg57 P0-A; a separate server wave adds the check), so
  // the first one listed here is not necessarily the valid one.
  const heldIds = new Map<number, string>();
  const parcels: ParcelHolding[] = [];
  for (const insc of scan.inscriptions) {
    if (insc.type === 'block') {
      if (!heldIds.has(insc.height)) heldIds.set(insc.height, insc.inscriptionId);
    } else if (typeof insc.parcelIndex === 'number') {
      parcels.push({ height: insc.height, parcelIndex: insc.parcelIndex, inscriptionId: insc.inscriptionId });
    }
  }

  const held = Array.from(heldIds.entries()).map(([h, id]) =>
    card(h, verifiedUser && recordMatches(h, id) ? 'verified' : 'unverified', id),
  );
  held.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'verified' ? -1 : 1;
    return a.height - b.height;
  });

  const recordedOnly = recorded
    .filter((h) => !heldIds.has(h))
    .map((h) => card(h, scan.capped ? 'unscanned' : 'previous', null));
  parcels.sort((a, b) => a.height - b.height || a.parcelIndex - b.parcelIndex);

  return {
    scan: 'ok',
    capped: scan.capped,
    held,
    recordedOnly,
    parcels,
    counts: {
      held: held.length,
      verified: held.filter((c) => c.status === 'verified').length,
      guardians: held.filter((c) => c.guardian).length,
    },
  };
}

/**
 * Which held heights need their Block row read (`GET /api/v1/blocks/{h}`).
 *
 * `claimed` is every height with a row at all (`GET /api/v1/blocks/claimed`);
 * a held height outside it has no record, so asking would only produce a 404.
 * Heights recorded to this wallet are always read: that list comes from a
 * different query, so a claimed list that came back empty or short cannot hide
 * a verified block. With no usable claimed list, read every held height.
 */
export function heightsToRead(held: number[], claimed: number[] | null, recordedHeights: number[]): number[] {
  if (!claimed) return held;
  const known = new Set([...claimed, ...recordedHeights]);
  return held.filter((h) => known.has(h));
}

/**
 * Guardians for the held blocks, by block. `empire-stats` finds guardians by
 * owner address, which misses records whose owner field is malformed (a legacy
 * client stored the whole wallet-session JSON there); the block page looks them
 * up by block. Both sources are merged so My Bitmaps and the block page agree;
 * the per-block answer wins for a height that appears in both.
 */
export function mergeGuardians(
  byOwner: WalletRecords['guardians'],
  byBlock: WalletRecords['guardians'],
): WalletRecords['guardians'] {
  const merged = new Map<number, WalletRecords['guardians'][number]>();
  for (const g of byOwner) merged.set(g.blockHeight, g);
  for (const g of byBlock) merged.set(g.blockHeight, g);
  return Array.from(merged.values()).sort((a, b) => a.blockHeight - b.blockHeight);
}

/** Parse the scan response body + status into a ChainScan. */
export function parseScanResponse(httpStatus: number, body: unknown): ChainScan {
  const b = body as { success?: boolean; code?: string; error?: string; data?: { inscriptions?: unknown } } | null;
  if (httpStatus === 503 || b?.code === 'onchain_unavailable') return { status: 'unavailable' };
  if (httpStatus !== 200 || !b?.success || !Array.isArray(b.data?.inscriptions)) {
    return { status: 'error', message: typeof b?.error === 'string' ? b.error : `HTTP ${httpStatus}` };
  }
  const listed = b.data!.inscriptions as unknown[];
  const count = (b.data as { count?: unknown }).count;
  const inscriptions: ScanInscription[] = [];
  for (const raw of listed) {
    const r = raw as { type?: unknown; height?: unknown; parcelIndex?: unknown; inscriptionId?: unknown };
    if ((r.type !== 'block' && r.type !== 'parcel') || typeof r.inscriptionId !== 'string') continue;
    if (typeof r.height !== 'number' || !Number.isInteger(r.height) || r.height < 0) continue;
    inscriptions.push({
      type: r.type,
      height: r.height,
      inscriptionId: r.inscriptionId,
      ...(typeof r.parcelIndex === 'number' ? { parcelIndex: r.parcelIndex } : {}),
    });
  }
  // The response has no total and no truncation flag; `count` is the number of
  // bitmaps it lists. Reaching the cap is the only sign the scan stopped early.
  const reported = Math.max(listed.length, typeof count === 'number' && Number.isFinite(count) ? count : 0);
  return { status: 'ok', inscriptions, capped: reported >= SCAN_CAP };
}

// ── Address types ────────────────────────────────────────────────────────

export type AddressType = 'taproot' | 'native-segwit' | 'nested-segwit' | 'legacy' | 'unknown';

/** Mainnet address type from its prefix; enough to explain an empty scan. */
export function addressType(address: string): AddressType {
  const a = address.trim();
  if (/^bc1p[02-9ac-hj-np-z]{58}$/i.test(a)) return 'taproot';
  if (/^bc1q[02-9ac-hj-np-z]{38}([02-9ac-hj-np-z]{20})?$/i.test(a)) return 'native-segwit';
  if (/^3[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a)) return 'nested-segwit';
  if (/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a)) return 'legacy';
  return 'unknown';
}

export const ADDRESS_TYPE_LABEL: Record<AddressType, string> = {
  taproot: 'Taproot',
  'native-segwit': 'Native SegWit',
  'nested-segwit': 'Nested SegWit',
  legacy: 'Legacy',
  unknown: 'Bitcoin',
};

// ── Verification outcome copy ────────────────────────────────────────────

export type VerifyFailureKind = 'rejected' | 'not-held' | 'chain-unavailable' | 'expired' | 'unchecked' | 'other';

export interface VerifyFailure {
  kind: VerifyFailureKind;
  message: string;
  retryable: boolean;
}

/** Wallets throw on a declined prompt; each words it differently. */
export function isUserRejection(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err ?? '');
  return /reject|denied|declin|cancel|user (closed|aborted)/i.test(text);
}

/**
 * Turn a failed step into one honest sentence. `httpStatus` is the
 * `/api/v1/auth/verify` status when the failure came from the server, else
 * undefined (the wallet threw before anything was sent).
 */
export function describeVerifyFailure(height: number, err: unknown, httpStatus?: number): VerifyFailure {
  if (httpStatus === undefined) {
    if (isUserRejection(err)) {
      return { kind: 'rejected', message: 'You declined the signature in your wallet. Nothing was recorded.', retryable: true };
    }
    const text = err instanceof Error ? err.message : '';
    return {
      kind: 'other',
      message: text ? `Your wallet could not sign: ${text}` : 'Your wallet could not sign the message.',
      retryable: true,
    };
  }
  if (httpStatus === 503) {
    return {
      kind: 'chain-unavailable',
      message: "Your signature is fine, but the ordinals indexer didn't answer, so the chain couldn't confirm the holder. Nothing was recorded. Try again in a moment.",
      retryable: true,
    };
  }
  if (httpStatus === 403) {
    return {
      kind: 'not-held',
      message: `The chain says this wallet doesn't hold ${height}.bitmap right now, so it can't be verified.`,
      retryable: false,
    };
  }
  if (httpStatus === 401) {
    return {
      kind: 'expired',
      message: 'The signature did not match or the request expired. Sign again to get a fresh message.',
      retryable: true,
    };
  }
  const text = err instanceof Error ? err.message : '';
  return { kind: 'other', message: text || 'Verification failed. Try again.', retryable: true };
}

/** How auth/verify established the holder on a request it accepted. */
export type HolderCheck = 'live' | 'previous';

export type VerifyOutcome = { ok: true; holderCheck: HolderCheck } | { ok: false; failure: VerifyFailure };

/**
 * Read `POST /api/v1/auth/verify`'s answer for block `height`.
 *
 * A 200 alone is not a verification. The route answers 200 with
 * `holderCheck: 'none'` when it checked no block at all (today: height 0,
 * whose falsy height skips the ownership check on the server), and that must
 * not read "Verified". Success is `holderCheck` 'live' (an indexer confirmed
 * the holder just now) or 'previous' (this wallet was already verified for
 * this block) and, when the body names an anchor block, this block.
 */
export function readVerifyResponse(height: number, httpStatus: number, body: unknown): VerifyOutcome {
  const b = body as { success?: boolean; error?: unknown; data?: { holderCheck?: unknown; anchorBlock?: unknown } } | null;
  if (httpStatus < 200 || httpStatus > 299 || !b?.success) {
    const text = typeof b?.error === 'string' && b.error ? b.error : `HTTP ${httpStatus}`;
    return { ok: false, failure: describeVerifyFailure(height, new Error(text), httpStatus) };
  }
  const check = b.data?.holderCheck;
  const anchor = b.data?.anchorBlock;
  const otherBlock = typeof anchor === 'number' && anchor !== height;
  if ((check === 'live' || check === 'previous') && !otherBlock) return { ok: true, holderCheck: check };
  return {
    ok: false,
    failure: {
      kind: 'unchecked',
      message: otherBlock && (check === 'live' || check === 'previous')
        ? `Couldn't verify this block. The server's answer was about ${anchor}.bitmap, not ${height}.bitmap, so this one isn't verified.`
        : `Couldn't verify this block. Your wallet signed, but the server didn't check the chain for ${height}.bitmap, so it isn't verified.`,
      retryable: false,
    },
  };
}
