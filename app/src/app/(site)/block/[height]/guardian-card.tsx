import Link from 'next/link';
import { guardianCardState, guardianRegistration, type BlockGuardianView, type GuardianCardKey } from '@/lib/blockGuardian';
import { shortenAddress } from '@/lib/blockPageData';
import type { PublicBlockEvent } from '@/lib/block-event-core';
import { formatNumber } from '@/lib/genome-utils';
import { relativeTime } from './activity-feed';

/**
 * The guardian card under the block's hero (Living Block, bg95).
 *
 * Says only what the record shows. The state comes from `guardianCardState`
 * (lib/blockGuardian), which names the server's own `guardianLiveState`, so the
 * card and the feed's `guardian.status` rows agree. "Registered <date> by
 * <wallet>" is a dated fact from this guardian's own `guardian.registered`
 * event (`guardianRegistration`), never a claim about today's holder, and the
 * LAST line appears only when the guardian has an event among the ones the page
 * already read; with the event store off, both are left out.
 *
 * Reads the public summary only (lib/blockGuardian): no owner column, no
 * visitor count.
 */

const STATE_CLASS: Record<GuardianCardKey, string> = {
  'answers-chat': 'bg-accent-cyan/10 text-accent-cyan',
  'chat-not-set-up': 'bg-surface-2 text-text-2',
  idle: 'bg-surface-2 text-text-2',
  resting: 'bg-surface-2 text-text-2',
  offline: 'bg-warn-soft text-warn-text',
  'no-heartbeat': 'bg-warn-soft text-warn-text',
};

const pill =
  'inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-5 text-sm font-medium text-text-primary transition hover:bg-white/5';

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' });
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function GuardianCard({
  height,
  view,
  events,
  now,
}: {
  height: number;
  view: BlockGuardianView;
  /** The events the page already read (newest last), or null when there are none. */
  events: PublicBlockEvent[] | null;
  now: number;
}) {
  if (view.degraded) {
    return (
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6" data-testid="guardian-card">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">Guardian</p>
        <p className="mt-2 text-sm text-text-secondary">
          Guardian details couldn&apos;t be loaded right now. This doesn&apos;t mean the block has none.
        </p>
      </section>
    );
  }

  if (!view.guardian) {
    return (
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6" data-testid="guardian-card">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">Guardian</p>
        <h2 className="mt-1 text-lg font-semibold text-text-primary">No guardian yet</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          A guardian is an AI agent that keeps a block and answers its visitors. Only the wallet that holds {height}.bitmap
          can set one up.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/world/${height}`} className={pill}>
            Set it up from the world
          </Link>
        </div>
      </section>
    );
  }

  const g = view.guardian;
  const state = guardianCardState(g, now);
  const chatHref = view.handle ? `/agent/${view.handle}?chat=1` : `/world/${height}`;
  const list = events ?? [];
  const registered = guardianRegistration(g, list);
  const last = [...list].filter((e) => e.actor.type === 'guardian').sort((a, b) => b.seq - a.seq)[0] ?? null;

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6" data-testid="guardian-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">Guardian</p>
          <h2 className="mt-1 break-words text-xl font-semibold text-text-primary">{g.name}</h2>
          {registered && (
            <p
              className="mt-1 text-xs text-text-secondary"
              data-testid="guardian-registered"
              title={new Date(registered.at).toUTCString()}
            >
              {`Registered ${day(registered.at)}${registered.by ? ` by ${shortenAddress(registered.by)}` : ''}`}
            </p>
          )}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATE_CLASS[state.key]}`}
          data-testid="guardian-state"
          data-state={state.key}
        >
          {state.label}
        </span>
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-text-secondary">Runs on</dt>
          <dd className="mt-0.5 text-text-primary">{g.selfHosted ? "The holder's own server" : 'Block Genomics'}</dd>
        </div>
        {g.selfHosted && (
          <div>
            <dt className="text-xs text-text-secondary">Last heartbeat</dt>
            <dd className="mt-0.5 text-text-primary">{g.lastHeartbeat ? relativeTime(g.lastHeartbeat, now) : 'none yet'}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-text-secondary">Messages</dt>
          <dd className="mt-0.5 tabular-nums text-text-primary">{formatNumber(g.totalMessages)}</dd>
        </div>
        {g.createdAt && (
          <div>
            <dt className="text-xs text-text-secondary">Since</dt>
            <dd className="mt-0.5 text-text-primary">{monthYear(g.createdAt)}</dd>
          </div>
        )}
      </dl>

      {last && (
        <p className="mt-4 text-sm text-text-primary" data-testid="guardian-last">
          <span className="mr-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">Last</span>
          {last.summary}{' '}
          <span className="text-xs text-text-secondary">
            ·{' '}
            <time dateTime={last.ts} title={new Date(last.ts).toUTCString()}>
              {relativeTime(last.ts, now)}
            </time>{' '}
            ·{' '}
            <a href={last.proof.url} rel="nofollow" className="inline-flex min-h-[44px] items-center hover:text-accent-cyan">
              proof ↗
            </a>
          </span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={chatHref} className={pill}>
          Talk to {g.name}
        </Link>
      </div>
    </section>
  );
}
