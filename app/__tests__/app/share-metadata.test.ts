/**
 * QA 2026-10-22 #17: X showed the homepage's twitter text for /docs and
 * /protocol (they set only openGraph), /whitepaper had the root og text, /nexus
 * and /brain had the generic <title>, and /nexus?block=h unfurled as the
 * homepage. Each page now carries its own text in both formats, and the map
 * deep link unfurls as its block.
 */

jest.mock('@/lib/block-summary', () => ({ isAboveTip: async (h: number) => h > 972_700 }));
jest.mock('@/app/(site)/nexus/nexus-client', () => () => null);
jest.mock('@/app/(site)/whitepaper/whitepaper-client', () => () => null);
// ESM-only renderers the docs/protocol pages import; only their metadata is under test.
jest.mock('react-markdown', () => () => null);
jest.mock('remark-gfm', () => () => null);
jest.mock('rehype-slug', () => () => null);
jest.mock('github-slugger', () => class {});

import type { Metadata } from 'next';
import { metadata as whitepaper } from '@/app/(site)/whitepaper/page';
import { metadata as brain } from '@/app/(site)/brain/layout';
import { metadata as docs } from '@/app/(site)/docs/page';
import { metadata as protocol } from '@/app/(site)/protocol/page';
import { generateMetadata as nexusMeta } from '@/app/(site)/nexus/page';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT_TITLE = 'Block Genomics — Bitcoin DNA for Verified AI';
const tw = (m: Metadata) => m.twitter as any;
const og = (m: Metadata) => m.openGraph as any;
const nexus = (block?: string) => nexusMeta({ searchParams: Promise.resolve(block === undefined ? {} : { block }) });

function ownText(m: Metadata) {
  expect(m.title).not.toBe(ROOT_TITLE);
  expect(tw(m).title).toBe(og(m).title);
  expect(tw(m).title).not.toBe(ROOT_TITLE);
  expect(tw(m).description).toBe(og(m).description);
  expect(tw(m).card).toBe('summary_large_image');
  expect(tw(m).images).toHaveLength(1);
}

it.each([
  ['/docs', docs],
  ['/protocol', protocol],
  ['/whitepaper', whitepaper],
  ['/brain', brain],
])('%s has its own title and share text in both formats', (_p, m) => ownText(m));

it('/nexus has its own title and share text', async () => {
  const m = await nexus();
  ownText(m);
  expect(m.title).toBe('The Nexus: Bitcoin Block Map | Block Genomics');
});

it('/nexus?block=718840 unfurls as that block with its card', async () => {
  const m = await nexus('718840');
  ownText(m);
  expect(String(m.title)).toContain('Block 718,840');
  expect(String(m.description)).toContain('Epoch 4 · The Adoption Era');
  expect(tw(m).images).toEqual(['/og/block/718840']);
  expect(og(m).images[0].url).toBe('/og/block/718840');
  expect(m.alternates?.canonical).toBe('/block/718840');
});

it.each(['abc', '980000', ''])('/nexus?block=%s falls back to the map text', async (b) => {
  const m = await nexus(b);
  expect(m.title).toBe('The Nexus: Bitcoin Block Map | Block Genomics');
  expect(m.alternates?.canonical).toBe('/nexus');
});
