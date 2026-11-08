import Link from 'next/link';
import { Box, Map as MapIcon, Navigation } from 'lucide-react';
import { NEXUS_PATH, applyBlockParam } from '@/lib/blockDeepLink';
import type { BlockPageData } from '@/lib/blockPageData';
import { formatNumber } from '@/lib/genome-utils';
import Card from '@/components/ui/card';
import Chip from '@/components/ui/chip';
import { secondaryButton } from '@/components/ui/button';
import { relativeTime } from './activity-feed';
import { groundText, parcelsText } from './hero-chips';

export function nexusHref(height: number): string {
  return `${NEXUS_PATH}${applyBlockParam('', height)}`;
}

/**
 * The Build card: what stands on the block and its newest change, or the
 * ground as mined (one parcel per transaction). Walk the block here is the
 * secondary style: the hero holds the page's one main action.
 */
export default function BuildCard({ data, now }: { data: BlockPageData; now: number }) {
  const { height } = data;
  const newest = [...data.objects].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const n = data.objectCount;

  return (
    <Card
      caption="Build"
      icon={<Box size={15} strokeWidth={1.75} aria-hidden="true" />}
      chip={
        n === 0 ? (
          <Chip tone="neutral" small>
            As mined
          </Chip>
        ) : null
      }
      testId="build-card"
    >
      {n > 0 ? (
        <>
          <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.012em] text-text-1">
            {`${formatNumber(n)} ${n === 1 ? 'thing' : 'things'} built`}
          </h3>
          {newest && (
            <p className="mt-2 text-[14px] text-text-2" data-testid="build-last">
              {'Last change · '}
              <span className="text-text-1">{newest.name || 'Untitled'}</span>
              {` · ${relativeTime(newest.createdAt, now)}`}
            </p>
          )}
        </>
      ) : data.chain ? (
        <>
          <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.012em] text-text-1">Nothing built yet</h3>
          <p className="mt-2 text-[14px] leading-[1.55] text-text-2" data-testid="build-empty">
            {`The ground is laid out from the block's own ${formatNumber(data.chain.txCount)} transactions: one parcel each, bigger transactions, bigger parcels.`}
          </p>
          <dl className="mt-3">
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[14px] text-text-2">Ground</dt>
              <dd className="text-[14px] text-text-1 tabular-nums">{groundText()}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-line-1 py-2.5">
              <dt className="text-[14px] text-text-2">Parcels</dt>
              <dd className="text-[14px] text-text-1 tabular-nums">{parcelsText(data.chain.txCount)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.012em] text-text-1" data-testid="build-empty">
          Nothing built here yet.
        </h3>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
        <Link href={`/world/${height}`} className={secondaryButton} data-testid="build-enter">
          <Navigation size={17} strokeWidth={1.75} aria-hidden="true" />
          Walk the block
        </Link>
        <Link href={nexusHref(height)} className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] text-accent-cyan hover:underline" data-testid="build-map">
          <MapIcon size={15} strokeWidth={1.75} aria-hidden="true" />
          See it on the map
        </Link>
      </div>
    </Card>
  );
}
