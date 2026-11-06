import { ArrowUpRight, CloudOff, ShieldCheck } from 'lucide-react';
import { displayOwner, shortenAddress, type BlockPageData } from '@/lib/blockPageData';
import { formatBytes } from '@/lib/genome-utils';
import Card from '@/components/ui/card';
import Chip from '@/components/ui/chip';
import Callout from '@/components/ui/callout';
import CopyButton from './copy-button';
import type { DeedStatus } from './deed-status';
import { parcelsText } from './hero-chips';

/**
 * The Deed card: who holds the deed, how sure the page is, and the inscription.
 *
 * Three states kept distinct on purpose: verified against the chain, on record
 * but not verifiable right now, and not registered on Block Genomics. The last
 * one says nothing about who holds the `.bitmap` on Bitcoin: this registry is
 * not the chain. The outage callout appears only when Bitcoin cannot be
 * checked (`unreachable`), never for a disputed deed, and its date only when
 * this server has a last verified time.
 */

/** "Oct 31", UTC: rendered on the server, one zone for every reader. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line-1 py-2.5 first:border-t-0">
      <dt className="text-[14px] text-text-2">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-right text-[14px] text-text-1 tabular-nums">{children}</dd>
    </div>
  );
}

const icon = <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />;
const linkCls = 'inline-flex min-h-[44px] items-center gap-1 text-[14px] text-accent-cyan hover:underline';

export default function DeedCard({ data, status }: { data: BlockPageData; status: DeedStatus | null }) {
  const { ownership, height } = data;
  const owner = displayOwner(ownership);

  if (!owner || !status) {
    return (
      <Card caption="Deed" icon={icon} testId="deed-card">
        <p className="mt-3 font-mono text-[16px] text-text-1">{height}.bitmap</p>
        <p className="mt-3 text-[15px] font-semibold text-text-1">{data.degraded ? 'Ownership unavailable' : 'Not yet on Block Genomics'}</p>
        <p className="mt-1 text-[14px] leading-[1.55] text-text-2">
          {data.degraded
            ? 'The ownership record could not be reached. This does not mean the block is unowned.'
            : `Nobody has verified ${height}.bitmap on Block Genomics yet. That says nothing about who holds it on Bitcoin.`}
        </p>
      </Card>
    );
  }

  const outage = status.key === 'unreachable';
  const lastVerifiedAt = ownership.availability?.lastVerifiedAt ?? null;
  const verifiedGreen = status.key === 'verified' && ownership.inSync === true;
  const chip = verifiedGreen ? (
    <Chip tone="ok" chip="deed" state={status.key} small>
      Verified
    </Chip>
  ) : outage || status.key === 'disputed' ? (
    <Chip tone="warn" chip="deed" state={status.key} small>
      {outage ? 'Not checked' : 'Disputed'}
    </Chip>
  ) : null;

  const canonicalId = ownership.deed?.canonicalId ?? null;
  const storedId = ownership.inscriptionId;
  const inscription = canonicalId
    ? { id: canonicalId, label: 'First valid inscription' }
    : storedId
      ? { id: storedId, label: 'Inscription on record' }
      : null;

  return (
    <Card caption="Deed" icon={icon} chip={chip} testId="deed-card">
      <p className="mt-3 font-mono text-[16px] text-text-1">{height}.bitmap</p>
      <p className="mt-2 text-[12.5px] font-medium uppercase tracking-[0.12em] text-text-3">
        {status.key === 'verified' || status.key === 'registry-behind' ? 'Holder on Bitcoin' : 'Last recorded holder'}
      </p>

      <dl className="mt-1">
        <Row label="Held by">
          <span className="truncate font-mono" title={owner} data-testid="deed-holder">
            {shortenAddress(owner)}
          </span>
          <CopyButton
            text={owner}
            label="address"
            iconOnly
            className="-my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-surface-3 hover:text-text-1"
          />
        </Row>
        {data.chain && <Row label="Size">{formatBytes(data.chain.size)}</Row>}
        {data.chain && <Row label="Parcels">{parcelsText(data.chain.txCount)}</Row>}
      </dl>

      {outage ? (
        <>
          <p className="mt-3 text-[14px] text-text-2" data-testid="deed-status-line">{status.badge}</p>
          <Callout
            tone="warn"
            icon={<CloudOff size={16} strokeWidth={1.75} aria-hidden="true" />}
            title="We can't check the deed on Bitcoin right now."
            testId="deed-outage"
            className="mt-3"
          >
            {lastVerifiedAt ? `Last check ${shortDate(lastVerifiedAt)}. ` : ''}
            This is the last holder we confirmed; it says nothing about a change of hands. Reload later to check again.
          </Callout>
        </>
      ) : (
        <p className="mt-3 text-[14px] leading-[1.55] text-text-2" data-testid="deed-status-line">{status.detail}</p>
      )}

      {inscription && (
        <div className="mt-auto pt-3">
          <a
            href={`https://ordinals.com/inscription/${inscription.id}`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={linkCls}
            data-testid="deed-inscription"
          >
            {inscription.label}
            <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
            {outage && <span className="text-text-3">(may be out of date)</span>}
          </a>
        </div>
      )}
    </Card>
  );
}
