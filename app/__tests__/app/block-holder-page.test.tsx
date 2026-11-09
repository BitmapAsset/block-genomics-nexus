/**
 * @jest-environment jsdom
 */

/**
 * The holder layer of the block page (bg98a2): a connected wallet that holds
 * the block sees its own wording on the three cards (Your guardian with
 * Manage, Your deed, Open the builder); the hero and the phone dock stay the
 * same for everyone, so the page keeps one `data-primary` and one orange
 * button. Replaces bg95's OwnerBar and its q8 test (four named replacements
 * below). The whole page is rendered for real; only the wallet hook and the
 * data reads are mocked.
 */

import { act, render, screen } from '@testing-library/react';

const HOLDER = 'bc1pexampleholder0000000000000000000000008978';
const OTHER = 'bc1pexampleotherwallet00000000000000000000001b2c';

const mockWallet: { isConnected: boolean; walletAddress: string | null } = { isConnected: false, walletAddress: null };
jest.mock('@/context/GlobalWalletContext', () => ({ useGlobalWallet: () => mockWallet }));
jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => () => null }));
jest.mock('@/lib/block-events', () => {
  // The real module loads the event signer, which needs TextEncoder; jsdom has none.
  const { TextEncoder, TextDecoder } = jest.requireActual('util');
  Object.assign(globalThis, { TextEncoder, TextDecoder });
  return {
    ...jest.requireActual('@/lib/block-events'),
    listBlockEvents: async () => ({ format: 'bg-event/1', enabled: false, events: [] }),
  };
});
jest.mock('@/lib/block-summary', () => ({ getTipHeight: async () => 972_600, isAboveTip: async () => false }));
const mockFetchBlockPageData = jest.fn();
jest.mock('@/lib/blockPageData', () => ({
  ...jest.requireActual('@/lib/blockPageData'),
  fetchBlockPageData: (...a: unknown[]) => mockFetchBlockPageData(...(a as [])),
}));
const mockFetchBlockGuardian = jest.fn();
jest.mock('@/lib/blockGuardian', () => {
  // The real module loads the event signer, which needs TextEncoder; jsdom has none.
  const { TextEncoder, TextDecoder } = jest.requireActual('util');
  Object.assign(globalThis, { TextEncoder, TextDecoder });
  return {
    ...jest.requireActual('@/lib/blockGuardian'),
    fetchBlockGuardian: (...a: unknown[]) => mockFetchBlockGuardian(...(a as [])),
  };
});
jest.mock('@/app/(site)/block/[height]/copy-button', () => () => null);
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => () => null);
jest.mock('@/app/(site)/block/[height]/block-tabs', () => () => null);

import BlockPage from '@/app/(site)/block/[height]/page';
import '@/app/(site)/block/[height]/holder-switch';

const HEIGHT = 612888;
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const STORED = 'storedidfortest0i0';

// The hero's action is fully in view (as at the top of the page), so the phone dock stays away.
type Entry = { isIntersecting: boolean; intersectionRatio: number; boundingClientRect: { top: number; bottom: number }; target: Element };
beforeAll(() => {
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(private cb: (e: Entry[]) => void) {}
    observe(el: Element) {
      this.cb([{ isIntersecting: true, intersectionRatio: 1, boundingClientRect: { top: 400, bottom: 454 }, target: el }]);
    }
    unobserve() {}
    disconnect() {}
  };
});

/** q8's fixture: the record names the holder, Bitcoin was not checked (stored id only). */
const recordOwnership = { onChainOwner: null, registeredOwner: HOLDER, inscriptionId: STORED, inSync: false, indeterminate: true, checkPending: false };

/** Verified on the deed rule, checked 4 minutes ago. */
const verifiedOwnership = {
  onChainOwner: HOLDER,
  registeredOwner: HOLDER,
  inscriptionId: STORED,
  inSync: true,
  indeterminate: false,
  checkPending: false,
  deed: { verdict: 'canonical', canonicalId: STORED, checkedAt: new Date(NOW - 4 * 60_000).toISOString(), unreachableSince: null },
};

const unknownOwnership = { onChainOwner: null, registeredOwner: null, inscriptionId: null, inSync: false, indeterminate: true, checkPending: false };

function pageData(ownership: Record<string, unknown>) {
  return {
    height: HEIGHT,
    claimed: ownership.registeredOwner !== null,
    label: null,
    ownership,
    objects: [],
    objectCount: 0,
    parcels: [],
    parcelCount: 0,
    experiences: [],
    experienceCount: 0,
    chain: null,
    market: null,
    degraded: false,
  };
}

function guardian(over: Record<string, unknown> = {}) {
  return {
    name: 'Atlas',
    status: 'active',
    selfHosted: false,
    lastHeartbeat: null,
    totalMessages: 1234,
    createdAt: '2026-08-01T00:00:00.000Z',
    llmConfigured: true,
    lastChatAt: null,
    ...over,
  };
}

const page = async () => BlockPage({ params: Promise.resolve({ height: String(HEIGHT) }) });

function as(walletAddress: string | null) {
  mockWallet.isConnected = walletAddress !== null;
  mockWallet.walletAddress = walletAddress;
}

function card(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`no ${id}`);
  return el;
}

const caption = (el: HTMLElement) => el.querySelector('h2')?.textContent ?? '';

/** One data-primary, and the one orange button is it (the hero's). */
function oneOrange(container: HTMLElement) {
  expect(container.querySelectorAll('[data-primary]')).toHaveLength(1);
  const orange = [...container.querySelectorAll('a, button')].filter((el) => el.className.split(/\s+/).includes('bg-bitcoin'));
  expect(orange).toHaveLength(1);
  expect(orange[0].hasAttribute('data-primary')).toBe(true);
  expect(orange[0].closest('[data-testid="block-hero"]')).not.toBeNull();
}

const HOLDER_STRINGS = ['Your guardian', 'Your deed', 'Your address', 'Manage', 'Open the builder', 'On record for your wallet', 'You hold this deed', 'Set up a guardian', 'Opens in the world view', 'The builder opens in the world view'];

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  as(null);
  mockFetchBlockPageData.mockReset().mockResolvedValue(pageData(recordOwnership));
  mockFetchBlockGuardian.mockReset().mockResolvedValue({ guardian: null, handle: null, degraded: false });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Your guardian', () => {
  it('an active guardian with a model: Manage first, then Talk, then the two lines in order', async () => {
    mockFetchBlockGuardian.mockResolvedValue({ guardian: guardian(), handle: null, degraded: false });
    as(HOLDER);
    const { container } = render(await page());
    const g = card(container, 'guardian-card');
    expect(caption(g)).toBe('Your guardian');
    expect(g.textContent).toContain('Visitor messages · all time');
    expect(g.textContent).toContain('1,234');
    expect(g.textContent).not.toMatch(/Messages1,234/);
    const controls = [...g.querySelectorAll('a, button')].map((el) => el.textContent?.trim());
    const manage = controls.indexOf('Manage Atlas');
    const talk = controls.indexOf('Talk to Atlas');
    expect(manage).toBeGreaterThanOrEqual(0);
    expect(talk).toBeGreaterThan(manage);
    const link = screen.getByRole('link', { name: 'Manage Atlas' });
    expect(link.getAttribute('href')).toBe(`/world/${HEIGHT}`);
    const text = g.textContent ?? '';
    expect(text.indexOf('Manage Atlas opens in the world view.')).toBeGreaterThan(-1);
    expect(text).not.toContain('Opens in the world view.');
    expect(text.indexOf('Keep private details to yourself.')).toBeGreaterThan(text.indexOf('Manage Atlas opens in the world view.'));
    expect(g.querySelectorAll('[data-swap-focus]')).toHaveLength(1);
    oneOrange(container);
  });

  it('a paused guardian: Manage, then "isn\'t taking messages", no Talk', async () => {
    mockFetchBlockGuardian.mockResolvedValue({ guardian: guardian({ status: 'paused' }), handle: null, degraded: false });
    as(HOLDER);
    const { container } = render(await page());
    const g = card(container, 'guardian-card');
    expect(caption(g)).toBe('Your guardian');
    expect(screen.getByRole('link', { name: 'Manage Atlas' })).toBeTruthy();
    expect(g.textContent).toContain("Atlas isn't taking messages right now.");
    expect(g.textContent).not.toContain('Talk to Atlas');
    expect(g.textContent).not.toContain('Keep private details to yourself.');
    const text = g.textContent ?? '';
    expect(text.indexOf('Manage Atlas opens in the world view.')).toBeGreaterThan(-1);
    expect(text).not.toContain('Opens in the world view.');
    expect(text.indexOf("isn't taking messages")).toBeGreaterThan(text.indexOf('Manage Atlas opens in the world view.'));
    oneOrange(container);
  });

  it('no guardian: "Give 612,888 a guardian" and a secondary "Set up a guardian" to the world, no connect button', async () => {
    as(HOLDER);
    const { container } = render(await page());
    const g = card(container, 'guardian-card');
    expect(caption(g)).toBe('Your guardian');
    expect(g.textContent).toContain('None yet');
    expect(screen.getByRole('heading', { name: 'Give 612,888 a guardian' })).toBeTruthy();
    expect(g.textContent).toContain('Your own AI agent, on your block.');
    expect(g.textContent).toContain('It looks after the block, builds on it and answers visitors.');
    const setup = screen.getByRole('link', { name: 'Set up a guardian' });
    expect(setup.getAttribute('href')).toBe('/world/612888');
    expect(setup.className.split(/\s+/)).not.toContain('bg-bitcoin');
    expect(g.textContent).toContain('Opens in the world view.');
    expect(container.querySelector('[data-testid="guardian-connect"]')).toBeNull();
    oneOrange(container);
  });

  it('a degraded guardian view: the visitor\'s degraded card, for the holder too', async () => {
    mockFetchBlockGuardian.mockResolvedValue({ guardian: null, handle: null, degraded: true });
    as(HOLDER);
    const { container } = render(await page());
    const g = card(container, 'guardian-card');
    expect(caption(g)).toBe('Guardian');
    expect(g.textContent).toContain("Guardian details couldn't be loaded right now.");
    expect(g.textContent).not.toContain('Manage');
    expect(g.closest('[data-holder-slot]')).toBeNull();
    oneOrange(container);
  });
});

describe('Your deed and Build', () => {
  it('the record fixture: "Your address", the record line, the transactions line, Open the builder', async () => {
    as(HOLDER);
    const { container } = render(await page());
    const d = card(container, 'deed-card');
    expect(caption(d)).toBe('Your deed');
    expect(d.textContent).toContain('Your address');
    expect(d.textContent).not.toContain('Held by');
    expect(d.querySelector('[data-testid="deed-status-line"]')?.textContent).toBe('On record for your wallet · not checked');
    expect(d.textContent).toContain('Transfers and listings are Bitcoin transactions. You prepare them in the world view, apart from your guardian.');
    // The outage callout keeps the visitor's words.
    expect(d.querySelector('[data-testid="deed-outage"]')).not.toBeNull();
    expect(d.querySelector('[data-tone="ok"]')).toBeNull();
    const b = card(container, 'build-card');
    const builder = screen.getByRole('link', { name: 'Open the builder' });
    expect(b.contains(builder)).toBe(true);
    expect(builder.getAttribute('href')).toBe('/world/612888');
    expect(b.textContent).not.toContain('Walk the block');
    expect(b.textContent).toContain('See it on the map');
    expect(b.textContent).toContain('The builder opens in the world view.');
    expect(b.textContent).not.toContain('Opens in the world view.');
    oneOrange(container);
  });

  it('verified on the deed rule: "You hold this deed · checked 4 min ago"', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData(verifiedOwnership));
    as(HOLDER);
    const { container } = render(await page());
    const d = card(container, 'deed-card');
    expect(d.querySelector('[data-testid="deed-status-line"]')?.textContent).toBe('You hold this deed · checked 4 min ago');
    oneOrange(container);
  });
});

describe('the hero and the visitors', () => {
  it('the hero is identical for the holder and the visitor', async () => {
    mockFetchBlockGuardian.mockResolvedValue({ guardian: guardian(), handle: null, degraded: false });
    const { container, rerender } = render(await page());
    const visitorHero = card(container, 'block-hero').outerHTML;
    expect(caption(card(container, 'guardian-card'))).toBe('Guardian');
    as(HOLDER);
    rerender(await page());
    expect(caption(card(container, 'guardian-card'))).toBe('Your guardian');
    expect(card(container, 'block-hero').outerHTML).toBe(visitorHero);
  });

  it.each([
    ['a disconnected visitor', null],
    ['another connected wallet', OTHER],
  ])('%s sees no holder words', async (_n, wallet) => {
    mockFetchBlockGuardian.mockResolvedValue({ guardian: guardian(), handle: null, degraded: false });
    as(wallet);
    const { container } = render(await page());
    for (const s of HOLDER_STRINGS) expect(container.textContent).not.toContain(s);
    expect(caption(card(container, 'guardian-card'))).toBe('Guardian');
    expect(caption(card(container, 'deed-card'))).toBe('Deed');
    expect(screen.getByRole('link', { name: 'Walk the block' })).toBeTruthy();
    oneOrange(container);
  });

  it('an unclaimed block: a connected wallet sees the visitor cards and no switch in the markup', async () => {
    mockFetchBlockPageData.mockResolvedValue(pageData(unknownOwnership));
    as(HOLDER);
    const { container } = render(await page());
    for (const s of HOLDER_STRINGS) expect(container.innerHTML).not.toContain(s);
    expect(container.querySelector('[data-holder-slot]')).toBeNull();
    oneOrange(container);
  });
});

describe('the swap', () => {
  it('focus on swap: connecting from the guardian card moves focus to the incoming heading, not body', async () => {
    const { rerender } = render(await page());
    const connect = screen.getByTestId('guardian-connect');
    act(() => connect.focus());
    expect(document.activeElement).toBe(connect);
    as(HOLDER);
    rerender(await page());
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.tagName).toBe('H3');
    expect(document.activeElement?.textContent).toBe('Give 612,888 a guardian');
  });

  it('no focus move when focus was elsewhere', async () => {
    const { rerender } = render(await page());
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => outside.focus());
    as(HOLDER);
    rerender(await page());
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('account switch: holder → another address shows every visitor card again', async () => {
    mockFetchBlockGuardian.mockResolvedValue({ guardian: guardian(), handle: null, degraded: false });
    as(HOLDER);
    const { container, rerender } = render(await page());
    expect(caption(card(container, 'guardian-card'))).toBe('Your guardian');
    expect(caption(card(container, 'deed-card'))).toBe('Your deed');
    expect(screen.getByRole('link', { name: 'Open the builder' })).toBeTruthy();
    as(OTHER);
    rerender(await page());
    expect(caption(card(container, 'guardian-card'))).toBe('Guardian');
    expect(caption(card(container, 'deed-card'))).toBe('Deed');
    expect(caption(card(container, 'build-card'))).toBe('Build');
    expect(card(container, 'deed-card').textContent).toContain('Held by');
    expect(screen.getByRole('link', { name: 'Walk the block' })).toBeTruthy();
    for (const s of HOLDER_STRINGS) expect(container.textContent).not.toContain(s);
  });
});

/**
 * bg95's OwnerBar and its q8 test are retired. Each of q8's four assertion
 * groups has a named replacement here, on q8's fixture (record only, stored id).
 */
describe('q8 replacements (OwnerBar retired)', () => {
  it('q8.1 the record text → the "Your deed" holder line', async () => {
    as(HOLDER);
    const { container } = render(await page());
    expect(container.textContent).not.toContain('Block Genomics has this bitmap on record for your wallet.');
    expect(card(container, 'deed-card').querySelector('[data-testid="deed-status-line"]')?.textContent).toBe('On record for your wallet · not checked');
  });

  it('q8.2 "Manage in My Bitmaps" (secondary) → "Manage <name>" on Your guardian, not orange, bg-surface-3', async () => {
    mockFetchBlockGuardian.mockResolvedValue({ guardian: guardian(), handle: null, degraded: false });
    as(HOLDER);
    render(await page());
    expect(screen.queryByRole('link', { name: 'Manage in My Bitmaps' })).toBeNull();
    const cls = screen.getByRole('link', { name: 'Manage Atlas' }).className.split(/\s+/);
    expect(cls).not.toContain('bg-bitcoin');
    expect(cls).toContain('bg-surface-3');
  });

  it('q8.3 exactly one data-primary on the holder page', async () => {
    as(HOLDER);
    const { container } = render(await page());
    expect(caption(card(container, 'deed-card'))).toBe('Your deed');
    expect(container.querySelectorAll('[data-primary]')).toHaveLength(1);
  });

  it('q8.4 exactly one orange element on the holder page, and it carries data-primary', async () => {
    as(HOLDER);
    const { container } = render(await page());
    expect(caption(card(container, 'deed-card'))).toBe('Your deed');
    const orange = [...container.querySelectorAll('a, button')].filter((el) => el.className.split(/\s+/).includes('bg-bitcoin'));
    expect(orange).toHaveLength(1);
    expect(orange[0].hasAttribute('data-primary')).toBe(true);
  });
});
