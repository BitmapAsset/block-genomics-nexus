import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildToolCatalog } from '@/lib/mcp/catalog';

// Block Genomics ships two MCP surfaces from one catalog: the npm package
// `block-genomics-mcp` (stdio, packages/bg-mcp) and the remote endpoint at
// /mcp. A tool added to one and not the other means an agent sees a different
// protocol depending on how it connected. packages/bg-mcp/src/tools.ts is
// canonical; src/lib/mcp/catalog.ts is a verbatim mirror of the block between
// the markers, and this test fails the moment they drift.
//
// The canonical file lives outside the app's Vercel Root Directory, so it is
// not guaranteed to be present in a serverless build context — the parity
// assertion skips when unreachable, exactly like scripts/sync-protocol.mjs.
// CI checks out the whole tree, so drift is always caught there.

const CANONICAL = join(__dirname, '../../../packages/bg-mcp/src/tools.ts');
const MIRROR = join(__dirname, '../../src/lib/mcp/catalog.ts');

const BEGIN = '// ===== BEGIN SHARED TOOL CATALOG =====';
const END = '// ===== END SHARED TOOL CATALOG =====';

function extractCatalog(source: string): string {
  const start = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  if (start === -1 || end === -1) throw new Error('SHARED TOOL CATALOG markers not found');
  return source.slice(start, end + END.length);
}

describe('MCP catalog app <-> npm package parity', () => {
  const canonicalReachable = existsSync(CANONICAL);

  (canonicalReachable ? it : it.skip)('shared catalog is byte-for-byte identical', () => {
    expect(extractCatalog(readFileSync(MIRROR, 'utf8'))).toBe(
      extractCatalog(readFileSync(CANONICAL, 'utf8')),
    );
  });

  it('mirror carries the marked catalog block', () => {
    expect(extractCatalog(readFileSync(MIRROR, 'utf8')).length).toBeGreaterThan(1000);
  });
});

describe('tool catalog shape', () => {
  const call = jest.fn(async () => '{}');
  const { publicTools, agentTools, writeTools } = buildToolCatalog(call);
  const all = [...publicTools, ...agentTools, ...writeTools];

  it('splits into 18 public, 3 agent-token and 2 signature tools', () => {
    expect(publicTools).toHaveLength(18);
    expect(agentTools).toHaveLength(3);
    expect(writeTools).toHaveLength(2);
  });

  it('names every tool uniquely under the bg_ prefix', () => {
    const names = all.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^bg_[a-z0-9_]+$/);
  });

  it('marks exactly the runtime tools as needing a token', async () => {
    for (const tool of agentTools) {
      call.mockClear();
      await tool.run({ agentId: 'a', period: 'p', summary: 's', stats: {} });
      expect(call.mock.calls[0][1]).toMatchObject({ auth: true });
    }
    for (const tool of publicTools) {
      call.mockClear();
      await tool.run({ height: 1, blockHeight: 1, id: 'x', q: 'x', address: 'x', walletAddress: 'x', message: 'm' });
      expect(call.mock.calls[0][1]?.auth).toBeUndefined();
    }
  });
});
