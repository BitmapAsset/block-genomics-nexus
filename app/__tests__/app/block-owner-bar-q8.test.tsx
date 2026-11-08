/**
 * @jest-environment jsdom
 */

/**
 * One orange action for holders too (Pepe Q8): a connected holder still sees
 * bg95's OwnerBar under the hero until bg98a2 replaces it, and its button now
 * takes the secondary style, so the page keeps exactly one `data-primary` and
 * one orange button. OwnerBar is rendered for real here; only the wallet hook
 * is mocked.
 */

import { render, screen } from '@testing-library/react';

const HOLDER = 'bc1pexampleholder0000000000000000000000008978';

jest.mock('@/context/GlobalWalletContext', () => ({ useGlobalWallet: () => ({ isConnected: true, walletAddress: HOLDER }) }));
jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));
jest.mock('@/lib/block-events', () => ({ listBlockEvents: async () => ({ format: 'bg-event/1', enabled: false, events: [] }) }));
jest.mock('@/lib/block-summary', () => ({ getTipHeight: async () => 972_600, isAboveTip: async () => false }));
const mockFetchBlockPageData = jest.fn();
jest.mock('@/lib/blockPageData', () => ({
  ...jest.requireActual('@/lib/blockPageData'),
  fetchBlockPageData: (...a: unknown[]) => mockFetchBlockPageData(...(a as [])),
}));
jest.mock('@/lib/blockGuardian', () => ({ fetchBlockGuardian: async () => ({ guardian: null, handle: null, degraded: false }) }));
jest.mock('@/app/(site)/block/[height]/copy-button', () => () => null);
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => () => null);
jest.mock('@/app/(site)/block/[height]/block-tabs', () => () => null);

import BlockPage from '@/app/(site)/block/[height]/page';

const HEIGHT = 612888;

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

beforeEach(() => {
  mockFetchBlockPageData.mockResolvedValue({
    height: HEIGHT,
    claimed: true,
    label: null,
    ownership: { onChainOwner: null, registeredOwner: HOLDER, inscriptionId: 'storedidfortest0i0', inSync: false, indeterminate: true, checkPending: false },
    objects: [],
    objectCount: 0,
    parcels: [],
    parcelCount: 0,
    experiences: [],
    experienceCount: 0,
    chain: null,
    market: null,
    degraded: false,
  });
});

it('a connected holder: OwnerBar shows, its button is secondary, and the page has one data-primary', async () => {
  const { container } = render(await BlockPage({ params: Promise.resolve({ height: String(HEIGHT) }) }));
  expect(screen.getByText('Block Genomics has this bitmap on record for your wallet.')).toBeTruthy();
  const manage = screen.getByRole('link', { name: 'Manage in My Bitmaps' });
  const cls = manage.className.split(/\s+/);
  expect(cls).not.toContain('bg-bitcoin');
  expect(cls).toContain('bg-surface-3');
  expect(container.querySelectorAll('[data-primary]')).toHaveLength(1);
  // The one orange button on the page is the hero's.
  const orange = [...container.querySelectorAll('a, button')].filter((el) => el.className.split(/\s+/).includes('bg-bitcoin'));
  expect(orange).toHaveLength(1);
  expect(orange[0].hasAttribute('data-primary')).toBe(true);
});
