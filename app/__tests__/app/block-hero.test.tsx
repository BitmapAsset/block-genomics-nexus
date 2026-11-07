/**
 * @jest-environment jsdom
 */

/**
 * The block page's hero (bg98a item 4): the stored artwork drawn pixel for
 * pixel in a fixed square, the epoch eyebrow, number and name, the scale chip
 * from the transaction count, the deed and guardian chips, and the page's one
 * `data-primary` action. Server HTML through renderToStaticMarkup; the art's
 * failed state through React Testing Library.
 */

import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));
jest.mock('@/app/(site)/block/[height]/deed-recheck', () => ({
  __esModule: true,
  default: ({ pending }: { pending: boolean }) => (pending ? <p data-testid="deed-recheck">recheck</p> : null),
}));

import Hero from '@/app/(site)/block/[height]/hero';
import BlockArt from '@/app/(site)/block/[height]/block-art';
import { deedStatus } from '@/app/(site)/block/[height]/deed-status';
import type { BlockOwnership, BlockPageData } from '@/lib/blockPageData';

const HEIGHT = 612888;
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const NB = ' ';
const HOLDER = 'bc1pholderrecorded000000000000000000000000a1ce';
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'block-612888-summary.json'), 'utf8'),
) as { value: number[] };

const chain = (txCount: number) => ({
  height: HEIGHT,
  hash: HEIGHT.toString(16).padStart(64, '0'),
  timestamp: 1_579_046_400,
  txCount,
  size: 410_624,
  genome: '0123456789abcdef'.repeat(4),
});

const unknown: BlockOwnership = { onChainOwner: null, registeredOwner: null, inscriptionId: null, inSync: false, indeterminate: true, checkPending: false };

const unreachable = (lastVerifiedAt: string | null): BlockOwnership => ({
  onChainOwner: null,
  registeredOwner: HOLDER,
  inscriptionId: 'storedidfortest0i0',
  inSync: false,
  indeterminate: true,
  checkPending: false,
  availability: { chain: 'unavailable', unavailableSince: null, lastVerifiedAt },
  deed: { verdict: 'undetermined', canonicalId: null, checkedAt: null, unreachableSince: null },
} as unknown as BlockOwnership);

function data(over: Partial<BlockPageData> = {}): BlockPageData {
  return {
    height: HEIGHT,
    claimed: false,
    label: null,
    ownership: unknown,
    objects: [],
    objectCount: 0,
    parcels: [],
    parcelCount: 0,
    experiences: [],
    experienceCount: 0,
    chain: chain(FIXTURE.value.length),
    market: null,
    degraded: false,
    ...over,
  } as BlockPageData;
}

function hero(d: BlockPageData, guardian: Parameters<typeof Hero>[0]['guardian'] = null): string {
  const status = d.ownership.registeredOwner || d.ownership.onChainOwner ? deedStatus(d.ownership, NOW) : null;
  return renderToStaticMarkup(<Hero data={d} status={status} guardian={guardian} guardianDegraded={false} now={NOW} />);
}

describe('hero, server HTML', () => {
  it('the 612,888 fixture: epoch eyebrow, number, name and 1,114 parcels', () => {
    expect(FIXTURE.value).toHaveLength(1114);
    const html = hero(data());
    expect(html).toContain('Bitcoin block · Epoch 3, The Expansion Era');
    expect(html).toContain('>612,888<');
    expect(html).toContain('612888.bitmap');
    expect(html).toContain(`2.1${NB}km × 2.1${NB}km · 1,114${NB}parcels`);
    expect(html).toContain(`Mined Jan 15, 2020 · 1,114${NB}transactions`);
  });

  it('another transaction count prints its own parcels', () => {
    const html = hero(data({ chain: chain(2850) }));
    expect(html).toContain(`2,850${NB}parcels`);
    expect(html).not.toContain(`1,114${NB}parcels`);
  });

  it('exactly one data-primary: Enter the block, to the world, with its caption', () => {
    const html = hero(data());
    expect(html.match(/data-primary/g)).toHaveLength(1);
    const tag = html.match(/<a[^>]*data-primary[^>]*>/)?.[0] ?? '';
    expect(tag).toContain(`href="/world/${HEIGHT}"`);
    expect(html).toContain('Enter the block');
    expect(html).toContain('Opens the block in 3D.');
    expect(html).toContain('Share');
  });

  it('the art: the stored 576 px PNG, intrinsic size, pixelated, no srcset', () => {
    const html = hero(data());
    const img = html.match(/<img[^>]*>/)?.[0] ?? '';
    expect(img).toContain(`src="/api/v1/block-thumbnail/${HEIGHT}.png?v=3"`);
    expect(img).toContain('width="576"');
    expect(img).toContain('height="576"');
    expect(img).toContain('image-rendering:pixelated');
    expect(img).not.toMatch(/srcset/i);
  });

  it('chain: null → no scale chip and no identity facts', () => {
    const html = hero(data({ chain: null }));
    expect(html).not.toContain('data-testid="hero-scale-chip"');
    expect(html).not.toContain('data-testid="hero-facts"');
    expect(html).not.toContain('Mined');
  });

  it('things built replace the size when there are any', () => {
    expect(hero(data())).toContain('401.0 KB');
    const html = hero(data({ objectCount: 3 }));
    expect(html).toContain(`3${NB}things built`);
  });

  it('no-deed-found: "No valid deed found", never "Nobody has inscribed"', () => {
    const ownership = { ...unreachable(null), deed: { verdict: 'none', canonicalId: null, checkedAt: null, unreachableSince: null } } as unknown as BlockOwnership;
    const html = hero(data({ claimed: true, ownership }));
    expect(html).toContain('No valid deed found');
    expect(html).toContain('Bitcoin shows no valid deed inscription for this block yet.');
    expect(html).not.toContain('Nobody has inscribed');
  });

  it('unreachable: "Deed not checked", with "last verified" only when the server has that time', () => {
    const without = hero(data({ claimed: true, ownership: unreachable(null) }));
    expect(without).toMatch(/data-chip="deed"[^>]*>(<span[^>]*><\/span>)?<span[^>]*>Deed not checked<\/span>/);
    expect(without).not.toContain('last verified');
    const withTime = hero(data({ claimed: true, ownership: unreachable(new Date(NOW - 6 * 86_400_000).toISOString()) }));
    expect(withTime).toContain('Deed not checked · last verified 6 days ago');
    expect(withTime).toContain('data-tone="warn"');
  });

  it('unclaimed: "Not on Block Genomics"; degraded: "Ownership unavailable"', () => {
    expect(hero(data())).toContain('Not on Block Genomics');
    expect(hero(data({ degraded: true }))).toContain('Ownership unavailable');
  });

  it('the guardian chip: its name and state, or "No guardian yet"', () => {
    expect(hero(data())).toContain('No guardian yet');
    expect(hero(data(), { name: 'Atlas', label: 'Answers chat', tone: 'ok', key: 'answers-chat' })).toContain('Guardian Atlas · Answers chat');
  });

  it('DeedRecheck is there while a check is pending', () => {
    expect(hero(data())).not.toContain('data-testid="deed-recheck"');
    const html = hero(data({ claimed: true, ownership: { ...unreachable(null), checkPending: true } }));
    expect(html).toContain('data-testid="deed-recheck"');
  });
});

describe('the art, in the browser', () => {
  it('an error shows the placeholder and Try again, which asks for the same picture', () => {
    const src = `/api/v1/block-thumbnail/${HEIGHT}.png?v=3`;
    render(<BlockArt src={src} alt="art" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByTestId('block-art-failed')).toBeTruthy();
    expect(screen.getByText("The artwork didn't load.")).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('img').getAttribute('src')).toBe(src);
  });
});

describe('no 3D on the block page', () => {
  it('nothing under the page folder imports three or the nexus viewer', () => {
    const dir = path.join(__dirname, '..', '..', 'src', 'app', '(site)', 'block', '[height]');
    for (const f of fs.readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect([f, /from ['"]three['"]|from ['"][^'"]*components\/nexus/.test(src)]).toEqual([f, false]);
    }
  });
});
