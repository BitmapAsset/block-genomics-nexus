/**
 * Shared service helpers for the experience routes: response serialization,
 * the SSRF-safe probe-and-persist, stale-on-read re-probe, and the Brain
 * rejection ContentFlag. Keeps the route handlers thin and consistent.
 */

import type { Experience } from '@prisma/client';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { NEXUS_BRAIN_WALLET } from '@/lib/protocol';
import { probeExperienceUrl, type ProbeResult } from '@/lib/experience-probe';
import { PROBE_STALE_MS } from '@/lib/experience-protocol';

/** Public API shape for an experience (parses stored JSON, hides nothing secret). */
export function serializeExperience(exp: Experience) {
  let clientRequirements: unknown = null;
  if (exp.clientRequirements) {
    try {
      clientRequirements = JSON.parse(exp.clientRequirements);
    } catch {
      clientRequirements = null;
    }
  }
  return {
    id: exp.id,
    walletAddress: exp.walletAddress,
    blockHeight: exp.blockHeight,
    parcelIndex: exp.parcelIndex,
    name: exp.name,
    description: exp.description,
    experienceType: exp.experienceType,
    entryUrl: exp.entryUrl,
    transport: exp.transport,
    healthUrl: exp.healthUrl,
    clientRequirements,
    capabilities: exp.capabilities,
    contentRating: exp.contentRating,
    version: exp.version,
    status: exp.status,
    lastProbedAt: exp.lastProbedAt,
    probeLatencyMs: exp.probeLatencyMs,
    soulJudged: exp.soulJudged,
    createdAt: exp.createdAt,
    updatedAt: exp.updatedAt,
  };
}

/** Probe the experience's health target and persist the resulting status. */
export async function probeAndPersist(exp: Pick<Experience, 'id' | 'healthUrl' | 'entryUrl'>): Promise<ProbeResult> {
  const target = exp.healthUrl || exp.entryUrl;
  const result = await probeExperienceUrl(target);
  await prisma.experience.update({
    where: { id: exp.id },
    data: {
      status: result.status,
      lastProbedAt: new Date(),
      probeLatencyMs: result.reachable ? result.latencyMs : null,
    },
  });
  return result;
}

/**
 * Fire-and-forget re-probe when the last probe is older than PROBE_STALE_MS.
 * The current read returns the existing snapshot; the refresh lands for the next
 * reader. Never throws into the request path.
 */
export function maybeReprobeStale(exp: Pick<Experience, 'id' | 'healthUrl' | 'entryUrl' | 'lastProbedAt'>): void {
  const stale = !exp.lastProbedAt || Date.now() - exp.lastProbedAt.getTime() > PROBE_STALE_MS;
  if (stale) void probeAndPersist(exp).catch(() => {});
}

/**
 * Record the Brain's rejection of a manifest as a ContentFlag (isBrainFlag),
 * mirroring the chat scan flag shape. Best-effort — a flag write failure must
 * not convert a clean 422 into a 500.
 */
export async function persistBrainRejection(opts: {
  blockHeight: number;
  ruleIndex: number | null;
  reasoning: string;
}): Promise<string> {
  const contentId = `experience:rejected:${crypto.randomUUID()}`;
  await prisma.contentFlag
    .create({
      data: {
        contentType: 'experience',
        contentId,
        flaggedBy: NEXUS_BRAIN_WALLET,
        isBrainFlag: true,
        ruleIndex: opts.ruleIndex,
        reason: `Brain rejected experience manifest: ${opts.reasoning}`,
      },
    })
    .catch(() => null);
  return contentId;
}
