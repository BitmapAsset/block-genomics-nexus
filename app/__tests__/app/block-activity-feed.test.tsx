/**
 * The block page's Activity tab (Living Block L1, gap G5): real `bg-event/1`
 * events with time and proof links when the event store answers; exactly
 * today's build list otherwise (flag off, migration not applied, no events yet,
 * or a read error).
 */

import { renderToStaticMarkup } from 'react-dom/server';

const mockListBlockEvents = jest.fn();
jest.mock('@/lib/block-events', () => ({
  listBlockEvents: (...a: unknown[]) => mockListBlockEvents(...a),
}));

jest.mock('@/lib/block-summary', () => ({ getTipHeight: async () => 972_600, isAboveTip: async () => false }));

const mockFetchBlockPageData = jest.fn();
jest.mock('@/lib/blockPageData', () => ({
  ...jest.requireActual('@/lib/blockPageData'),
  fetchBlockPageData: (...a: unknown[]) => mockFetchBlockPageData(...(a as [])),
}));
jest.mock('@/lib/blockGuardian', () => ({ fetchBlockGuardian: async () => ({ guardian: null }) }));

// Client islands. The tab strip renders only the Activity panel, so the test
// reads exactly what that tab shows.
jest.mock('@/app/(site)/block/[height]/copy-button', () => () => null);
jest.mock('@/app/(site)/block/[height]/owner-bar', () => () => null);
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => () => null);
jest.mock('@/app/(site)/block/[height]/block-tabs', () => (p: { panels: Record<string, unknown> }) => p.panels.activity);

import BlockPage from '@/app/(site)/block/[height]/page';
import ActivityFeed, { relativeTime } from '@/app/(site)/block/[height]/activity-feed';
import type { PublicBlockEvent } from '@/lib/block-event-core';

const HEIGHT = 840000;
const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

function event(seq: number, over: Partial<PublicBlockEvent> = {}): PublicBlockEvent {
  const id = `01JB7Z8K2Q4X9M3T6V0R5N1C${String(seq).padStart(2, '0')}`;
  return {
    format: 'bg-event/1',
    id,
    block: HEIGHT,
    seq,
    kind: 'build.placed',
    actor: { type: 'owner', id: 'bc1pexampleholder0000000000000000000000008978', handle: null },
    signer: { scheme: 'bip322', address: 'bc1pexampleholder0000000000000000000000008978' },
    summary: `Placed object ${seq}`,
    payloadHash: 'sha256:' + 'a'.repeat(64),
    prev: 'sha256:' + 'b'.repeat(64),
    hash: 'sha256:' + 'c'.repeat(64),
    ts: new Date(NOW - seq * 60_000).toISOString(),
    proof: { url: `/api/v1/blocks/${HEIGHT}/events/${id}/proof` },
    ...over,
  };
}

const pageData = {
  height: HEIGHT,
  claimed: true,
  label: null,
  ownership: { onChainOwner: null, registeredOwner: null, inscriptionId: null, inSync: false, indeterminate: true, checkPending: false },
  objects: [{ id: 'o1', objectType: 'lantern', name: 'Old Lantern', createdAt: '2026-10-01T00:00:00.000Z', creator: { address: 'bc1pbuilder', handle: null, displayName: null } }],
  objectCount: 1,
  parcels: [],
  parcelCount: 0,
  experiences: [],
  experienceCount: 0,
  chain: null,
  market: null,
  degraded: false,
};

const render = async () => renderToStaticMarkup(await BlockPage({ params: Promise.resolve({ height: String(HEIGHT) }) }));

beforeEach(() => {
  mockListBlockEvents.mockReset();
  mockFetchBlockPageData.mockReset();
  mockFetchBlockPageData.mockResolvedValue(pageData);
});

describe('ActivityFeed', () => {
  it('lists newest first with actor, relative time (absolute on hover) and a proof link', () => {
    const html = renderToStaticMarkup(
      <ActivityFeed
        now={NOW}
        events={[
          event(1),
          event(2, { kind: 'deed.moved', summary: 'The deed moved to a new holder', actor: { type: 'system', id: null, handle: null } }),
          event(3, { kind: 'build.changed', actor: { type: 'owner-session', id: 'bc1pexampleholder0000000000000000000000008978', handle: null } }),
        ]}
      />,
    );
    expect(html.indexOf('Placed object 3')).toBeLessThan(html.indexOf('The deed moved'));
    expect(html.indexOf('The deed moved')).toBeLessThan(html.indexOf('Placed object 1'));
    expect(html).toContain('deed holder bc1pex…8978');
    expect(html).toContain('via bc1pex…8978&#x27;s session');
    expect(html).toContain('Block Genomics');
    expect(html).toContain(`href="/api/v1/blocks/${HEIGHT}/events/${event(1).id}/proof"`);
    expect(html).toContain('proof ↗');
    expect(html).toContain('1 min ago');
    expect(html.toLowerCase()).toContain(`datetime="${event(1).ts.toLowerCase()}"`);
  });

  it('relative time', () => {
    expect(relativeTime(new Date(NOW - 10_000).toISOString(), NOW)).toBe('just now');
    expect(relativeTime(new Date(NOW - 12 * 60_000).toISOString(), NOW)).toBe('12 min ago');
    expect(relativeTime(new Date(NOW - 5 * 3600_000).toISOString(), NOW)).toBe('5 h ago');
    expect(relativeTime(new Date(NOW - 9 * 86400_000).toISOString(), NOW)).toBe('Oct 14, 2026');
  });
});

describe('the Activity tab on /block/[height]', () => {
  it('reads the latest 30 events and shows them instead of the build list', async () => {
    mockListBlockEvents.mockResolvedValue({ format: 'bg-event/1', enabled: true, block: HEIGHT, events: [event(1), event(2)], lastSeq: 2, hasMore: false });
    const html = await render();
    expect(mockListBlockEvents).toHaveBeenCalledWith(HEIGHT, { limit: 30 });
    expect(html).toContain('>Activity<');
    expect(html).toContain('Placed object 2');
    expect(html).toContain('proof ↗');
    expect(html).not.toContain('Old Lantern');
  });

  it.each([
    ['flag off / table missing', { format: 'bg-event/1', enabled: false, events: [] }],
    ['no events yet', { format: 'bg-event/1', enabled: true, block: HEIGHT, events: [], lastSeq: 0, hasMore: false }],
  ])('%s → exactly today’s build list', async (_label, page) => {
    mockListBlockEvents.mockResolvedValue(page);
    const html = await render();
    expect(html).toContain('>Builds<');
    expect(html).toContain('Old Lantern');
    expect(html).not.toContain('proof ↗');
  });

  it('a failing event read never takes the page down', async () => {
    mockListBlockEvents.mockRejectedValue(new Error('db down'));
    const html = await render();
    expect(html).toContain('Old Lantern');
  });
});
