import Link from 'next/link';
import { Eye, Map as MapIcon, Navigation } from 'lucide-react';
import type { BlockPageData } from '@/lib/blockPageData';
import { epochLabelFor } from '@/lib/bitmapStandard';
import { bitmapThumbnailUrl } from '@/lib/bitmap-layout';
import { formatNumber } from '@/lib/genome-utils';
import Chip, { type ChipTone } from '@/components/ui/chip';
import { primaryButton } from '@/components/ui/button';
import BlockArt from './block-art';
import DeedRecheck from './deed-recheck';
import ShareMenu from './share-menu';
import type { DeedStatus } from './deed-status';
import { deedChipView, guardianChipView, identityFacts, scaleChipText } from './hero-chips';

/**
 * The block page's hero (bg98a item 4): the artwork, who and what this block
 * is, its deed and guardian chips, and the page's one main action, Enter the
 * block (the only element with `data-primary`), with Share beside it.
 *
 * The art comes first in the markup (it leads on a phone); from 1200 px the
 * grid puts it on the right of the text.
 */
export default function Hero({
  data,
  status,
  guardian,
  guardianDegraded,
  now,
}: {
  data: BlockPageData;
  status: DeedStatus | null;
  /** The guardian shown on the card, with its display state; null when there is none. */
  guardian: { name: string; label: string; tone: ChipTone; key: string } | null;
  guardianDegraded: boolean;
  now: number;
}) {
  const { height } = data;
  const epoch = epochLabelFor(height);
  const deed = deedChipView(data.ownership, status, data.degraded, now);
  const guardianChip = guardianChipView(guardian, guardianDegraded);
  const facts = identityFacts(data.chain, data.objectCount);

  return (
    <section
      className="mt-4 grid gap-6 md:rounded-[28px] md:border md:border-line-1 md:bg-gradient-to-br md:from-white/[0.035] md:to-transparent md:p-10 min-[1200px]:grid-cols-[minmax(0,1fr)_576px] min-[1200px]:items-center min-[1200px]:gap-10"
      data-testid="block-hero"
    >
      <div className="-mx-4 md:mx-auto md:w-full md:max-w-[576px] min-[1200px]:col-start-2 min-[1200px]:row-start-1">
        <BlockArt src={bitmapThumbnailUrl(height)} alt={`${height}.bitmap, the block's artwork`}>
          {data.chain && (
            <span
              className="inline-flex min-h-[26px] items-center gap-1.5 rounded-full border border-line-2 bg-bg-primary/80 px-2.5 text-[12px] text-text-1 tabular-nums backdrop-blur"
              data-testid="hero-scale-chip"
            >
              <MapIcon size={13} strokeWidth={1.75} aria-hidden="true" />
              {scaleChipText(data.chain.txCount)}
            </span>
          )}
        </BlockArt>
      </div>

      <div className="min-w-0 min-[1200px]:col-start-1 min-[1200px]:row-start-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-2 md:text-[12px]" data-testid="hero-eyebrow">
          {`Bitcoin block · ${epoch.label}, ${epoch.sub}${data.label ? ` · ${data.label}` : ''}`}
        </p>
        <h1 className="mt-3 text-[60px] font-bold leading-[0.95] tracking-[-0.045em] text-text-1 tabular-nums md:text-[96px]">
          {formatNumber(height)}
        </h1>
        <p className="mt-3 font-mono text-[17px] text-bitcoin md:text-[20px]">{height}.bitmap</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Chip tone={deed.tone} chip="deed" state={deed.state} testId="deed-chip">
            {deed.text}
          </Chip>
          {guardianChip && (
            <Chip tone={guardianChip.tone} chip="guardian" state={guardianChip.state} testId="guardian-chip">
              {guardianChip.text}
            </Chip>
          )}
        </div>
        {deed.line && <p className="mt-2 text-[14px] text-text-2">{deed.line}</p>}
        <DeedRecheck pending={data.ownership.checkPending} />

        {facts.length > 0 && (
          <p className="mt-4 text-[14.5px] text-text-2 tabular-nums" data-testid="hero-facts">
            {facts.join(' · ')}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href={`/world/${height}`} className={primaryButton} data-primary="">
            <Navigation size={18} strokeWidth={1.75} aria-hidden="true" />
            Enter the block
          </Link>
          <ShareMenu height={height} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-text-3">
          <Eye size={15} strokeWidth={1.75} aria-hidden="true" />
          Opens the block in 3D.
        </p>
      </div>
    </section>
  );
}
