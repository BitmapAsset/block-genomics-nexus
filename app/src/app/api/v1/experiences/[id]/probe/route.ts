import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { PROBE_RATE_LIMIT_MS } from '@/lib/experience-protocol';
import { serializeExperience, probeAndPersist } from '@/lib/experience-service';

/**
 * POST /api/v1/experiences/[id]/probe — trigger an on-demand health probe.
 *
 * Public: it can only re-probe an already-registered, already-SSRF-validated
 * healthUrl (never an attacker-supplied one), so it is not an SSRF vector. Bounded
 * to 1 probe/min per experience via the persisted `lastProbedAt` (cross-instance).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const exp = await prisma.experience.findUnique({ where: { id } });
    if (!exp) return error('Experience not found', 404);

    if (exp.lastProbedAt && Date.now() - exp.lastProbedAt.getTime() < PROBE_RATE_LIMIT_MS) {
      const retryAfter = Math.ceil((PROBE_RATE_LIMIT_MS - (Date.now() - exp.lastProbedAt.getTime())) / 1000);
      return error(`Probe rate limit: 1 per minute per experience — retry in ${retryAfter}s`, 429);
    }

    const result = await probeAndPersist(exp);
    const fresh = await prisma.experience.findUnique({ where: { id } });
    return success({
      ...serializeExperience(fresh ?? exp),
      probe: {
        status: result.status,
        reachable: result.reachable,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
        reason: result.reason,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
