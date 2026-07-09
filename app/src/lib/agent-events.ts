/**
 * Agent event emitter — fires AgentEvent rows for the active BitmapAgents
 * registered on a block whenever a real user action lands. Fire-and-forget:
 * never throws into the caller, never blocks the hot path.
 *
 * Wire callers with:
 *   void emitAgentEvent(blockHeight, 'visitor_arrived', { actor, summary });
 * OR
 *   emitAgentEvent(...).catch(() => {});
 *
 * IMPORTANT: `data` payload must never contain LLM keys, emails, or private
 * fields — only actor identifiers, a short summary string, and resource ids.
 */

import prisma from '@/lib/prisma';

/**
 * Union of AgentEvent.type values understood by the events poll route.
 * Kept as a string union (not enum) so callers can pass string literals; the
 * DB column is a plain String, so unknown types stay writeable but this list
 * documents what the polling side expects.
 */
export type AgentEventType =
  | 'visitor_arrived'
  | 'dm_received'
  | 'chat_message'
  | 'listing_created'
  | 'world_updated'
  | 'escalation'
  | 'offer_made'
  | 'content_reported'
  | 'permission_request'
  | 'heartbeat';

/** Per-agent-per-block-per-visitor throttle window for visitor_arrived. */
const VISITOR_DEDUPE_WINDOW_MS = 10 * 60 * 1000; // 10min

/**
 * Emit an event to every ACTIVE BitmapAgent registered on `blockHeight`.
 * Non-blocking: catches every error and just console.warns. Safe to call
 * without awaiting.
 *
 * The `visitor_arrived` type is throttled per (agent, actor) for
 * VISITOR_DEDUPE_WINDOW_MS to avoid flooding an agent every page hit.
 */
export async function emitAgentEvent(
  blockHeight: number,
  type: AgentEventType | string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    if (blockHeight == null || Number.isNaN(blockHeight)) return;

    // Snapshot the active agents on this block. Read is cheap and indexed.
    const agents = await prisma.bitmapAgent.findMany({
      where: { blockHeight, status: 'active' },
      select: { id: true },
    });
    if (agents.length === 0) return;

    const payload = JSON.stringify(sanitizePayload(data));

    // For visitor_arrived, avoid re-emitting the same actor→agent within the
    // dedupe window. Best-effort: on any lookup failure we just emit.
    const shouldDedupe = type === 'visitor_arrived' && typeof data.actor === 'string';
    const cutoff = new Date(Date.now() - VISITOR_DEDUPE_WINDOW_MS);

    await Promise.all(
      agents.map(async (a) => {
        try {
          if (shouldDedupe) {
            const recent = await prisma.agentEvent.findFirst({
              where: {
                agentId: a.id,
                type: 'visitor_arrived',
                timestamp: { gte: cutoff },
                payload: { contains: `"actor":"${escapeForContains(String(data.actor))}"` },
              },
              select: { id: true },
            });
            if (recent) return;
          }
          await prisma.agentEvent.create({
            data: { agentId: a.id, type, payload },
          });
        } catch (perAgentErr) {
          console.warn('[agent-events] per-agent emit failed', {
            agentId: a.id,
            type,
            err: perAgentErr instanceof Error ? perAgentErr.message : String(perAgentErr),
          });
        }
      }),
    );
  } catch (err) {
    // Never throw into the caller's hot path.
    console.warn('[agent-events] emit failed', {
      blockHeight,
      type,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Strip obviously sensitive keys before persisting. Belt-and-braces: callers
 * are already expected to pass only safe fields, but if a route accidentally
 * spreads a request body, we drop credentials/PII here.
 */
function sanitizePayload(data: Record<string, unknown>): Record<string, unknown> {
  const BLOCKED = new Set([
    'llmApiKey',
    'apiKey',
    'privateKey',
    'password',
    'secret',
    'signature',
    'email',
    'phone',
    'authorization',
    'cookie',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (BLOCKED.has(k)) continue;
    // Truncate freeform strings so an oversized message can't bloat the row.
    if (typeof v === 'string') {
      out[k] = v.length > 500 ? v.slice(0, 500) + '…' : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Escape a value for safe use inside a Prisma `contains` filter substring. */
function escapeForContains(v: string): string {
  return v.replace(/["\\%_]/g, '');
}
