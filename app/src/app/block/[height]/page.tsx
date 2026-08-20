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
import { EPOCH_LABELS, getEpochColor, getEpochIndex } from '@/lib/bitmapStandard';
import { formatBytes, formatNumber, hexPairToColor } from '@/lib/genome-utils';
import CopyButton from './copy-button';

/**
 * The public page for a single bitmap block — the canonical URL people paste
 * into X, Telegram and Discord.
 *
 * Rendered per request rather than statically: the headline fact on the page is
 * who holds the deed *right now*, which is a live indexer answer. That also
 * keeps the build free of any database or network dependency.
 */
export const dynamic = 'force-dynamic';

/**
 * One fetch per request, shared by `generateMetadata` and the component.
 * Without this the ownership lookup would run twice for every crawler hit.
 */
const getBlockData = cache(async (height: number): Promise<BlockPageData> => {
  return fetchBlockPageData(height);
});

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

  const data = await getBlockData(height);
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
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted">
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
    <section className="mt-14">
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-sm tabular-nums text-text-muted">{formatNumber(count)}</span>
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
      <p className="text-sm text-text-muted">{children}</p>
    </div>
  );
}

function CreatorTag({ creator, prefix }: { creator: Creator; prefix: string }) {
  const label = creatorLabel(creator);
  const inner = <span className="text-text-secondary">{label}</span>;

  return (
    <span className="text-xs text-text-muted">
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
 * on record but not verifiable this request, and genuinely unclaimed. Collapsing
 * "we could not reach the indexer" into "unowned" would be a lie about property.
 */
function DeedPanel({ data }: { data: BlockPageData }) {
  const { ownership } = data;
  const owner = displayOwner(ownership);

  if (!owner) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted">
          Deed
        </div>
        <p className="mt-2 text-base text-text-primary">
          {data.degraded ? 'Ownership unavailable' : 'Unclaimed'}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {data.degraded
            ? 'The ownership record could not be reached. This does not mean the block is unowned.'
            : `No one has inscribed ${data.height}.bitmap in this registry yet. The district exists — it is simply empty.`}
        </p>
      </div>
    );
  }

  const verified = ownership.inSync;
  const chainMoved = !ownership.indeterminate && !ownership.inSync && ownership.onChainOwner !== null;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted">
          Deed
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-medium"
          style={
            verified
              ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e' }
              : { background: 'rgba(100,116,139,0.12)', color: '#94a3b8' }
          }
        >
          {verified ? 'Verified on-chain' : ownership.checkPending ? 'Checking' : 'Unverified'}
        </span>
      </div>

      <p className="mt-3 break-all font-mono text-base text-text-primary">{owner}</p>

      <p className="mt-2 text-sm text-text-muted">
        {verified
          ? 'Current holder of the .bitmap inscription. Whoever holds the deed controls everything standing on this block.'
          : chainMoved
            ? 'Live holder per the ordinals indexer. This registry still lists a previous owner and has not caught up yet.'
            : ownership.checkPending
              ? 'Last recorded holder. The live chain check is still running — reload in a moment to see it confirmed.'
              : 'Last recorded holder. The ordinals indexer could not be reached, so this is not confirmed against the chain right now.'}
      </p>

      {ownership.inscriptionId && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted">
            Inscription
          </div>
          <p className="mt-1 break-all font-mono text-xs text-text-secondary">
            {ownership.inscriptionId}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default async function BlockPage({ params }: { params: Promise<{ height: string }> }) {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);
  if (height === undefined) notFound();

  const data = await getBlockData(height);
  const epoch = epochFor(height);
  const epochColor = getEpochColor(height);
  const href = nexusHref(height);

  const mined = data.chain
    ? new Date(data.chain.timestamp * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={NEXUS_PATH}
        className="text-xs text-text-muted transition-colors hover:text-accent-cyan"
      >
        ← The Nexus
      </Link>

      {/* ── Hero ── */}
      <header className="mt-8">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border px-3 py-1 text-[11px] font-medium"
            style={{ borderColor: epochColor, color: epochColor }}
          >
            {epoch.label} · {epoch.sub}
          </span>
          {data.label && (
            <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-text-secondary">
              {data.label}
            </span>
          )}
        </div>

        <p className="mt-7 text-[11px] font-medium uppercase tracking-[0.28em] text-text-muted">
          Bitcoin Block
        </p>
        <h1 className="mt-1 text-6xl font-semibold tracking-[-0.03em] text-text-primary tabular-nums sm:text-7xl">
          {formatNumber(height)}
        </h1>
        <p className="mt-2 font-mono text-xl text-bitcoin">{height}.bitmap</p>

        {data.chain && (
          <div className="mt-7">
            <GenomeStrip genome={data.chain.genome} />
            <p className="mt-2 font-mono text-[11px] text-text-muted">
              genome {data.chain.genome.slice(0, 32)}…
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={href}
            className="rounded-xl bg-bitcoin px-5 py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110"
          >
            Open in The Nexus
          </Link>
          <CopyButton text={`/block/${height}`} label="link" />
        </div>
      </header>

      {data.degraded && (
        <p className="mt-8 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs text-text-muted">
          Some data could not be loaded right now, so builds and ownership may be incomplete on this
          view. The block itself is unaffected.
        </p>
      )}

      {/* ── Deed ── */}
      <div className="mt-10">
        <DeedPanel data={data} />
      </div>

      {/* ── Stats ── */}
      <Section title="Block stats">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label="Transactions"
            value={data.chain ? formatNumber(data.chain.txCount) : '—'}
          />
          <Stat label="Size" value={data.chain ? formatBytes(data.chain.size) : '—'} />
          <Stat label="Mined" value={mined ?? '—'} />
          <Stat label="Objects" value={formatNumber(data.objectCount)} />
          <Stat label="Parcels" value={formatNumber(data.parcelCount)} />
          <Stat label="Experiences" value={formatNumber(data.experienceCount)} />
        </div>
        {data.chain && (
          <p className="mt-3 break-all font-mono text-[11px] text-text-muted">
            {data.chain.hash}
          </p>
        )}
      </Section>

      {/* ── Objects ── */}
      <Section title="Built on this block" count={data.objectCount}>
        {data.objects.length === 0 ? (
          <Empty>
            Nothing has been built here yet. Whoever holds the deed can place the first object.
          </Empty>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.objects.map((o) => (
                <li
                  key={o.id}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {o.name || 'Untitled'}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-text-muted">
                      {o.objectType}
                    </span>
                  </div>
                  <div className="mt-2">
                    <CreatorTag creator={o.creator} prefix="Built by" />
                  </div>
                </li>
              ))}
            </ul>
            {data.objectCount > data.objects.length && (
              <p className="mt-4 text-xs text-text-muted">
                Showing {data.objects.length} of {formatNumber(data.objectCount)}.{' '}
                <Link href={href} className="text-accent-cyan hover:underline">
                  See them all in The Nexus
                </Link>
                .
              </p>
            )}
            <p className="mt-4 text-xs text-text-muted">
              Attribution is permanent: it records who built each object, not who owns the block
              today.
            </p>
          </>
        )}
      </Section>

      {/* ── Parcels ── */}
      {data.parcelCount > 0 && (
        <Section title="Parcels" count={data.parcelCount}>
          <ul className="flex flex-wrap gap-2">
            {data.parcels.map((p) => (
              <li
                key={p.txIndex}
                className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2"
              >
                <span className="font-mono text-xs text-text-primary">#{p.txIndex}</span>
                {p.owner && (
                  <span className="ml-2 text-[11px] text-text-muted">
                    {creatorLabel(p.owner)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {data.parcelCount > data.parcels.length && (
            <p className="mt-4 text-xs text-text-muted">
              Showing {data.parcels.length} of {formatNumber(data.parcelCount)}.
            </p>
          )}
        </Section>
      )}

      {/* ── Experiences ── */}
      <Section title="Experiences" count={data.experienceCount}>
        {data.experiences.length === 0 ? (
          <Empty>
            No experiences are registered on this block yet. Owners can publish one through the
            experience protocol.
          </Empty>
        ) : (
          <ul className="grid gap-3">
            {data.experiences.map((e) => (
              <li
                key={e.id}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-text-primary">{e.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted">
                    {e.experienceType}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px]"
                    style={
                      e.status === 'live'
                        ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e' }
                        : { background: 'rgba(100,116,139,0.12)', color: '#94a3b8' }
                    }
                  >
                    {e.status}
                  </span>
                </div>
                {e.description && (
                  <p className="mt-2 text-sm text-text-secondary">{e.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <CreatorTag creator={e.creator} prefix="Published by" />
                  <span className="font-mono text-[11px] text-text-muted">v{e.version}</span>
                  {e.parcelIndex !== null && (
                    <span className="text-[11px] text-text-muted">parcel #{e.parcelIndex}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
