import { notFound } from 'next/navigation';
import { parseBlockParam } from '@/lib/blockDeepLink';
import ParcelClient from './parcel-client';

/**
 * Server component purely so an unparseable height can 404 for real.
 *
 * This was previously a client component that rendered an "Invalid block
 * height" message, which meant `/nexus/parcel/abc` answered 200 — a soft 404.
 * The interactive view stays client-only; only the param check moved up.
 */
export default async function ParcelPage({ params }: { params: Promise<{ height: string }> }) {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);
  if (height === undefined) notFound();

  return <ParcelClient blockHeight={height} />;
}
