// Runs the promise checks against the live site and writes one JSON report and one line.
//
//   node gates/run.ts [--out <dir>] [--commit <sha>]
//
// Variables: BG_GATES_BLOCKS (comma list of up to 3 heights, default 840000),
// BG_GATES_GATE_BLOCK (the block G-OWNER-ONLY sends its refused requests for),
// BG_GATES_PLAN_FILE (planned checks that are not built yet, kept outside the repository).
// Exit 0 once the JSON is written, 2 when it could not be.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checks as builtChecks } from './checks/index.ts';
import { createClient } from './lib/http.ts';
import type { Answer } from './lib/http.ts';
import { loadPlan } from './lib/plan.ts';
import { redact } from './lib/redact.ts';
import { buildReport } from './lib/report.ts';
import type { CheckRow, PlanRow, Report } from './lib/report.ts';
import { NotRunError } from './lib/types.ts';
import type { Check, ProbeResult } from './lib/types.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUDGET = 40;
const NEED_VARIABLE: Record<string, string> = { gateBlock: 'BG_GATES_GATE_BLOCK' };

export type RunOptions = {
  argv: string[];
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  checks?: readonly Check[];
  print: (line: string) => void;
  now?: () => Date;
};

export type RunResult = { code: number; report?: Report };

function parseArgs(argv: string[]): { out: string; commit: string | null } {
  let out = './gates-out';
  let commit: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag === '--out' || flag === '--commit') && value !== undefined) {
      if (flag === '--out') out = value;
      else commit = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${flag}`);
    }
  }
  return { out, commit };
}

function parseHeights(raw: string | undefined): number[] {
  const text = raw === undefined || raw.trim() === '' ? '840000' : raw;
  const parts = text.split(',').map((p) => p.trim());
  if (parts.length > 3) throw new Error('BG_GATES_BLOCKS takes at most 3 heights');
  return parts.map((p) => {
    if (!/^\d+$/.test(p)) throw new Error(`BG_GATES_BLOCKS holds a height that is not an integer: ${p}`);
    return Number(p);
  });
}

function parseGateBlock(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  if (!/^\d+$/.test(raw.trim())) throw new Error('BG_GATES_GATE_BLOCK is not an integer');
  return Number(raw.trim());
}

export async function runGates(opts: RunOptions): Promise<RunResult> {
  const now = opts.now ?? (() => new Date());
  const print = (l: string) => opts.print(redact(l));
  const checks = opts.checks ?? builtChecks;

  let out: string;
  let commit: string | null;
  let heights: number[];
  let gateBlock: number | null;
  try {
    ({ out, commit } = parseArgs(opts.argv));
    heights = parseHeights(opts.env.BG_GATES_BLOCKS);
    gateBlock = parseGateBlock(opts.env.BG_GATES_GATE_BLOCK);
    mkdirSync(out, { recursive: true });
  } catch (err) {
    print(`promise checks: ${(err as Error).message}`);
    return { code: 2 };
  }

  const started = now();
  const budget = { left: BUDGET };
  const cache = new Map<string, Answer>();
  const rows: (CheckRow | PlanRow)[] = [];
  let requests = 0;

  for (const check of checks) {
    const http = createClient({ checkId: check.id, gateBlock, fetchImpl: opts.fetchImpl, budget, cache });
    let result: ProbeResult;
    const unmet = check.needs.find((n) => n === 'gateBlock' && gateBlock === null);
    if (unmet !== undefined) {
      result = { status: 'not_run', reason: `set ${NEED_VARIABLE[unmet]}`, values: {} };
    } else {
      try {
        result = await check.probe({ heights, gateBlock, http, repoRoot: REPO_ROOT });
      } catch (err) {
        result =
          err instanceof NotRunError
            ? { status: 'not_run', reason: err.message, values: {} }
            : { status: 'fail', reason: `the check stopped: ${(err as Error).message}`, values: {} };
      }
    }
    requests += http.requests.length;
    rows.push({
      id: check.id,
      promise: check.promise,
      group: check.group,
      status: result.status,
      reason: result.reason,
      values: result.values,
      ...(check.notCovered ? { notCovered: check.notCovered } : {}),
      requests: [...http.requests],
    });
  }

  const plan = loadPlan(
    opts.env.BG_GATES_PLAN_FILE,
    checks.map((c) => c.id),
  );
  rows.push(...plan.rows);

  const report = buildReport(rows, {
    commit,
    startedAt: started.toISOString(),
    finishedAt: now().toISOString(),
    requests,
    ...(plan.planError === undefined ? {} : { planError: plan.planError }),
  });

  try {
    const json = redact(JSON.stringify(report, null, 2)) + '\n';
    writeFileSync(join(out, `gates-${started.toISOString().slice(0, 10)}.json`), json);
    writeFileSync(join(out, 'latest.json'), json);
    writeFileSync(join(out, 'latest.txt'), redact(report.line) + '\n');
  } catch (err) {
    print(`promise checks: the report could not be written: ${(err as Error).message}`);
    return { code: 2, report };
  }

  print(report.line);
  for (const row of [...report.checks, ...report.security]) {
    if (row.status !== 'not_built') print(`${row.id} ${row.status} ${row.reason}`);
  }
  return { code: 0, report };
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const result = await runGates({
    argv: process.argv.slice(2),
    env: process.env,
    fetchImpl: fetch,
    print: (l) => console.log(l),
  });
  process.exitCode = result.code;
}
