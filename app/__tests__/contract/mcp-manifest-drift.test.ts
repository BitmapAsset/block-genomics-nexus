/**
 * Contract guard: `public/.well-known/mcp.json` is generated, never hand-edited.
 *
 * The manifest is what an MCP directory or client reads before it connects. It
 * used to be maintained by hand: its `tools` array described a different
 * surface from the one /mcp registers, and the tool count in `instructions`
 * went stale as the catalog grew. It is now written by `npm run mcp:manifest`
 * from buildMcpManifest() (src/lib/mcp/manifest.ts), which reads the endpoint's
 * own catalog, and this suite fails the moment the checked-in file and the
 * builder disagree.
 */

import fs from 'fs';
import path from 'path';
import { GET as serverCard } from '@/app/.well-known/mcp/server-card.json/route';
import { renderMcpManifest } from '@/lib/mcp/manifest';
import { bgTools } from '@/lib/mcp/server';
import { createCall } from '@/lib/mcp/client';
import { buildToolCatalog } from '@/lib/mcp/catalog';

const MANIFEST_PATH = path.join(__dirname, '../../public/.well-known/mcp.json');
const REGENERATE = 'Run `npm run mcp:manifest` (from app/) and commit the regenerated file.';

type ToolEntry = {
  name: string;
  description: string;
  requiresSigner?: true;
  requiresToken?: true;
  inputSchema: Record<string, unknown>;
};

/** Line-level pointer into the first mismatch; the files are too large for a useful full diff. */
function firstDifference(actual: string, expected: string): string {
  const a = actual.split('\n');
  const e = expected.split('\n');
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] !== e[i]) {
      return `line ${i + 1}: expected ${JSON.stringify(e[i] ?? '<end of file>')}, found ${JSON.stringify(a[i] ?? '<end of file>')}`;
    }
  }
  return 'no line differs';
}

const onDisk = fs.readFileSync(MANIFEST_PATH, 'utf8');

// Parsed per test rather than at load, so a hand edit that breaks the JSON
// still reaches the drift check and its regenerate hint.
const readManifest = () => JSON.parse(onDisk) as { instructions: string; tools: ToolEntry[] };

describe('public/.well-known/mcp.json', () => {
  it('is exactly what buildMcpManifest() generates', () => {
    const expected = renderMcpManifest();
    if (onDisk !== expected) {
      throw new Error(
        'public/.well-known/mcp.json has drifted from the MCP tool catalog ' +
          `(${firstDifference(onDisk, expected)}). ${REGENERATE}`,
      );
    }
  });

  it('keeps its published shape: the same top-level keys in the same order', () => {
    expect(Object.keys(readManifest())).toEqual([
      '$schema',
      'name',
      'version',
      'description',
      'homepage',
      'openapi',
      'remotes',
      'packages',
      'instructions',
      'tools',
    ]);
  });

  it('gives every tool a name, a description and an object input schema', () => {
    for (const tool of readManifest().tools) {
      // The pre-generation entry shape, optional credential flags included.
      const flags = Object.keys(tool).filter((k) => k === 'requiresSigner' || k === 'requiresToken');
      expect(Object.keys(tool)).toEqual(['name', 'description', ...flags, 'inputSchema']);
      for (const flag of flags) expect(tool[flag as 'requiresSigner' | 'requiresToken']).toBe(true);
      expect(tool.name).toMatch(/^bg_[a-z0-9_]+$/);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('flags the tools that need a credential, as the hand-written manifest did', () => {
    const { agentTools, ownerTools, writeTools } = buildToolCatalog(createCall({ base: 'https://blockgenomics.io' }));
    const byName = new Map(readManifest().tools.map((t) => [t.name, t]));
    for (const t of [...agentTools, ...ownerTools]) expect(byName.get(t.name)).toMatchObject({ requiresToken: true });
    for (const t of writeTools) expect(byName.get(t.name)).toMatchObject({ requiresSigner: true });
    const flagged = new Set([...agentTools, ...ownerTools, ...writeTools].map((t) => t.name));
    for (const t of readManifest().tools.filter((t) => !flagged.has(t.name))) {
      expect(t.requiresSigner).toBeUndefined();
      expect(t.requiresToken).toBeUndefined();
    }
  });

  it('lists exactly the tools the endpoint registers, described as the server card describes them', async () => {
    const registered = bgTools(createCall({ base: 'https://blockgenomics.io' })).map((t) => t.name);
    const card = (await serverCard().json()) as { tools: ToolEntry[] };
    const { tools } = readManifest();

    expect(tools.map((t) => t.name)).toEqual(registered);
    // Same entries as the card, apart from the manifest's credential flags.
    expect(tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))).toEqual(card.tools);
  });

  it('states the live tool count wherever its instructions give one', () => {
    const { instructions, tools } = readManifest();
    const counts = [...instructions.matchAll(/(\d+)(?: `bg_\*`)? tools\b/g)].map((m) => Number(m[1]));
    expect(counts.length).toBeGreaterThan(0);
    for (const count of counts) expect(count).toBe(tools.length);
  });
});
