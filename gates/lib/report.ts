// The day's report: one JSON object and one line.
import type { RequestRecord } from './http.ts';
import type { ProbeResult } from './types.ts';

export const SCHEMA = 'bg-gates/1';
export const BASE = 'https://blockgenomics.io';

type Group = 'promise' | 'security';

// What the runner hands in: a built check's result, or a row of the plan file.
export type CheckRow = {
  id: string;
  promise: string;
  group: Group;
  status: ProbeResult['status'];
  reason: string;
  values: Record<string, unknown>;
  notCovered?: string;
  requests: RequestRecord[];
};

export type PlanRow = { id: string; group: Group; status: 'not_built'; reason: string };

export type ReportCheck = {
  id: string;
  promise: string;
  status: ProbeResult['status'];
  reason: string;
  values: Record<string, unknown>;
  notCovered?: string;
  requests: RequestRecord[];
};

export type ReportPlan = { id: string; status: 'not_built'; reason: string };

export type Summary = {
  total: number;
  pass: number;
  inPart: number;
  fail: number;
  notRun: number;
  notBuilt: number;
  securityTotal: number;
  securityPass: number;
};

export type Report = {
  schema: string;
  base: string;
  commit: string | null;
  runtime: string;
  startedAt: string;
  finishedAt: string;
  requests: number;
  summary: Summary;
  line: string;
  planError?: string;
  checks: (ReportCheck | ReportPlan)[];
  security: (ReportCheck | ReportPlan)[];
};

export type Meta = {
  commit: string | null;
  startedAt: string;
  finishedAt: string;
  requests: number;
  planError?: string;
};

function isPlan(row: CheckRow | PlanRow): row is PlanRow {
  return row.status === 'not_built';
}

function out(row: CheckRow | PlanRow): ReportCheck | ReportPlan {
  if (isPlan(row)) return { id: row.id, status: row.status, reason: row.reason };
  return {
    id: row.id,
    promise: row.promise,
    status: row.status,
    reason: row.reason,
    values: row.values,
    ...(row.notCovered ? { notCovered: row.notCovered } : {}),
    requests: row.requests,
  };
}

export function buildReport(rows: (CheckRow | PlanRow)[], meta: Meta): Report {
  const promise = rows.filter((r) => r.group === 'promise');
  const security = rows.filter((r) => r.group === 'security');
  const built = promise.filter((r): r is CheckRow => !isPlan(r));
  const summary: Summary = {
    total: promise.length,
    pass: built.filter((r) => r.status === 'pass').length,
    inPart: built.filter((r) => r.status === 'pass' && r.notCovered).length,
    fail: built.filter((r) => r.status === 'fail').length,
    notRun: built.filter((r) => r.status === 'not_run').length,
    notBuilt: promise.length - built.length,
    securityTotal: security.length,
    securityPass: security.filter((r) => r.status === 'pass').length,
  };
  const report: Report = {
    schema: SCHEMA,
    base: BASE,
    commit: meta.commit,
    runtime: process.version,
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
    requests: meta.requests,
    summary,
    line: '',
    ...(meta.planError === undefined ? {} : { planError: meta.planError }),
    checks: promise.map(out),
    security: security.map(out),
  };
  report.line = line(report);
  return report;
}

function redIds(rows: (ReportCheck | ReportPlan)[]): string[] {
  return rows.filter((r) => r.status === 'fail' || r.status === 'not_run').map((r) => r.id);
}

export function line(report: Report): string {
  const s = report.summary;
  let text = `checks ${s.pass} of ${s.total} green`;
  if (s.inPart > 0) text += `, ${s.inPart} in part`;
  const red = redIds(report.checks);
  if (red.length > 0) text += ` · red: ${red.join(', ')}`;
  if (s.notBuilt > 0) text += ` · not built yet: ${s.notBuilt}`;
  text += ` · security ${s.securityPass} of ${s.securityTotal}`;
  const secRed = redIds(report.security);
  if (secRed.length > 0) text += ` (red: ${secRed.join(', ')})`;
  return text;
}
