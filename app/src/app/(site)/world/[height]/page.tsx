import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseBlockParam } from '@/lib/blockDeepLink';
import WorldClient from './world-client';

/**
 * The world of one block, fullscreen.
 *
 * Same engine as before (ParcelView); this route only gives it the whole
 * viewport and a way back to the block page. `/nexus/parcel/{h}` redirects
 * here so there is one URL per world.
 */
export async function generateMetadata({ params }: { params: Promise<{ height: string }> }): Promise<Metadata> {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);
  if (height === undefined) notFound();
  return {
    title: `World — ${height}.bitmap | Block Genomics`,
    description: `Walk through the world built on Bitcoin block ${height.toLocaleString('en-US')}.`,
    alternates: { canonical: `/world/${height}` },
    // A fullscreen 3D canvas with no text to index; the block page at
    // /block/{height} is the indexable page for the same block.
    robots: { index: false, follow: true },
  };
}

export default async function WorldPage({ params }: { params: Promise<{ height: string }> }) {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);
  if (height === undefined) notFound();

  return <WorldClient blockHeight={height} />;
}
