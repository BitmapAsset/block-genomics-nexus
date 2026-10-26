/**
 * @jest-environment jsdom
 */

/**
 * The block page's Activity tab rendered by React Testing Library (Living Block
 * L1): with three events it lists each one's time, summary and proof link;
 * with the event store answering `{enabled:false}` the tab is byte-for-byte
 * the build list the page rendered before the event spine existed.
 *
 * The golden file was rendered by this same harness from the page as it was
 * before the event spine (`f8d74cce`, parent of the bg90 merge). Regenerate it
 * only on purpose: BG_ACTIVITY_GOLDEN_WRITE=1 writes instead of comparing.
 */

import fs from 'fs';
import path from 'path';
import { render, within } from '@testing-library/react';

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

// Client islands. The tab strip renders only the Activity panel, in a wrapper
// the test can find.
jest.mock('@/app/(site)/block/[height]/copy-button', () => () => null);
jest.mock('@/app/(site)/block/[height]/owner-bar', () => () => null);
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => () => null);
jest.mock('@/app/(site)/block/[height]/block-tabs', () => (p: { panels: Record<string, React.ReactNode> }) => (
  <div data-testid="activity-panel">{p.panels.activity}</div>
));

import BlockPage from '@/app/(site)/block/[height]/page';
import type { PublicBlockEvent } from '@/lib/block-event-core';

const HEIGHT = 840000;
const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const GOLDEN = path.join(__dirname, '__golden__', 'activity-tab-builds-f8d74cce.html');

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
  objects: [
    { id: 'o1', objectType: 'lantern', name: 'Old Lantern', createdAt: '2026-10-01T00:00:00.000Z', creator: { address: 'bc1pbuilder', handle: null, displayName: null } },
    { id: 'o2', objectType: 'crate', name: null, createdAt: '2026-10-03T00:00:00.000Z', creator: { address: 'bc1pbuilder', handle: null, displayName: null } },
  ],
  objectCount: 2,
  parcels: [],
  parcelCount: 0,
  experiences: [],
  experienceCount: 0,
  chain: null,
  market: null,
  degraded: false,
};

async function activityPanel(): Promise<HTMLElement> {
  const { getByTestId } = render(await BlockPage({ params: Promise.resolve({ height: String(HEIGHT) }) }));
  return getByTestId('activity-panel');
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockListBlockEvents.mockReset();
  mockFetchBlockPageData.mockReset();
  mockFetchBlockPageData.mockResolvedValue(pageData);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('three events: newest first, each with its time, summary and proof link', async () => {
  const events = [
    event(1),
    event(2, { kind: 'deed.verified', summary: 'The deed was verified on-chain', actor: { type: 'system', id: null, handle: null }, signer: { scheme: 'ed25519', address: 'bg-sys-0123456789abcdef' } }),
    event(3, { kind: 'guardian.status', summary: 'Satoshis Keeper is now idle', actor: { type: 'guardian', id: 'gdn_1', handle: 'satoshis-keeper' } }),
  ];
  mockListBlockEvents.mockResolvedValue({ format: 'bg-event/1', enabled: true, block: HEIGHT, events, lastSeq: 3, hasMore: false });

  const panel = await activityPanel();
  expect(mockListBlockEvents).toHaveBeenCalledWith(HEIGHT, { limit: 30 });
  expect(within(panel).getByRole('heading', { name: 'Activity' })).toBeTruthy();
  expect(within(panel).queryByText('Old Lantern', { exact: false })).toBeNull();

  const items = within(panel).getAllByRole('listitem');
  expect(items).toHaveLength(3);
  const expected = [events[2], events[1], events[0]];
  items.forEach((li, i) => {
    const e = expected[i];
    expect(li.getAttribute('data-event-kind')).toBe(e.kind);
    expect(li.textContent).toContain(e.summary);
    const time = li.querySelector('time') as HTMLTimeElement;
    expect(time.getAttribute('datetime')).toBe(e.ts);
    expect(time.getAttribute('title')).toBe(new Date(e.ts).toUTCString());
    expect(time.textContent).toBe(`${e.seq} min ago`);
    const link = within(li).getByRole('link', { name: 'proof ↗' });
    expect(link.getAttribute('href')).toBe(`/api/v1/blocks/${HEIGHT}/events/${e.id}/proof`);
    expect(link.getAttribute('rel')).toBe('nofollow');
  });
  expect(items[0].textContent).toContain('guardian @satoshis-keeper');
  expect(items[1].textContent).toContain('Block Genomics');
  expect(items[2].textContent).toContain('deed holder bc1pex…8978');
});

it('{enabled:false}: the tab is identical to the build list before the event spine', async () => {
  mockListBlockEvents.mockResolvedValue({ format: 'bg-event/1', enabled: false, events: [] });
  const panel = await activityPanel();
  const html = panel.innerHTML;
  expect(within(panel).getByRole('heading', { name: 'Builds' })).toBeTruthy();
  expect(within(panel).queryByRole('link', { name: 'proof ↗' })).toBeNull();

  if (process.env.BG_ACTIVITY_GOLDEN_WRITE === '1') {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, html + '\n');
    return;
  }
  expect(html + '\n').toBe(fs.readFileSync(GOLDEN, 'utf8'));
});
