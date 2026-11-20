#!/usr/bin/env node
// Audits every lockfile of the tree with `npm audit --package-lock-only` and gates high and
// critical findings on a dated allow-list (.github/audit-allowlist.json). Built-ins only.
//
// Exit 1 when a finding has no allow-list entry, when an entry has expired, when an entry
// expires more than 30 days ahead, or when npm audit gives no answer. An entry whose finding
// is gone prints a `fixed: remove` line and does not fail. Moderate and low findings are
// not gated.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// npm audit's top-level key for its per-package findings.
export const FINDINGS_KEY = 'vulnerabilities';
const GATED = new Set(['high', 'critical']);
const GHSA = /GHSA(?:-[0-9a-z]{4}){3}/i;
const MAX_DAYS = 30;

// One finding per directory and GHSA id: { dir, ghsa, severity, package }.
export function findingsOf(auditJson, dir) {
  const out = [];
  const seen = new Set();
  const byPackage = (auditJson && auditJson[FINDINGS_KEY]) || {};
  for (const entry of Object.values(byPackage)) {
    for (const via of Array.isArray(entry && entry.via) ? entry.via : []) {
      if (typeof via !== 'object' || via === null || !GATED.has(via.severity)) continue;
      const m = GHSA.exec(String(via.url || ''));
      if (!m) continue;
      const ghsa = m[0];
      if (seen.has(ghsa)) continue;
      seen.add(ghsa);
      out.push({ dir, ghsa, severity: via.severity, package: via.name });
    }
  }
  return out;
}

function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

// today: YYYY-MM-DD (UTC). Returns { code, lines }.
export function evaluate(findings, entries, today) {
  const lines = [];
  let code = 0;
  const latest = addDays(today, MAX_DAYS);
  const key = (dir, ghsa) => `${dir} ${ghsa}`;
  const found = new Set(findings.map((f) => key(f.dir, f.ghsa)));

  for (const f of findings) {
    const allowed = entries.some((e) => e.dir === f.dir && e.ghsa === f.ghsa);
    lines.push(`${f.dir} ${f.package} ${f.ghsa} ${f.severity} ${allowed ? 'allowed' : 'NEW'}`);
    if (!allowed) code = 1;
  }
  for (const e of entries) {
    const expires = String(e.expires || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
      lines.push(`entry without a date: ${e.ghsa} (${e.dir})`);
      code = 1;
    } else if (expires < today) {
      lines.push(`expired: ${e.ghsa} (${e.dir}) on ${expires}`);
      code = 1;
    } else if (expires > latest) {
      lines.push(`too far ahead: ${e.ghsa} (${e.dir}) expires ${expires}, after ${latest}`);
      code = 1;
    }
    if (!found.has(key(e.dir, e.ghsa))) lines.push(`fixed: remove ${e.ghsa} (${e.dir})`);
  }
  return { code, lines };
}

function lockDirs(root) {
  const res = spawnSync('git', ['ls-files', '--', 'package-lock.json', '*/package-lock.json'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error('git ls-files failed');
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((p) => (dirname(p) === '.' ? '.' : dirname(p)));
}

function main() {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const entries = JSON.parse(readFileSync(join(root, '.github/audit-allowlist.json'), 'utf8')).entries;
  const findings = [];
  for (const dir of lockDirs(root)) {
    const res = spawnSync('npm', ['audit', '--package-lock-only', '--json'], {
      cwd: join(root, dir),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    let json = null;
    try {
      json = JSON.parse(res.stdout);
    } catch {
      json = null;
    }
    if (json === null || typeof json !== 'object' || 'error' in json) {
      console.log(`npm audit gave no answer for ${dir}`);
      process.exitCode = 1;
      return;
    }
    findings.push(...findingsOf(json, dir));
  }
  const { code, lines } = evaluate(findings, Array.isArray(entries) ? entries : [], new Date().toISOString().slice(0, 10));
  for (const l of lines) console.log(l);
  process.exitCode = code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
