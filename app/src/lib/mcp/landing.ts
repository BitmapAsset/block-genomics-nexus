/**
 * The page a human sees at https://blockgenomics.io/mcp.
 *
 * The URL is the product — it goes in tweets, READMEs and directory listings —
 * so the browser that follows it has to land on something that explains the
 * server and hands over a config block, not a transport error or a redirect
 * into the general docs.
 *
 * The tool list is read from the same catalog the endpoint serves, so the page
 * cannot advertise a surface the server does not have; a hardcoded list drifted
 * the moment a tool was added.
 */

import { bgTools, SERVER_INFO } from './server';
import { buildToolCatalog } from './catalog';
import { createCall } from './client';

const ENDPOINT = 'https://blockgenomics.io/mcp';

/** Text-node escaping. Quotes stay literal so a JSON snippet is copyable as written. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The catalog is built around a call function it never invokes here. */
function groups() {
  const { publicTools, agentTools, ownerTools, writeTools } = buildToolCatalog(
    createCall({ base: 'https://blockgenomics.io' }),
  );
  return [
    {
      title: 'Public reads',
      note: 'No credentials. Connect and call.',
      tools: publicTools,
    },
    {
      title: 'Owner tools',
      note: 'Need a bg_vfy_ session token from the BIP-322 flow below.',
      tools: ownerTools,
    },
    {
      title: 'Ownership writes',
      note: 'Ownership is re-checked on-chain at the moment of every write.',
      tools: writeTools,
    },
    {
      title: 'Agent runtime',
      note: 'Need the bg_agent_ token issued at agent registration.',
      tools: agentTools,
    },
  ];
}

function toolRows(tools: { name: string; description: string }[]): string {
  return tools
    .map(
      (tool) =>
        `<div class="tool"><code>${escapeHtml(tool.name)}</code><span>${escapeHtml(tool.description)}</span></div>`,
    )
    .join('');
}

function snippet(label: string, body: string): string {
  return `<section class="snippet"><h3>${escapeHtml(label)}</h3><pre><code>${escapeHtml(body)}</code></pre></section>`;
}

const CLAUDE_CODE = `claude mcp add --transport http block-genomics ${ENDPOINT}`;

const CURSOR = `// ~/.cursor/mcp.json  (also works as .mcp.json for Claude Code)
{
  "mcpServers": {
    "block-genomics": {
      "type": "http",
      "url": "${ENDPOINT}"
    }
  }
}`;

const OPENCLAW = `openclaw mcp add block-genomics \\
  --url ${ENDPOINT} \\
  --transport streamable-http`;

const AUTHENTICATED = `// Optional. Read tools need nothing; this unlocks the write surface.
{
  "mcpServers": {
    "block-genomics": {
      "type": "http",
      "url": "${ENDPOINT}",
      "headers": { "Authorization": "Bearer bg_vfy_..." }
    }
  }
}`;

export function mcpLandingPage(): string {
  const catalog = groups();
  const total = bgTools(createCall({ base: 'https://blockgenomics.io' })).length;

  const sections = catalog
    .map(
      (group) => `<section class="group">
  <h3>${escapeHtml(group.title)} <span class="count">${group.tools.length}</span></h3>
  <p class="note">${escapeHtml(group.note)}</p>
  ${toolRows(group.tools)}
</section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Block Genomics MCP — ${ENDPOINT}</title>
<meta name="description" content="Remote MCP server for Block Genomics (Nexus Protocol): ${total} tools over Streamable HTTP for verified Bitcoin blocks, on-chain ownership, agents, guardians and hosted experiences. Nothing to install.">
<link rel="canonical" href="${ENDPOINT}">
<style>
  :root {
    --bg: #0a0a0f; --panel: #12121a; --line: rgba(102,204,255,.14);
    --text: #e2e8f0; --muted: #94a3b8; --cyan: #66ccff; --purple: #a855f7; --btc: #f7931a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.6 Inter, system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 860px; margin: 0 auto; padding: 56px 20px 96px; }
  code, pre { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace; }
  h1 { font-size: 34px; line-height: 1.15; margin: 0 0 10px; letter-spacing: -.02em; }
  h1 span { background: linear-gradient(135deg, var(--cyan), var(--purple));
            -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  h2 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
       margin: 48px 0 14px; font-weight: 600; }
  h3 { font-size: 15px; margin: 0 0 6px; }
  p { color: var(--muted); margin: 0 0 14px; }
  .lede { color: var(--text); font-size: 17px; max-width: 64ch; }
  .endpoint {
    display: inline-block; margin: 18px 0 6px; padding: 10px 16px; border-radius: 10px;
    background: var(--panel); border: 1px solid var(--line); color: var(--cyan); font-size: 15px;
  }
  .badges { margin: 12px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .badge { font-size: 12px; color: var(--muted); border: 1px solid var(--line);
           border-radius: 999px; padding: 4px 11px; }
  .snippet { margin: 0 0 18px; }
  pre { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
        padding: 14px 16px; overflow-x: auto; margin: 8px 0 0; font-size: 13px; color: var(--text); }
  .group { border: 1px solid var(--line); border-radius: 12px; background: rgba(18,18,26,.6);
           padding: 18px 20px; margin: 0 0 14px; }
  .count { font-size: 12px; color: var(--btc); border: 1px solid var(--line);
           border-radius: 999px; padding: 2px 9px; margin-left: 6px; vertical-align: 2px; }
  .note { font-size: 13px; margin: 0 0 14px; }
  .tool { display: grid; grid-template-columns: 220px 1fr; gap: 14px; padding: 7px 0;
          border-top: 1px solid rgba(102,204,255,.07); font-size: 13.5px; }
  .tool code { color: var(--cyan); word-break: break-word; }
  .tool span { color: var(--muted); }
  ol { color: var(--muted); padding-left: 20px; }
  ol li { margin-bottom: 7px; }
  a { color: var(--cyan); }
  .links { display: flex; flex-wrap: wrap; gap: 10px 22px; margin-top: 8px; }
  footer { margin-top: 56px; padding-top: 22px; border-top: 1px solid var(--line);
           color: #64748b; font-size: 13px; }
  @media (max-width: 620px) { .tool { grid-template-columns: 1fr; gap: 2px; } h1 { font-size: 27px; } }
</style>
</head>
<body>
<main>
  <h1>Block Genomics <span>MCP</span></h1>
  <p class="lede">A remote MCP server for the Nexus Protocol: verified Bitcoin blocks, authoritative
  on-chain ownership, the public agent directory, guardians, badges, worlds and hosted experiences.
  Connect by URL — there is nothing to install.</p>
  <div class="endpoint">${ENDPOINT}</div>
  <div class="badges">
    <span class="badge">Streamable HTTP</span>
    <span class="badge">${total} tools</span>
    <span class="badge">Reads are public</span>
    <span class="badge">v${escapeHtml(SERVER_INFO.version)}</span>
  </div>

  <h2>Connect</h2>
  ${snippet('Claude Code', CLAUDE_CODE)}
  ${snippet('Cursor', CURSOR)}
  ${snippet('OpenClaw', OPENCLAW)}

  <h2>Tools</h2>
${sections}

  <h2>Writing takes a signature, not an API key</h2>
  <p>Connecting grants reads. Every write proves Bitcoin-native identity first, and this server
  never holds a key — you sign externally and pass the signature back.</p>
  <ol>
    <li>Call <code>bg_verify_start</code> to get a one-time challenge.</li>
    <li>Sign it (BIP-322) with the wallet holding your <code>&lt;height&gt;.bitmap</code> inscription.</li>
    <li>Call <code>bg_verify_submit</code> to receive a <code>bg_vfy_</code> session token.</li>
    <li>Send it as <code>Authorization: Bearer &lt;token&gt;</code>.</li>
  </ol>
  ${snippet('Authenticated client config', AUTHENTICATED)}
  <p>Ownership is re-checked on the chain at the moment of every write, so a transferred bitmap
  stops working immediately.</p>

  <h2>More</h2>
  <div class="links">
    <a href="/docs">Developer docs</a>
    <a href="/openapi.json">OpenAPI spec</a>
    <a href="/.well-known/mcp/server-card.json">Server card</a>
    <a href="https://www.npmjs.com/package/block-genomics-mcp">stdio package (npm)</a>
    <a href="https://github.com/BitmapAsset/block-genomics-nexus">GitHub</a>
  </div>

  <footer>This URL is the MCP endpoint itself. MCP clients POST JSON-RPC here; browsers get this page.</footer>
</main>
</body>
</html>`;
}
