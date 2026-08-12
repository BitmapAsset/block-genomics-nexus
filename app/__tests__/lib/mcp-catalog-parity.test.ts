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
  // Typed so `call.mock.calls[i][1]` is the CallOptions the tool passed, rather
  // than an empty tuple — these assertions are entirely about those options.
  type CallOpts = { method?: string; auth?: boolean; query?: unknown; body?: unknown };
  const call = jest.fn<Promise<string>, [string, CallOpts?]>(async () => '{}');
  const { publicTools, agentTools, ownerTools, writeTools } = buildToolCatalog(call);
  const all = [...publicTools, ...agentTools, ...ownerTools, ...writeTools];

  const ARGS = {
    height: 1,
    blockHeight: 1,
    id: 'x',
    q: 'x',
    address: 'x',
    walletAddress: 'x',
    message: 'm',
    handle: 'h',
    agentId: 'a',
    period: 'p',
    summary: 's',
    stats: {},
    objectType: 'cube',
  };

  it('splits into 21 public, 3 agent-token, 4 ownership-gated and 2 signature tools', () => {
    expect(publicTools).toHaveLength(21);
    expect(agentTools).toHaveLength(3);
    expect(ownerTools).toHaveLength(4);
    expect(writeTools).toHaveLength(2);
    expect(all).toHaveLength(30);
  });

  it('names every tool uniquely under the bg_ prefix', () => {
    const names = all.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^bg_[a-z0-9_]+$/);
  });

  it('marks every credentialed tool as needing a token, and no public one', async () => {
    for (const tool of [...agentTools, ...ownerTools]) {
      call.mockClear();
      await tool.run(ARGS);
      expect(call.mock.calls[0][1]).toMatchObject({ auth: true });
    }
    for (const tool of publicTools) {
      call.mockClear();
      await tool.run(ARGS);
      expect(call.mock.calls[0][1]?.auth).toBeUndefined();
    }
  });

  // The founder rule in executable form: connecting is not a capability. Every
  // tool that mutates state must sit behind a credential, so a bare anonymous
  // connection can read and nothing else.
  it('leaves no anonymous write path — every mutating tool is credentialed or signed', async () => {
    const signedNames = new Set(writeTools.map((t) => t.name));
    for (const tool of publicTools) {
      call.mockClear();
      await tool.run(ARGS);
      const opts = call.mock.calls[0][1] ?? {};
      const method = (opts.method ?? 'GET').toUpperCase();
      if (method === 'GET') continue;
      // A public non-GET is only allowed when it is an auth entry point
      // (obtaining a challenge/credential) or carries its own BIP-322 signature.
      expect(
        signedNames.has(tool.name) ||
          ['bg_challenge', 'bg_verify_start', 'bg_verify_submit', 'bg_guardian_chat'].includes(tool.name),
      ).toBe(true);
    }

    for (const tool of ownerTools) {
      call.mockClear();
      await tool.run(ARGS);
      expect(call.mock.calls[0][1]).toMatchObject({ auth: true });
    }
  });

  it('routes the ownership-gated build primitive through the gated world endpoint', async () => {
    const worldCreate = ownerTools.find((t) => t.name === 'bg_world_create');
    expect(worldCreate).toBeDefined();
    call.mockClear();
    await worldCreate!.run({ blockHeight: 12345, objectType: 'cube' });
    const [path, opts] = call.mock.calls[0];
    expect(path).toBe('/api/v1/world');
    expect(opts).toMatchObject({ method: 'POST', auth: true });
  });
});
