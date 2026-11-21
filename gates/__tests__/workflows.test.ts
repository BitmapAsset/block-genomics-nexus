// Line rules over every workflow file. Lines whose first non-space character is `#` are skipped.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('../../.github/workflows/', import.meta.url));
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.yml'))
  .sort();

function lines(file: string): { n: number; text: string }[] {
  return readFileSync(join(DIR, file), 'utf8')
    .split('\n')
    .map((text, i) => ({ n: i + 1, text }))
    .filter((l) => !l.text.trimStart().startsWith('#'));
}

const PINNED = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40} # v\d/;
const DOCKER = /^docker:\/\/\S+@sha256:[0-9a-f]{64}$/;

describe('workflow files', () => {
  it('finds the workflow files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('sets permissions at the top level of every file', () => {
    const missing = files.filter((f) => !lines(f).some((l) => l.text.startsWith('permissions:')));
    expect(missing).toEqual([]);
  });

  it('pins every action by commit or digest', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const l of lines(f)) {
        const m = /^\s*(?:-\s+)?uses:\s*(.+?)\s*$/.exec(l.text);
        if (!m) continue;
        const value = m[1];
        if (value.startsWith('./') || PINNED.test(value) || DOCKER.test(value)) continue;
        bad.push(`${f}:${l.n}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps no git credential after any checkout', () => {
    const bad: string[] = [];
    for (const f of files) {
      const all = readFileSync(join(DIR, f), 'utf8').split('\n');
      all.forEach((text, i) => {
        if (text.trimStart().startsWith('#') || !text.includes('actions/checkout@')) return;
        // The step's `-`: on this line, or two columns left of a key under `- name:`.
        const indent = text.length - text.trimStart().length;
        const dash = text.trimStart().startsWith('-') ? indent : indent - 2;
        let found = false;
        for (let j = i + 1; j < all.length; j += 1) {
          const next = all[j];
          if (next.trim() !== '' && next.length - next.trimStart().length <= dash) break;
          if (next.trim() === 'persist-credentials: false') found = true;
        }
        if (!found) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('never uses the pull_request_target trigger', () => {
    const bad = files.flatMap((f) => lines(f).filter((l) => l.text.includes('pull_request_target')).map((l) => `${f}:${l.n}`));
    expect(bad).toEqual([]);
  });
});
