/**
 * JsonLd carries the request nonce (the `x-nonce` request header middleware
 * sets), so every <script> element on a page is uniform under the report-only
 * policy. Its JSON is unchanged: `<` stays escaped.
 */

const requestHeaders = { current: new Headers() };
jest.mock('next/headers', () => ({
  headers: jest.fn(async () => requestHeaders.current),
}));

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JsonLd from '@/components/seo/JsonLd';

const DATA = { '@type': 'Thing', name: 'a </script><b>tag</b>' };
const ESCAPED = JSON.stringify(DATA).replace(/</g, '\\u003c');

async function render(): Promise<string> {
  // A server component: call it, then render what it returns.
  const element = await (JsonLd as (p: { data: Record<string, unknown> }) => unknown)({ data: DATA });
  return renderToStaticMarkup(element as ReactElement);
}

describe('JsonLd', () => {
  it('renders nonce equal to x-nonce', async () => {
    requestHeaders.current = new Headers({ 'x-nonce': 'bm9uY2UtZml4dHVyZQ==' });
    const html = await render();
    expect(html).toMatch(/^<script type="application\/ld\+json" nonce="bm9uY2UtZml4dHVyZQ==">/);
    expect(html).toContain(ESCAPED);
    expect(html).not.toContain('</script><b>');
  });

  it('renders no nonce attribute when the request carries none', async () => {
    requestHeaders.current = new Headers();
    const html = await render();
    expect(html).not.toContain('nonce=');
    expect(html).toBe(`<script type="application/ld+json">${ESCAPED}</script>`);
  });
});
