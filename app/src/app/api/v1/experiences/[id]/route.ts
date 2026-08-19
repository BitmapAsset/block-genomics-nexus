import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import { experienceManifestPatchSchema } from '@/lib/experience-protocol';
import { verifyExperienceOwnerGate } from '@/lib/experience-ownership';
import { judgeExperienceManifest } from '@/lib/experience-judge';
import { serializeExperience, probeAndPersist, maybeReprobeStale, persistBrainRejection } from '@/lib/experience-service';
import { enforceRateLimit } from '@/lib/api-rate-limit';

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}

/**
 * GET /api/v1/experiences/[id] — public. Stale-on-read (>15min) triggers an
 * async re-probe; the current snapshot is returned immediately.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-experiences-id' });
  if (rl.response) return rl.response;

  try {
    const { id } = await params;
    const exp = await prisma.experience.findUnique({ where: { id } });
    if (!exp) return error('Experience not found', 404);
    maybeReprobeStale(exp);
    return success(serializeExperience(exp));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

/**
 * PATCH /api/v1/experiences/[id] — owner-gated partial manifest update.
 * Re-verifies on-chain ownership, re-judges changed text, and re-probes.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { walletAddress, signature, challenge } = body ?? {};

    if (!walletAddress || !signature || !challenge) {
      return error('Missing required fields: walletAddress, signature, challenge', 400);
    }
    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    const exp = await prisma.experience.findUnique({ where: { id } });
    if (!exp) return error('Experience not found', 404);
    // The caller must be the registrant (pre-gate cheap check, avoids consuming
    // the challenge on an obviously-wrong caller). The on-chain gate below is the
    // authoritative owner check.
    if (exp.walletAddress !== walletAddress) return error('Not the experience owner', 403);

    const parsed = experienceManifestPatchSchema.safeParse(body);
    if (!parsed.success) return error(`Invalid manifest patch: ${zodMessage(parsed.error)}`, 400);
    const patch = parsed.data;

    const gate = await verifyExperienceOwnerGate({
      walletAddress,
      blockHeight: exp.blockHeight,
      signature,
      challenge,
      purpose: 'experience-manage',
    });
    if (!gate.ok) return error(gate.error, gate.status);

    // Re-judge only when the human-readable text changes (name/description/entryUrl).
    if (patch.name !== undefined || patch.description !== undefined || patch.entryUrl !== undefined) {
      const judgement = await judgeExperienceManifest({
        name: patch.name ?? exp.name,
        description: patch.description ?? exp.description,
        entryUrl: patch.entryUrl ?? exp.entryUrl,
        walletAddress,
        blockHeight: exp.blockHeight,
      });
      if (judgement.violated) {
        const contentFlagId = await persistBrainRejection({
          blockHeight: exp.blockHeight,
          ruleIndex: judgement.ruleIndex,
          reasoning: judgement.reasoning,
        });
        return NextResponse.json(
          {
            success: false,
            error: `Manifest rejected by Nexus Brain: ${judgement.reasoning}`,
            ruleIndex: judgement.ruleIndex,
            contentFlagId,
          },
          { status: 422 },
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description ?? null;
    if (patch.experienceType !== undefined) data.experienceType = patch.experienceType;
    if (patch.entryUrl !== undefined) data.entryUrl = patch.entryUrl;
    if (patch.transport !== undefined) data.transport = patch.transport;
    if (patch.healthUrl !== undefined) data.healthUrl = patch.healthUrl ?? null;
    if (patch.clientRequirements !== undefined) {
      data.clientRequirements = patch.clientRequirements ? JSON.stringify(patch.clientRequirements) : null;
    }
    if (patch.capabilities !== undefined) data.capabilities = patch.capabilities ?? [];
    if (patch.contentRating !== undefined) data.contentRating = patch.contentRating ?? null;
    if (patch.version !== undefined) data.version = patch.version;

    const updated = await prisma.experience.update({ where: { id }, data });
    // Re-probe (health/entry URL may have changed).
    await probeAndPersist(updated).catch(() => {});
    const fresh = await prisma.experience.findUnique({ where: { id } });
    return success(serializeExperience(fresh ?? updated));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

/**
 * DELETE /api/v1/experiences/[id] — owner-gated, terminal.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { walletAddress, signature, challenge } = body ?? {};

    if (!walletAddress || !signature || !challenge) {
      return error('Missing required fields: walletAddress, signature, challenge', 400);
    }
    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    const exp = await prisma.experience.findUnique({ where: { id } });
    if (!exp) return error('Experience not found', 404);
    if (exp.walletAddress !== walletAddress) return error('Not the experience owner', 403);

    const gate = await verifyExperienceOwnerGate({
      walletAddress,
      blockHeight: exp.blockHeight,
      signature,
      challenge,
      purpose: 'experience-manage',
    });
    if (!gate.ok) return error(gate.error, gate.status);

    await prisma.experience.delete({ where: { id } });
    return success({ id, removed: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
