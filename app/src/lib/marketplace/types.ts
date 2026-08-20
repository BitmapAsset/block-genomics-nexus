/**
 * Marketplace lane — shared types.
 *
 * The protocol's deed layer is Bitcoin: whoever holds the `.bitmap` inscription
 * owns the block, and that is settled on-chain (see `/api/v1/ownership/verify`).
 * This lane does not participate in that. It reads what third-party ordinals
 * marketplaces are *advertising* about a block and shows it, nothing more.
 *
 * That distinction is the whole design constraint, so it is encoded in the type:
 * every result carries `advisory: true`. There is no code path from a
 * `BlockMarket` into an authorization decision, and there must never be one — a
 * venue is an untrusted upstream that can say anything, including that a block
 * is owned by someone who does not hold it. Venue data decorates the UI; the
 * chain decides who controls the block.
 *
 * Hard non-goals for this lane: no custody, no order placement, no payment
 * flows, no on-chain writes. It is a read-only window onto someone else's order
 * book.
 */

/** Total sats ever mintable. Any price at or above this is upstream garbage. */
export const MAX_PLAUSIBLE_SATS = 2_100_000_000_000_000;

/**
 * A single venue's view of one block.
 *
 * `priceSats` is null whenever `listed` is false — an unlisted block has no
 * asking price. The two fields are kept separate rather than collapsed into
 * "price or null" because "not listed" and "listed but the venue omitted the
 * price" are different upstream states, and the second one is a venue bug we
 * want to surface rather than silently render as unlisted.
 */
export interface MarketListing {
  /** Venue id, e.g. `magiceden`. Stable, lowercase, used as a map key. */
  venue: string;
  /** Human label for the venue, e.g. `Magic Eden`. */
  venueName: string;
  /** Whether the venue currently advertises this block for sale. */
  listed: boolean;
  /** Asking price in sats. Null when unlisted or when the venue omitted it. */
  priceSats: number | null;
  /** Venue-side URL for a human to click through to. Never auto-followed. */
  url: string | null;
  /** Last observed sale price in sats, when the venue exposes one. */
  lastSaleSats: number | null;
  /** ISO-8601 timestamp of that last sale, when the venue exposes one. */
  lastSaleAt: string | null;
}

/**
 * Outcome of asking one venue about one block.
 *
 * Deliberately a result object rather than an exception: a venue being down,
 * hostile, or slow is an ordinary Tuesday for this lane, and it must degrade
 * into a rendered "unavailable" state rather than a 500 on the public block
 * page. Adapters never throw.
 */
export type VenueQueryResult =
  | { ok: true; listing: MarketListing }
  | { ok: false; reason: string };

/**
 * What the lane knows about a block before it asks anyone.
 *
 * `inscriptionId` is the load-bearing field. A bitmap's identity on an ordinals
 * marketplace is its inscription, not its height — height is a name inside the
 * bitmap standard, and asking a venue to resolve it means trusting the venue's
 * name index to agree with the standard. The inscription id is the same
 * primitive the deed layer uses, so keying on it makes venue answers about the
 * same object the chain is about.
 *
 * When it is absent the block has never been inscribed, which means it cannot be
 * listed on an ordinals venue and the lane can answer `not_listed` without a
 * single upstream call.
 */
export interface VenueQuery {
  height: number;
  inscriptionId: string | null;
}

/**
 * A marketplace venue this lane can read.
 *
 * Adding a venue means implementing this and registering it — nothing else in
 * the lane is venue-aware.
 *
 * The two host lists are separate because they authorise different things.
 * `apiHosts` is the SSRF allowlist enforced by `fetchVenueJson`: an adapter
 * cannot make a request to an origin it did not declare, even via redirect.
 * `linkHosts` is the allowlist for URLs we render as clickable `href`s, which is
 * a phishing control rather than a request control. They usually differ — a
 * venue serves its API from one hostname and its human UI from another — and
 * collapsing them would either let the fetcher reach the marketing site or let a
 * hostile payload put an API hostname in front of a user.
 */
export interface VenueAdapter {
  /** Stable lowercase id. */
  readonly id: string;
  /** Human label. */
  readonly name: string;
  /** Exact hostnames this venue may send requests to. */
  readonly apiHosts: readonly string[];
  /** Exact hostnames whose URLs may be rendered as outbound links. */
  readonly linkHosts: readonly string[];
  /**
   * False when the venue needs credentials it does not have. A venue that is
   * not configured is skipped entirely — never queried, never an error.
   */
  isConfigured(): boolean;
  /** Ask this venue about a block. Never throws. */
  fetchBlockMarket(query: VenueQuery): Promise<VenueQueryResult>;
}

/**
 * Why the lane has nothing to show, when it has nothing to show.
 *
 * `unconfigured` and `unavailable` are split because they mean different things
 * to an operator: the first is "you never set an API key", the second is "your
 * key is set and the upstream still failed". Collapsing them would make a
 * misconfigured deploy indistinguishable from a venue outage.
 */
export type MarketStatus = 'listed' | 'not_listed' | 'unavailable' | 'unconfigured';

/** The lane's answer for one block, aggregated across configured venues. */
export interface BlockMarket {
  height: number;
  status: MarketStatus;
  /** Best (lowest-priced) live listing, or null. */
  listing: MarketListing | null;
  /** Every venue result that came back listed, cheapest first. */
  listings: MarketListing[];
  /** Venue ids that were actually queried this call. */
  venuesQueried: string[];
  /** Per-venue failure reasons, for operator visibility. Never shown as truth. */
  errors: Array<{ venue: string; reason: string }>;
  /**
   * Always true. A machine-readable marker that this payload is third-party
   * market chatter, not protocol state, and must not gate anything.
   */
  advisory: true;
  /**
   * ISO-8601 time this view was computed upstream.
   *
   * A cached view is returned verbatim, so this is the time of the underlying
   * venue query, not of the request that read it — which is the useful reading:
   * it answers "how old is this price", not "when did you hand it to me".
   */
  checkedAt: string;
}
