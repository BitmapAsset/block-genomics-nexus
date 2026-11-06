/**
 * The block page's Activity section (Living Block L1, gap G5): real
 * `bg-event/1` events with time and proof links when the event store answers;
 * the dark build list under "Built here" otherwise (flag off, migration not
 * applied, no events yet, or a read error). Since bg95 the section sits under
 * the guardian card, above the tabs.
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
jest.mock('@/lib/blockGuardian', () => ({ fetchBlockGuardian: async () => ({ guardian: null, handle: null, degraded: false }) }));
// The wallet context pulls in the wallet SDKs (ESM); the page's client islands only need the hook.
jest.mock('@/context/GlobalWalletContext', () => ({ useGlobalWallet: () => ({ isConnected: false, walletAddress: null }) }));
jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

// Client islands. The tab strip renders nothing, so the test reads the
// Activity section (and the rest of the page above the tabs).
jest.mock('@/app/(site)/block/[height]/copy-button', () => () => null);
jest.mock('@/app/(site)/block/[height]/owner-bar', () => () => null);
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => () => null);
jest.mock('@/app/(site)/block/[height]/block-tabs', () => () => null);

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

describe('the Activity section on /block/[height]', () => {
  it('reads the latest 30 events and shows them instead of the build list', async () => {
    mockListBlockEvents.mockResolvedValue({ format: 'bg-event/1', enabled: true, block: HEIGHT, events: [event(1), event(2)], lastSeq: 2, hasMore: false });
    const html = await render();
    expect(mockListBlockEvents).toHaveBeenCalledWith(HEIGHT, { limit: 30 });
    expect(html).toContain('>Activity<');
    expect(html).toContain('Placed object 2');
    expect(html).toContain('proof ↗');
    // Instead of the build list: the section itself no longer lists the build (the Build card still names it).
    const section = html.slice(html.indexOf('data-testid="block-activity"'));
    expect(section.slice(0, section.indexOf('</section>'))).not.toContain('Old Lantern');
  });

  it.each([
    ['flag off / table missing', { format: 'bg-event/1', enabled: false, events: [] }],
    ['no events yet', { format: 'bg-event/1', enabled: true, block: HEIGHT, events: [], lastSeq: 0, hasMore: false }],
  ])('%s → the dark build list', async (_label, page) => {
    mockListBlockEvents.mockResolvedValue(page);
    const html = await render();
    expect(html).toContain('>Activity<');
    expect(html).toContain('Built here · 1 object · last change Oct 1, 2026');
    expect(html).toContain('Old Lantern');
    expect(html).not.toContain('proof ↗');
  });

  it('a failing event read never takes the page down', async () => {
    mockListBlockEvents.mockRejectedValue(new Error('db down'));
    const html = await render();
    expect(html).toContain('Old Lantern');
  });
});

function activityOf(html: string): string {
  const start = html.indexOf('data-testid="block-activity"');
  return html.slice(start, html.indexOf('</section>', start));
}

const OFF = { format: 'bg-event/1', enabled: false, events: [] };

/** A claimed block whose deed rule could not reach Bitcoin (the `unreachable` deed state). */
const unreachable = {
  onChainOwner: null,
  registeredOwner: 'bc1pexampleholder0000000000000000000000008978',
  inscriptionId: 'storedidfortest0i0',
  inSync: false,
  indeterminate: true,
  checkPending: false,
  deed: { verdict: 'undetermined', canonicalId: null, checkedAt: null, unreachableSince: null },
};

describe('the Activity header and states (bg98a)', () => {
  it('events on: "Newest first · signed events carry a proof"', async () => {
    mockListBlockEvents.mockResolvedValue({ format: 'bg-event/1', enabled: true, block: HEIGHT, events: [event(1)], lastSeq: 1, hasMore: false });
    const html = activityOf(await render());
    expect(html).toContain('Newest first · signed events carry a proof');
  });

  it('flag off with builds: no proof line in the header', async () => {
    mockListBlockEvents.mockResolvedValue(OFF);
    const html = activityOf(await render());
    expect(html).not.toContain('signed events carry a proof');
    expect(html).toContain('Old Lantern');
  });

  it('nothing at all: the empty state, said once', async () => {
    mockListBlockEvents.mockResolvedValue(OFF);
    mockFetchBlockPageData.mockResolvedValue({ ...pageData, objects: [], objectCount: 0 });
    const page = await render();
    const html = activityOf(page);
    expect(html).toContain('Nothing has happened here yet');
    expect(html).toContain('Builds, guardian answers and changes of hands will show up here. Signed events carry a proof.');
    expect(page.split('Nothing has happened here yet')).toHaveLength(2);
  });

  it('the outage callout only while the deed cannot be checked, with its date only when known', async () => {
    mockListBlockEvents.mockResolvedValue(OFF);
    expect(activityOf(await render())).not.toContain('Deed checks are paused.');

    mockFetchBlockPageData.mockResolvedValue({ ...pageData, ownership: unreachable });
    let html = activityOf(await render());
    expect(html).toContain('Deed checks are paused.');
    expect(html).toContain('What&#x27;s below was recorded before or doesn&#x27;t need a deed check.');
    expect(html).not.toContain('Last check');

    mockFetchBlockPageData.mockResolvedValue({
      ...pageData,
      ownership: { ...unreachable, availability: { chain: 'unavailable', unavailableSince: null, lastVerifiedAt: '2026-10-31T08:00:00.000Z' } },
    });
    html = activityOf(await render());
    expect(html).toContain('Last check Oct 31.');

    mockFetchBlockPageData.mockResolvedValue({
      ...pageData,
      ownership: { ...unreachable, deed: { ...unreachable.deed, verdict: 'disputed' } },
    });
    expect(activityOf(await render())).not.toContain('Deed checks are paused.');
  });
});
