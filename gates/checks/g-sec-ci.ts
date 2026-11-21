// The security scans are green on the commit that is live: the newest successful production
// deployment names a commit, and that commit's check runs hold the four scans, each green.
// GitHub is read anonymously.
import { jsonOf } from '../lib/chain.ts';
import type { Answer } from '../lib/http.ts';
import { NotRunError } from '../lib/types.ts';
import type { Check, Ctx, ProbeResult } from '../lib/types.ts';

const REPO = 'https://api.github.com/repos/BitmapAsset/block-genomics-nexus';
const ENVIRONMENT = 'Production%20%E2%80%93%20app';
const SCANS = ['gates', 'dep-audit', 'secrets', 'Analyze (javascript-typescript)'] as const;

type Run = { name?: unknown; status?: unknown; conclusion?: unknown; completed_at?: unknown };

function readable(a: Answer, what: string): unknown {
  if (a.status === 403) throw new NotRunError('GitHub refused the anonymous read (rate limit).');
  if (a.status !== 200) throw new NotRunError(`GitHub answered ${a.status} for ${what}.`);
  return jsonOf(a);
}

export const gSecCi: Check = {
  id: 'G-SEC-CI',
  promise: 'The security scans are green on the commit that is live.',
  group: 'security',
  needs: [],
  async probe(ctx: Ctx): Promise<ProbeResult> {
    const deploys = readable(
      await ctx.http.get(`${REPO}/deployments?environment=${ENVIRONMENT}&per_page=3`),
      'the deployments',
    );
    let sha: string | null = null;
    for (const d of Array.isArray(deploys) ? deploys.slice(0, 3) : []) {
      const id = (d as { id?: unknown }).id;
      const dsha = (d as { sha?: unknown }).sha;
      if (typeof id !== 'number' || typeof dsha !== 'string') continue;
      const statuses = readable(
        await ctx.http.get(`${REPO}/deployments/${id}/statuses?per_page=1`),
        'a deployment status',
      );
      const newest = Array.isArray(statuses) ? (statuses[0] as { state?: unknown } | undefined) : undefined;
      if (newest?.state === 'success') {
        sha = dsha;
        break;
      }
    }
    if (sha === null || !/^[0-9a-f]{40}$/.test(sha)) {
      return { status: 'not_run', reason: 'No successful production deployment among the newest 3.', values: {} };
    }

    const body = readable(await ctx.http.get(`${REPO}/commits/${sha}/check-runs?per_page=100`), 'the check runs');
    const runs = ((body as { check_runs?: unknown } | null)?.check_runs ?? []) as Run[];
    const found: Record<string, string | null> = {};
    const problems: string[] = [];
    for (const name of SCANS) {
      const done = (Array.isArray(runs) ? runs : []).filter(
        (r) => r.name === name && r.status === 'completed' && typeof r.completed_at === 'string',
      );
      done.sort((x, y) => String(y.completed_at).localeCompare(String(x.completed_at)));
      const latest = done[0];
      const conclusion = latest ? String(latest.conclusion) : null;
      found[name] = conclusion;
      if (conclusion === null) problems.push(`${name} is missing`);
      else if (conclusion !== 'success') problems.push(`${name} ended in ${conclusion}`);
    }
    const values = { sha, runs: found };
    const short = sha.slice(0, 7);
    if (problems.length > 0) {
      return { status: 'fail', reason: `On the live commit ${short}: ${problems.join('; ')}.`, values };
    }
    return { status: 'pass', reason: `The four scans are green on the live commit ${short}.`, values };
  },
};
