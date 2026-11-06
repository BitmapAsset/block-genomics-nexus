/**
 * Read-only aggregate behind the public block page at `/block/[height]`.
 *
 * This is the protocol's public face: the URL people paste into X, so it has to
 * answer "who holds this block, and what is standing on it" for any height,
 * including heights nobody has ever claimed.
 *
 * Two rules shape every function here.
 *
 * 1. **Read-only, with one named exception.** The page never mutates app state.
 *    `verifyBlockOwnership()` is the richer ownership primitive but it stamps
 *    `lastOwnerCheck`, which would turn every crawler hit into a write, so it is
 *    never called here. Which inscription is the deed comes from the deed rule
 *    (`canonicalDeedFor`, lib/onchain/deed), asked only for a claimed block; its
 *    holder is read through `publicOwnerLookup`, which never blocks on the
 *    throttled indexer and never persists anything.
 *    The exception: on a memory and table miss, `canonicalDeedFor` may write
 *    one `DeedVerdict` cache row for a canonical deed buried at least
 *    REORG_DEPTH blocks deep. It is the same row the ownership cron
 *    (`prewarmDeeds`) and the ownership API write, at most one per height, and
 *    nothing a request carries changes it. Database writes per request: none on
 *    a cache hit; at most that one row per claimed height on a miss (none while
 *    the table is not migrated, where the write fails and is ignored).
 *
 * 2. **Never throw.** A public share target that 500s when the database or the
 *    ordinals indexer blinks is worse than one that renders with a gap in it, so
 *    every external call degrades to null/empty and sets a `degraded` flag the
 *    UI can be honest about.
 *
 * The ownership model is deliberately two-valued: `onChainOwner` is the deed —
 * whoever holds the `.bitmap` inscription right now — while `registeredOwner` is
 * what this app last recorded. They can disagree (a sale the sync job has not
 * caught yet), and the page shows the chain as truth. Object attribution is a
 * third, separate thing: `creator` is who placed an object and does NOT change
 * when the block sells. Attribution survives the sale, control does not.
 */

import prisma from '@/lib/prisma';
import { lookupOwnerForRender } from '@/lib/publicOwnerLookup';
import { getOwnerAvailability } from '@/lib/onchain/owner-freshness';
import { canonicalDeedFor, CANONICAL_TTL_MS, DEED_RULE_ID, type CanonicalDeed, type DeedVerdict } from '@/lib/onchain/deed';
import { fetchBlockOgSummary, type BlockOgSummary } from '@/lib/blockOgData';
import { getBlockMarket, type BlockMarket } from '@/lib/marketplace';
import { formatBytes, formatNumber } from '@/lib/genome-utils';

/** Cap on each list so one heavily-built block cannot blow up the page. */
export const MAX_OBJECTS = 24;
export const MAX_PARCELS = 24;
export const MAX_EXPERIENCES = 12;

/**
 * Wall-clock budget for the marketplace lookup during a page render.
 *
 * The lane's own fetch timeout is per-request, and a listed block costs two
 * sequential upstream calls, so its worst case is longer than this page should
 * ever wait. Market data is a decoration on a share target: past this budget the
 * panel renders as unavailable, which is a better outcome than a slow venue
 * holding the whole page.
 */
const MARKET_RENDER_BUDGET_MS = 2500;

/**
 * How long a render waits for the deed rule's answer. A cached answer is
 * instant; past this the page says "checking" and the answer keeps resolving
 * in the background for the next render (see `canonicalDeedFor`).
 */
export const DEED_RENDER_BUDGET_MS = 300;

/**
 * Ceiling on deed resolutions page renders start, per process (the same shape
 * as the 16 background holder warms in `publicOwnerLookup`). A crawler walking
 * claimed blocks would otherwise queue one resolution per block on the resolver
 * the sign-in gate also uses. Past the cap a render answers from cached answers
 * only, and the deed chip says "Checking…" until a later render has a slot.
 */
export const MAX_PAGE_DEED_CHECKS = 8;

/**
 * How long a slot follows a resolution that outlived the render: until it
 * lands, or this long at the most (the ownership cron's per-block budget).
 */
const PAGE_DEED_CHECK_HOLD_MS = 45_000;

/** Identity shown next to a build. Resolved from a handle when we have one. */
export interface Creator {
  address: string;
  /** Block-scoped handle, else the account handle, else null. */
  handle: string | null;
  displayName: string | null;
}

export interface BlockOwnership {
  /** Live holder of the `.bitmap` inscription — the deed. */
  onChainOwner: string | null;
  /** Owner last recorded by this app. May lag the chain. */
  registeredOwner: string | null;
  inscriptionId: string | null;
  /** True only on a live, positive equality between chain and record. */
  inSync: boolean;
  /**
   * True when on-chain truth could not be established this request (no
   * inscription linked, or the indexer was unreachable). Never means "unowned".
   */
  indeterminate: boolean;
  /**
   * True when `indeterminate` is only because the render path declined to wait
   * for the throttled indexer call. Distinguishes "still checking" from "the
   * indexer is down" — see `publicOwnerLookup`.
   */
  checkPending: boolean;
  /**
   * What this server's latest holder check for the inscription established,
   * when there is an inscription to check. Lets the deed card say "chain
   * unreachable since…" for an outage instead of "unverified".
   */
  availability?: DeedAvailability;
  /**
   * What the deed rule said this request, for a claimed block. Absent for an
   * unclaimed block (no lookup is started) or when the database was down.
   */
  deed?: DeedCheck;
}

/** The deed rule's answer as the page used it. */
export interface DeedCheck {
  verdict: DeedVerdict;
  /** The deed's inscription id under the deed rule; set only for `canonical`. */
  canonicalId: string | null;
  /**
   * When the holder shown was observed: the time its render-cache entry was
   * written, not the newest check of any caller. Null when no holder is shown.
   */
  checkedAt: string | null;
  /**
   * When this server's holder check for the canonical deed first found Bitcoin
   * unreachable, while it still is. Set only for `canonical`; null when the deed
   * rule itself could not answer, because this server cannot know when that
   * outage began (its answer time is only the latest retry).
   */
  unreachableSince: string | null;
  /**
   * True when this render started no deed check because the page's checks were
   * all in use; the answer comes on a later render.
   */
  queued?: boolean;
}

export interface DeedAvailability {
  chain: 'ok' | 'unavailable' | 'unchecked';
  unavailableSince: string | null;
  lastVerifiedAt: string | null;
}

export interface BlockObjectSummary {
  id: string;
  objectType: string;
  name: string | null;
  createdAt: string;
  /** Who placed it. Unchanged by a later sale of the block. */
  creator: Creator;
}

export interface ParcelSummary {
  txIndex: number;
  owner: Creator | null;
}

export interface ExperienceSummary {
  id: string;
  name: string;
  description: string | null;
  experienceType: string;
  status: string;
  version: string;
  parcelIndex: number | null;
  capabilities: string[];
  creator: Creator;
}

export interface BlockPageData {
  height: number;
  /** True when this block has a record in the app — i.e. someone claimed it. */
  claimed: boolean;
  label: string | null;
  ownership: BlockOwnership;
  objects: BlockObjectSummary[];
  objectCount: number;
  parcels: ParcelSummary[];
  parcelCount: number;
  experiences: ExperienceSummary[];
  experienceCount: number;
  /** Header stats from mempool.space. Null when unmined or the API failed. */
  chain: BlockOgSummary | null;
  /**
   * Advisory third-party marketplace view. Null when no venue is configured or
   * the lookup exceeded its render budget.
   *
   * Explicitly NOT part of the ownership model: `ownership` above is the deed,
   * settled on-chain, and nothing in this field may be read as control over the
   * block. A venue can advertise whatever it likes.
   */
  market: BlockMarket | null;
  /** True when a backing service failed, so the page can say so rather than imply zero. */
  degraded: boolean;
}

/** Ownership shape used when nothing could be established. */
const UNKNOWN_OWNERSHIP: BlockOwnership = {
  onChainOwner: null,
  registeredOwner: null,
  inscriptionId: null,
  inSync: false,
  indeterminate: true,
  checkPending: false,
};

/**
 * Middle-truncate a Bitcoin address for display.
 *
 * Keeps both ends because the tail is what a reader compares against a wallet;
 * short addresses are returned whole rather than padded into something longer
 * than the original.
 */
export function shortenAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Best display label for a creator: handle, else display name, else short address. */
export function creatorLabel(creator: Creator): string {
  if (creator.handle) return `@${creator.handle}`;
  if (creator.displayName) return creator.displayName;
  return shortenAddress(creator.address);
}

/**
 * Decide the ownership story from the app record and a live indexer answer.
 *
 * Pure so the fail-closed rules can be tested without a database or a network.
 * `inSync` is true ONLY on a live positive equality — an indexer outage yields
 * `indeterminate`, never a match and never a mismatch.
 */
export function resolveOwnership(
  record: { ownerAddress: string | null; inscriptionId: string | null } | null,
  onChainOwner: string | null,
  checkPending = false,
  availability?: DeedAvailability,
): BlockOwnership {
  if (!record) return { ...UNKNOWN_OWNERSHIP };

  return {
    onChainOwner,
    registeredOwner: record.ownerAddress,
    inscriptionId: record.inscriptionId,
    inSync: onChainOwner !== null && onChainOwner === record.ownerAddress,
    indeterminate: onChainOwner === null,
    checkPending: onChainOwner === null && checkPending,
    ...(availability ? { availability } : {}),
  };
}

/** The reason `deedFor` gives when it started no check because every slot was in use. */
const QUEUED_REASON = 'deed check queued: the page checks in this process are all in use';

/** True when a deed answer timed out and is still resolving in the background, or is queued. */
function stillResolving(deed: CanonicalDeed): boolean {
  // `canonicalDeedFor` answers `undetermined` with this reason when only the
  // request budget ran out; any other `undetermined` is a failed check.
  return (
    deed.verdict === 'undetermined' &&
    (/^no deed answer within/.test(deed.reason ?? '') || deed.reason === QUEUED_REASON)
  );
}

/**
 * Decide the ownership story on the deed rule.
 *
 * `inSync` is true only when the deed rule named a canonical deed, its live
 * holder answered, and that holder equals the record. The stored inscription id
 * is kept for display ("on record") but never decides a match: the ownership
 * API applies the deed rule, and the page must not be greener than it.
 *
 * The holder comes from the render cache (`holderFor`) and is dated with that
 * cache entry's time. When this server's newest holder check for the deed
 * failed after the holder was cached (or the holder carries no time), the
 * holder is not shown as current: the chip takes the outage state instead.
 *
 * Pure apart from the two memory reads it is handed (`holderFor`,
 * `availabilityFor`), so every branch can be tested without a network.
 */
export function resolveDeedOwnership(
  record: { ownerAddress: string | null; inscriptionId: string | null },
  deed: CanonicalDeed,
  holderFor: (inscriptionId: string) => { address: string | null; pending: boolean; checkedAt?: string },
  availabilityFor: (inscriptionId: string) => {
    chain: DeedAvailability['chain'];
    checkedAt: string | null;
    lastVerifiedAt: string | null;
    unavailableSince: string | null;
  },
): BlockOwnership {
  const base = {
    registeredOwner: record.ownerAddress,
    inscriptionId: record.inscriptionId,
  };

  if (deed.verdict === 'canonical' && deed.inscriptionId) {
    const id = deed.inscriptionId;
    const held = holderFor(id);
    const a = availabilityFor(id);
    const failedSince =
      held.address !== null &&
      a.chain === 'unavailable' &&
      (!held.checkedAt || !a.checkedAt || Date.parse(a.checkedAt) > Date.parse(held.checkedAt));
    const address = failedSince ? null : held.address;
    const pending = held.pending;
    return {
      ...base,
      onChainOwner: address,
      inSync: address !== null && address === record.ownerAddress,
      indeterminate: address === null,
      checkPending: address === null && pending,
      availability: { chain: a.chain, unavailableSince: a.unavailableSince, lastVerifiedAt: a.lastVerifiedAt },
      deed: {
        verdict: 'canonical',
        canonicalId: id,
        checkedAt: address !== null ? held.checkedAt ?? null : null,
        unreachableSince: address === null && a.chain === 'unavailable' ? a.unavailableSince : null,
      },
    };
  }

  const pending = stillResolving(deed);
  const queued = deed.verdict === 'undetermined' && deed.reason === QUEUED_REASON;
  return {
    ...base,
    onChainOwner: null,
    inSync: false,
    indeterminate: true,
    checkPending: pending,
    deed: {
      verdict: deed.verdict,
      canonicalId: null,
      checkedAt: null,
      unreachableSince: null,
      ...(queued ? { queued: true } : {}),
    },
  };
}

/** Heights whose deed check a page render started and which has not landed yet. */
const pageDeedChecks = new Set<number>();

/**
 * Canonical deeds page renders have learned in this process, so a card or a
 * render past the cap can use them without asking the resolver.
 */
const knownDeeds = new Map<number, { deed: CanonicalDeed; expiresAt: number }>();

/** Test seam: forget the page's deed checks and the canonical deeds it learned. */
export function __resetPageDeedChecks(): void {
  pageDeedChecks.clear();
  knownDeeds.clear();
}

function learn(deed: CanonicalDeed): void {
  if (deed.verdict !== 'canonical' || !deed.inscriptionId) return;
  const ttl = typeof CANONICAL_TTL_MS === 'number' ? CANONICAL_TTL_MS : 0;
  knownDeeds.set(deed.height, { deed, expiresAt: Date.now() + ttl });
}

/**
 * The canonical deed for `height` from cached answers only: what page renders
 * learned in this process, then the stored `DeedVerdict` row. Never starts a
 * resolution; null when neither has one.
 */
async function cachedCanonicalDeed(height: number): Promise<CanonicalDeed | null> {
  const known = knownDeeds.get(height);
  if (known && known.expiresAt > Date.now()) return known.deed;
  try {
    const row = await prisma.deedVerdict.findUnique({
      where: { height },
      select: { inscriptionId: true, ruleId: true, resolvedAt: true },
    });
    if (!row || !DEED_RULE_ID || row.ruleId !== DEED_RULE_ID || !row.inscriptionId) return null;
    const resolvedAt = row.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : new Date().toISOString();
    return { height, inscriptionId: row.inscriptionId, ruleId: row.ruleId, verdict: 'canonical', resolvedAt, source: 'db' };
  } catch {
    // Table not migrated yet, or the database blinked: no cached answer.
    return null;
  }
}

/**
 * Hold a slot until the resolution a render started lands. Asking the deed rule
 * again joins its open resolution (one per height), so this starts nothing new.
 */
function holdSlot(height: number): void {
  void canonicalDeedFor(height, { budgetMs: PAGE_DEED_CHECK_HOLD_MS })
    .then(learn, () => undefined)
    .finally(() => pageDeedChecks.delete(height));
}

/**
 * The deed rule for a claimed block; a failure reads as `undetermined`, never a
 * throw. At most MAX_PAGE_DEED_CHECKS checks started by page renders run at
 * once; past that a render answers from cached answers or says the check is
 * queued.
 */
async function deedFor(height: number): Promise<CanonicalDeed> {
  const joining = pageDeedChecks.has(height);
  if (!joining && pageDeedChecks.size >= MAX_PAGE_DEED_CHECKS) {
    return (
      (await cachedCanonicalDeed(height)) ?? {
        height,
        inscriptionId: null,
        ruleId: '',
        verdict: 'undetermined',
        resolvedAt: new Date().toISOString(),
        reason: QUEUED_REASON,
        source: 'resolver',
      }
    );
  }
  if (!joining) pageDeedChecks.add(height);
  let holding = false;
  try {
    const deed = await canonicalDeedFor(height, { budgetMs: DEED_RENDER_BUDGET_MS });
    learn(deed);
    if (!joining && stillResolving(deed)) {
      holdSlot(height);
      holding = true;
    }
    return deed;
  } catch (e) {
    return {
      height,
      inscriptionId: null,
      ruleId: '',
      verdict: 'undetermined',
      resolvedAt: new Date().toISOString(),
      reason: e instanceof Error ? e.message : 'deed lookup failed',
      source: 'resolver',
    };
  } finally {
    if (!joining && !holding) pageDeedChecks.delete(height);
  }
}

/**
 * True only when the page may call the holder verified: a live match on the
 * deed rule's canonical deed. Shared by the deed chip and the share line.
 */
export function verifiedOnDeedRule(ownership: BlockOwnership): boolean {
  return ownership.inSync && ownership.deed?.verdict === 'canonical';
}

/**
 * The address to present as "holder" — the chain when it answered, otherwise the
 * app's record clearly marked as unverified by the caller reading `indeterminate`.
 */
export function displayOwner(ownership: BlockOwnership): string | null {
  return ownership.onChainOwner ?? ownership.registeredOwner;
}

type IdentityRow = { walletAddress: string; handle: string | null; displayName: string | null };

/**
 * Index wallet → identity, preferring a block-scoped profile over the global
 * account. A BlockProfile handle is the name someone chose *for this block*, so
 * on this page it is the more specific and more useful label.
 */
export function buildCreatorIndex(
  users: IdentityRow[],
  blockProfiles: IdentityRow[],
): Map<string, Creator> {
  const index = new Map<string, Creator>();

  for (const u of users) {
    index.set(u.walletAddress, {
      address: u.walletAddress,
      handle: u.handle,
      displayName: u.displayName,
    });
  }
  // Block-scoped profiles win — applied second so they overwrite.
  for (const p of blockProfiles) {
    index.set(p.walletAddress, {
      address: p.walletAddress,
      handle: p.handle,
      displayName: p.displayName,
    });
  }

  return index;
}

/** Look up an address, falling back to a bare-address creator. */
function toCreator(index: Map<string, Creator>, address: string): Creator {
  return index.get(address) ?? { address, handle: null, displayName: null };
}

/**
 * Everything the app knows about a block, from the database.
 *
 * Returns null (not empty data) when the database is unreachable, so the caller
 * can distinguish "nothing built here" from "we could not look".
 */
async function fetchDbState(height: number) {
  try {
    const [block, objects, objectCount, parcels, parcelCount, experiences, experienceCount] =
      await Promise.all([
        prisma.block.findUnique({ where: { height } }),
        prisma.blockObject.findMany({
          where: { blockHeight: height, visible: true },
          orderBy: { createdAt: 'desc' },
          take: MAX_OBJECTS,
        }),
        prisma.blockObject.count({ where: { blockHeight: height, visible: true } }),
        prisma.parcel.findMany({
          where: { blockHeight: height },
          orderBy: { txIndex: 'asc' },
          take: MAX_PARCELS,
        }),
        prisma.parcel.count({ where: { blockHeight: height } }),
        // soulJudged is the Brain's publication gate. Filtering on it here keeps
        // anything that predates or bypassed that gate off a public page.
        prisma.experience.findMany({
          where: { blockHeight: height, soulJudged: true },
          orderBy: { createdAt: 'desc' },
          take: MAX_EXPERIENCES,
        }),
        prisma.experience.count({ where: { blockHeight: height, soulJudged: true } }),
      ]);

    return { block, objects, objectCount, parcels, parcelCount, experiences, experienceCount };
  } catch (e) {
    console.warn(
      `[blockPageData] database unavailable for block ${height}:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/** Resolve display identities for every address referenced by the block's builds. */
async function fetchIdentities(height: number, addresses: string[]): Promise<Map<string, Creator>> {
  if (addresses.length === 0) return new Map();

  try {
    const [users, profiles] = await Promise.all([
      prisma.user.findMany({
        where: { walletAddress: { in: addresses } },
        select: { walletAddress: true, handle: true, displayName: true },
      }),
      prisma.blockProfile.findMany({
        where: { blockHeight: height, walletAddress: { in: addresses } },
        select: { walletAddress: true, handle: true, displayName: true },
      }),
    ]);
    return buildCreatorIndex(users, profiles);
  } catch {
    // Identities are decoration; addresses alone still render a truthful page.
    return new Map();
  }
}


/**
 * Assemble the full block page payload.
 *
 * Never throws. An unknown or unclaimed height is a valid, fully-renderable
 * result — `claimed: false` with empty lists — because every one of the ~900k
 * mined blocks is a real place in the Nexus whether or not anyone has bought it.
 */
export async function fetchBlockPageData(height: number): Promise<BlockPageData> {
  // Chain stats and the app's own state are independent; overlap them.
  const [chainResult, db] = await Promise.all([
    fetchBlockOgSummary(height).catch(() => null),
    fetchDbState(height),
  ]);

  if (!db) {
    return {
      height,
      claimed: false,
      label: null,
      ownership: { ...UNKNOWN_OWNERSHIP },
      objects: [],
      objectCount: 0,
      parcels: [],
      parcelCount: 0,
      experiences: [],
      experienceCount: 0,
      chain: chainResult,
      market: null,
      degraded: true,
    };
  }

  const { block, objects, objectCount, parcels, parcelCount, experiences, experienceCount } = db;

  // The market view is an outbound call with its own budget; start it now so
  // it overlaps the deed lookup below.
  const marketP = marketWithinBudget({ height, inscriptionId: block?.inscriptionId ?? null });

  // Only a claimed block asks the deed rule, so a crawler walking unclaimed
  // heights starts no lookup. The holder of the canonical deed is read through
  // `lookupOwnerForRender`, never awaited: the ord client throttles to ~1
  // req/sec process-wide, and blocking here lets a crawler serialise the page.
  const ownership = block
    ? resolveDeedOwnership(block, await deedFor(height), lookupOwnerForRender, getOwnerAvailability)
    : resolveOwnership(null, null);
  const onChainOwner = ownership.onChainOwner;

  const addresses = Array.from(
    new Set(
      [
        block?.ownerAddress,
        onChainOwner,
        ...objects.map((o) => o.ownerAddress),
        ...parcels.map((p) => p.ownerAddress),
        ...experiences.map((e) => e.walletAddress),
      ].filter((a): a is string => typeof a === 'string' && a.length > 0),
    ),
  );

  // Overlapped: identity resolution is a database read, the market view is an
  // outbound call, and neither depends on the other.
  const [identities, market] = await Promise.all([fetchIdentities(height, addresses), marketP]);

  return {
    height,
    claimed: block !== null,
    label: block?.label ?? null,
    ownership,
    objects: objects.map((o) => ({
      id: o.id,
      objectType: o.objectType,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      creator: toCreator(identities, o.ownerAddress),
    })),
    objectCount,
    parcels: parcels.map((p) => ({
      txIndex: p.txIndex,
      owner: p.ownerAddress ? toCreator(identities, p.ownerAddress) : null,
    })),
    parcelCount,
    experiences: experiences.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      experienceType: e.experienceType,
      status: e.status,
      version: e.version,
      parcelIndex: e.parcelIndex,
      capabilities: e.capabilities,
      creator: toCreator(identities, e.walletAddress),
    })),
    experienceCount,
    chain: chainResult,
    market,
    degraded: false,
  };
}

/**
 * Market view, or null if it did not arrive in time.
 *
 * Bounded here rather than inside the lane because the budget is a property of
 * this caller — the API route is happy to wait for a complete answer, a page
 * render is not.
 */
async function marketWithinBudget(query: {
  height: number;
  inscriptionId: string | null;
}): Promise<BlockMarket | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getBlockMarket(query),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), MARKET_RENDER_BUDGET_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One-line summary of a block's state, used in the share title and description.
 *
 * Lives here rather than in the page so the "what do we claim about ownership"
 * rule is testable on its own — this is the sentence that ends up in someone's
 * timeline, so being wrong about it is expensive.
 */
export function describeBlock(data: BlockPageData): string {
  const parts: string[] = [];

  if (data.chain) {
    parts.push(`${formatNumber(data.chain.txCount)} transactions`);
    parts.push(formatBytes(data.chain.size));
  }

  const owner = displayOwner(data.ownership);
  // "Held by" only on a live match between the chain and our record, on the
  // deed rule (`verifiedOnDeedRule`). Anything
  // else is our record and is labelled as one: an unverified row once put a
  // wallet that does not hold the inscription into timelines as "Held by".
  // Silence, not "Not yet on Block Genomics", when the lookup failed: a share
  // card that misstates someone's block because our database blinked is worse
  // than one that omits the line entirely.
  if (owner && verifiedOnDeedRule(data.ownership)) {
    parts.push(`Held by ${shortenAddress(owner)}`);
  } else if (data.ownership.registeredOwner) {
    parts.push(`Registered to ${shortenAddress(data.ownership.registeredOwner)} (not verified)`);
  } else if (!owner && !data.degraded) {
    parts.push('Not yet on Block Genomics');
  }

  if (data.objectCount > 0) {
    parts.push(`${formatNumber(data.objectCount)} object${data.objectCount === 1 ? '' : 's'} built`);
  }
  if (data.experienceCount > 0) {
    parts.push(
      `${formatNumber(data.experienceCount)} experience${data.experienceCount === 1 ? '' : 's'}`,
    );
  }

  return parts.join(' · ');
}

/**
 * Counts only — for the OG card, which needs "how much is here" but none of the
 * detail and sits in the critical path of a crawler request that will time out.
 */
export interface BlockCardFacts {
  /** Owner this app last recorded. Only `verified` lets the card call it the holder. */
  owner: string | null;
  /**
   * True only on the page's rule (`verifiedOnDeedRule`), from cached answers:
   * the canonical deed's cached holder equals `owner`.
   */
  verified: boolean;
  objectCount: number;
  claimed: boolean;
}

export async function fetchBlockCardFacts(height: number): Promise<BlockCardFacts> {
  try {
    const [block, objectCount] = await Promise.all([
      prisma.block.findUnique({
        where: { height },
        select: { ownerAddress: true, inscriptionId: true },
      }),
      prisma.blockObject.count({ where: { blockHeight: height, visible: true } }),
    ]);

    if (!block) return { owner: null, verified: false, objectCount: 0, claimed: false };

    // The deed rule, as the page applies it, from cached answers only: a card
    // never starts a resolution (unfurlers hit this in bursts and time out
    // fast). With no cached canonical deed the card prints the recorded owner
    // as "LAST RECORDED", never as the holder.
    const deed = await cachedCanonicalDeed(height);
    const verified = deed
      ? verifiedOnDeedRule(resolveDeedOwnership(block, deed, lookupOwnerForRender, getOwnerAvailability))
      : false;

    return { owner: block.ownerAddress, verified, objectCount, claimed: true };
  } catch {
    return { owner: null, verified: false, objectCount: 0, claimed: false };
  }
}
