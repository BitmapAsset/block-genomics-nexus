/**
 * Regenerate `public/.well-known/mcp.json` from the MCP tool catalog.
 *
 *   npm run mcp:manifest
 *
 * The content comes from buildMcpManifest() in src/lib/mcp/manifest.ts — edit
 * the copy there, then re-run this. __tests__/contract/mcp-manifest-drift.test.ts
 * fails in CI while the checked-in file and the builder disagree.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderMcpManifest } from '../src/lib/mcp/manifest';

const out = join(import.meta.dirname, '..', 'public', '.well-known', 'mcp.json');
const next = renderMcpManifest();

if (existsSync(out) && readFileSync(out, 'utf8') === next) {
  console.log('[mcp-manifest] public/.well-known/mcp.json already up to date');
} else {
  writeFileSync(out, next);
  console.log(`[mcp-manifest] wrote public/.well-known/mcp.json (${JSON.parse(next).tools.length} tools)`);
}
