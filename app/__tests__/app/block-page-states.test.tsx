/**
 * /block/[height] in each dark state (bg95, PLAN-bg95 §2 and §7): the event
 * store off, ord unreachable, nothing live. One render per state, checking the
 * copy, that nothing is green without a match on the deed rule, that the word
 * "live" never appears, and that empty land is said once.
 *
 * The guardian goes through the real `fetchBlockGuardian` over a mocked row
 * that carries every owner-only column, so the privacy test also covers the
 * select-and-project path.
 *
 * bg98a: the hero, the Guardian / Deed / Build cards and Block facts. Every
 * assertion the new page supersedes is replaced by the same fact in its new
 * place (the hero deed chip, the Deed card, the Build card, the sheet trigger).
 */

import { renderToStaticMarkup } from 'react-dom/server';

const mockGuardianFindFirst = jest.fn();
const mockProfileFindFirst = jest.fn();
const mockConversationFindFirst = jest.fn();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    guardianAgent: { findFirst: (...a: unknown[]) => mockGuardianFindFirst(...a) },
    blockProfile: { findFirst: (...a: unknown[]) => mockProfileFindFirst(...a) },
    guardianConversation: { findFirst: (...a: unknown[]) => mockConversationFindFirst(...a) },
  },
}));

// Client islands that read the wallet: the hook alone, so they render their visitor markup.
jest.mock('@/context/GlobalWalletContext', () => ({ useGlobalWallet: () => ({ isConnected: false, walletAddress: null }) }));
jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

const mockListBlockEvents = jest.fn();
jest.mock('@/lib/block-events', () => ({
  ...jest.requireActual('@/lib/block-events'),
  listBlockEvents: (...a: unknown[]) => mockListBlockEvents(...a),
}));

const mockGetBlockSummary = jest.fn();
jest.mock('@/lib/block-summary', () => ({
  getTipHeight: async () => 972_600,
  isAboveTip: async () => false,
  getBlockSummary: (...a: unknown[]) => mockGetBlockSummary(...a),
}));

const mockFetchBlockPageData = jest.fn();
jest.mock('@/lib/blockPageData', () => ({
  ...jest.requireActual('@/lib/blockPageData'),
  fetchBlockPageData: (...a: unknown[]) => mockFetchBlockPageData(...(a as [])),
}));

// Client islands: the tab strip renders every panel, so "said once" counts the tabs too.
jest.mock('@/app/(site)/block/[height]/copy-button', () => () => null);
jest.mock('@/app/(site)/block/[height]/owner-bar', () => () => null);
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => () => null);
jest.mock('@/app/(site)/block/[height]/block-tabs', () =>
  function BlockTabs(p: { panels: Record<string, React.ReactNode> }) {
    return <div>{Object.entries(p.panels).map(([k, v]) => <div key={k}>{v}</div>)}</div>;
  },
);

import BlockPage from '@/app/(site)/block/[height]/page';
import { resolveDeedOwnership } from '@/lib/blockPageData';
import { OWNER_GUARDIAN_FIELDS } from '@/lib/guardian-view';
import { summaryFor, type PublicBlockEvent } from '@/lib/block-event-core';

const HEIGHT = 720143;
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const ALICE = 'bc1pholderrecorded000000000000000000000000a1ce';
const STORED = 'storedinscriptionforthistest0i0';
const EMPTY_LAND = /Nothing built yet|Nothing built here yet/g;

const chain = {
  height: HEIGHT,
  hash: HEIGHT.toString(16).padStart(64, '0'),
  timestamp: 1_642_000_000,
  txCount: 2_500,
  size: 1_400_000,
  genome: '0123456789abcdef'.repeat(4),
};

const unknownOwnership = { onChainOwner: null, registeredOwner: null, inscriptionId: null, inSync: false, indeterminate: true, checkPending: false };

function objects(n: number) {
  return Array.from({ length: Math.min(n, 24) }, (_, i) => ({
    id: `o${i}`,
    objectType: 'lantern',
    name: `Lantern ${i}`,
    createdAt: new Date(Date.UTC(2026, 9, 1 + (i % 28))).toISOString(),
    creator: { address: 'bc1pbuilder', handle: null, displayName: null },
  }));
}

function pageData(over: Record<string, unknown> = {}) {
  return {
    height: HEIGHT,
    claimed: false,
    label: null,
    ownership: unknownOwnership,
    objects: [],
    objectCount: 0,
    parcels: [],
    parcelCount: 0,
    experiences: [],
    experienceCount: 0,
    chain,
    market: null,
    degraded: false,
    ...over,
  };
}

/** A claimed block whose deed rule could not reach Bitcoin. */
const unreachable = {
  onChainOwner: null,
  registeredOwner: ALICE,
  inscriptionId: STORED,
  inSync: false,
  indeterminate: true,
  checkPending: false,
  deed: { verdict: 'undetermined', canonicalId: null, checkedAt: null, unreachableSince: '2026-11-02T11:40:00.000Z' },
};

const marker = (tag: string) => ['m', tag, String(Date.now()), String(Math.random()).slice(2, 8)].join('-');

function guardianRow(over: Record<string, unknown> = {}) {
  return {
    name: 'Guardian #720143',
    status: 'active',
    selfHosted: false,
    lastHeartbeat: null,
    totalMessages: 18,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    llmApiKey: marker('k'),
    llmProvider: 'anthropic',
    llmModel: 'test-model',
    totalVisitors: 0,
    ...over,
  };
}

function event(seq: number, over: Partial<PublicBlockEvent> = {}): PublicBlockEvent {
  const id = `01JB7Z8K2Q4X9M3T6V0R5N1D${String(seq).padStart(2, '0')}`;
  return {
    format: 'bg-event/1',
    id,
    block: HEIGHT,
    seq,
    kind: 'build.placed',
    actor: { type: 'owner', id: ALICE, handle: null },
    signer: { scheme: 'bip322', address: ALICE },
    summary: `Placed object ${seq}`,
    payloadHash: `sha256:${seq}`,
    prev: `sha256:${seq - 1}`,
    hash: `sha256:${seq}h`,
    ts: new Date(NOW - seq * 60_000).toISOString(),
    proof: { url: `/api/v1/blocks/${HEIGHT}/events/${id}/proof` },
    ...over,
  };
}

const render = async () => renderToStaticMarkup(await BlockPage({ params: Promise.resolve({ height: String(HEIGHT) }) }));

/** The hero's deed chip text (the first `data-chip="deed"`). */
function chipOf(html: string): string {
  const m = html.match(/data-chip="deed"[^>]*>(?:<span[^>]*><\/span>)?<span[^>]*>([^<]*)<\/span>/);
  return m ? m[1] : '';
}

/** True when any deed chip on the page (hero or Deed card) has the ok tone. */
function deedIsGreen(html: string): boolean {
  return [...html.matchAll(/<span[^>]*data-chip="deed"[^>]*>/g)].some((m) => m[0].includes('data-tone="ok"'));
}

/** One card's markup alone, by its test id. */
function cardOf(html: string, id: string): string {
  const start = html.indexOf(`data-testid="${id}"`);
  if (start < 0) return '';
  const rest = html.slice(start);
  return rest.slice(0, rest.indexOf('</section>'));
}

const ORD = (id: string) => `https://ordinals.com/inscription/${id}`;

/** The guardian card's markup alone (the Activity feed labels each row's signer separately). */
function guardianCardOf(html: string): string {
  const start = html.indexOf('data-testid="guardian-card"');
  if (start < 0) return '';
  const rest = html.slice(start);
  return rest.slice(0, rest.indexOf('</section>'));
}

function commonChecks(html: string) {
  expect(html).not.toMatch(/\blive\b/i);
  expect((html.match(EMPTY_LAND) ?? []).length).toBeLessThanOrEqual(1);
  expect(html).not.toContain('Visitors');
  expect(html.match(/data-primary/g)).toHaveLength(1);
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockGuardianFindFirst.mockReset().mockResolvedValue(null);
  mockProfileFindFirst.mockReset().mockResolvedValue(null);
  mockConversationFindFirst.mockReset().mockResolvedValue(null);
  mockListBlockEvents.mockReset().mockResolvedValue({ format: 'bg-event/1', enabled: false, events: [] });
  mockGetBlockSummary.mockReset().mockReturnValue(new Promise(() => {}));
  mockFetchBlockPageData.mockReset().mockResolvedValue(pageData());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('dark states', () => {
  it('unclaimed: grey "Not on Block Genomics" chip, empty land once, guardian invitation', async () => {
    const html = await render();
    expect(chipOf(html)).toBe('Not on Block Genomics');
    expect(deedIsGreen(html)).toBe(false);
    expect((html.match(EMPTY_LAND) ?? []).length).toBe(1);
    expect(html).toContain('No guardian yet');
    commonChecks(html);
  });

  it('claimed + indexer unreachable: amber chip with the time, last recorded holder, stored id on record', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: unreachable }));
    const html = await render();
    expect(chipOf(html)).toBe('Deed not checked');
    expect(cardOf(html, 'deed-card')).toContain('Not checked · Bitcoin indexer unreachable since 11:40 UTC');
    expect(html).toContain(ALICE);
    expect(cardOf(html, 'deed-card')).toContain('Inscription on record');
    expect(html).toContain(`href="${ORD(STORED)}"`);
    expect(cardOf(html, 'deed-card')).toContain('(may be out of date)');
    expect(deedIsGreen(html)).toBe(false);
    commonChecks(html);
  });

  it('claimed + indexer unreachable through the deed rule: amber chip with no time, card says right now', async () => {
    const ownership = resolveDeedOwnership(
      { ownerAddress: ALICE, inscriptionId: STORED },
      { height: HEIGHT, inscriptionId: null, ruleId: 'test-rule', verdict: 'undetermined', resolvedAt: new Date(NOW).toISOString(), reason: 'ord answered 403', source: 'resolver' },
      () => ({ address: null, pending: false }),
      () => ({ chain: 'unchecked', checkedAt: null, lastVerifiedAt: null, unavailableSince: null }),
    );
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership }));
    const html = await render();
    expect(chipOf(html)).toBe('Deed not checked');
    // The card says the facts once: the status title and the callout, not the long detail.
    expect(cardOf(html, 'deed-card')).toContain('>Not checked · Bitcoin indexer unreachable<');
    expect(cardOf(html, 'deed-card')).toContain('data-testid="deed-outage"');
    expect(html).not.toContain('could not be checked right now');
    expect(deedIsGreen(html)).toBe(false);
    commonChecks(html);
  });

  it('no green without a match on the deed rule, even when the stored id’s holder matched', async () => {
    mockFetchBlockPageData.mockResolvedValue(
      pageData({ claimed: true, ownership: { ...unreachable, onChainOwner: ALICE, inSync: true, indeterminate: false } }),
    );
    const html = await render();
    expect(deedIsGreen(html)).toBe(false);
    expect(chipOf(html)).not.toMatch(/verified/i);
  });

  it('verified on the deed rule: the only green state, with its age', async () => {
    mockFetchBlockPageData.mockResolvedValue(
      pageData({
        claimed: true,
        ownership: {
          onChainOwner: ALICE,
          registeredOwner: ALICE,
          inscriptionId: STORED,
          inSync: true,
          indeterminate: false,
          checkPending: false,
          deed: { verdict: 'canonical', canonicalId: STORED, checkedAt: new Date(NOW - 7 * 60_000).toISOString(), unreachableSince: null },
        },
      }),
    );
    const html = await render();
    expect(chipOf(html)).toBe('Deed verified on Bitcoin · 7 min ago');
    expect(deedIsGreen(html)).toBe(true);
    expect(html).not.toContain('Inscription on record');
    expect(cardOf(html, 'deed-card')).toContain('First valid inscription');
    expect(html).toContain(`href="${ORD(STORED)}"`);
    expect(html).not.toContain('(may be out of date)');
    expect(html).not.toContain('data-testid="deed-outage"');
    commonChecks(html);
  });

  it('claimed + no deed on file: grey chip', async () => {
    mockFetchBlockPageData.mockResolvedValue(
      pageData({ claimed: true, ownership: { ...unreachable, inscriptionId: null, deed: { ...unreachable.deed } } }),
    );
    const html = await render();
    expect(chipOf(html)).toBe('Not checked · no deed on file');
    expect(deedIsGreen(html)).toBe(false);
    commonChecks(html);
  });

  it('hosted guardian + rich land: "Answers chat", no heartbeat line, Built here header, no visitor count', async () => {
    mockGuardianFindFirst.mockResolvedValue(guardianRow());
    mockProfileFindFirst.mockResolvedValue({ handle: 'keeper720143' });
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: unreachable, objects: objects(61), objectCount: 61 }));
    const html = await render();
    expect(html).toContain('data-state="answers-chat"');
    expect(html).toContain('>Answers chat<');
    expect(html).not.toContain('Last heartbeat');
    expect(html).toMatch(/<button[^>]*data-action="talk"[^>]*>.*Talk to Guardian #720143<\/button>/);
    expect(html).not.toContain('?chat=1');
    expect(html).toContain('Built here · 61 objects · last change');
    expect(html).toContain('Showing 24 of 61');
    expect(html).not.toContain('Registered by the deed holder');
    expect(html).not.toContain('data-testid="guardian-last"');
    expect((html.match(EMPTY_LAND) ?? []).length).toBe(0);
    commonChecks(html);
  });

  it('self-hosted guardian with a 30 h old heartbeat: Offline', async () => {
    mockGuardianFindFirst.mockResolvedValue(guardianRow({ selfHosted: true, lastHeartbeat: new Date(NOW - 30 * 3_600_000) }));
    const html = await render();
    expect(html).toContain('data-state="offline"');
    expect(html).toContain('>Offline<');
    expect(html).toContain('30 h ago');
    commonChecks(html);
  });

  it('events on with a guardian event: LAST line with its proof, dated registration line from guardian.registered', async () => {
    mockGuardianFindFirst.mockResolvedValue(guardianRow());
    const events = [
      event(1, {
        kind: 'guardian.registered',
        summary: summaryFor('guardian.registered', { guardianName: 'Guardian #720143' }),
        actor: { type: 'owner', id: ALICE, handle: null },
        ts: '2026-08-01T00:00:02.000Z',
      }),
      event(2),
      event(3, { kind: 'guardian.status', summary: 'Guardian #720143 is now idle', actor: { type: 'guardian', id: 'g1', handle: null } }),
    ];
    mockListBlockEvents.mockResolvedValue({ format: 'bg-event/1', enabled: true, block: HEIGHT, events, lastSeq: 3, hasMore: false });
    const html = await render();
    const last = html.slice(html.indexOf('data-testid="guardian-last"'));
    expect(html).toContain('data-testid="guardian-last"');
    expect(last).toContain('Guardian #720143 is now idle');
    expect(last).toContain(`/api/v1/blocks/${HEIGHT}/events/${events[2].id}/proof`);
    expect(guardianCardOf(html)).toContain('Registered Aug 1, 2026 by bc1pho…a1ce');
    expect(guardianCardOf(html)).not.toContain('deed holder');
    commonChecks(html);
  });

  it('an older guardian’s event and a sale leave no line that reads as today’s holder’s endorsement', async () => {
    const OLD = 'bc1pearlierholder00000000000000000000000000beef';
    mockGuardianFindFirst.mockResolvedValue(guardianRow({ createdAt: new Date('2026-10-01T00:00:00Z') }));
    const events = [
      event(1, {
        kind: 'guardian.registered',
        summary: summaryFor('guardian.registered', { guardianName: 'Old Keeper' }),
        actor: { type: 'owner', id: OLD, handle: null },
        ts: '2026-08-01T00:00:02.000Z',
      }),
      event(2, {
        kind: 'deed.moved',
        summary: summaryFor('deed.moved'),
        actor: { type: 'system', id: null, handle: null },
        signer: { scheme: 'ed25519', address: 'sys-1' },
        ts: '2026-09-15T00:00:00.000Z',
      }),
    ];
    mockListBlockEvents.mockResolvedValue({ format: 'bg-event/1', enabled: true, block: HEIGHT, events, lastSeq: 2, hasMore: false });
    const html = await render();
    const card = guardianCardOf(html);
    expect(card).toContain('Guardian #720143');
    expect(card).not.toContain('deed holder');
    expect(card).not.toContain('Registered');
    expect(html).not.toContain('data-testid="guardian-registered"');
  });

  it('a sale after the registration: the line stays a dated fact about who registered, never "the deed holder"', async () => {
    mockGuardianFindFirst.mockResolvedValue(guardianRow());
    const events = [
      event(1, {
        kind: 'guardian.registered',
        summary: summaryFor('guardian.registered', { guardianName: 'Guardian #720143' }),
        actor: { type: 'owner', id: ALICE, handle: null },
        ts: '2026-08-01T00:00:02.000Z',
      }),
      event(2, {
        kind: 'deed.moved',
        summary: summaryFor('deed.moved'),
        actor: { type: 'system', id: null, handle: null },
        signer: { scheme: 'ed25519', address: 'sys-1' },
        ts: '2026-10-20T00:00:00.000Z',
      }),
    ];
    mockListBlockEvents.mockResolvedValue({ format: 'bg-event/1', enabled: true, block: HEIGHT, events, lastSeq: 2, hasMore: false });
    const html = await render();
    expect(html).toContain('data-testid="guardian-registered"');
    expect(guardianCardOf(html)).toContain('Registered Aug 1, 2026 by bc1pho…a1ce');
    expect(guardianCardOf(html)).not.toContain('deed holder');
  });

  it('0 objects: the empty-land line is said once', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: unreachable }));
    const html = await render();
    expect((html.match(EMPTY_LAND) ?? []).length).toBe(1);
  });

  it('chain: null → page banner and no scale line', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData({ chain: null }));
    const html = await render();
    expect(html).toContain('Bitcoin data is unreachable right now; block facts are missing on this view.');
    expect(html).not.toContain('mean lot');
    commonChecks(html);
  });

  it('the hero art, then Guardian, Deed and Build, then Activity, then Block facts', async () => {
    mockGuardianFindFirst.mockResolvedValue(guardianRow());
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: unreachable, objects: objects(3), objectCount: 3 }));
    const html = await render();
    const at = (s: string) => {
      const i = html.indexOf(s);
      expect(i).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at(`<img src="/api/v1/block-thumbnail/${HEIGHT}.png`),
      at('<h1'),
      at('data-testid="deed-chip"'),
      at('data-testid="guardian-card"'),
      at('data-testid="deed-card"'),
      at('data-testid="build-card"'),
      at('data-testid="block-activity"'),
      at('data-testid="block-scale-line"'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('no guardian: the Deed card leads, then Guardian, then Build', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: unreachable }));
    const html = await render();
    const order = ['data-testid="deed-card"', 'data-testid="guardian-card"', 'data-testid="build-card"'].map((s) => html.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(cardOf(html, 'guardian-card')).toContain('Hold this block? Connect your wallet');
  });

  it('a degraded guardian lookup keeps the Guardian card first', async () => {
    mockGuardianFindFirst.mockRejectedValue(new Error('ECONNREFUSED'));
    const html = await render();
    expect(html.indexOf('data-testid="guardian-card"')).toBeLessThan(html.indexOf('data-testid="deed-card"'));
    expect(html).toContain('Guardian details couldn&#x27;t be loaded right now');
    expect(html).not.toContain('No guardian yet');
  });
});

const disputed = {
  ...unreachable,
  deed: { verdict: 'disputed', canonicalId: null, checkedAt: null, unreachableSince: null },
};

describe('Deed card', () => {
  it('the outage callout only for unreachable: a disputed deed has none and no "Reload later"', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: disputed }));
    const html = await render();
    expect(chipOf(html)).toBe('Deed disputed · under review');
    expect(html).not.toContain('data-testid="deed-outage"');
    expect(html).not.toContain('Reload later');
    expect(cardOf(html, 'deed-card')).toContain('Bitcoin sources do not agree');
    expect(cardOf(html, 'deed-card')).not.toContain('(may be out of date)');
  });

  it('the outage date only with a last verified time', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: unreachable }));
    const without = cardOf(await render(), 'deed-card');
    expect(without).toContain('Reload later to check again.');
    expect(without).not.toContain('Last check');
    mockFetchBlockPageData.mockResolvedValue(
      pageData({
        claimed: true,
        ownership: { ...unreachable, availability: { chain: 'unavailable', unavailableSince: null, lastVerifiedAt: '2026-10-31T08:00:00.000Z' } },
      }),
    );
    const withDate = await render();
    expect(cardOf(withDate, 'deed-card')).toContain('Last check Oct 31.');
    expect(chipOf(withDate)).toMatch(/^Deed not checked · last verified \d+ days ago$/);
  });

  it('the inscription link: first valid, on record, or none', async () => {
    mockFetchBlockPageData.mockResolvedValue(
      pageData({ claimed: true, ownership: { ...unreachable, inscriptionId: null, deed: { ...unreachable.deed, verdict: 'canonical', canonicalId: 'canonfortest0i0' } } }),
    );
    let card = cardOf(await render(), 'deed-card');
    expect(card).toContain(`href="${ORD('canonfortest0i0')}"`);
    expect(card).toContain('First valid inscription');
    expect(card).toContain('rel="noopener noreferrer nofollow"');

    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: { ...unreachable, inscriptionId: null, deed: { ...unreachable.deed } } }));
    card = cardOf(await render(), 'deed-card');
    expect(card).not.toContain('data-testid="deed-inscription"');
  });

  it('unclaimed: bg95 text, and no "Verify in My Bitmaps" link', async () => {
    const card = cardOf(await render(), 'deed-card');
    expect(card).toContain('Not yet on Block Genomics');
    expect(card).toContain('Nobody has verified');
    expect(card).not.toContain('My Bitmaps');
  });

  it('chain: null: no size or parcel rows', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: unreachable, chain: null }));
    const card = cardOf(await render(), 'deed-card');
    expect(card).toContain('Held by');
    expect(card).not.toContain('>Size<');
    expect(card).not.toContain('>Parcels<');
  });
});

describe('Build card and Block facts', () => {
  it('empty: the ground from the block\'s own transaction count, both actions secondary', async () => {
    const html = await render();
    const card = cardOf(html, 'build-card');
    expect(card).toContain('Nothing built yet');
    expect(card).toContain("The ground is laid out from the block&#x27;s own 2,500 transactions: one parcel each, bigger transactions, bigger parcels.");
    expect(card).toContain('2,500 parcels');
    expect(card).toContain('2.1 km × 2.1 km');
    expect(card).toContain(`href="/world/${HEIGHT}"`);
    expect(card).not.toContain('data-primary');
    expect(card).toContain('See it on the map');
  });

  it('chain: null: "Nothing built here yet." with no count and no ground line', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData({ chain: null }));
    const card = cardOf(await render(), 'build-card');
    expect(card).toContain('Nothing built here yet.');
    expect(card).not.toContain('Ground');
  });

  it('with builds: the count and the newest change', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData({ objects: objects(5), objectCount: 5 }));
    const card = cardOf(await render(), 'build-card');
    expect(card).toContain('5 things built');
    expect(card).toContain('Lantern 4');
  });

  it('Block facts: the hash, the genome and "Parcels on record"; no Transactions, Size or Mined', async () => {
    const html = await render();
    const facts = html.slice(html.indexOf('block genome '));
    expect(facts).toContain(chain.hash);
    expect(facts).toContain('Parcels on record');
    for (const label of ['>Transactions<', '>Size<', '>Mined<']) expect(facts).not.toContain(label);
    expect(html).not.toContain('Walk through');
  });

});

describe('privacy', () => {
  it('no owner-only column, no marker value and no visitor count reaches the HTML', async () => {
    const markers: Record<string, string> = {};
    const extra: Record<string, unknown> = {};
    for (const f of OWNER_GUARDIAN_FIELDS) {
      markers[f] = marker(f.slice(0, 3));
      extra[f] = markers[f];
    }
    const secretKey = marker('key');
    const tokenHash = marker('tok');
    mockGuardianFindFirst.mockResolvedValue(
      guardianRow({ ...extra, llmApiKey: secretKey, monitorTokenHash: tokenHash, personality: marker('per'), totalVisitors: 4321 }),
    );
    mockProfileFindFirst.mockResolvedValue({ handle: 'keeper720143' });
    mockFetchBlockPageData.mockResolvedValue(pageData({ claimed: true, ownership: unreachable }));

    const html = await render();

    expect(html).toContain('Guardian #720143');
    for (const v of [...Object.values(markers), secretKey, tokenHash]) expect(html).not.toContain(v);
    for (const f of [...OWNER_GUARDIAN_FIELDS, 'llmApiKey', 'monitorTokenHash', 'totalVisitors']) expect(html).not.toContain(f);
    expect(html).not.toContain('4321');
    expect(html).not.toContain('Visitors');
  });
});
