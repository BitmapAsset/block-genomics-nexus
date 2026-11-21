// Planned checks that are not built yet, read from a file kept outside the repository
// (BG_GATES_PLAN_FILE). Each becomes a `not_built` row, so the daily line counts them
// without claiming that anything ran.
import { readFileSync } from 'node:fs';
import type { PlanRow } from './report.ts';

export type Plan = { rows: PlanRow[]; planError?: string };

type Entry = { id: string; group: 'promise' | 'security'; wave: string };

function isEntry(e: unknown): e is Entry {
  if (typeof e !== 'object' || e === null) return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id !== '' &&
    (r.group === 'promise' || r.group === 'security') &&
    typeof r.wave === 'string' &&
    r.wave !== ''
  );
}

export function loadPlan(path: string | undefined, builtIds: string[]): Plan {
  if (path === undefined || path === '') return { rows: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { rows: [], planError: 'The plan file could not be read or parsed.' };
  }
  const list = (parsed as { notBuilt?: unknown } | null)?.notBuilt;
  if (!Array.isArray(list)) {
    return { rows: [], planError: 'The plan file has no notBuilt list.' };
  }
  if (!list.every(isEntry)) {
    return { rows: [], planError: 'An entry of the plan file has no id, group or wave.' };
  }
  const built = new Set(builtIds);
  const rows = list
    .filter((e) => !built.has(e.id))
    .map((e): PlanRow => ({ id: e.id, group: e.group, status: 'not_built', reason: `not built yet: ${e.wave} builds it` }));
  return { rows };
}
