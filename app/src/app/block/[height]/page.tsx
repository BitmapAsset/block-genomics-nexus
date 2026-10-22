import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { NEXUS_PATH, applyBlockParam, parseBlockParam } from '@/lib/blockDeepLink';
import {
  fetchBlockPageData,
  creatorLabel,
  describeBlock,
  displayOwner,
  type BlockPageData,
  type Creator,
} from '@/lib/blockPageData';
import { fetchBlockGuardian, type BlockGuardianView } from '@/lib/blockGuardian';
import { getTipHeight } from '@/lib/block-summary';
import type { BlockMarket } from '@/lib/marketplace';
import { EPOCH_LABELS, getEpochColor, getEpochIndex } from '@/lib/bitmapStandard';
import { formatBytes, formatNumber, hexPairToColor } from '@/lib/genome-utils';
import CopyButton from './copy-button';
import BlockTabs from './block-tabs';
import OwnerBar from './owner-bar';
import DeedRecheck from './deed-recheck';

/**
 * The public page for a single bitmap block — the canonical URL people paste
 * into X, Telegram and Discord.
 *
 * Rendered per request rather than statically: the headline fact on the page is
 * who holds the deed *right now*, which is a live indexer answer. That also
 * keeps the build free of any database or network dependency.
 *
 * Layout: the art is the hero, the deed sits right under it, and everything
 * else lives in four tabs (World · Guardian · Experiences · Activity) that are
 * all server-rendered, so a crawler reads the whole page.
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
  const tip = await getTipHeight();
  return tip !== null && height > tip;
}

function nexusHref(height: number): string {
  return `${NEXUS_PATH}${applyBlockParam('', height)}`;
}

function epochFor(height: number) {
  return EPOCH_LABELS[getEpochIndex(height)] ?? EPOCH_LABELS[EPOCH_LABELS.length - 1];
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
  const epoch = epochFor(height);

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
        <Link href={`/agent/${creator.handle}`} className="hover:text-accent-cyan">
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
 * The deed panel.
 *
 * Three distinct states, kept distinct on purpose: verified against the chain,
 * on record but not verifiable this request, and not registered on Block
 * Genomics. The last one says nothing about who holds the `.bitmap` on Bitcoin:
 * this registry is not the chain. Collapsing "we could not reach the indexer"
 * into "unowned" would be a lie about property.
 */
function DeedPanel({ data }: { data: BlockPageData }) {
  const { ownership } = data;
  const owner = displayOwner(ownership);

  if (!owner) {
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

  const verified = ownership.inSync;
  const chainMoved = !ownership.indeterminate && !ownership.inSync && ownership.onChainOwner !== null;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">
          Deed
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={
            verified
              ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e' }
              : { background: 'rgba(100,116,139,0.16)', color: '#cbd5e1' }
          }
        >
          {verified ? 'Verified on-chain' : ownership.checkPending ? 'Checking' : 'Unverified'}
        </span>
      </div>

      <p className="mt-3 break-all font-mono text-base text-text-primary">{owner}</p>

      <p className="mt-2 text-sm text-text-secondary">
        {verified
          ? 'Current holder of the .bitmap inscription. Whoever holds the deed controls everything standing on this block.'
          : chainMoved
            ? 'Live holder per the ordinals indexer. This registry still lists a previous owner and has not caught up yet.'
            : ownership.checkPending
              ? 'Last recorded holder. The live chain check is still running; this updates on its own.'
              : ownership.inscriptionId === null
                ? // No id on file means the indexer was never asked, so "could
                  // not be reached" would be a false reason.
                  'Last recorded holder. Block Genomics has no inscription id on file for this block, so the chain was not checked.'
                : 'Last recorded holder. The ordinals indexer could not be reached, so this is not confirmed against the chain right now.'}
      </p>

      {ownership.inscriptionId && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">
            Inscription
          </div>
          <p className="mt-1 break-all font-mono text-xs text-text-secondary">
            {ownership.inscriptionId}
          </p>
        </div>
      )}
      <DeedRecheck pending={ownership.checkPending} />
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
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ background: 'rgba(234,179,8,0.1)', color: '#eab308' }}
        >
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

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

const pillPrimary =
  'inline-flex min-h-[48px] items-center justify-center rounded-full bg-bitcoin px-6 text-sm font-semibold text-black transition hover:brightness-110';
const pillSecondary =
  'inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary transition hover:bg-white/5';

// ── Tab panels ──────────────────────────────────────────────────────────

function WorldPanel({ data }: { data: BlockPageData }) {
  const { height } = data;
  return (
    <>
      <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-transparent p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="max-w-xl">
          <h2 className="text-xl font-semibold tracking-tight text-text-primary">Walk through {height}.bitmap</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Every transaction in this block is a parcel, sized by its bytes. Fly over it, walk its streets and see
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

      <Section title="Built on this block" count={data.objectCount}>
        {data.objects.length === 0 ? (
          <Empty>Nothing has been built here yet. Whoever holds the deed can place the first object from the world.</Empty>
        ) : (
          <>
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
                <Link href={`/world/${height}`} className="text-accent-cyan hover:underline">
                  See them all in the world
                </Link>
                .
              </p>
            )}
          </>
        )}
      </Section>

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

function GuardianPanel({ height, view }: { height: number; view: BlockGuardianView }) {
  if (view.degraded) {
    return <Empty>Guardian details couldn&apos;t be loaded right now. This doesn&apos;t mean the block has none.</Empty>;
  }

  if (!view.guardian) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-text-primary">No guardian on this block yet</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          A guardian is an AI agent that keeps a block: it greets visitors, answers questions about the block and builds
          with its owner. Only the wallet that holds {height}.bitmap can set one up.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/world/${height}`} className={pillSecondary}>
            Set it up from the world
          </Link>
          <Link href="/my-bitmaps" className={pillSecondary}>
            Hold it? Verify first
          </Link>
        </div>
      </div>
    );
  }

  const g = view.guardian;
  const chatHref = view.handle ? `/agent/${view.handle}?chat=1` : `/world/${height}`;
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">Guardian</p>
          <h2 className="mt-1 truncate text-xl font-semibold text-text-primary">{g.name}</h2>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={
            g.active
              ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e' }
              : { background: 'rgba(234,179,8,0.12)', color: '#facc15' }
          }
        >
          {g.active ? 'Active' : g.status.charAt(0).toUpperCase() + g.status.slice(1)}
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-text-secondary">Last heartbeat</dt>
          <dd className="mt-1 text-sm text-text-primary">{relativeTime(g.lastHeartbeat)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Messages</dt>
          <dd className="mt-1 text-sm tabular-nums text-text-primary">{formatNumber(g.totalMessages)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Visitors</dt>
          <dd className="mt-1 text-sm tabular-nums text-text-primary">{formatNumber(g.totalVisitors)}</dd>
        </div>
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={chatHref} className={pillPrimary}>
          Chat with {g.name}
        </Link>
      </div>
    </div>
  );
}

function ExperiencesPanel({ data }: { data: BlockPageData }) {
  return (
    <>
      {data.experiences.length === 0 ? (
        <Empty>
          <p>No experiences are registered on this block yet.</p>
          <p className="mt-2">
            Owners publish games, galleries and apps here with a signed manifest.{' '}
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
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={
                    e.status === 'live'
                      ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e' }
                      : { background: 'rgba(100,116,139,0.16)', color: '#cbd5e1' }
                  }
                >
                  {e.status}
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

function ActivityPanel({ data, mined }: { data: BlockPageData; mined: string | null }) {
  const builds = [...data.objects].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
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
          <p className="mt-3 break-all font-mono text-xs text-text-secondary">{data.chain.hash}</p>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">Chain stats couldn&apos;t be loaded right now.</p>
        )}
      </Section>

      {data.market && data.market.status !== 'unconfigured' && (
        <Section title="Market">
          <MarketPanel market={data.market} />
        </Section>
      )}

      <Section title="Builds">
        {builds.length === 0 ? (
          <Empty>No builds recorded on this block yet.</Empty>
        ) : (
          <ol className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            {builds.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <span className="text-sm text-text-primary">
                  {o.name || 'Untitled'} <span className="text-text-secondary">· {o.objectType}</span>
                </span>
                <span className="text-xs text-text-secondary">
                  <CreatorTag creator={o.creator} prefix="by" /> ·{' '}
                  {new Date(o.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-xs text-text-secondary">
          Attribution is permanent: it records who built each object, not who owns the block today.
        </p>
      </Section>
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default async function BlockPage({ params }: { params: Promise<{ height: string }> }) {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);
  if (height === undefined) notFound();
  if (await isUnmined(height)) notFound();

  const [data, guardianView] = await Promise.all([getBlockData(height), fetchBlockGuardian(height)]);
  const epoch = epochFor(height);
  const epochColor = getEpochColor(height);

  const mined = data.chain
    ? new Date(data.chain.timestamp * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  const facts = [
    mined ? { label: 'Mined', value: mined } : null,
    data.chain ? { label: 'Transactions', value: formatNumber(data.chain.txCount) } : null,
    data.chain ? { label: 'Size', value: formatBytes(data.chain.size) } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href="/explore"
        className="inline-flex min-h-[44px] items-center text-sm text-text-secondary transition-colors hover:text-accent-cyan"
      >
        ← Explore
      </Link>

      {/* ── Hero: the art is the hero ── */}
      <header className="mt-4 grid gap-8 md:grid-cols-[minmax(0,320px)_1fr] md:items-center">
        {/* Bitmap art: server-rendered PNG, cached per height */}
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API PNG, already cached server-side */}
        <img
          src={`/api/v1/block-thumbnail/${height}.png?v=2`}
          alt={`${height}.bitmap`}
          width={256}
          height={256}
          className="aspect-square w-full max-w-[320px] rounded-2xl border border-white/[0.08] bg-[#1d1f31]"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: epochColor, color: epochColor }}
            >
              {epoch.label} · {epoch.sub}
            </span>
            {data.label && (
              <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-text-primary">{data.label}</span>
            )}
          </div>
          <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.28em] text-text-secondary">Bitcoin block</p>
          <h1 className="mt-1 text-6xl font-semibold tracking-[-0.03em] text-text-primary tabular-nums sm:text-7xl">
            {formatNumber(height)}
          </h1>
          <p className="mt-2 font-mono text-xl text-bitcoin">{height}.bitmap</p>

          {facts.length > 0 && (
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-xs text-text-secondary">{f.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium tabular-nums text-text-primary">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {data.chain && (
            <div className="mt-5">
              <GenomeStrip genome={data.chain.genome} />
              <p className="mt-2 font-mono text-[11px] text-text-secondary">
                block genome {data.chain.genome.slice(0, 32)}…
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={`/world/${height}`} className={pillPrimary}>
              Enter world
            </Link>
            <CopyButton text={`/block/${height}`} label="link" />
          </div>
        </div>
      </header>

      <OwnerBar onChainOwner={data.ownership.onChainOwner} registeredOwner={data.ownership.registeredOwner} />

      {data.degraded && (
        <p className="mt-8 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm text-text-secondary">
          Some data could not be loaded right now, so builds and ownership may be incomplete on this
          view. The block itself is unaffected.
        </p>
      )}

      {/* ── Deed ── */}
      <div className="mt-8">
        <DeedPanel data={data} />
      </div>

      {/* ── Tabs ── */}
      <div className="mt-10">
        <BlockTabs
          tabs={[
            { id: 'world', label: 'World', count: data.objectCount },
            { id: 'guardian', label: 'Guardian', count: guardianView.guardian ? 1 : 0 },
            { id: 'experiences', label: 'Experiences', count: data.experienceCount },
            { id: 'activity', label: 'Activity' },
          ]}
          panels={{
            world: <WorldPanel data={data} />,
            guardian: <GuardianPanel height={height} view={guardianView} />,
            experiences: <ExperiencesPanel data={data} />,
            activity: <ActivityPanel data={data} mined={mined} />,
          }}
        />
      </div>
    </main>
  );
}
