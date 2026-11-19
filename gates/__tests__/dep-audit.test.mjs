// The dependency audit's rules, on made-up npm audit answers. `.mjs`, so the strict typecheck
// of gates/ does not read the script it imports.
import { describe, expect, it } from 'vitest';
import { FINDINGS_KEY, evaluate, findingsOf } from '../../.github/scripts/dep-audit.mjs';

const A = 'GHSA-2222-3333-4444';
const B = 'GHSA-5555-6666-7777';
const today = '2026-01-10';

describe('evaluate', () => {
  const finding = { dir: '.', ghsa: A, severity: 'high', package: 'made-up' };

  it('fails on a finding without an entry', () => {
    const r = evaluate([finding], [], today);
    expect(r.code).toBe(1);
    expect(r.lines.join('\n')).toContain('NEW');
  });

  it('fails on an expired entry', () => {
    const r = evaluate([finding], [{ ghsa: A, dir: '.', reason: 'r', expires: '2026-01-09' }], today);
    expect(r.code).toBe(1);
  });

  it('fails on an entry that expires more than 30 days ahead', () => {
    const r = evaluate([finding], [{ ghsa: A, dir: '.', reason: 'r', expires: '2026-02-10' }], today);
    expect(r.code).toBe(1);
  });

  it('passes on an allowed finding', () => {
    const r = evaluate([finding], [{ ghsa: A, dir: '.', reason: 'r', expires: '2026-02-09' }], today);
    expect(r.code).toBe(0);
    expect(r.lines).toContain(`. made-up ${A} high allowed`);
  });

  it('passes on an entry without a finding, asking for its removal', () => {
    const r = evaluate([], [{ ghsa: B, dir: 'app', reason: 'r', expires: '2026-01-20' }], today);
    expect(r.code).toBe(0);
    expect(r.lines).toContain(`fixed: remove ${B} (app)`);
  });
});

describe('findingsOf', () => {
  const via = (name, ghsa, severity) => ({
    source: 1,
    name,
    title: 'made-up',
    url: `https://github.com/advisories/${ghsa}`,
    severity,
    range: '<1.0.0',
  });

  it('keeps high and critical, drops moderate', () => {
    const audit = {
      [FINDINGS_KEY]: {
        one: { name: 'one', severity: 'high', via: [via('one', A, 'high')] },
        two: { name: 'two', severity: 'moderate', via: [via('two', B, 'moderate')] },
      },
    };
    expect(findingsOf(audit, 'cli')).toEqual([{ dir: 'cli', ghsa: A, severity: 'high', package: 'one' }]);
  });

  it('counts a critical reached through two packages once per directory', () => {
    const audit = {
      [FINDINGS_KEY]: {
        deep: { name: 'deep', severity: 'critical', via: [via('deep', A, 'critical')] },
        parent: { name: 'parent', severity: 'critical', via: ['deep', via('deep', A, 'critical')] },
      },
    };
    expect(findingsOf(audit, '.')).toEqual([{ dir: '.', ghsa: A, severity: 'critical', package: 'deep' }]);
  });
});
