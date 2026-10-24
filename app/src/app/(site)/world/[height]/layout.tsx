import { notFound } from 'next/navigation';
import { parseBlockParam } from '@/lib/blockDeepLink';
import { isAboveTip } from '@/lib/block-summary';

/**
 * Same gate as /block/[height]/layout.tsx: a height that does not parse, or a
 * block that is not mined yet (/world/980000), is a real 404 before the world
 * renders. Without it the page answered 200 and drew an empty world. It lives
 * in the layout so it still sets a true 404 if this segment ever gains a
 * loading.tsx. Heights at or below KNOWN_MINED_HEIGHT skip the tip fetch.
 */
export default async function WorldLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ height: string }>;
}) {
  const { height: raw } = await params;
  const height = parseBlockParam(raw);
  if (height === undefined) notFound();
  if (await isAboveTip(height)) notFound();

  return children;
}
