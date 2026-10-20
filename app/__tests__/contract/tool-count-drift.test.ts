/**
 * Contract guard: every published MCP tool count matches the catalog.
 *
 * mcp.json is generated from the catalog (mcp-manifest-drift.test.ts), but the
 * prose surfaces are hand-written: llms.txt and llms-full.txt said "30 tools"
 * after the catalog grew to 35, and agents read those files first. Any
 * "<n> tools" / "<n>-tool" claim in the files below must equal the catalog.
 */

import fs from 'fs';
import path from 'path';
import { buildToolCatalog } from '@/lib/mcp/catalog';

const ROOT = path.join(__dirname, '../..');
const FILES = [
  'public/llms.txt',
  'public/llms-full.txt',
  '../packages/bg-mcp/README.md',
  '../docs/SMITHERY-LISTING.md',
];

const catalog = buildToolCatalog(async () => '');
const TOOL_COUNT = Object.values(catalog).reduce((n, tools) => n + tools.length, 0);

it('the catalog has the tools the manifest advertises', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/.well-known/mcp.json'), 'utf8'));
  expect(manifest.tools).toHaveLength(TOOL_COUNT);
});

it.each(FILES)('%s states the real tool count', (rel) => {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const claims = [...text.matchAll(/\b(\d+)(?: |-)(?:MCP )?tools?\b/gi)].map((m) => Number(m[1]));
  expect(claims.length).toBeGreaterThan(0);
  expect(claims.filter((n) => n !== TOOL_COUNT)).toEqual([]);
});
