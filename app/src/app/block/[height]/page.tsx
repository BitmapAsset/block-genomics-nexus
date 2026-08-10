import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { NEXUS_PATH, applyBlockParam, parseBlockParam } from '@/lib/blockDeepLink';
import { fetchBlockOgSummary } from '@/lib/blockOgData';
import { EPOCH_LABELS, getEpochIndex } from '@/lib/bitmapStandard';
import { formatBytes, formatNumber } from '@/lib/genome-utils';
import RedirectToNexus from './redirect-to-nexus';

/**
 * Canonical shareable URL for a block. This is what gets pasted into X, so the
 * page's whole job is to carry a rich card and then get out of the way.
 */

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

  const summary = await fetchBlockOgSummary(height);
  const epoch = EPOCH_LABELS[getEpochIndex(height)] ?? EPOCH_LABELS[EPOCH_LABELS.length - 1];

  const title = `Block ${formatNumber(height)} — ${height}.bitmap | Block Genomics`;
  const description = summary
    ? `${formatNumber(summary.txCount)} transactions · ${formatBytes(summary.size)} · ${epoch.label}. Genome ${summary.genome.slice(0, 16)}… derived from the block hash. Explore this district in The Nexus.`
    : `${height}.bitmap — a 2.1km × 2.1km district of sovereign digital land in The Nexus, anchored to Bitcoin block ${formatNumber(height)}.`;

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

export default async function BlockPage({ params }: { params: Promise<{ height: string }> }) {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);
  if (height === undefined) notFound();

  const href = nexusHref(height);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <RedirectToNexus href={href} />
      <p className="text-sm tracking-[0.3em] text-text-muted">OPENING THE NEXUS</p>
      <h1 className="text-4xl font-semibold text-text-primary">{height}.bitmap</h1>
      <Link href={href} className="text-accent-cyan underline">
        Continue to block {formatNumber(height)}
      </Link>
    </section>
  );
}
