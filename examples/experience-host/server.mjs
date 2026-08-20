#!/usr/bin/env node
/**
 * A minimal self-hosted Nexus experience.
 *
 * This is the whole federation story in one file: you run this on YOUR server,
 * you register its URL against a bitmap you own, and it becomes discoverable
 * through the Nexus protocol. Nothing here is written to Bitcoin — the bitmap
 * inscription stays the deed, and this is only the world it points at. Nexus
 * never hosts, proxies, or relays any of it.
 *
 * Zero dependencies. Node >= 18.
 *
 *   node server.mjs --block 840000 --public-url https://plaza.example.com
 *
 * It serves exactly three things:
 *   GET /                                     the experience itself
 *   GET /health                               what the Nexus probe hits
 *   GET /.well-known/nexus-experience.json    the manifest you publish
 *
 * The well-known manifest is the federation contract. Publishing it lets anyone
 * — including `GET /api/v1/experiences/{id}/verify?remote=1` — check that the
 * world you are actually running still matches what you registered.
 */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// ─── config ──────────────────────────────────────────────────────────────────

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', process.env.PORT ?? 8787));
const BLOCK_HEIGHT = Number(arg('block', process.env.BLOCK_HEIGHT ?? 840000));
const NAME = arg('name', 'Pixel Plaza');
const DESCRIPTION = arg('description', 'A tiny self-hosted world on my bitmap.');
const VERSION = arg('version', '1.0.0');

/**
 * The URL the outside world reaches this server at.
 *
 * It must be the PUBLIC https:// origin, not localhost — Nexus refuses to probe
 * or fetch private, loopback, and link-local addresses (SSRF protection), so a
 * localhost entryUrl is rejected at registration. In development, put this
 * behind a tunnel (cloudflared, ngrok, tailscale funnel) and pass the tunnel URL.
 */
const PUBLIC_URL = arg('public-url', process.env.PUBLIC_URL ?? `http://localhost:${PORT}`);

// ─── the experience ──────────────────────────────────────────────────────────

const WORLD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(NAME)}</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0b0d10; color:#e6edf3; font:16px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; }
  main { text-align:center; padding:2rem; }
  h1 { margin:0 0 .5rem; font-size:1.5rem; }
  code { color:#7ee787; }
  p { color:#8b949e; }
</style>
</head>
<body>
  <main>
    <h1>${escapeHtml(NAME)}</h1>
    <p>${escapeHtml(DESCRIPTION)}</p>
    <p>Self-hosted on block <code>${BLOCK_HEIGHT}</code>.</p>
    <p>The deed lives on Bitcoin. This world lives on my server.</p>
  </main>
</body>
</html>`;

/**
 * The manifest this host publishes about itself.
 *
 * Keep it byte-identical to what you registered with Nexus. The registry stores
 * a canonical hash of the manifest under your BIP-322 signature; if these drift,
 * `verify?remote=1` will say so — which is the point. It is a drift signal, not
 * an error: it usually means you shipped a new build and have not re-registered.
 */
function manifest() {
  return {
    manifestVersion: 1,
    blockHeight: BLOCK_HEIGHT,
    name: NAME,
    description: DESCRIPTION,
    experienceType: 'web',
    entryUrl: PUBLIC_URL,
    transport: 'https',
    healthUrl: `${PUBLIC_URL}/health`,
    capabilities: ['avatars', 'chat'],
    contentRating: 'everyone',
    version: VERSION,
    // Owner-attested digest of what you are serving. Nexus never fetches or
    // checks your bundle — storing this under your signature is what lets a
    // client pin what it expects and notice a swapped payload.
    contentHash: `sha256:${createHash('sha256').update(WORLD_HTML).digest('hex')}`,
  };
}

// ─── server ──────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
    // The manifest is meant to be read cross-origin by clients and verifiers.
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  res.end(body);
}

const server = createServer((req, res) => {
  const path = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`).pathname;

  if (path === '/health') {
    return send(res, 200, JSON.stringify({ status: 'ok', block: BLOCK_HEIGHT }), 'application/json');
  }
  if (path === '/.well-known/nexus-experience.json') {
    return send(res, 200, JSON.stringify(manifest(), null, 2), 'application/json');
  }
  if (path === '/') {
    return send(res, 200, WORLD_HTML, 'text/html; charset=utf-8');
  }
  return send(res, 404, JSON.stringify({ error: 'not found' }), 'application/json');
});

server.listen(PORT, () => {
  console.log(`\n  ${NAME} — self-hosted Nexus experience`);
  console.log(`  listening on   http://localhost:${PORT}`);
  console.log(`  public URL     ${PUBLIC_URL}`);
  console.log(`  manifest       ${PUBLIC_URL}/.well-known/nexus-experience.json`);
  console.log(`  health         ${PUBLIC_URL}/health`);
  if (PUBLIC_URL.startsWith('http://')) {
    console.log('\n  ⚠  Nexus only accepts https:// (or wss://) entry URLs and refuses');
    console.log('     private/loopback addresses. Put this behind a public HTTPS');
    console.log('     tunnel and re-run with --public-url <that URL> before registering.');
  }
  console.log('\n  Next: register it. See README.md in this folder.\n');
});
