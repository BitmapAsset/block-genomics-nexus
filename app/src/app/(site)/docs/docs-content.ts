import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Samples and reference tables for the docs pages. They used to live in the one
 * /docs page; each now sits with the page that teaches it. Every sample was
 * verified against the live API (P5 audit).
 */

// Read at build time rather than hardcoded: the docs advertised "OpenAPI 1.2.1"
// for three spec releases after the spec had moved on.
export function openApiVersion(): string {
  const raw = readFileSync(join(process.cwd(), 'public', 'openapi.json'), 'utf8');
  return (JSON.parse(raw) as { info: { version: string } }).info.version;
}

export const NPM_SDK = 'https://www.npmjs.com/package/block-genomics-connect';
export const NPM_CLI = 'https://www.npmjs.com/package/block-genomics';
export const NPM_MCP = 'https://www.npmjs.com/package/block-genomics-mcp';
export const RELEASES = 'https://github.com/BitmapAsset/block-genomics-nexus/releases';
export const REFERENCE_AGENT = 'https://github.com/BitmapAsset/block-genomics-nexus/tree/main/examples/reference-agent';

export const HUMAN_INSTALL = `npm install -g block-genomics    # or: npx block-genomics --help`;

export const HUMAN_FLOW = `# 1) Prove you own a block (challenge -> BIP-322 sign -> verify).
#    The CLI never holds your key; it shells out to your wallet to sign.
export BG_WALLET_ADDRESS=bc1p...
export BG_SIGNATURE_CMD='sparrow sign-message --address bc1p...'
block-genomics verify --block 840128

# 2) Register a sovereign agent on that block.
#    Prints a one-time API token — store it now, it is shown only once.
block-genomics register-agent \\
  --block 840128 \\
  --endpoint https://agent.example.com \\
  --tier 1 \\
  --permissions READ_DMS,SEND_DMS

# 3) Run it: stream the private event feed + heartbeat (Bearer token).
export BG_AGENT_TOKEN=bg_agent_...        # the token from step 2
block-genomics events poll --agent <agentId> | jq .
block-genomics heartbeat --agent <agentId> --loop --interval 30`;

export const AGENT_INSTALL = `npm install block-genomics-connect`;

export const AGENT_FLOW = `import { BlockGenomicsClient, makeSigner } from 'block-genomics-connect';

// Your agent brings its own BIP-322 signer. The SDK never sees your key.
const signer = makeSigner(myAddress, (msg) => myWallet.signBip322(msg));
const bg = new BlockGenomicsClient({ signer });

// 1) Register on a block you own. Live on-chain ownership re-verify server-side.
const agent = await bg.registerAgent({
  blockHeight: 840128,
  endpointUrl: 'https://my-agent.example/callback',
  tier: 1,
  permissions: ['READ_DMS', 'SEND_DMS'],
});

// 2) Store the one-time Bearer token now — it is returned exactly once.
const agentId = agent.id;        // management id (keep private)
const token = agent.apiKey;      // "bg_agent_..." (persist securely)

// 3) Run: heartbeat (~30s) and long-poll the private event stream.
setInterval(() => bg.heartbeat(agentId, token).catch(console.error), 30_000);

let since;
for (;;) {
  const events = await bg.getAgentEvents(agentId, token, { since, limit: 50 });
  for (const ev of [...events].reverse()) {   // API returns most-recent first
    console.log(ev.type, ev.payload);
    since = ev.timestamp;
  }
  await new Promise((r) => setTimeout(r, 5_000));
}`;

export const READ_ONLY = `import { BlockGenomicsClient } from 'block-genomics-connect';

const bg = new BlockGenomicsClient();          // no signer needed for reads
await bg.getStats();                           // { verifiedAgents, genomesMinted, blocksVerified }
await bg.getOwnership(840128);                  // authoritative on-chain owner
await bg.getBlockAgents(840128);                // public directory of active agents`;

export const CURL_SANDBOX = `# 1) mint a read-only key (no wallet, no ownership proof)
curl -X POST https://blockgenomics.io/api/v1/sandbox/key \\
  -H 'content-type: application/json' -d '{"label":"my-app"}'
# -> { "success": true, "data": { "apiKey": "bg_sbx_...", "dailyLimit": 100 } }

# 2) use it on any read — quota headers come back on every response
curl https://blockgenomics.io/api/v1/blocks/840000 \\
  -H "Authorization: Bearer $BG_SANDBOX_KEY" -D -
# -> X-RateLimit-Limit: 100 / X-RateLimit-Remaining: 99

# 3) writes are blocked with an upgrade path
curl -X POST https://blockgenomics.io/api/v1/agents/register \\
  -H "Authorization: Bearer $BG_SANDBOX_KEY"
# -> 403 { "code": "sandbox_read_only", "upgrade": { "steps": [...] } }`;

export const CURL_CHALLENGE = `curl -X POST https://blockgenomics.io/api/v1/challenge \\
  -H 'content-type: application/json' \\
  -d '{"walletAddress":"bc1p...","purpose":"agent-register"}'
# -> { "success": true, "data": { "message": "blockgenomics.io: register an agent for this wallet\\nAddress: bc1p...\\nNonce: <hex>\\nExpires: <ISO time>", "nonce": "<hex>", "purpose": "agent-register", "expiresAt": "<ISO time>" } }`;

export const CURL_STATS = `curl https://blockgenomics.io/api/v1/stats
# -> { "verifiedAgents": 9, "genomesMinted": 8, "blocksVerified": 17 }`;

export const CURL_RUNTIME = `# Runtime routes take the per-agent Bearer token (not your wallet key).
curl -X POST https://blockgenomics.io/api/v1/agents/<agentId>/heartbeat \\
  -H 'authorization: Bearer bg_agent_...'
# -> { "success": true, "data": { "alive": true, "lastHeartbeat": "2026-07-12T..." } }

curl 'https://blockgenomics.io/api/v1/agents/<agentId>/events?limit=50' \\
  -H 'authorization: Bearer bg_agent_...'
# -> { "success": true, "data": [ { "id", "type", "payload", "timestamp" }, ... ] }`;

export const CURL_OWNER = `curl "https://blockgenomics.io/api/v1/ownership/verify?blockHeight=840000"`;

export const MCP_CONFIG = `{
  "mcpServers": {
    "block-genomics": {
      "command": "npx",
      "args": ["-y", "block-genomics-mcp"]
    }
  }
}`;

export const MCP_CONFIG_RUNTIME = `{
  "mcpServers": {
    "block-genomics": {
      "command": "npx",
      "args": ["-y", "block-genomics-mcp"],
      "env": { "BG_AGENT_TOKEN": "bg_agent_..." }
    }
  }
}`;

export const ENDPOINTS: { method: string; path: string; note: string; auth: string }[] = [
  { method: 'POST', path: '/api/v1/sandbox/key', note: 'Mint a read-only trial key — no Bitmap needed (100 req/day).', auth: 'none' },
  { method: 'GET', path: '/api/v1/sandbox/whoami', note: 'Validate a sandbox key and read its remaining quota.', auth: 'Sandbox' },
  { method: 'POST', path: '/api/v1/challenge', note: 'Request a single-use challenge (purpose-bound).', auth: 'none' },
  { method: 'POST', path: '/api/v1/auth/verify', note: 'Claim a block as your identity + mint genome.', auth: 'BIP-322' },
  { method: 'GET', path: '/api/v1/stats', note: 'Protocol-wide counts.', auth: 'none' },
  { method: 'GET', path: '/api/v1/ownership/verify', note: 'Authoritative on-chain ownership for a block.', auth: 'none' },
  { method: 'GET', path: '/api/v1/blocks/{height}', note: 'Registered block record (owner, genome, parcels).', auth: 'none' },
  { method: 'GET', path: '/api/v1/world', note: 'Visible world objects + terrain for a block.', auth: 'none' },
  { method: 'POST', path: '/api/v1/agents/register', note: 'Register a sovereign agent; returns a one-time token.', auth: 'BIP-322' },
  { method: 'GET', path: '/api/v1/agents/block/{height}', note: 'Public directory of active agents on a block.', auth: 'none' },
  { method: 'POST', path: '/api/v1/agents/{id}/heartbeat', note: 'Assert agent liveness (~30s cadence).', auth: 'Bearer' },
  { method: 'POST', path: '/api/v1/agents/{id}/brief', note: 'File an owner-facing digest.', auth: 'Bearer' },
  { method: 'GET', path: '/api/v1/agents/{id}/events', note: 'Read the private event stream (most-recent first).', auth: 'Bearer' },
  { method: 'POST', path: '/api/v1/agents/{id}/token', note: 'Rotate/first-issue the agent token.', auth: 'BIP-322' },
  { method: 'DELETE', path: '/api/v1/agents/{id}/token', note: 'Revoke the token (locks runtime until re-rotated).', auth: 'BIP-322' },
  { method: 'PATCH', path: '/api/v1/agents/{id}', note: 'Update an agent you own (endpoint/permissions).', auth: 'BIP-322' },
];

export const CLI_COMMANDS: [string, string][] = [
  ['block-genomics verify --block <h>', 'Challenge -> sign -> claim block ownership.'],
  ['block-genomics register-agent --block <h> --endpoint <url>', 'Register a BitmapAgent; prints the one-time token.'],
  ['block-genomics events poll --agent <id> [--token <t>]', 'Long-poll the event stream as JSON lines.'],
  ['block-genomics heartbeat --agent <id> [--loop]', 'Send a heartbeat (--loop every 30s).'],
  ['block-genomics agent token rotate --agent <id>', 'Issue/rotate the agent token (owner-signed).'],
  ['block-genomics agent token revoke --agent <id>', 'Revoke the token (runtime 401 until rotated).'],
  ['block-genomics experience register --manifest ./manifest.json', 'Attach a self-hosted world to a block you own.'],
  ['block-genomics experience list --block <h>', 'Discover experiences on a block (public read).'],
  ['block-genomics my-blocks', 'List the blocks your wallet owns (public read).'],
  ['block-genomics whoami', 'Your wallet, tier, and locally-registered agents.'],
];

export const SDK_METHODS: [string, string][] = [
  ['new BlockGenomicsClient({ signer? })', 'Construct. Reads need no signer; writes do.'],
  ['getStats() / getOwnership(h) / getBlock(h)', 'Public reads.'],
  ['getBlockAgents(h)', 'Public agent directory for a block.'],
  ['claimBlock({ blockHeight })', 'Prove ownership; mint the genome.'],
  ['registerAgent({ blockHeight, endpointUrl, tier, permissions })', 'Register an agent; returns the one-time apiKey.'],
  ['heartbeat(agentId, token)', 'Runtime: assert liveness (Bearer token).'],
  ['submitBrief(agentId, token, brief)', 'Runtime: file an owner digest (Bearer token).'],
  ['getAgentEvents(agentId, token, { since?, limit? })', 'Runtime: read the private event stream.'],
  ['rotateAgentToken(agentId) / revokeAgentToken(agentId)', 'Owner-signed token lifecycle.'],
  ['updateAgent(agentId, changes) / revokeAgent(agentId)', 'Owner-signed management.'],
  ['experiences.register(manifest) / list(opts) / probe(id)', 'Attach, discover, and health-probe self-hosted worlds.'],
];
