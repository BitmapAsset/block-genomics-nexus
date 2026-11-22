/**
 * G1 docs truth (CRAWL-AUDIT 2026-11-21): the docs hub said "Sixteen endpoints"
 * while the spec has more paths, and /docs/SDK.md (a 404) was linked from the
 * agent profile and named as the SDK docs in the OpenAPI file.
 */
import fs from 'fs';
import path from 'path';
import { ENDPOINTS, openApiCounts } from '@/app/(site)/docs/docs-content';

const appRoot = path.join(__dirname, '..', '..');
const repoRoot = path.join(appRoot, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(appRoot, ...p), 'utf8');

/** A site path such as /docs/sdk maps to a page file under app/src/app/(site). */
function sitePageExists(urlPath: string): boolean {
  const rel = urlPath.replace(/^\/+/, '');
  return fs.existsSync(path.join(appRoot, 'src', 'app', '(site)', rel, 'page.tsx'));
}

describe('docs hub endpoint count', () => {
  const cwd = process.cwd();
  beforeAll(() => process.chdir(appRoot));
  afterAll(() => process.chdir(cwd));

  it('counts paths and operations from public/openapi.json', () => {
    const spec = JSON.parse(read('public', 'openapi.json')) as { paths: Record<string, Record<string, unknown>> };
    const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
    const ops = Object.values(spec.paths).reduce((n, item) => n + Object.keys(item).filter((k) => methods.includes(k)).length, 0);
    expect(openApiCounts()).toEqual({ paths: Object.keys(spec.paths).length, operations: ops });
  });

  it('the hub derives its numbers instead of a hardcoded word', () => {
    const hub = read('src', 'app', '(site)', 'docs', 'page.tsx');
    expect(hub).not.toMatch(/Sixteen endpoints/i);
    expect(hub).toContain('{ENDPOINTS.length}');
    expect(hub).toContain('openApiCounts()');
    expect(ENDPOINTS.length).toBeGreaterThan(0);
  });
});

describe('SDK docs link points at a page that exists', () => {
  it('the agent profile links /docs/sdk, never /docs/SDK.md', () => {
    const src = read('src', 'app', '(site)', 'agent', '[handle]', 'agent-profile-client.tsx');
    expect(src).not.toContain('/docs/SDK.md');
    const hrefs = [...src.matchAll(/href="(\/docs\/[^"#?]*)"/g)].map((m) => m[1]);
    expect(hrefs).toContain('/docs/sdk');
    for (const h of hrefs) expect(sitePageExists(h)).toBe(true);
  });

  it.each([
    ['app/public/openapi.json', path.join(appRoot, 'public', 'openapi.json')],
    ['sdk/agent-connect/openapi.json', path.join(repoRoot, 'sdk', 'agent-connect', 'openapi.json')],
  ])('%s names a docs page that exists in x-bg-sdk.docs', (_label, file) => {
    const spec = JSON.parse(fs.readFileSync(file, 'utf8')) as { 'x-bg-sdk': { docs: string } };
    const url = new URL(spec['x-bg-sdk'].docs, 'https://blockgenomics.io/');
    expect(url.origin).toBe('https://blockgenomics.io');
    expect(url.pathname).not.toMatch(/SDK\.md$/);
    expect(sitePageExists(url.pathname)).toBe(true);
  });

  it('the two published copies of the spec stay identical', () => {
    expect(fs.readFileSync(path.join(repoRoot, 'sdk', 'agent-connect', 'openapi.json'), 'utf8')).toBe(read('public', 'openapi.json'));
  });
});
