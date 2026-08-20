/**
 * Read-only aggregate behind the public block page at `/block/[height]`.
 *
 * This is the protocol's public face: the URL people paste into X, so it has to
 * answer "who holds this block, and what is standing on it" for any height,
 * including heights nobody has ever claimed.
 *
 * Two rules shape every function here.
 *
 * 1. **Read-only.** The page must never mutate. `verifyBlockOwnership()` is the
 *    richer ownership primitive but it stamps `lastOwnerCheck`, which would turn
 *    every crawler hit into a write. The indexer lookup is called directly
 *    instead (cached, fail-closed) and nothing is persisted.
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
import { getInscriptionOwner } from '@/lib/ownership-sync';
import { fetchBlockOgSummary, type BlockOgSummary } from '@/lib/blockOgData';
import { formatBytes, formatNumber } from '@/lib/genome-utils';

/** Cap on each list so one heavily-built block cannot blow up the page. */
export const MAX_OBJECTS = 24;
export const MAX_PARCELS = 24;
export const MAX_EXPERIENCES = 12;

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
): BlockOwnership {
  if (!record) return { ...UNKNOWN_OWNERSHIP };

  return {
    onChainOwner,
    registeredOwner: record.ownerAddress,
    inscriptionId: record.inscriptionId,
    inSync: onChainOwner !== null && onChainOwner === record.ownerAddress,
    indeterminate: onChainOwner === null,
  };
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
 * Deed holder for the public block page, or null when there is no inscription
 * or the indexer is down.
 *
 * DISPLAY tier: this renders a page and authorizes nothing, so it shares the
 * cached observation rather than putting every page view on the indexer's
 * throttle. Anything that gates a write must use the auth tier instead — see
 * lib/onchain/owner-freshness.ts.
 */
async function fetchOnChainOwner(inscriptionId: string | null): Promise<string | null> {
  if (!inscriptionId) return null;
  try {
    return await getInscriptionOwner(inscriptionId, 'display');
  } catch {
    return null;
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
      degraded: true,
    };
  }

  const { block, objects, objectCount, parcels, parcelCount, experiences, experienceCount } = db;

  const onChainOwner = await fetchOnChainOwner(block?.inscriptionId ?? null);
  const ownership = resolveOwnership(block, onChainOwner);

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

  const identities = await fetchIdentities(height, addresses);

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
    degraded: false,
  };
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
  // Silence, not "Unclaimed", when the lookup failed: a share card that calls
  // someone's block unowned because our database blinked is worse than one that
  // omits the line entirely.
  if (owner) {
    parts.push(`Held by ${shortenAddress(owner)}`);
  } else if (!data.degraded) {
    parts.push('Unclaimed');
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
  owner: string | null;
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

    if (!block) return { owner: null, objectCount: 0, claimed: false };

    const onChainOwner = await fetchOnChainOwner(block.inscriptionId);

    return {
      owner: onChainOwner ?? block.ownerAddress,
      objectCount,
      claimed: true,
    };
  } catch {
    return { owner: null, objectCount: 0, claimed: false };
  }
}
