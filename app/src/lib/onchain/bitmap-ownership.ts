/**
 * "Does this wallet hold the deed for this block, right now?"
 *
 * This is the single answer the whole ownership gate rests on. It was previously
 * inlined in `/api/v1/auth/verify`; it lives here because the MCP/agent
 * ownership gate must ask the exact same question with the exact same
 * fail-closed semantics. Two implementations of this would eventually disagree,
 * and the lenient one would become the way in.
 *
 * SECURITY MODEL — fail closed, always:
 *   - WHICH inscription is the deed is decided server-side by the bitmap
 *     resolver (lib/onchain/deed.ts): the first valid `N.bitmap` from block N
 *     onward. Any other inscription with the same text, a bare number, padded
 *     text, a delegate or an encoded body is a copy and proves nothing. No
 *     caller input (a request body, a stored hint) selects the inscription.
 *   - The CURRENT-HOLDER check is mandatory. `.bitmap` inscription content is
 *     public and immutable, so a content match alone proves nothing about who
 *     holds it now. A live indexer must report the current holder, and that
 *     holder must equal the claimed wallet (case-sensitive bech32).
 *   - Providers, in order: the ord hosts (`ORD_BASE_URLS`, default
 *     ordinals.com), then the Esplora sat tracker (both through
 *     owner-freshness), then Unisat as a tertiary fallback — applying the SAME
 *     equality assertion. Unisat is NEVER a content-only bypass.
 *   - The deed's content is re-read and must be exactly `N.bitmap` (no
 *     delegate, no content-encoding): an ADDITIONAL constraint, never a
 *     substitute for the holder check. There is no content-only success path.
 *   - Our own database is a CACHE and is deliberately not consulted for the
 *     holder. Trusting it during an indexer outage previously let a stale
 *     record re-grant a sold block.
 *   - When the deed or its holder cannot be established, callers get
 *     `unavailable` and must surface a retryable 503 rather than granting or
 *     hard-denying. A block with no valid deed is a definitive 403.
 *
 * FRESHNESS: every question this module answers gates a mutation, so the holder
 * lookup always runs on the AUTH tier (lib/onchain/owner-freshness.ts). That is
 * a tightening AND a de-load: these calls previously went straight to the ord
 * client on every single write with no coalescing, so a burst of writes against
 * one block cost one throttled indexer round-trip each.
 */

import { getInscriptionBody as ordGetInscriptionBody } from '@/lib/onchain/ord';
import { resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';
import { readInscriptionBodyFromChain } from '@/lib/onchain/sat-tracker';
import { canonicalDeedFor } from '@/lib/onchain/deed';

/** Timeout for the Unisat calls made from this module. */
const FETCH_TIMEOUT_MS = 8000;
const NOT_HELD_REASON = 'Inscription is not held by this wallet';

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Inscription content from the ord hosts, else read out of the reveal
 * transaction via Esplora (which declines delegated or content-encoded
 * inscriptions rather than return different bytes than ord would serve).
 * null = unavailable, never "empty". `encoded` = the host declared a
 * Content-Encoding, which a deed never has.
 */
async function fetchInscriptionContent(inscriptionId: string): Promise<{ text: string; encoded: boolean } | null> {
  const fromOrd = await ordGetInscriptionBody(inscriptionId);
  if (fromOrd) {
    const enc = (fromOrd.contentEncoding ?? '').trim().toLowerCase();
    return { text: fromOrd.text, encoded: enc !== '' && enc !== 'identity' };
  }
  const fromChain = await readInscriptionBodyFromChain(inscriptionId);
  return fromChain === null ? null : { text: fromChain, encoded: false };
}

/** A deed's content is exactly the bytes `<height>.bitmap`: no whitespace, no bare number. */
export function contentNamesBlock(content: string, blockHeight: number): boolean {
  return content === `${blockHeight}.bitmap`;
}

export interface OwnershipCheck {
  verified: boolean;
  /** Set when NO live provider could answer — the caller must retry, not deny. */
  unavailable?: boolean;
  reason?: string;
  /** The deed inscription the check was about. */
  inscriptionId?: string;
  /** `ownership_not_proven` when the block has no valid deed at all. */
  code?: 'ownership_not_proven';
}

/**
 * Verify a SPECIFIC inscription is currently held by `walletAddress` and names
 * `blockHeight`.
 *
 * This proves holding of an inscription, NOT that the inscription is the deed:
 * authorization must go through `verifyBlockOwnedBy`, which picks the deed.
 *
 * @returns `{ verified: true }` only when a live indexer names this wallet as the
 * current holder AND the inscription content is exactly `<height>.bitmap`.
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
      return { verified: false, reason: NOT_HELD_REASON };
    }

    // ── ADDITIONAL constraint: exactly `<height>.bitmap` ─────────────
    if (ordOwner?.delegate) {
      return { verified: false, reason: 'Inscription delegates its content; a deed carries its own' };
    }

    const content = await fetchInscriptionContent(inscriptionId);

    if (content === null) {
      console.warn(`[ownership] holder confirmed for ${inscriptionId} but content unavailable; failing closed`);
      return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
    }

    if (content.encoded) {
      return { verified: false, reason: 'Inscription content is encoded; a deed is plain bytes' };
    }

    if (!contentNamesBlock(content.text, blockHeight)) {
      return {
        verified: false,
        reason: `Inscription content ${JSON.stringify(content.text.slice(0, 64))} is not exactly "${blockHeight}.bitmap"`,
      };
    }

    return { verified: true, inscriptionId };
  } catch (e) {
    console.error('[ownership] inscription check failed:', e);
    return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
  }
}

/**
 * The one call the ownership gate makes: does `walletAddress` hold block
 * `blockHeight` right now?
 *
 * Resolves the block's deed (lib/onchain/deed.ts), then checks the live holder
 * of THAT inscription. Which inscriptions the wallet holds does not matter: a
 * wallet holding a copy holds nothing.
 *
 * @param _hint Ignored. Accepted so existing callers that pass a stored or
 *   caller-supplied inscription id keep compiling; it never selects the
 *   inscription that is checked.
 */
export async function verifyBlockOwnedBy(
  walletAddress: string,
  blockHeight: number,
  _hint?: string | null // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<OwnershipCheck> {
  const deed = await canonicalDeedFor(blockHeight);

  if (deed.verdict === 'none') {
    return {
      verified: false,
      code: 'ownership_not_proven',
      reason: `Block ${blockHeight} has no valid .bitmap deed${deed.reason ? ` (${deed.reason})` : ''}`,
    };
  }

  if (deed.verdict !== 'canonical' || !deed.inscriptionId) {
    console.warn(
      `[ownership] deed for ${blockHeight} not established (${deed.verdict}${deed.reason ? `: ${deed.reason}` : ''}); failing closed`
    );
    return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
  }

  const check = await verifyInscriptionOwnership(walletAddress, deed.inscriptionId, blockHeight);
  if (check.verified || check.unavailable) return check;
  // The deed itself failing the content re-check means our sources disagree
  // with the resolver: retry, never a definitive answer either way.
  if (check.reason !== NOT_HELD_REASON) {
    console.warn(`[ownership] deed ${deed.inscriptionId} for ${blockHeight} failed the content re-check: ${check.reason}`);
    return { verified: false, unavailable: true, reason: 'onchain_unavailable' };
  }
  return { ...check, inscriptionId: deed.inscriptionId };
}
