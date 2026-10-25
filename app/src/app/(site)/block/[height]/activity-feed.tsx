/**
 * The Activity tab's event feed (Living Block L1): the latest `bg-event/1`
 * events on this block, newest first, each with its actor, a relative time
 * (absolute on hover) and a link to its proof. Server-rendered; the live
 * channel (L2) will append to it.
 */

import type { PublicBlockEvent } from '@/lib/block-event-core';

function shortAddress(a: string): string {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function actorLabel(e: PublicBlockEvent): string {
  const id = e.actor.handle ? `@${e.actor.handle}` : e.actor.id ? shortAddress(e.actor.id) : null;
  switch (e.actor.type) {
    case 'owner':
      return id ? `deed holder ${id}` : 'the deed holder';
    case 'owner-session':
      return id ? `via ${id}'s session` : "via the holder's session";
    case 'guardian':
      return id ? `guardian ${id}` : 'the guardian';
    default:
      return 'Block Genomics';
  }
}

export function relativeTime(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function ActivityFeed({ events, now }: { events: PublicBlockEvent[]; now: number }) {
  const newestFirst = [...events].sort((a, b) => b.seq - a.seq);
  return (
    <ol className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      {newestFirst.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3" data-event-kind={e.kind}>
          <span className="text-sm text-text-primary">
            {e.summary} <span className="text-text-secondary">· {actorLabel(e)}</span>
          </span>
          <span className="text-xs text-text-secondary">
            <time dateTime={e.ts} title={new Date(e.ts).toUTCString()}>
              {relativeTime(e.ts, now)}
            </time>{' '}
            ·{' '}
            <a href={e.proof.url} className="hover:text-accent-cyan" rel="nofollow">
              proof ↗
            </a>
          </span>
        </li>
      ))}
    </ol>
  );
}
