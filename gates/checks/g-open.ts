// The SDK, the CLI and the MCP server are published on npm, at a version no newer than the
// repository's, and the site's MCP server card lists its tools.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonOf } from '../lib/chain.ts';
import type { Check, Ctx, ProbeResult } from '../lib/types.ts';

const NPM = 'https://registry.npmjs.org';
const PACKAGES: readonly { name: string; dir: string }[] = [
  { name: 'block-genomics', dir: 'cli' },
  { name: 'block-genomics-mcp', dir: 'packages/bg-mcp' },
  { name: 'block-genomics-connect', dir: 'sdk/agent-connect' },
];
const PLAIN = /^\d+\.\d+\.\d+$/;

function compare(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

function versionIn(repoRoot: string, dir: string): unknown {
  try {
    return (JSON.parse(readFileSync(join(repoRoot, dir, 'package.json'), 'utf8')) as { version?: unknown }).version;
  } catch {
    return undefined;
  }
}

export const gOpen: Check = {
  id: 'G-OPEN',
  promise: 'The SDK, the CLI and the MCP server are published as open packages.',
  group: 'promise',
  needs: [],
  async probe(ctx: Ctx): Promise<ProbeResult> {
    const fails: string[] = [];
    const notRun: string[] = [];

    const res = await ctx.http.get('/.well-known/mcp/server-card.json');
    const card = (res.status === 200 ? jsonOf(res) : null) as Record<string, unknown> | null;
    const info = (card?.serverInfo ?? null) as Record<string, unknown> | null;
    const tools = card?.tools;
    if (res.status !== 200) {
      fails.push(`The server card answered ${res.status}.`);
    } else {
      if (typeof info?.version !== 'string' || info.version === '') fails.push('The server card names no version.');
      if (!Array.isArray(tools) || tools.length === 0) fails.push('The server card lists no tools.');
    }

    const packages: { name: string; npm: unknown; repository: unknown }[] = [];
    const waitingForRelease: { name: string; npm: string; repository: string }[] = [];
    for (const p of PACKAGES) {
      const repository = versionIn(ctx.repoRoot, p.dir);
      const answer = await ctx.http.get(`${NPM}/${p.name}/latest`);
      if (answer.status === 404) {
        packages.push({ name: p.name, npm: null, repository });
        fails.push(`${p.name} is not on npm.`);
        continue;
      }
      const npm = answer.status === 200 ? (jsonOf(answer) as { version?: unknown } | null)?.version : undefined;
      packages.push({ name: p.name, npm, repository });
      if (answer.status !== 200) {
        notRun.push(`the npm registry answered ${answer.status} for ${p.name}.`);
        continue;
      }
      if (typeof npm !== 'string' || !PLAIN.test(npm) || typeof repository !== 'string' || !PLAIN.test(repository)) {
        notRun.push(`${p.name} has a version that is not plain (npm ${String(npm)}, repository ${String(repository)}).`);
        continue;
      }
      const order = compare(npm, repository);
      if (order > 0) fails.push(`npm has ${p.name} ${npm}; the repository is at ${repository}.`);
      if (order < 0) waitingForRelease.push({ name: p.name, npm, repository });
    }

    const values = {
      card: { status: res.status, version: info?.version, tools: Array.isArray(tools) ? tools.length : null },
      packages,
      waitingForRelease,
    };
    if (fails.length > 0) return { status: 'fail', reason: fails.join(' '), values };
    if (notRun.length > 0) return { status: 'not_run', reason: notRun.join(' '), values };
    const k = waitingForRelease.length;
    const reason =
      'All three packages are on npm.' + (k > 0 ? ` ${k} have a newer version waiting for a release.` : '');
    return { status: 'pass', reason, values };
  },
};
