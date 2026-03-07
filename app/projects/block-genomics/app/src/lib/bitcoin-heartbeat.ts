/**
 * ⛏️ Bitcoin Block Heartbeat Protocol
 * 
 * The Guardian heartbeat is synchronized to Bitcoin itself.
 * Every time a new block is mined (~10 min), all active Guardians
 * receive a health check pulse — verifying their LLM key is valid
 * and updating their status accordingly.
 * 
 * This is platform-agnostic: works on Vercel, DigitalOcean, bare metal.
 * The trigger mechanism (cron, WebSocket, webhook) is just a poller —
 * the actual heartbeat logic is driven by Bitcoin block height changes.
 * 
 * Bitcoin's heartbeat IS the protocol's heartbeat.
 */

import prisma from '@/lib/prisma';

const MEMPOOL_API = 'https://mempool.space/api';

/* ═══════════════════════════════════════════
   CASCADING HEARTBEAT PROTOCOL CONSTANTS
   
   Bitcoin block → Brain heartbeat (0s) → Guardian heartbeat (+21s)
   21 = tribute to Bitcoin's 21M cap
   
   Minimum 30s cooldown between heartbeats to prevent waste
   when multiple blocks arrive in rapid succession.
   ═══════════════════════════════════════════ */

/** Seconds after Brain heartbeat before Guardian heartbeats fire */
export const GUARDIAN_HEARTBEAT_OFFSET_MS = 21_000;

/** Minimum cooldown between heartbeat cycles (prevents waste on rapid blocks) */
export const HEARTBEAT_COOLDOWN_MS = 30_000;

/* ═══════════════════════════════════════════
   BLOCK TIP DETECTION
   ═══════════════════════════════════════════ */

export interface BlockHeartbeatResult {
  newBlock: boolean;
  blockHeight: number;
  previousHeight: number | null;
  guardiansChecked: number;
  guardiansOnline: number;
  guardiansDegraded: number;
  guardiansOffline: number;
  timestamp: string;
}

/**
 * Get the current Bitcoin block tip height from mempool.space
 */
async function getCurrentBlockHeight(): Promise<number> {
  const res = await fetch(`${MEMPOOL_API}/blocks/tip/height`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`mempool.space unreachable: ${res.status}`);
  const height = parseInt(await res.text(), 10);
  if (isNaN(height)) throw new Error('Invalid block height from mempool.space');
  return height;
}

/**
 * Get/set the last known block height from DB.
 * Uses a SystemState key-value record.
 */
async function getLastKnownHeight(): Promise<number | null> {
  const record = await prisma.systemState.findUnique({
    where: { key: 'lastHeartbeatBlockHeight' },
  });
  return record ? parseInt(record.value, 10) : null;
}

async function setLastKnownHeight(height: number): Promise<void> {
  await prisma.systemState.upsert({
    where: { key: 'lastHeartbeatBlockHeight' },
    create: { key: 'lastHeartbeatBlockHeight', value: height.toString() },
    update: { value: height.toString() },
  });
}

/** Get last heartbeat execution timestamp (ms) for cooldown enforcement */
async function getLastHeartbeatTimestamp(): Promise<number | null> {
  const record = await prisma.systemState.findUnique({
    where: { key: 'lastHeartbeatTimestamp' },
  });
  return record ? parseInt(record.value, 10) : null;
}

async function setLastHeartbeatTimestamp(ms: number): Promise<void> {
  await prisma.systemState.upsert({
    where: { key: 'lastHeartbeatTimestamp' },
    create: { key: 'lastHeartbeatTimestamp', value: ms.toString() },
    update: { value: ms.toString() },
  });
}

/* ═══════════════════════════════════════════
   GUARDIAN LLM HEALTH CHECK
   ═══════════════════════════════════════════ */

interface LLMCheckResult {
  guardianId: string;
  name: string;
  status: 'online' | 'degraded' | 'offline';
  responseTimeMs: number;
  error?: string;
}

/**
 * Ping a Guardian's LLM with a minimal test prompt.
 * Returns status based on response.
 */
async function checkGuardianLLM(guardian: {
  id: string;
  name: string;
  llmProvider: string | null;
  llmModel: string | null;
  llmApiKey: string | null;
  llmEndpoint: string | null;
  selfHosted: boolean;
  agentEndpoint: string | null;
}): Promise<LLMCheckResult> {
  const start = Date.now();

  // Self-hosted guardians: ping their endpoint
  if (guardian.selfHosted && guardian.agentEndpoint) {
    try {
      const res = await fetch(guardian.agentEndpoint, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10_000),
      });
      return {
        guardianId: guardian.id,
        name: guardian.name,
        status: res.ok ? 'online' : 'degraded',
        responseTimeMs: Date.now() - start,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (e: any) {
      return {
        guardianId: guardian.id,
        name: guardian.name,
        status: 'offline',
        responseTimeMs: Date.now() - start,
        error: e?.message || 'Endpoint unreachable',
      };
    }
  }

  // BYOK guardians: verify their LLM API key works
  if (!guardian.llmApiKey) {
    return {
      guardianId: guardian.id,
      name: guardian.name,
      status: 'degraded',
      responseTimeMs: 0,
      error: 'No LLM API key configured',
    };
  }

  try {
    const endpoint = resolveLLMEndpoint(guardian.llmProvider, guardian.llmEndpoint);
    const body = buildTestPayload(guardian.llmProvider, guardian.llmModel);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${guardian.llmApiKey}`,
        ...(guardian.llmProvider === 'xai' ? { 'Authorization': `Bearer ${guardian.llmApiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const elapsed = Date.now() - start;

    if (res.ok) {
      return { guardianId: guardian.id, name: guardian.name, status: 'online', responseTimeMs: elapsed };
    }

    // 401/403 = bad key
    if (res.status === 401 || res.status === 403) {
      return {
        guardianId: guardian.id,
        name: guardian.name,
        status: 'offline',
        responseTimeMs: elapsed,
        error: 'API key invalid or expired',
      };
    }

    // 429 = rate limited but key works
    if (res.status === 429) {
      return { guardianId: guardian.id, name: guardian.name, status: 'online', responseTimeMs: elapsed };
    }

    return {
      guardianId: guardian.id,
      name: guardian.name,
      status: 'degraded',
      responseTimeMs: elapsed,
      error: `LLM returned ${res.status}`,
    };
  } catch (e: any) {
    return {
      guardianId: guardian.id,
      name: guardian.name,
      status: 'offline',
      responseTimeMs: Date.now() - start,
      error: e?.message || 'LLM unreachable',
    };
  }
}

/**
 * Resolve LLM chat completions endpoint from provider name
 */
function resolveLLMEndpoint(provider: string | null, customEndpoint: string | null): string {
  if (customEndpoint) return customEndpoint;
  switch (provider?.toLowerCase()) {
    case 'openai': return 'https://api.openai.com/v1/chat/completions';
    case 'anthropic': return 'https://api.anthropic.com/v1/messages';
    case 'xai':
    case 'grok': return 'https://api.x.ai/v1/chat/completions';
    case 'google':
    case 'gemini': return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    default: return 'https://api.openai.com/v1/chat/completions'; // OpenAI-compatible default
  }
}

/**
 * Build a minimal test payload — uses cheapest possible call
 */
function buildTestPayload(provider: string | null, model: string | null): any {
  const p = provider?.toLowerCase();

  if (p === 'anthropic') {
    return {
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    };
  }

  // OpenAI-compatible (OpenAI, xAI, Gemini, custom)
  return {
    model: model || 'gpt-4o-mini',
    max_tokens: 1,
    messages: [{ role: 'user', content: 'ping' }],
  };
}

/* ═══════════════════════════════════════════
   MAIN HEARTBEAT EXECUTOR
   ═══════════════════════════════════════════ */

/**
 * Execute the Bitcoin Block Heartbeat.
 * 
 * Called by a poller (Vercel cron, setInterval, webhook — doesn't matter).
 * Only performs Guardian health checks when a NEW block has been mined.
 * 
 * @param force - Skip block height check, run health checks regardless
 */
export async function executeBlockHeartbeat(force = false): Promise<BlockHeartbeatResult> {
  const currentHeight = await getCurrentBlockHeight();
  const previousHeight = await getLastKnownHeight();

  const newBlock = force || previousHeight === null || currentHeight > previousHeight;

  if (!newBlock) {
    return {
      newBlock: false,
      blockHeight: currentHeight,
      previousHeight,
      guardiansChecked: 0,
      guardiansOnline: 0,
      guardiansDegraded: 0,
      guardiansOffline: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Cooldown check ──
  // If multiple blocks arrive in quick succession (e.g. 3 blocks in 60s),
  // only fire one heartbeat per HEARTBEAT_COOLDOWN_MS (30s minimum).
  if (!force) {
    const lastTs = await getLastHeartbeatTimestamp();
    if (lastTs && Date.now() - lastTs < HEARTBEAT_COOLDOWN_MS) {
      // Still update height so we don't re-trigger on same block
      await setLastKnownHeight(currentHeight);
      return {
        newBlock: true,
        blockHeight: currentHeight,
        previousHeight,
        guardiansChecked: 0,
        guardiansOnline: 0,
        guardiansDegraded: 0,
        guardiansOffline: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // New block detected! Update height + timestamp
  await setLastKnownHeight(currentHeight);
  await setLastHeartbeatTimestamp(Date.now());

  // Fetch all active guardians with LLM keys or self-hosted endpoints
  const guardians = await prisma.guardianAgent.findMany({
    where: {
      status: { in: ['active', 'online', 'paused'] },
      OR: [
        { llmApiKey: { not: null } },
        { selfHosted: true, agentEndpoint: { not: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      llmProvider: true,
      llmModel: true,
      llmApiKey: true,
      llmEndpoint: true,
      selfHosted: true,
      agentEndpoint: true,
    },
  });

  // Check all guardians in parallel (with concurrency limit)
  const BATCH_SIZE = 10;
  const results: LLMCheckResult[] = [];

  for (let i = 0; i < guardians.length; i += BATCH_SIZE) {
    const batch = guardians.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(checkGuardianLLM));
    results.push(...batchResults);
  }

  // Update Guardian statuses in DB
  await Promise.all(
    results.map((r) =>
      prisma.guardianAgent.update({
        where: { id: r.guardianId },
        data: {
          lastHeartbeat: new Date(),
          endpointVerified: r.status === 'online',
          status: r.status === 'online' ? 'active' : r.status === 'degraded' ? 'active' : 'paused',
        },
      })
    )
  );

  // Log the heartbeat event
  const online = results.filter((r) => r.status === 'online').length;
  const degraded = results.filter((r) => r.status === 'degraded').length;
  const offline = results.filter((r) => r.status === 'offline').length;

  console.log(
    `[⛏️ Bitcoin Heartbeat] Block #${currentHeight} — ` +
    `${guardians.length} guardians checked: ${online} online, ${degraded} degraded, ${offline} offline`
  );

  return {
    newBlock: true,
    blockHeight: currentHeight,
    previousHeight,
    guardiansChecked: guardians.length,
    guardiansOnline: online,
    guardiansDegraded: degraded,
    guardiansOffline: offline,
    timestamp: new Date().toISOString(),
  };
}
