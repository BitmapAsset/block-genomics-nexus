/**
 * The docs are split into one URL per capability or question. Each URL needs
 * its own head: a title short enough not to be cut in a result, a description
 * that fits, and an absolute canonical. The FAQPage structured data lives on
 * /docs/faq only, and mirrors the visible FAQ word for word.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Metadata } from 'next';

import { DOC_PAGES, docUrl } from '@/app/(site)/docs/doc-pages';
import { metadata as hub } from '@/app/(site)/docs/page';
import { metadata as quickstartCli } from '@/app/(site)/docs/quickstart-cli/page';
import { metadata as quickstartSdk } from '@/app/(site)/docs/quickstart-sdk/page';
import { metadata as concepts } from '@/app/(site)/docs/concepts/page';
import { metadata as api } from '@/app/(site)/docs/api/page';
import { metadata as cli } from '@/app/(site)/docs/cli/page';
import { metadata as sdk } from '@/app/(site)/docs/sdk/page';
import { metadata as faq } from '@/app/(site)/docs/faq/page';
import { metadata as whatIsABitmap } from '@/app/(site)/docs/what-is-a-bitmap/page';
import { metadata as bitcoinMcpServer } from '@/app/(site)/docs/bitcoin-mcp-server/page';
import { metadata as aiAgentIdentity } from '@/app/(site)/docs/ai-agent-identity-bitcoin/page';
import { metadata as runebolt } from '@/app/(site)/runebolt/layout';
import { metadata as connect } from '@/app/(site)/connect/layout';
import { metadata as whitepaper } from '@/app/(site)/whitepaper/page';
import { metadata as myBitmaps } from '@/app/(site)/my-bitmaps/page';
import { metadata as explore } from '@/app/(site)/explore/page';
import { metadata as live } from '@/app/(site)/live/layout';
import { metadata as offline } from '@/app/(site)/offline/layout';
import { metadata as agent } from '@/app/(site)/agent/layout';

jest.mock('@/app/(site)/whitepaper/whitepaper-client', () => () => null);
jest.mock('@/app/(site)/my-bitmaps/my-bitmaps-client', () => () => null);
// ESM-only renderers some pages import; only their metadata is under test.
jest.mock('react-markdown', () => () => null);
jest.mock('remark-gfm', () => () => null);
jest.mock('rehype-slug', () => () => null);
jest.mock('github-slugger', () => class {});

const PAGES: Record<string, Metadata> = {
  'quickstart-cli': quickstartCli,
  'quickstart-sdk': quickstartSdk,
  concepts,
  api,
  cli,
  sdk,
  faq,
  'what-is-a-bitmap': whatIsABitmap,
  'bitcoin-mcp-server': bitcoinMcpServer,
  'ai-agent-identity-bitcoin': aiAgentIdentity,
};

const text = (v: unknown) => String(v);
const canonical = (m: Metadata) => String((m.alternates as { canonical?: string } | undefined)?.canonical);
/* eslint-disable @typescript-eslint/no-explicit-any */
const og = (m: Metadata) => m.openGraph as any;
const tw = (m: Metadata) => m.twitter as any;

describe('docs pages', () => {
  it('has a page module for every registry entry and no extras', () => {
    expect(Object.keys(PAGES).sort()).toEqual(DOC_PAGES.map((p) => p.slug).sort());
  });

  it.each(DOC_PAGES.map((p) => [p.slug]))('/docs/%s has its own head', (slug) => {
    const m = PAGES[slug];

    expect(text(m.title).length).toBeLessThanOrEqual(60);
    expect(text(m.title).length).toBeGreaterThan(10);
    expect(text(m.description).length).toBeLessThanOrEqual(160);
    expect(text(m.description).length).toBeGreaterThan(60);
    expect(canonical(m)).toBe(docUrl(slug as never));
    expect(canonical(m)).toMatch(/^https:\/\/blockgenomics\.io\/docs\//);
    expect(tw(m).title).toBe(og(m).title);
    expect(tw(m).description).toBe(og(m).description);
  });

  it('gives every docs page a distinct title and description', () => {
    const all = [hub, ...Object.values(PAGES)];

    expect(new Set(all.map((m) => text(m.title))).size).toBe(all.length);
    expect(new Set(all.map((m) => text(m.description))).size).toBe(all.length);
  });

  it('keeps the hub canonical on /docs', () => {
    expect(canonical(hub)).toBe('https://blockgenomics.io/docs');
  });

  it('puts the FAQPage structured data on /docs/faq only', () => {
    const root = resolve(__dirname, '../../src/app/(site)/docs');
    const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

    expect(read('faq/page.tsx')).toContain('DOCS_FAQ_SCHEMA');
    expect(read('page.tsx')).not.toContain('DOCS_FAQ_SCHEMA');
    for (const { slug } of DOC_PAGES.filter((p) => p.slug !== 'faq')) {
      expect(read(`${slug}/page.tsx`)).not.toContain('DOCS_FAQ_SCHEMA');
    }
  });
});

describe('routes that used to inherit the root head', () => {
  it.each([
    ['/runebolt', runebolt],
    ['/connect', connect],
  ])('%s carries its own title, description and absolute canonical', (path, m) => {
    expect(text(m.title)).not.toMatch(/^Block Genomics —/);
    expect(text(m.title).length).toBeLessThanOrEqual(60);
    expect(text(m.description).length).toBeLessThanOrEqual(160);
    expect(canonical(m)).toBe(`https://blockgenomics.io${path}`);
  });

  it.each([
    ['/whitepaper', whitepaper],
    ['/my-bitmaps', myBitmaps],
    ['/explore', explore],
  ])('%s title stays within 60 characters and names its category', (_path, m) => {
    expect(text(m.title).length).toBeLessThanOrEqual(60);
    expect(text(m.title)).toContain('Block Genomics');
    expect(text(m.title).length).toBeGreaterThan('Explore — Block Genomics'.length);
  });
});

describe('app views stay out of search results', () => {
  it.each([
    ['/live', live],
    ['/offline', offline],
    ['/agent', agent],
  ])('%s is noindex,follow', (_path, m) => {
    expect(m.robots).toEqual({ index: false, follow: true });
  });
});
