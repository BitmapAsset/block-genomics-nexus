/**
 * Contract guard: `public/openapi.json` must describe the routes this app
 * actually serves.
 *
 * The spec is the machine-readable surface agents build against — it is served
 * at /openapi.json, bundled into the `block-genomics-connect` SDK, and pointed
 * at by mcp.json and ai-plugin.json. When it drifts, an agent's first request
 * fails against a route that never existed, or a shipped route stays invisible.
 * Nothing else in CI reads both sides, so drift was previously only findable by
 * hand.
 *
 * Three invariants:
 *   1. No phantom routes — every documented path + method is implemented.
 *   2. No silent additions — every implemented route is either documented or
 *      listed in UNDOCUMENTED_BY_DESIGN with a reason. A new route fails this
 *      suite until someone makes that call deliberately.
 *   3. The SDK's bundled copy is byte-identical to the served spec.
 */

import fs from 'fs';
import path from 'path';

const APP_ROOT = process.cwd();
const API_ROOT = path.join(APP_ROOT, 'src', 'app', 'api');
const SPEC_PATH = path.join(APP_ROOT, 'public', 'openapi.json');
const SDK_SPEC_PATH = path.join(APP_ROOT, '..', 'sdk', 'agent-connect', 'openapi.json');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Implemented routes that are intentionally absent from the public spec.
 *
 * Exact paths, not prefixes: a new route under an already-listed area still
 * fails until it is classified, which is the whole point of the registry.
 */
const UNDOCUMENTED_BY_DESIGN: Record<string, string> = {
  // ── Deployment and internal jobs. Publishing these invites calls we would
  //    only have to reject, and none of them are protocol surface. ──
  '/api/health': 'liveness probe for the deployment, not a protocol route',
  '/api/v1/activity': 'internal activity write, called by our own routes',
  '/api/v1/admin/cleanup': 'operator-only maintenance',
  '/api/v1/admin/cleanup-duplicates': 'operator-only maintenance',
  '/api/v1/analytics': 'internal telemetry read',
  '/api/v1/inscriptions/scan': 'internal indexer job',
  '/api/v1/ownership/cron': 'scheduled reconciliation job, not caller-facing',
  '/api/v1/brain/appeal': 'Nexus Brain moderation internals',
  '/api/v1/brain/cron': 'Nexus Brain scheduled job',
  '/api/v1/brain/flag': 'Nexus Brain moderation internals',
  '/api/v1/brain/heartbeat-chain': 'Nexus Brain internals',
  '/api/v1/brain/heartbeat-chain/anchor': 'Nexus Brain internals',
  '/api/v1/brain/scan': 'Nexus Brain internals',
  '/api/v1/brain/stats': 'Nexus Brain internals',
  '/api/v1/brain/status': 'Nexus Brain internals',

  // ── Cookie-session endpoints for the web client. Agents authenticate with
  //    BIP-322 + bearer tokens instead, so these would mislead them. ──
  '/api/v1/session': 'browser cookie session, not the agent auth path',
  '/api/v1/session/start': 'browser cookie session',
  '/api/v1/session/username': 'browser cookie session',
  '/api/v1/session/verify': 'browser cookie session',
  '/api/v1/encryption': 'browser-side key exchange helper',
  '/api/v1/tier/resolve': 'internal tier resolution used by the web client',

  // ── Superseded aliases kept for existing callers. The documented
  //    replacements are /api/v1/blocks/{height} and /api/v1/auth/verify. ──
  '/api/v1/agent/{id}': 'legacy alias; agents use /api/v1/agents/*',
  '/api/v1/block/{height}': 'legacy alias of /api/v1/blocks/{height}',
  '/api/v1/verify': 'legacy alias of /api/v1/auth/verify',

  // ── Rendered assets. Embedded by URL in READMEs and unfurls; there is no
  //    JSON contract for an agent to program against. ──
  '/api/v1/badge/{id}': 'SVG badge image',
  '/api/v1/bitmap-image/{height}': 'rendered bitmap image',
  '/api/v1/block-thumbnail/{height}': 'rendered thumbnail image',

  // ── Web app product surfaces, outside the Nexus agent protocol. ──
  '/api/v1/blocks/claimed': 'web explorer listing',
  '/api/v1/chat/history': 'block chat product surface',
  '/api/v1/chat/react': 'block chat product surface',
  '/api/v1/chat/{blockHeight}': 'block chat product surface',
  '/api/v1/delegations/listings': 'delegation marketplace product surface',
  '/api/v1/delegations/purchase': 'delegation marketplace product surface',
  '/api/v1/estates': 'estates product surface',
  '/api/v1/estates/{blockHeight}': 'estates product surface',
  '/api/v1/game/active': 'game product surface',
  '/api/v1/game/claim': 'game product surface',
  '/api/v1/game/elements': 'game product surface',
  '/api/v1/game/elements/{id}': 'game product surface',
  '/api/v1/game/leaderboard': 'game product surface',
  '/api/v1/game/quests': 'game product surface',
  '/api/v1/game/quests/{id}': 'game product surface',
  '/api/v1/game/state': 'game product surface',
  '/api/v1/guardian': 'guardian product surface',
  '/api/v1/guardian/chat': 'guardian product surface',
  '/api/v1/guardian/events': 'guardian product surface',
  '/api/v1/guardian/heartbeat': 'guardian product surface',
  '/api/v1/guardian/monitor': 'guardian operator console',
  '/api/v1/guardian/monitor/command': 'guardian operator console',
  '/api/v1/guardian/monitor/conversations': 'guardian operator console',
  '/api/v1/guardian/monitor/events': 'guardian operator console',
  '/api/v1/guardian/monitor/pair': 'guardian operator console',
  '/api/v1/guardian/monitor/summary': 'guardian operator console',
  '/api/v1/guardian/{id}': 'guardian product surface',
  '/api/v1/heartbeat': 'web client heartbeat, distinct from the agent heartbeat',
  '/api/v1/history': 'web explorer history feed',
  '/api/v1/leaderboard': 'web explorer leaderboard',
  '/api/v1/lightning/invoice': 'RuneBolt Lightning payment flow',
  '/api/v1/lightning/status/{invoiceId}': 'RuneBolt Lightning payment flow',
  '/api/v1/livestream': 'livestream product surface',
  '/api/v1/livestream/active': 'livestream product surface',
  '/api/v1/ownership/prep-transfer': 'transfer helper for the web wallet flow',
  '/api/v1/profiles/create': 'web profile management',
  '/api/v1/profiles/empire-stats/{address}': 'web profile management',
  '/api/v1/profiles/set-primary': 'web profile management',
  '/api/v1/profiles/update': 'web profile management',
  '/api/v1/users/by-handle/{handle}': 'web user lookup',
  '/api/v1/users/list': 'web user directory',
  '/api/v1/users/{address}': 'web user lookup',
  '/api/v1/vps/block/{blockHeight}': 'VPS link product surface',
  '/api/v1/vps/link': 'VPS link product surface',
  '/api/v1/vps/{linkId}': 'VPS link product surface',
  '/api/v1/vps/{linkId}/health': 'VPS link product surface',
};

/** Methods on a documented path that are implemented but intentionally unpublished. */
const UNDOCUMENTED_METHODS_BY_DESIGN: Record<string, Partial<Record<HttpMethod, string>>> = {};

interface ImplementedRoute {
  route: string;
  methods: Set<HttpMethod>;
  file: string;
}

function collectRoutes(dir: string, acc: ImplementedRoute[] = []): ImplementedRoute[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRoutes(full, acc);
      continue;
    }
    if (!/^route\.tsx?$/.test(entry.name)) continue;

    const src = fs.readFileSync(full, 'utf8');
    const methods = new Set<HttpMethod>();
    for (const m of src.matchAll(
      /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g
    )) {
      methods.add(m[1] as HttpMethod);
    }

    const rel = path.relative(path.join(APP_ROOT, 'src', 'app'), path.dirname(full));
    const route = '/' + rel.split(path.sep).join('/').replace(/\[([^\]]+)\]/g, (_, n) => `{${n}}`);
    acc.push({ route, methods, file: path.relative(APP_ROOT, full) });
  }
  return acc;
}

const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8')) as {
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
};
const implemented = collectRoutes(API_ROOT);
const implementedByRoute = new Map(implemented.map((r) => [r.route, r]));

describe('openapi.json ↔ implemented routes', () => {
  it('documents no path that is not implemented', () => {
    const phantom = Object.keys(spec.paths).filter((p) => !implementedByRoute.has(p));
    expect(phantom).toEqual([]);
  });

  it('documents no method that is not implemented', () => {
    const phantom: string[] = [];
    for (const [specPath, ops] of Object.entries(spec.paths)) {
      const impl = implementedByRoute.get(specPath);
      if (!impl) continue; // reported by the path test above
      for (const method of HTTP_METHODS) {
        if (ops[method.toLowerCase()] && !impl.methods.has(method)) {
          phantom.push(`${method} ${specPath}`);
        }
      }
    }
    expect(phantom).toEqual([]);
  });

  it('documents every implemented route, or records why not', () => {
    const undocumented = implemented
      .map((r) => r.route)
      .filter((r) => !spec.paths[r] && !(r in UNDOCUMENTED_BY_DESIGN))
      .sort();

    // A failure here means a route shipped without a decision being made. Either
    // add it to public/openapi.json, or add it to UNDOCUMENTED_BY_DESIGN with the
    // reason it stays private.
    expect(undocumented).toEqual([]);
  });

  it('documents every method of every documented route, or records why not', () => {
    const undocumented: string[] = [];
    for (const [specPath, ops] of Object.entries(spec.paths)) {
      const impl = implementedByRoute.get(specPath);
      if (!impl) continue;
      for (const method of impl.methods) {
        if (ops[method.toLowerCase()]) continue;
        if (UNDOCUMENTED_METHODS_BY_DESIGN[specPath]?.[method]) continue;
        undocumented.push(`${method} ${specPath}`);
      }
    }
    expect(undocumented.sort()).toEqual([]);
  });

  it('keeps the exclusion registry free of entries for routes that no longer exist', () => {
    const stale = Object.keys(UNDOCUMENTED_BY_DESIGN)
      .filter((r) => !implementedByRoute.has(r))
      .sort();
    expect(stale).toEqual([]);
  });

  it('never lists a route as both documented and undocumented-by-design', () => {
    const both = Object.keys(UNDOCUMENTED_BY_DESIGN)
      .filter((r) => r in spec.paths)
      .sort();
    expect(both).toEqual([]);
  });

  it('gives every exclusion a reason', () => {
    const unexplained = Object.entries(UNDOCUMENTED_BY_DESIGN)
      .filter(([, reason]) => reason.trim().length === 0)
      .map(([route]) => route);
    expect(unexplained).toEqual([]);
  });
});

describe('openapi.json distribution copies', () => {
  it('keeps the SDK bundle byte-identical to the served spec', () => {
    // sdk/agent-connect ships openapi.json to npm. A drifted copy sends agents
    // to a surface this deployment does not serve.
    expect(fs.existsSync(SDK_SPEC_PATH)).toBe(true);
    expect(fs.readFileSync(SDK_SPEC_PATH, 'utf8')).toBe(fs.readFileSync(SPEC_PATH, 'utf8'));
  });

  // llms.txt and llms-full.txt state the spec version and path count in prose an
  // agent reads before it fetches anything. Both were three releases stale.
  it.each(['public/llms.txt', 'public/llms-full.txt'])(
    '%s states the current spec version and path count',
    (rel) => {
      const text = fs.readFileSync(path.join(APP_ROOT, rel), 'utf8');
      const pathCount = Object.keys(spec.paths).length;

      const versions = [...text.matchAll(/`info\.version`\s+(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
      expect(versions.length).toBeGreaterThan(0);
      for (const v of versions) expect(v).toBe(spec.info.version);

      const counts = [...text.matchAll(/(\d+)\s+paths/g)].map((m) => Number(m[1]));
      expect(counts.length).toBeGreaterThan(0);
      for (const c of counts) expect(c).toBe(pathCount);
    }
  );
});
