/**
 * "Does this wallet hold the .bitmap inscription for this block, right now?"
 *
 * This is the single answer the whole ownership gate rests on. It was previously
 * inlined in `/api/v1/auth/verify`; it lives here because the MCP/agent
 * ownership gate must ask the exact same question with the exact same
 * fail-closed semantics. Two implementations of this would eventually disagree,
 * and the lenient one would become the way in.
 *
 * SECURITY MODEL — fail closed, always:
 *   - The CURRENT-HOLDER check is mandatory. `.bitmap` inscription content is
 *     public and immutable, so a content match alone proves nothing about who
 *     holds it now. A live indexer must report the current holder, and that
 *     holder must equal the claimed wallet (case-sensitive bech32).
 *   - Providers, in order: ord (`ORD_BASE_URL`, default ordinals.com), then
 *     Unisat as a tertiary fallback — applying the SAME equality assertion.
 *     Unisat is NEVER a content-only bypass.
 *   - The block-number content match is an ADDITIONAL constraint, never a
 *     substitute for the holder check. There is no content-only success path.
 *   - Our own database is a CACHE and is deliberately not consulted here.
 *     Trusting it during an indexer outage previously let a stale record
 *     re-grant a sold block.
 *   - When no provider can answer, callers get `unavailable` and must surface a
 *     retryable 503 rather than granting or hard-denying.
 *
 * FRESHNESS: every question this module answers gates a mutation, so the holder
 * lookup always runs on the AUTH tier (lib/onchain/owner-freshness.ts). That is
 * a tightening AND a de-load: these calls previously went straight to the ord
 * client on every single write with no coalescing, so a burst of writes against
 * one block cost one throttled indexer round-trip each.
 */

import { getAddressInscriptions as ordGetAddressInscriptions } from '@/lib/onchain/ord';
import { resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';

/** Timeout for the non-ord (content / Unisat) calls made from this module. */
const FETCH_TIMEOUT_MS = 8000;

/** Most inscriptions we will content-check when scanning a wallet, to bound latency. */
const MAX_SCANNED_INSCRIPTIONS = 50;

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** `.bitmap` inscription content is either `<height>` or `<height>.bitmap`. */
export function contentNamesBlock(content: string, blockHeight: number): boolean {
  const trimmed = content.trim();
  return trimmed === `${blockHeight}` || trimmed === `${blockHeight}.bitmap`;
}

export interface OwnershipCheck {
  verified: boolean;
  /** Set when NO live provider could answer — the caller must retry, not deny. */
  unavailable?: boolean;
  reason?: string;
  /** The inscription that satisfied the check, when one was found by scanning. */
  inscriptionId?: string;
}

/**
 * Verify a SPECIFIC inscription is currently held by `walletAddress` and names
 * `blockHeight`.
 *
 * @returns `{ verified: true }` only when a live indexer names this wallet as the
 * current holder AND the inscription content names the claimed block.
 */
export async function verifyInscriptionOwnership(
  walletAddress: string,
  inscriptionId: string,
  blockHeight: number
): Promise<OwnershipCheck> {
  try {
    // ── MANDATORY current-holder check ──────────────────────────────
    let holderAddress: string | null = null;

    const ordOwner = await resolveInscriptionOwner(inscriptionId, 'auth');
    if (ordOwner) holderAddress = ordOwner.address;

    // Tertiary fallback: Unisat, ONLY to learn the current holder.
    if (!holderAddress) {
      try {
        const res = await fetchWithTimeout(
          `https://open-api.unisat.io/v1/indexer/inscription/info/${encodeURIComponent(inscriptionId)}`
        );
        if (res.ok) {
          const data = await res.json();
          const address: unknown = data?.data?.address;
          if (typeof address === 'string' && address.length > 0) holderAddress = address;
        }
      } catch {
        /* Unisat unavailable — fall through to fail-closed below */
      }
    }

    if (!holderAddress) {
      console.warn(`[ownership] no live holder for ${inscriptionId}; failing closed`);
      return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    }

    if (holderAddress !== walletAddress) {
      return { verified: false, reason: 'Inscription is not held by this wallet' };
    }

    // ── ADDITIONAL constraint: content must name the claimed block ───
    let content: string | null = null;
    try {
      const res = await fetchWithTimeout(`https://ordinals.com/content/${encodeURIComponent(inscriptionId)}`);
      if (res.ok) content = await res.text();
    } catch {
      /* content unavailable */
    }

    if (content === null) {
      console.warn(`[ownership] holder confirmed for ${inscriptionId} but content unavailable; failing closed`);
      return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    }

    if (!contentNamesBlock(content, blockHeight)) {
      return {
        verified: false,
        reason: `Inscription content "${content.trim().slice(0, 64)}" does not match block ${blockHeight}`,
      };
    }

    return { verified: true, inscriptionId };
  } catch (e) {
    console.error('[ownership] inscription check failed:', e);
    return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
  }
}

/**
 * Scan the inscriptions a wallet currently holds for a `.bitmap` naming
 * `blockHeight`.
 *
 * The inscription list comes only from live indexers reporting what the wallet
 * holds NOW, so a content match against a listed inscription proves holding and
 * block identity together.
 *
 * @returns `unavailable` when no provider could list the wallet's inscriptions.
 * An empty list is a real "holds none" negative, not an outage.
 */
export async function scanWalletForBitmap(
  walletAddress: string,
  blockHeight: number
): Promise<OwnershipCheck> {
  try {
    let inscriptionIds: string[] | null = await ordGetAddressInscriptions(walletAddress);

    if (inscriptionIds === null) {
      try {
        const res = await fetchWithTimeout(
          `https://open-api.unisat.io/v1/indexer/address/${encodeURIComponent(walletAddress)}/inscription-utxo-data?cursor=0&size=100`
        );
        if (res.ok) {
          const data = await res.json();
          const utxos = data?.data?.utxo || [];
          const ids: string[] = [];
          for (const utxo of utxos) {
            for (const insc of utxo?.inscriptions || []) {
              if (typeof insc?.inscriptionId === 'string') ids.push(insc.inscriptionId);
            }
          }
          inscriptionIds = ids;
        }
      } catch {
        /* Unisat unavailable — fall through to fail-closed below */
      }
    }

    if (inscriptionIds === null) {
      console.warn(`[ownership] no inscription list for ${walletAddress}; failing closed`);
      return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    }

    for (const id of inscriptionIds.slice(0, MAX_SCANNED_INSCRIPTIONS)) {
      try {
        const res = await fetchWithTimeout(`https://ordinals.com/content/${encodeURIComponent(id)}`, {}, 5000);
        if (res.ok && contentNamesBlock(await res.text(), blockHeight)) {
          return { verified: true, inscriptionId: id };
        }
      } catch {
        continue;
      }
    }

    return {
      verified: false,
      reason: `No .bitmap inscription for block ${blockHeight} is held by this wallet`,
    };
  } catch (e) {
    console.error('[ownership] wallet scan failed:', e);
    return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
  }
}

/**
 * The one call the ownership gate makes: does `walletAddress` hold block
 * `blockHeight` right now?
 *
 * Prefers the cheap direct check when the caller already knows the inscription
 * id, and falls back to scanning the wallet's current holdings otherwise.
 *
 * @param inscriptionId Optional known `.bitmap` inscription for the block.
 */
export async function verifyBlockOwnedBy(
  walletAddress: string,
  blockHeight: number,
  inscriptionId?: string | null
): Promise<OwnershipCheck> {
  if (inscriptionId) {
    const direct = await verifyInscriptionOwnership(walletAddress, inscriptionId, blockHeight);
    // A definitive negative on a known inscription is the answer — the wallet
    // was asked about THAT inscription and does not hold it. Only widen the
    // search when the direct path could not reach a live indexer at all.
    if (direct.verified || !direct.unavailable) return direct;
  }
  return scanWalletForBitmap(walletAddress, blockHeight);
}
