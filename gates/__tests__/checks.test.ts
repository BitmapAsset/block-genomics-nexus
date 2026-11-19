import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gMap } from '../checks/g-map.ts';
import { gDistrict } from '../checks/g-district.ts';
import { gOwnerOnly } from '../checks/g-owner-only.ts';
import { gOpen } from '../checks/g-open.ts';
import { gSecCi } from '../checks/g-sec-ci.ts';
import { NotRunError } from '../lib/types.ts';
import type { Check, Ctx, ProbeResult } from '../lib/types.ts';
import { runGates } from '../run.ts';
import { BS, GH, NPM, SITE, fakeFetch, makeCtx } from './helpers.ts';
import type { Call, Route } from './helpers.ts';

// Runs a probe the way run.ts does: a NotRunError becomes not_run, any other throw a fail.
async function probe(check: Check, ctx: Ctx): Promise<ProbeResult> {
  try {
    return await check.probe(ctx);
  } catch (err) {
    if (err instanceof NotRunError) return { status: 'not_run', reason: err.message, values: {} };
    return { status: 'fail', reason: `the check stopped: ${(err as Error).message}`, values: {} };
  }
}

const HASH = 'ab'.repeat(32);

function chainRoutes(txCount = 12): Record<string, Route> {
  return {
    [`GET ${BS}/api/block-height/840000`]: { status: 200, text: HASH },
    [`GET ${BS}/api/block/${HASH}`]: { status: 200, body: { tx_count: txCount } },
  };
}

function layout(over: Record<string, unknown> = {}): Route {
  const squares = Array.from({ length: 12 }, (_, i) => [i, 0, 1]);
  return { status: 200, body: { height: 840000, txCount: 12, squares, source: 'live', ...over } };
}

describe('G-MAP', () => {
  const L = `GET ${SITE}/api/v1/blocks/840000/layout`;

  it('passes when the layout is live with one square per transaction', async () => {
    const r = await probe(gMap, makeCtx('G-MAP', { [L]: layout(), ...chainRoutes() }));
    expect(r.status).toBe('pass');
    expect(r.reason).toContain('1 blocks checked');
    expect(r.values).toEqual({ '840000': { txCount: 12, squares: 12, source: 'live', chainTxCount: 12 } });
  });

  it('fails when the layout counts one transaction short', async () => {
    const squares = Array.from({ length: 11 }, () => [0, 0, 1]);
    const r = await probe(gMap, makeCtx('G-MAP', { [L]: layout({ txCount: 11, squares }), ...chainRoutes() }));
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('The layout says 11 parcels; the chain says 12.');
  });

  it('fails when one square is missing', async () => {
    const squares = Array.from({ length: 11 }, () => [0, 0, 1]);
    const r = await probe(gMap, makeCtx('G-MAP', { [L]: layout({ squares }), ...chainRoutes() }));
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('The layout of block 840000 has 11 squares for 12 parcels.');
  });

  it('fails when the layout is estimated', async () => {
    const r = await probe(gMap, makeCtx('G-MAP', { [L]: layout({ source: 'estimated' }), ...chainRoutes() }));
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('The layout of block 840000 is estimated, not live.');
  });

  it('fails when the layout does not answer 200', async () => {
    const r = await probe(gMap, makeCtx('G-MAP', { [L]: { status: 503, body: {} }, ...chainRoutes() }));
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('The layout of block 840000 answered 503.');
  });

  it('does not run when the second source fails', async () => {
    const routes = { [L]: layout(), [`GET ${BS}/api/block-height/840000`]: { status: 502, text: 'bad gateway' } };
    const r = await probe(gMap, makeCtx('G-MAP', routes));
    expect(r.status).toBe('not_run');
    expect(r.reason).toContain('blockstream.info gave no block hash for 840000.');
  });
});

describe('G-DISTRICT', () => {
  const S = `GET ${SITE}/api/v1/blocks/840000/world/scale`;
  const scale = (over: Record<string, unknown> = {}): Route => ({
    status: 200,
    body: { height: 840000, edge_m: 2100, area_m2: 4410000, parcels: 12, ...over },
  });

  it('passes on 2.1 km by 2.1 km with one parcel per transaction', async () => {
    const r = await probe(gDistrict, makeCtx('G-DISTRICT', { [S]: scale(), ...chainRoutes() }));
    expect(r.status).toBe('pass');
  });

  it('fails on another edge', async () => {
    const r = await probe(gDistrict, makeCtx('G-DISTRICT', { [S]: scale({ edge_m: 2000 }), ...chainRoutes() }));
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('Block 840000 says edge 2000 m; the promise is 2100 m.');
  });

  it('fails on a parcel count that differs from the chain', async () => {
    const r = await probe(gDistrict, makeCtx('G-DISTRICT', { [S]: scale({ parcels: 11 }), ...chainRoutes() }));
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('Block 840000 has 11 parcels; the chain says 12.');
  });
});

describe('G-OWNER-ONLY', () => {
  const W0 = `GET ${SITE}/api/v1/world?blockHeight=840000`;
  const P0 = `GET ${SITE}/api/v1/blocks/840000/world`;
  const W1 = `GET ${SITE}/api/v1/world?blockHeight=840000&after=1`;
  const P1 = `GET ${SITE}/api/v1/blocks/840000/world?after=1`;
  const POST_WORLD = `POST ${SITE}/api/v1/world`;
  const POST_PLACE = `POST ${SITE}/api/v1/blocks/840000/world/place`;
  const objects = (n: number): Route => ({ status: 200, body: { objects: Array.from({ length: n }, (_, i) => ({ i })) } });
  const placements = (n: number): Route => ({ status: 200, body: { placements: Array.from({ length: n }, (_, i) => ({ i })) } });

  // A answers `a`, B (it carries a signature) answers `b`.
  function world(a: number, b: number): Route {
    return (body) => {
      const signed = typeof body === 'object' && body !== null && 'signature' in body;
      return { status: signed ? b : a, body: { error: 'refused' } };
    };
  }

  function routes(over: Record<string, Route> = {}): Record<string, Route> {
    return {
      [W0]: objects(3),
      [P0]: placements(2),
      [W1]: objects(3),
      [P1]: placements(2),
      [POST_WORLD]: world(401, 401),
      [POST_PLACE]: { status: 503, body: { enabled: false } },
      ...over,
    };
  }

  it('passes when A and B are refused, C is off and nothing changed', async () => {
    const calls: Call[] = [];
    const r = await probe(gOwnerOnly, makeCtx('G-OWNER-ONLY', routes(), { calls }));
    expect(r.status).toBe('pass');
    expect(r.reason).toBe('Builds without a signature and with a made-up signature were refused; nothing changed.');
    expect(r.values).toMatchObject({ a: 401, b: 401, c: 503, place: 'off', objects: [3, 3], placements: [2, 2] });
    expect(r.values.covers).toEqual(['no credential', 'made-up signature']);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([W0, P0, POST_WORLD, POST_WORLD, POST_PLACE, W1, P1]);
    const bodies = calls.filter((c) => c.method === 'POST').map((c) => JSON.parse(c.body ?? '{}'));
    expect(bodies[0]).toEqual({ blockHeight: 840000, objectType: 'box' });
    expect(bodies[1].signature).toBe('AA==');
    expect(bodies[2]).toEqual({});
    for (const c of calls) {
      expect(Object.keys(c.headers).sort()).toEqual(
        c.method === 'POST' ? ['accept', 'content-type', 'user-agent'] : ['accept', 'user-agent'],
      );
    }
  });

  it('passes when A and B answer 403 and C is refused', async () => {
    const r = await probe(
      gOwnerOnly,
      makeCtx('G-OWNER-ONLY', routes({ [POST_WORLD]: world(403, 403), [POST_PLACE]: { status: 401, body: {} } })),
    );
    expect(r.status).toBe('pass');
    expect(r.values.place).toBe('refused');
  });

  it('fails when a build is accepted', async () => {
    const r = await probe(gOwnerOnly, makeCtx('G-OWNER-ONLY', routes({ [POST_WORLD]: world(401, 201) })));
    expect(r.status).toBe('fail');
    expect(r.reason).toBe('The site accepted a build without a signature (request B, status 201).');
  });

  it('fails when the objects changed', async () => {
    const r = await probe(gOwnerOnly, makeCtx('G-OWNER-ONLY', routes({ [W1]: objects(4) })));
    expect(r.status).toBe('fail');
    expect(r.reason).toBe('objects changed: 3 before, 4 after');
  });

  it('fails when the placements changed', async () => {
    const r = await probe(gOwnerOnly, makeCtx('G-OWNER-ONLY', routes({ [P1]: placements(3) })));
    expect(r.status).toBe('fail');
    expect(r.reason).toBe('placements changed: 2 before, 3 after');
  });

  it('does not run when C answers 400 before a credential is checked', async () => {
    const r = await probe(gOwnerOnly, makeCtx('G-OWNER-ONLY', routes({ [POST_PLACE]: { status: 400, body: {} } })));
    expect(r.status).toBe('not_run');
    expect(r.reason).toBe('request C answered 400 before a credential was checked; the check needs a new request');
  });

  it('does not run when a read answers 500', async () => {
    const r = await probe(gOwnerOnly, makeCtx('G-OWNER-ONLY', routes({ [P0]: { status: 500, body: {} } })));
    expect(r.status).toBe('not_run');
    expect(r.reason).toContain('500');
  });

  it('does not run without a gate block, naming the variable', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gates-test-'));
    const calls: Call[] = [];
    const res = await runGates({
      argv: ['--out', out],
      env: {},
      fetchImpl: fakeFetch({}, calls),
      checks: [gOwnerOnly],
      print: () => {},
    });
    expect(res.code).toBe(0);
    const row = res.report?.checks.find((c) => c.id === 'G-OWNER-ONLY');
    expect(row?.status).toBe('not_run');
    expect(row?.reason).toContain('BG_GATES_GATE_BLOCK');
    expect(calls).toHaveLength(0);
  });
});

describe('G-OPEN', () => {
  const CARD = `GET ${SITE}/.well-known/mcp/server-card.json`;
  const card = (tools: unknown[] = [{ name: 'tool' }]): Route => ({
    status: 200,
    body: { serverInfo: { name: 'made-up', version: '9.9.9' }, tools },
  });

  function repo(): string {
    const root = mkdtempSync(join(tmpdir(), 'gates-repo-'));
    const write = (dir: string, version: string) => {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ version }));
    };
    write('cli', '1.2.0');
    write('packages/bg-mcp', '2.0.1');
    write('sdk/agent-connect', '3.1.0');
    return root;
  }

  function npm(cli: Route, mcp: Route, connect: Route): Record<string, Route> {
    return {
      [`GET ${NPM}/block-genomics/latest`]: cli,
      [`GET ${NPM}/block-genomics-mcp/latest`]: mcp,
      [`GET ${NPM}/block-genomics-connect/latest`]: connect,
    };
  }
  const v = (version: string): Route => ({ status: 200, body: { version } });

  it('passes with two packages waiting for a release', async () => {
    const r = await probe(
      gOpen,
      makeCtx('G-OPEN', { [CARD]: card(), ...npm(v('1.1.0'), v('2.0.1'), v('3.0.0')) }, { repoRoot: repo() }),
    );
    expect(r.status).toBe('pass');
    expect(r.reason).toBe('All three packages are on npm. 2 have a newer version waiting for a release.');
    expect(r.values.waitingForRelease).toEqual([
      { name: 'block-genomics', npm: '1.1.0', repository: '1.2.0' },
      { name: 'block-genomics-connect', npm: '3.0.0', repository: '3.1.0' },
    ]);
  });

  it('fails when a package is not on npm', async () => {
    const r = await probe(
      gOpen,
      makeCtx('G-OPEN', { [CARD]: card(), ...npm(v('1.2.0'), { status: 404, body: {} }, v('3.1.0')) }, { repoRoot: repo() }),
    );
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('block-genomics-mcp is not on npm.');
  });

  it('fails when npm is ahead of the repository', async () => {
    const r = await probe(
      gOpen,
      makeCtx('G-OPEN', { [CARD]: card(), ...npm(v('1.3.0'), v('2.0.1'), v('3.1.0')) }, { repoRoot: repo() }),
    );
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('npm has block-genomics 1.3.0; the repository is at 1.2.0.');
  });

  it('fails when the server card lists no tools', async () => {
    const r = await probe(
      gOpen,
      makeCtx('G-OPEN', { [CARD]: card([]), ...npm(v('1.2.0'), v('2.0.1'), v('3.1.0')) }, { repoRoot: repo() }),
    );
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('The server card lists no tools.');
  });

  it('does not run on a version that is not plain', async () => {
    const r = await probe(
      gOpen,
      makeCtx('G-OPEN', { [CARD]: card(), ...npm(v('1.0'), v('2.0.1'), v('3.1.0')) }, { repoRoot: repo() }),
    );
    expect(r.status).toBe('not_run');
    expect(r.reason).toContain('block-genomics');
  });
});

describe('G-SEC-CI', () => {
  const REPO = `${GH}/repos/BitmapAsset/block-genomics-nexus`;
  const DEPLOYS = `GET ${REPO}/deployments?environment=Production%20%E2%80%93%20app&per_page=3`;
  const SHA_OLD = '1'.repeat(40);
  const SHA = 'abc1234' + '0'.repeat(33);
  const status = (id: number) => `GET ${REPO}/deployments/${id}/statuses?per_page=1`;
  const RUNS = `GET ${REPO}/commits/${SHA}/check-runs?per_page=100`;
  const run = (name: string, conclusion: string, at: string) => ({
    name,
    status: 'completed',
    conclusion,
    completed_at: at,
  });
  const allGreen = [
    run('gates', 'success', '2026-01-01T00:01:00Z'),
    run('dep-audit', 'success', '2026-01-01T00:02:00Z'),
    run('secrets', 'success', '2026-01-01T00:03:00Z'),
    run('Analyze (javascript-typescript)', 'success', '2026-01-01T00:04:00Z'),
  ];

  function routes(checkRuns: unknown[], over: Record<string, Route> = {}): Record<string, Route> {
    return {
      [DEPLOYS]: { status: 200, body: [{ id: 11, sha: SHA_OLD }, { id: 12, sha: SHA }, { id: 13, sha: SHA_OLD }] },
      [status(11)]: { status: 200, body: [{ state: 'failure' }] },
      [status(12)]: { status: 200, body: [{ state: 'success' }] },
      [RUNS]: { status: 200, body: { total_count: checkRuns.length, check_runs: checkRuns } },
      ...over,
    };
  }

  it('passes when the four scans are green on the live commit', async () => {
    const r = await probe(gSecCi, makeCtx('G-SEC-CI', routes(allGreen)));
    expect(r.status).toBe('pass');
    expect(r.values.sha).toBe(SHA);
  });

  it('fails naming a scan that is missing', async () => {
    const r = await probe(gSecCi, makeCtx('G-SEC-CI', routes(allGreen.filter((c) => c.name !== 'dep-audit'))));
    expect(r.status).toBe('fail');
    expect(r.reason).toBe('On the live commit abc1234: dep-audit is missing.');
  });

  it('counts the latest run of a name', async () => {
    const runs = [...allGreen, run('gates', 'failure', '2026-01-01T00:09:00Z')];
    const r = await probe(gSecCi, makeCtx('G-SEC-CI', routes(runs)));
    expect(r.status).toBe('fail');
    expect(r.reason).toContain('gates');
    expect(r.reason).toContain('failure');
  });

  it('does not run without a successful deployment among three', async () => {
    const over = {
      [status(12)]: { status: 200, body: [{ state: 'error' }] },
      [status(13)]: { status: 200, body: [] },
    };
    const r = await probe(gSecCi, makeCtx('G-SEC-CI', routes(allGreen, over)));
    expect(r.status).toBe('not_run');
    expect(r.reason).toBe('No successful production deployment among the newest 3.');
  });

  it('does not run when GitHub refuses the read', async () => {
    const r = await probe(gSecCi, makeCtx('G-SEC-CI', { [DEPLOYS]: { status: 403, body: {} } }));
    expect(r.status).toBe('not_run');
    expect(r.reason).toBe('GitHub refused the anonymous read (rate limit).');
  });
});
