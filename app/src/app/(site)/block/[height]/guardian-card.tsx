import Link from 'next/link';
import { ArrowUpRight, Bot, SlidersHorizontal } from 'lucide-react';
import {
  guardianCardState,
  guardianDisplayState,
  guardianRegistration,
  type BlockGuardianView,
} from '@/lib/blockGuardian';
import { shortenAddress } from '@/lib/blockPageData';
import type { PublicBlockEvent } from '@/lib/block-event-core';
import { formatNumber } from '@/lib/genome-utils';
import Card from '@/components/ui/card';
import Chip from '@/components/ui/chip';
import { secondaryButton } from '@/components/ui/button';
import { relativeTime } from './activity-feed';
import type { DeedStateKey } from './deed-status';
import { GuardianAction, GuardianHoldPrompt } from './guardian-action';

/**
 * The guardian card on the block page (Living Block bg95, visitor view bg98a).
 *
 * Says only what the record shows. The state comes from `guardianCardState`
 * (lib/blockGuardian), which names the server's own `guardianLiveState`, so the
 * card and the feed's `guardian.status` rows agree; `guardianDisplayState`
 * changes only the self-hosted case while the deed can't be checked. "Registered
 * <date> by <wallet>" is a dated fact from this guardian's own
 * `guardian.registered` event, never a claim about today's holder, and the LAST
 * line appears only when the guardian has an event among the ones the page
 * already read.
 *
 * One action, and only for an active guardian (the chat route answers for active
 * guardians only): Talk when a model is set up, else Leave a message.
 *
 * Reads the public summary only (lib/blockGuardian): no owner column, no
 * visitor count.
 *
 * `holder` (bg98a2) is the connected holder's variant, chosen on the client by
 * HolderSwitch: "Your guardian" with Manage <name> first (to the world view,
 * where the guardian is set up), the message count said as all time, and an
 * empty card that offers to set one up. The degraded card has no holder
 * variant. The one heading each variant can take focus on a swap carries
 * `data-swap-focus`.
 */

const worldNote = <p className="mt-2 text-[12.5px] text-text-3">Opens in the world view.</p>;

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' });
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line-1 py-2.5 first:border-t-0">
      <dt className="text-[14px] text-text-2">{label}</dt>
      <dd className="text-right text-[14px] text-text-1 tabular-nums">{children}</dd>
    </div>
  );
}

const icon = <Bot size={15} strokeWidth={1.75} aria-hidden="true" />;

export default function GuardianCard({
  height,
  view,
  events,
  now,
  deedKey = null,
  holder = false,
}: {
  height: number;
  view: BlockGuardianView;
  /** The events the page already read (newest last), or null when there are none. */
  events: PublicBlockEvent[] | null;
  now: number;
  /** The deed state on this page, or null for an unclaimed block. */
  deedKey?: DeedStateKey | null;
  /** The connected holder's variant. */
  holder?: boolean;
}) {
  const caption = holder ? 'Your guardian' : 'Guardian';
  if (view.degraded) {
    return (
      <Card caption="Guardian" icon={icon} testId="guardian-card">
        <p className="mt-3 text-[14px] leading-[1.55] text-text-2">
          Guardian details couldn&apos;t be loaded right now. This doesn&apos;t mean the block has none.
        </p>
      </Card>
    );
  }

  if (!view.guardian && holder) {
    return (
      <Card
        caption={caption}
        icon={icon}
        testId="guardian-card"
        chip={
          <Chip tone="neutral" small>
            None yet
          </Chip>
        }
      >
        <h3 tabIndex={-1} data-swap-focus className="mt-3 text-[19px] font-semibold tracking-[-0.012em] text-text-1">
          {`Give ${formatNumber(height)} a guardian`}
        </h3>
        <p className="mt-1 text-[14px] text-text-2">Your own AI agent, on your block.</p>
        <p className="mt-3 text-[14px] leading-[1.55] text-text-2">It looks after the block, builds on it and answers visitors.</p>
        <div className="mt-auto pt-4">
          <Link href={`/world/${height}`} className={secondaryButton} data-testid="guardian-holder-setup">
            Set up a guardian
          </Link>
          {worldNote}
        </div>
      </Card>
    );
  }

  if (!view.guardian) {
    return (
      <Card
        caption="Guardian"
        icon={icon}
        testId="guardian-card"
        chip={
          <Chip tone="neutral" small>
            None yet
          </Chip>
        }
      >
        <h3 tabIndex={-1} data-swap-focus className="mt-3 text-[19px] font-semibold tracking-[-0.012em] text-text-1">No guardian yet</h3>
        <p className="mt-1 text-[14px] text-text-2">This block has no AI agent yet.</p>
        <p className="mt-3 text-[14px] leading-[1.55] text-text-2">
          {`A guardian is an AI agent that looks after a block: builds things on it and answers visitors' messages. Only the wallet that holds ${height}.bitmap can set one up.`}
        </p>
        <div className="mt-auto pt-4">
          <GuardianHoldPrompt height={height} />
        </div>
      </Card>
    );
  }

  const g = view.guardian;
  const state = guardianDisplayState(guardianCardState(g, now), deedKey, g, now);
  const list = events ?? [];
  const registered = guardianRegistration(g, list);
  const last = [...list].filter((e) => e.actor.type === 'guardian').sort((a, b) => b.seq - a.seq)[0] ?? null;
  const active = (g.status ?? 'active') === 'active';

  return (
    <Card
      caption={caption}
      icon={icon}
      testId="guardian-card"
      chip={
        <Chip tone={state.tone} chip="guardian-card" state={state.key} testId="guardian-state" small>
          {state.label}
        </Chip>
      }
    >
      <h3 tabIndex={-1} data-swap-focus className="mt-3 break-words text-[19px] font-semibold tracking-[-0.012em] text-text-1">
        {g.name}
      </h3>
      {registered && (
        <p className="mt-1 text-[12.5px] text-text-3" data-testid="guardian-registered" title={new Date(registered.at).toUTCString()}>
          {`Registered ${day(registered.at)}${registered.by ? ` by ${shortenAddress(registered.by)}` : ''}`}
        </p>
      )}

      {state.note && <p className="mt-3 text-[14px] leading-[1.55] text-warn-text" data-testid="guardian-note">{state.note}</p>}

      <dl className="mt-3">
        <Row label="Runs on">{g.selfHosted ? "The holder's own server" : 'Block Genomics, for the holder'}</Row>
        {g.selfHosted && <Row label="Last heartbeat">{g.lastHeartbeat ? relativeTime(g.lastHeartbeat, now) : 'none yet'}</Row>}
        <Row label={holder ? 'Visitor messages · all time' : 'Messages'}>{formatNumber(g.totalMessages)}</Row>
        {g.lastChatAt && <Row label="Last chat">{relativeTime(g.lastChatAt, now)}</Row>}
        {g.createdAt && <Row label="Since">{monthYear(g.createdAt)}</Row>}
      </dl>

      {last && (
        <p className="mt-3 text-[14px] text-text-1" data-testid="guardian-last">
          <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-2">Last</span>
          {last.summary}{' '}
          <span className="text-[12.5px] text-text-3">
            ·{' '}
            <time dateTime={last.ts} title={new Date(last.ts).toUTCString()}>
              {relativeTime(last.ts, now)}
            </time>{' '}
            ·{' '}
            <a href={last.proof.url} rel="nofollow" className="inline-flex min-h-[44px] items-center gap-0.5 text-accent-cyan hover:underline">
              proof
              <ArrowUpRight size={13} strokeWidth={1.75} aria-hidden="true" />
            </a>
          </span>
        </p>
      )}

      {holder ? (
        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/world/${height}`} className={secondaryButton} data-testid="guardian-manage">
              <SlidersHorizontal size={17} strokeWidth={1.75} aria-hidden="true" />
              {`Manage ${g.name}`}
            </Link>
            {active && <GuardianAction height={height} name={g.name} mode={g.llmConfigured ? 'talk' : 'message'} />}
          </div>
          <p className="mt-2 text-[12.5px] text-text-3">{`Manage ${g.name} opens in the world view.`}</p>
          {active ? (
            <p className="mt-1 text-[12.5px] text-text-3">Keep private details to yourself.</p>
          ) : (
            <p className="mt-2 text-[14px] text-text-2" data-testid="guardian-not-taking">{`${g.name} isn't taking messages right now.`}</p>
          )}
        </div>
      ) : (
      <div className="mt-auto pt-4">
        {active ? (
          <>
            <GuardianAction height={height} name={g.name} mode={g.llmConfigured ? 'talk' : 'message'} />
            <p className="mt-2 text-[12.5px] text-text-3">Keep private details to yourself.</p>
          </>
        ) : (
          <p className="text-[14px] text-text-2" data-testid="guardian-not-taking">{`${g.name} isn't taking messages right now.`}</p>
        )}
      </div>
      )}
    </Card>
  );
}
