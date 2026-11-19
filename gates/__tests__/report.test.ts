import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPlan } from '../lib/plan.ts';
import { buildReport, line } from '../lib/report.ts';
import type { CheckRow, PlanRow } from '../lib/report.ts';
import type { Check } from '../lib/types.ts';
import { runGates } from '../run.ts';
import { fakeFetch } from './helpers.ts';

const meta = { commit: null, startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:05.000Z', requests: 0 };

function built(id: string, group: 'promise' | 'security', status: CheckRow['status'], notCovered?: string): CheckRow {
  return {
    id,
    promise: `made-up promise of ${id}`,
    group,
    status,
    reason: `made-up reason of ${id}`,
    values: {},
    requests: [],
    ...(notCovered ? { notCovered } : {}),
  };
}

function planned(n: number, group: 'promise' | 'security', prefix: string): PlanRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    group,
    status: 'not_built' as const,
    reason: 'not built yet: wave-x builds it',
  }));
}

const plan = [...planned(20, 'promise', 'G-FUTURE'), ...planned(2, 'security', 'G-FUTURE-SEC')];

describe('the report line', () => {
  it('reads the day-one shape', () => {
    const rows = [
      built('G-MAP', 'promise', 'pass', 'part'),
      built('G-DISTRICT', 'promise', 'pass'),
      built('G-OWNER-ONLY', 'promise', 'pass', 'part'),
      built('G-OPEN', 'promise', 'pass'),
      built('G-SEC-CI', 'security', 'fail'),
      ...plan,
    ];
    const r = buildReport(rows, meta);
    expect(line(r)).toBe('checks 4 of 24 green, 2 in part · not built yet: 20 · security 0 of 3 (red: G-SEC-CI)');
    expect(r.line).toBe(line(r));
    expect(r.schema).toBe('bg-gates/1');
    expect(r.base).toBe('https://blockgenomics.io');
    expect(r.summary).toEqual({
      total: 24,
      pass: 4,
      inPart: 2,
      fail: 0,
      notRun: 0,
      notBuilt: 20,
      securityTotal: 3,
      securityPass: 0,
    });
    expect(r.checks).toHaveLength(24);
    expect(r.security).toHaveLength(3);
    expect(r.checks[0]).toEqual({
      id: 'G-MAP',
      promise: 'made-up promise of G-MAP',
      status: 'pass',
      reason: 'made-up reason of G-MAP',
      values: {},
      notCovered: 'part',
      requests: [],
    });
    expect(r.checks[4]).toEqual({ id: 'G-FUTURE-1', status: 'not_built', reason: 'not built yet: wave-x builds it' });
  });

  it('names a red promise check and a green security check', () => {
    const rows = [
      built('G-MAP', 'promise', 'pass', 'part'),
      built('G-DISTRICT', 'promise', 'pass'),
      built('G-OWNER-ONLY', 'promise', 'not_run', 'part'),
      built('G-OPEN', 'promise', 'pass'),
      built('G-SEC-CI', 'security', 'pass'),
      ...plan,
    ];
    const r = buildReport(rows, meta);
    expect(line(r)).toBe('checks 3 of 24 green, 1 in part · red: G-OWNER-ONLY · not built yet: 20 · security 1 of 3');
    expect(r.summary.notRun).toBe(1);
  });

  it('reads without a plan file', () => {
    const rows = [
      built('G-MAP', 'promise', 'pass', 'part'),
      built('G-DISTRICT', 'promise', 'pass'),
      built('G-OWNER-ONLY', 'promise', 'pass', 'part'),
      built('G-OPEN', 'promise', 'pass'),
      built('G-SEC-CI', 'security', 'pass'),
    ];
    expect(line(buildReport(rows, meta))).toBe('checks 4 of 4 green, 2 in part · security 1 of 1');
  });
});

describe('the plan file', () => {
  function file(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'gates-plan-'));
    const path = join(dir, 'plan.json');
    writeFileSync(path, content);
    return path;
  }

  it('skips an entry whose check is built', () => {
    const path = file(
      JSON.stringify({
        notBuilt: [
          { id: 'G-MAP', group: 'promise', wave: 'wave-x' },
          { id: 'G-FUTURE-1', group: 'promise', wave: 'wave-y' },
          { id: 'G-FUTURE-SEC-1', group: 'security', wave: 'wave-z' },
        ],
      }),
    );
    const p = loadPlan(path, ['G-MAP']);
    expect(p.planError).toBeUndefined();
    expect(p.rows).toEqual([
      { id: 'G-FUTURE-1', group: 'promise', status: 'not_built', reason: 'not built yet: wave-y builds it' },
      { id: 'G-FUTURE-SEC-1', group: 'security', status: 'not_built', reason: 'not built yet: wave-z builds it' },
    ]);
  });

  it('gives a planError and no rows for a file it cannot read or parse', () => {
    const missing = loadPlan(join(tmpdir(), 'gates-no-such-dir', 'plan.json'), []);
    expect(missing.rows).toEqual([]);
    expect(missing.planError).toEqual(expect.any(String));
    const broken = loadPlan(file('{ not json'), []);
    expect(broken.rows).toEqual([]);
    expect(broken.planError).toEqual(expect.any(String));
    const noWave = loadPlan(file(JSON.stringify({ notBuilt: [{ id: 'G-FUTURE-1', group: 'promise' }] })), []);
    expect(noWave.rows).toEqual([]);
    expect(noWave.planError).toEqual(expect.any(String));
  });

  it('has no rows without a file', () => {
    expect(loadPlan(undefined, [])).toEqual({ rows: [] });
  });

  it('puts the planError into the JSON and goes on', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gates-out-'));
    const res = await runGates({
      argv: ['--out', out],
      env: { BG_GATES_PLAN_FILE: file('{ not json') },
      fetchImpl: fakeFetch({}),
      checks: [],
      print: () => {},
    });
    expect(res.code).toBe(0);
    const json = JSON.parse(readFileSync(join(out, 'latest.json'), 'utf8'));
    expect(json.planError).toEqual(expect.any(String));
    expect(json.summary.notBuilt).toBe(0);
  });
});

describe('the run', () => {
  const ok: Check = {
    id: 'G-MADE-UP',
    promise: 'A made-up promise.',
    group: 'promise',
    needs: [],
    probe: async () => ({ status: 'pass', reason: 'fine', values: {} }),
  };

  it('writes the dated JSON, latest.json and latest.txt with the line alone', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gates-out-'));
    const printed: string[] = [];
    const res = await runGates({
      argv: ['--out', out, '--commit', 'f'.repeat(40)],
      env: {},
      fetchImpl: fakeFetch({}),
      checks: [ok],
      print: (l) => printed.push(l),
      now: () => new Date('2026-01-02T03:04:05Z'),
    });
    expect(res.code).toBe(0);
    const dated = JSON.parse(readFileSync(join(out, 'gates-2026-01-02.json'), 'utf8'));
    expect(dated.commit).toBe('f'.repeat(40));
    expect(dated.runtime).toBe(process.version);
    expect(readFileSync(join(out, 'latest.txt'), 'utf8').trim()).toBe('checks 1 of 1 green · security 0 of 0');
    expect(printed[0]).toBe('checks 1 of 1 green · security 0 of 0');
    expect(printed).toContain('G-MADE-UP pass fine');
  });

  it('turns a stray throw into a fail', async () => {
    const broken: Check = { ...ok, probe: async () => Promise.reject(new Error('boom')) };
    const out = mkdtempSync(join(tmpdir(), 'gates-out-'));
    const res = await runGates({ argv: ['--out', out], env: {}, fetchImpl: fakeFetch({}), checks: [broken], print: () => {} });
    expect(res.report?.checks[0]).toMatchObject({ status: 'fail', reason: 'the check stopped: boom' });
  });

  it('exits 2 when the out directory cannot be written', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gates-out-'));
    const blocker = join(dir, 'a-file');
    writeFileSync(blocker, 'not a directory');
    const res = await runGates({
      argv: ['--out', join(blocker, 'out')],
      env: {},
      fetchImpl: fakeFetch({}),
      checks: [ok],
      print: () => {},
    });
    expect(res.code).toBe(2);
  });

  it('exits 2 when a report file cannot be written', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gates-out-'));
    mkdirSync(join(out, 'latest.json'));
    const res = await runGates({ argv: ['--out', out], env: {}, fetchImpl: fakeFetch({}), checks: [ok], print: () => {} });
    expect(res.code).toBe(2);
  });

  it('exits 2 on more than three heights or one that is not an integer', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gates-out-'));
    const base = { argv: ['--out', out], fetchImpl: fakeFetch({}), checks: [ok], print: () => {} };
    expect((await runGates({ ...base, env: { BG_GATES_BLOCKS: '840000,840000,840000,840000' } })).code).toBe(2);
    expect((await runGates({ ...base, env: { BG_GATES_BLOCKS: '840000,abc' } })).code).toBe(2);
  });
});
