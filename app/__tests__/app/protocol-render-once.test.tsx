/**
 * /protocol renders per request (it carries the CSP nonce), but the spec, its
 * table of contents, the badges and the markdown tree are build inputs: they
 * are read and parsed once per server instance and every later request reuses
 * the same element tree. A failed read is not kept, so the next request
 * retries it.
 */

import { renderToStaticMarkup } from 'react-dom/server';

const mockMarkdown = jest.fn((props: { children?: string }) => (
  <div data-markdown="">{String(props.children ?? '').length}</div>
));
// ESM-only renderers; the call count is what is under test.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: (props: { children?: string }) => mockMarkdown(props),
}));
jest.mock('remark-gfm', () => () => null);
jest.mock('rehype-slug', () => () => null);
jest.mock('github-slugger', () =>
  class {
    slug(s: string) {
      return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
  },
);

const mockReadFileSync = jest.fn();
jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  return {
    ...actual,
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  };
});

import ProtocolPage from '@/app/(site)/protocol/page';

const { readFileSync: realReadFileSync } = jest.requireActual('node:fs') as typeof import('node:fs');
const reads = (suffix: string) =>
  mockReadFileSync.mock.calls.filter(([p]) => String(p).endsWith(suffix)).length;

beforeEach(() => {
  mockReadFileSync.mockImplementation((...a: unknown[]) => (realReadFileSync as (...x: unknown[]) => unknown)(...a));
});

it('parses the spec once for two requests and reads each file once', () => {
  const first = renderToStaticMarkup(<ProtocolPage />);
  const second = renderToStaticMarkup(<ProtocolPage />);

  expect(mockMarkdown).toHaveBeenCalledTimes(1);
  expect(reads('nexus-protocol-v1.md')).toBe(1);
  expect(reads('openapi.json')).toBe(1);

  // Same page both times: badges, TOC and the rendered article.
  expect(second).toBe(first);
  expect(first).toContain('Nexus Protocol v');
  expect(first).toContain('OpenAPI ');
  expect(first).toContain('data-markdown');
  expect(first).toMatch(/<article class="doc-prose min-w-0"><div data-markdown="">\d+<\/div><\/article>/);
});

it('does not keep a failed read: the next request reads again', async () => {
  // A fresh module instance (nothing cached yet); the renderer comes from the same
  // registry so it shares that instance's React.
  await jest.isolateModulesAsync(async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup: render } = await import('react-dom/server');
    const { default: Page } = await import('@/app/(site)/protocol/page');
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error('spec unreadable');
    });
    expect(() => render(createElement(Page))).toThrow('spec unreadable');
    expect(render(createElement(Page))).toContain('Nexus Protocol v');
  });
});
