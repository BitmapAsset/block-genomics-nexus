import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { NEXUS_PATH, applyBlockParam, parseBlockParam } from '@/lib/blockDeepLink';
import {
  fetchBlockPageData,
  creatorLabel,
  describeBlock,
  displayOwner,
  type BlockPageData,
  type Creator,
} from '@/lib/blockPageData';
import { fetchBlockGuardian } from '@/lib/blockGuardian';
import { isAboveTip } from '@/lib/block-summary';
import type { BlockMarket } from '@/lib/marketplace';
import { epochLabelFor } from '@/lib/bitmapStandard';
import { formatBytes, formatNumber, hexPairToColor } from '@/lib/genome-utils';
import CopyButton from './copy-button';
import BlockTabs from './block-tabs';
import OwnerBar from './owner-bar';
import { deedStatus, type DeedStatus } from './deed-status';
import ActivityFeed from './activity-feed';
import GuardianCard from './guardian-card';
import Hero from './hero';
import { guardianCardState } from '@/lib/blockGuardian';
import { listBlockEvents } from '@/lib/block-events';
import { scaleLineForTxCount } from '@/lib/world-scale';
import type { PublicBlockEvent } from '@/lib/block-event-core';

/**
 * The public page for a single bitmap block — the canonical URL people paste
 * into X, Telegram and Discord.
 *
 * Rendered per request rather than statically: the headline fact on the page is
 * who holds the deed *right now*, which is a live indexer answer. That also
 * keeps the build free of any database or network dependency.
 *
 * Layout, top to bottom (one column on a phone): the identity line with the
 * deed chip, the block map with its scale line, the guardian card, Activity,
 * then three tabs (World · Experiences · Block facts) and the Deed card. All
 * server-rendered, so a crawler reads the whole page. Nothing here claims to be
 * live: with the event store off the page shows what the record holds.
 */
export const dynamic = 'force-dynamic';

/**
 * One fetch per request, shared by `generateMetadata` and the component.
 * Without this the ownership lookup would run twice for every crawler hit.
 */
const getBlockData = cache(async (height: number): Promise<BlockPageData> => {
  return fetchBlockPageData(height);
});

/**
 * A height above mempool's tip has no block yet, so it gets Next's not-found
 * (noindex) rather than a block page and a share card. Same rule as the block
 * summary API. An unreadable tip (null) renders the page as before.
 */
async function isUnmined(height: number): Promise<boolean> {
  return isAboveTip(height);
}

function nexusHref(height: number): string {
  return `${NEXUS_PATH}${applyBlockParam('', height)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ height: string }>;
}): Promise<Metadata> {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);
  // Rejected here rather than only in the component: metadata resolves before
  // the shell is flushed, so this is the last point where a real 404 status can
  // still be set instead of a soft 404.
  if (height === undefined) notFound();

  const [unmined, data] = await Promise.all([isUnmined(height), getBlockData(height)]);
  if (unmined) notFound();
  const epoch = epochLabelFor(height);

  const title = `Block ${formatNumber(height)} — ${height}.bitmap | Block Genomics`;
  const description = `${describeBlock(data)}. ${epoch.label}, a 2.1km × 2.1km district of sovereign digital land in The Nexus, anchored to Bitcoin block ${formatNumber(height)}.`;

  const path = `/block/${height}`;
  const image = `/og/block/${height}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: 'Block Genomics',
      type: 'article',
      images: [{ url: image, width: 1200, height: 630, alt: `Bitcoin block ${height} genome card` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

// ── Presentational pieces ───────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 first:mt-0">
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-sm tabular-nums text-text-secondary">{formatNumber(count)}</span>
        )}
      </div>
      {children}
    </section>
  );
}

/** Honest empty state — says what is absent without dressing it up as an error. */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.09] px-6 py-10 text-center">
      <div className="text-sm leading-relaxed text-text-secondary">{children}</div>
    </div>
  );
}

function CreatorTag({ creator, prefix }: { creator: Creator; prefix: string }) {
  const label = creatorLabel(creator);
  const inner = <span className="text-text-primary">{label}</span>;

  return (
    <span className="text-xs text-text-secondary">
      {prefix}{' '}
      {creator.handle ? (
        // Padding without layout: a 44 px tap target on a phone, same line height.
        <Link href={`/agent/${creator.handle}`} className="-my-[14px] inline-block py-[14px] hover:text-accent-cyan">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </span>
  );
}

/**
 * Genome spectrum — one bar per byte of the genome, coloured deterministically
 * from the block hash, so the strip is a fingerprint of this block specifically.
 */
function GenomeStrip({ genome }: { genome: string }) {
  const bars = Array.from({ length: 32 }, (_, i) => {
    const pair = genome.slice(i * 2, i * 2 + 2);
    return { color: hexPairToColor(pair), height: 10 + (parseInt(pair, 16) / 255) * 26 };
  });

  return (
    <div className="flex h-9 items-end gap-[3px]" aria-hidden="true">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="w-[6px] rounded-full"
          style={{ backgroundColor: bar.color, height: `${bar.height}px`, opacity: 0.9 }}
        />
      ))}
    </div>
  );
}

/**
 * The Deed card: the holder's address and the inscription, under the tabs.
 *
 * Three distinct states, kept distinct on purpose: verified against the chain,
 * on record but not verifiable this request, and not registered on Block
 * Genomics. The last one says nothing about who holds the `.bitmap` on Bitcoin:
 * this registry is not the chain. Collapsing "we could not reach the indexer"
 * into "unowned" would be a lie about property.
 */
function DeedPanel({ data, status }: { data: BlockPageData; status: DeedStatus | null }) {
  const { ownership } = data;
  const owner = displayOwner(ownership);

  if (!owner || !status) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">
          Deed
        </div>
        <p className="mt-2 text-base text-text-primary">
          {data.degraded ? 'Ownership unavailable' : 'Not yet on Block Genomics'}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {data.degraded
            ? 'The ownership record could not be reached. This does not mean the block is unowned.'
            : `Nobody has verified ${data.height}.bitmap on Block Genomics yet. That says nothing about who holds it on Bitcoin.`}
        </p>
        {!data.degraded && (
          <Link
            href="/my-bitmaps"
            className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-4 text-sm font-medium text-text-primary hover:bg-white/5"
          >
            Hold it? Verify in My Bitmaps
          </Link>
        )}
      </div>
    );
  }

  const canonicalId = ownership.deed?.canonicalId ?? null;
  const storedId = ownership.inscriptionId;
  // The stored id is labelled "on record" unless the deed rule named the same one.
  const showStored = storedId !== null && storedId !== canonicalId;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">
        Deed · {status.key === 'verified' || status.key === 'registry-behind' ? 'holder on Bitcoin' : 'last recorded holder'}
      </div>

      <p className="mt-3 break-all font-mono text-base text-text-primary">{owner}</p>

      <p className="mt-2 text-sm text-text-secondary">{status.detail}</p>

      {(canonicalId || showStored) && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          {canonicalId && (
            <>
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">
                Inscription · the deed
              </div>
              <p className="mt-1 break-all font-mono text-xs text-text-secondary">{canonicalId}</p>
            </>
          )}
          {showStored && (
            <>
              <div
                className={`text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary${canonicalId ? ' mt-3' : ''}`}
              >
                Inscription · on record
              </div>
              <p className="mt-1 break-all font-mono text-xs text-text-secondary">{storedId}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Sats rendered as BTC once that reads better than a seven-digit integer. */
function formatSats(sats: number): string {
  const btc = sats / 100_000_000;
  if (btc >= 0.0001) {
    return `${btc.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} BTC`;
  }
  return `${formatNumber(sats)} sats`;
}

/**
 * Third-party market state for this block.
 *
 * Visually subordinate to the deed, because that is the actual relationship:
 * the deed panel is what the chain says, this is what a shop is advertising.
 * The copy says "advisory" out loud so a reader does not mistake a price for a
 * fact about control.
 *
 * Renders nothing at all when no venue is configured — an operator who never
 * set a venue key has no integration to report, and an empty panel on a public
 * share page would look like breakage rather than absence.
 */
function MarketPanel({ market }: { market: BlockMarket | null }) {
  if (!market || market.status === 'unconfigured') return null;

  if (market.status !== 'listed' || !market.listing) {
    return (
      <p className="text-sm text-text-secondary">
        {market.status === 'unavailable'
          ? 'Marketplace data is unavailable right now.'
          : 'Not listed on any connected marketplace.'}
      </p>
    );
  }

  const { listing } = market;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">
          Market
        </div>
        <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn-text">
          Listed
        </span>
      </div>

      <p className="mt-3 text-base text-text-primary">
        {listing.priceSats !== null ? formatSats(listing.priceSats) : 'Price not published'}
        <span className="ml-2 text-sm text-text-secondary">on {listing.venueName}</span>
      </p>

      {listing.lastSaleSats !== null && (
        <p className="mt-1 text-sm text-text-secondary">
          Last sale {formatSats(listing.lastSaleSats)}
          {listing.lastSaleAt
            ? ` on ${new Date(listing.lastSaleAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}`
            : ''}
        </p>
      )}

      <p className="mt-2 text-sm text-text-secondary">
        Advisory only, reported by a third-party marketplace. It is not proof of ownership and the
        protocol takes no part in the sale — the deed above is the authority.
      </p>

      {listing.url && (
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-4 inline-flex min-h-[44px] items-center text-sm text-text-primary underline underline-offset-4 hover:text-accent-cyan"
        >
          View on {listing.venueName} ↗
        </a>
      )}
    </div>
  );
}

const pillPrimary =
  'inline-flex min-h-[48px] items-center justify-center rounded-full bg-bitcoin px-6 text-sm font-semibold text-black transition hover:brightness-110';
const pillSecondary =
  'inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary transition hover:bg-white/5';

// ── Tab panels ──────────────────────────────────────────────────────────

/**
 * `listBuilds` is false while Activity above already lists the builds (event
 * store off or empty), so the same list is not shown twice.
 */
function WorldPanel({ data, listBuilds }: { data: BlockPageData; listBuilds: boolean }) {
  const { height } = data;
  return (
    <>
      <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-transparent p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="max-w-xl">
          <h2 className="text-xl font-semibold tracking-tight text-text-primary">Walk through {height}.bitmap</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Every transaction in this block is a parcel, sized by the value it moved: the same squares as the bitmap above. Fly over it, walk its streets and see
            what has been built.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link href={`/world/${height}`} className={pillPrimary}>
            Enter world
          </Link>
          <Link href={nexusHref(height)} className={pillSecondary}>
            See it on the map
          </Link>
        </div>
      </div>

      {/* Empty land is said once, in Activity above the tabs. */}
      {listBuilds && data.objects.length > 0 && (
        <Section title="Built on this block" count={data.objectCount}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.objects.map((o) => (
              <li key={o.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-text-primary">{o.name || 'Untitled'}</span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wider text-text-secondary">{o.objectType}</span>
                </div>
                <div className="mt-2">
                  <CreatorTag creator={o.creator} prefix="Built by" />
                </div>
              </li>
            ))}
          </ul>
          {data.objectCount > data.objects.length && (
            <p className="mt-4 text-sm text-text-secondary">
              Showing {data.objects.length} of {formatNumber(data.objectCount)}.{' '}
              <Link href={`/world/${height}`} className="inline-flex min-h-[44px] items-center text-accent-cyan hover:underline">
                See them all in the world
              </Link>
              .
            </p>
          )}
        </Section>
      )}

      {data.parcelCount > 0 && (
        <Section title="Parcels" count={data.parcelCount}>
          <ul className="flex flex-wrap gap-2">
            {data.parcels.map((p) => (
              <li key={p.txIndex} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2">
                <span className="font-mono text-xs text-text-primary">#{p.txIndex}</span>
                {p.owner && <span className="ml-2 text-xs text-text-secondary">{creatorLabel(p.owner)}</span>}
              </li>
            ))}
          </ul>
          {data.parcelCount > data.parcels.length && (
            <p className="mt-4 text-sm text-text-secondary">
              Showing {data.parcels.length} of {formatNumber(data.parcelCount)}.
            </p>
          )}
        </Section>
      )}
    </>
  );
}

function ExperiencesPanel({ data }: { data: BlockPageData }) {
  return (
    <>
      {data.experiences.length === 0 ? (
        <Empty>
          <p>No experiences are registered on this block yet.</p>
          <p className="mt-2">
            Owners publish galleries, apps and interactive worlds here with a signed manifest.{' '}
            <Link href="/docs/experience-hosting" className="text-accent-cyan hover:underline">
              How it works
            </Link>
          </p>
        </Empty>
      ) : (
        <ul className="grid gap-3">
          {data.experiences.map((e) => (
            <li key={e.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-text-primary">{e.name}</span>
                <span className="text-[11px] uppercase tracking-wider text-text-secondary">{e.experienceType}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    e.status === 'live' ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-surface-2 text-text-2'
                  }`}
                >
                  {/* "Published", not "live": nothing on this page claims to be live. */}
                  {e.status === 'live' ? 'published' : e.status}
                </span>
              </div>
              {e.description && <p className="mt-2 text-sm text-text-secondary">{e.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <CreatorTag creator={e.creator} prefix="Published by" />
                <span className="font-mono text-xs text-text-secondary">v{e.version}</span>
                {e.parcelIndex !== null && <span className="text-xs text-text-secondary">parcel #{e.parcelIndex}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The latest 30 Living Block events, or null to keep today's build list: flag
 * off, migration not applied, no events yet, or any read error. Never throws,
 * so the event store can never take the block page down.
 */
async function latestEvents(height: number): Promise<{ events: PublicBlockEvent[]; readAt: number } | null> {
  try {
    const page = await listBlockEvents(height, { limit: 30 });
    return page.enabled && page.events.length > 0 ? { events: page.events, readAt: Date.now() } : null;
  } catch {
    return null;
  }
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Activity, right under the guardian card: the event feed when the event store
 * has events; else what the record holds ("Built here · N objects · last change
 * <date>" and the build list); else one line for empty land. This is the only
 * place the page says nothing has been built.
 */
function ActivitySection({
  data,
  events,
}: {
  data: BlockPageData;
  events: { events: PublicBlockEvent[]; readAt: number } | null;
}) {
  const builds = [...data.objects].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="mt-10" data-testid="block-activity">
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">Activity</h2>
      </div>
      {events ? (
        <>
          <ActivityFeed events={events.events} now={events.readAt} />
          <p className="mt-4 text-xs text-text-secondary">
            Each entry is chained to the one before it and links to a proof you can check yourself.
          </p>
        </>
      ) : builds.length === 0 ? (
        <Empty>Nothing has been built here yet. Whoever holds the deed can place the first object from the world.</Empty>
      ) : (
        <>
          <p className="mb-3 text-sm text-text-secondary" data-testid="built-here">
            Built here · {formatNumber(data.objectCount)} object{data.objectCount === 1 ? '' : 's'} · last change{' '}
            {dayOf(builds[0].createdAt)}
          </p>
          <ol className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            {builds.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <span className="text-sm text-text-primary">
                  {o.name || 'Untitled'} <span className="text-text-secondary">· {o.objectType}</span>
                </span>
                <span className="text-xs text-text-secondary">
                  <CreatorTag creator={o.creator} prefix="by" /> · {dayOf(o.createdAt)}
                </span>
              </li>
            ))}
          </ol>
          {data.objectCount > builds.length && (
            <p className="mt-3 text-sm text-text-secondary">
              Showing {builds.length} of {formatNumber(data.objectCount)}.{' '}
              <Link
                href={`/world/${data.height}`}
                className="inline-flex min-h-[44px] items-center text-accent-cyan hover:underline"
              >
                See them all in the world
              </Link>
              .
            </p>
          )}
          <p className="mt-4 text-xs text-text-secondary">
            Attribution is permanent: it records who built each object, not who owns the block today.
          </p>
        </>
      )}
    </section>
  );
}

/** The Block facts tab: the block hash, its genome and scale, today's stats and the market. */
function BlockFactsPanel({ data, mined }: { data: BlockPageData; mined: string | null }) {
  // From the transaction count the page already has: no block summary, no wait.
  const scale = data.chain ? scaleLineForTxCount(data.chain.txCount) : null;
  return (
    <>
      {data.chain && (
        <div className="mb-8">
          <GenomeStrip genome={data.chain.genome} />
          <p className="mt-2 break-all font-mono text-[11px] text-text-2">block genome {data.chain.genome.slice(0, 32)}…</p>
          {scale && (
            <p className="mt-2 text-xs text-text-2 tabular-nums" data-testid="block-scale-line">
              {scale}
            </p>
          )}
        </div>
      )}
      <Section title="Block">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Transactions" value={data.chain ? formatNumber(data.chain.txCount) : '—'} />
          <Stat label="Size" value={data.chain ? formatBytes(data.chain.size) : '—'} />
          <Stat label="Mined" value={mined ?? '—'} />
          <Stat label="Objects" value={formatNumber(data.objectCount)} />
          <Stat label="Parcels" value={formatNumber(data.parcelCount)} />
          <Stat label="Experiences" value={formatNumber(data.experienceCount)} />
        </div>
        {data.chain ? (
          <div className="mt-3 flex items-center gap-2">
            <p className="min-w-0 break-all font-mono text-xs text-text-2" data-testid="block-hash">{data.chain.hash}</p>
            <CopyButton text={data.chain.hash} label="block hash" iconOnly className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-surface-3 hover:text-text-1" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">Chain stats couldn&apos;t be loaded right now.</p>
        )}
      </Section>

      {data.market && data.market.status !== 'unconfigured' && (
        <Section title="Market">
          <MarketPanel market={data.market} />
        </Section>
      )}
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default async function BlockPage({ params }: { params: Promise<{ height: string }> }) {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);
  if (height === undefined) notFound();
  if (await isUnmined(height)) notFound();

  const [data, guardianView, events] = await Promise.all([
    getBlockData(height),
    fetchBlockGuardian(height),
    latestEvents(height),
  ]);
  const now = Date.now();
  // A deed state only for a block on record; an unclaimed one gets its own chip.
  const status = displayOwner(data.ownership) ? deedStatus(data.ownership, now) : null;
  const shown = guardianView.guardian;
  const guardianState = shown ? { name: shown.name, ...guardianCardState(shown, now), tone: 'neutral' as const } : null;

  const mined = data.chain
    ? new Date(data.chain.timestamp * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <main className="bp-dark bg-bg-primary">
    <div className="mx-auto max-w-[1200px] overflow-x-hidden px-4 pb-10 pt-4 md:px-10 md:pb-16 md:pt-6">
      <Link
        href="/explore"
        className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-text-2 transition-colors hover:text-accent-cyan"
      >
        <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
        Explore
      </Link>

      {data.chain === null && (
        <p
          className="mt-4 rounded-[14px] border border-line-1 bg-surface-1 px-4 py-3 text-sm text-text-2"
          data-testid="chain-banner"
        >
          Bitcoin data is unreachable right now; block facts are missing on this view.
        </p>
      )}

      {data.degraded && (
        <p className="mt-4 rounded-[14px] border border-line-1 bg-surface-1 px-4 py-3 text-sm text-text-2" data-testid="degraded-banner">
          Some data could not be loaded right now, so builds and ownership may be incomplete on this
          view. The block itself is unaffected.
        </p>
      )}

      <Hero data={data} status={status} guardian={guardianState} guardianDegraded={guardianView.degraded} now={now} />

      <OwnerBar onChainOwner={data.ownership.onChainOwner} registeredOwner={data.ownership.registeredOwner} />

      {/* ── Guardian, then Activity ── */}
      <div className="mt-10">
        <GuardianCard height={height} view={guardianView} events={events?.events ?? null} now={events?.readAt ?? now} />
      </div>

      <ActivitySection data={data} events={events} />

      {/* ── Tabs ── */}
      <div className="mt-10">
        <BlockTabs
          tabs={[
            { id: 'world', label: 'World', count: data.objectCount },
            { id: 'experiences', label: 'Experiences', count: data.experienceCount },
            { id: 'facts', label: 'Block facts' },
          ]}
          panels={{
            world: <WorldPanel data={data} listBuilds={events !== null} />,
            experiences: <ExperiencesPanel data={data} />,
            facts: <BlockFactsPanel data={data} mined={mined} />,
          }}
        />
      </div>

      {/* ── Deed ── */}
      <div className="mt-10">
        <DeedPanel data={data} status={status} />
      </div>
    </div>
    </main>
  );
}
