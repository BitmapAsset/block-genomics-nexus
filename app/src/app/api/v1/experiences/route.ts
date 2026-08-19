import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import {
  experienceManifestSchema,
  EXPERIENCE_TYPES,
  EXPERIENCE_STATUSES,
  type ExperienceType,
  type ExperienceStatus,
} from '@/lib/experience-protocol';
import { verifyExperienceOwnerGate } from '@/lib/experience-ownership';
import { judgeExperienceManifest } from '@/lib/experience-judge';
import { serializeExperience, probeAndPersist, persistBrainRejection } from '@/lib/experience-service';
import { enforceRateLimit } from '@/lib/api-rate-limit';

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}

/**
 * POST /api/v1/experiences — register a self-hosted experience on an owned block.
 * Ownership gate = the SAME fail-closed path as agent register (BIP-322 + single-
 * use server challenge + live on-chain re-verify). The Brain judges the manifest
 * text before accept; a violation is a hard 422 + ContentFlag. Probed on register.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, challenge } = body ?? {};

    if (!walletAddress || !signature || !challenge) {
      return error('Missing required fields: walletAddress, signature, challenge', 400);
    }
    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    // Validate the manifest BEFORE the ownership gate so a malformed body never
    // consumes the one-time challenge.
    const parsed = experienceManifestSchema.safeParse(body);
    if (!parsed.success) {
      return error(`Invalid manifest: ${zodMessage(parsed.error)}`, 400);
    }
    const m = parsed.data;

    const gate = await verifyExperienceOwnerGate({
      walletAddress,
      blockHeight: m.blockHeight,
      signature,
      challenge,
      purpose: 'experience-register',
    });
    if (!gate.ok) return error(gate.error, gate.status);

    // Brain moral judge on the human-readable manifest text — hard publication gate.
    const judgement = await judgeExperienceManifest({
      name: m.name,
      description: m.description,
      entryUrl: m.entryUrl,
      walletAddress,
      blockHeight: m.blockHeight,
    });
    if (judgement.violated) {
      const contentFlagId = await persistBrainRejection({
        blockHeight: m.blockHeight,
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

    const healthUrl = m.healthUrl ?? m.entryUrl;
    const created = await prisma.experience.create({
      data: {
        walletAddress,
        blockHeight: m.blockHeight,
        parcelIndex: m.parcelIndex ?? null,
        name: m.name,
        description: m.description ?? null,
        experienceType: m.experienceType,
        entryUrl: m.entryUrl,
        transport: m.transport,
        healthUrl,
        clientRequirements: m.clientRequirements ? JSON.stringify(m.clientRequirements) : null,
        capabilities: m.capabilities ?? [],
        contentRating: m.contentRating ?? null,
        version: m.version,
        status: 'pending',
        soulJudged: true,
      },
    });

    // Probe on register (best-effort; sets live/degraded/unreachable).
    await probeAndPersist(created).catch(() => {});
    const fresh = await prisma.experience.findUnique({ where: { id: created.id } });
    return success(serializeExperience(fresh ?? created), 201);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

/**
 * GET /api/v1/experiences?blockHeight=&type=&status=&limit=&offset=
 * Public, paginated discovery.
 */
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-experiences' });
  if (rl.response) return rl.response;

  try {
    const { searchParams } = new URL(req.url);
    const where: { blockHeight?: number; experienceType?: ExperienceType; status?: ExperienceStatus } = {};

    const blockHeightRaw = searchParams.get('blockHeight');
    if (blockHeightRaw != null) {
      const bh = Number(blockHeightRaw);
      if (!Number.isInteger(bh) || bh < 0) return error('blockHeight must be a non-negative integer', 400);
      where.blockHeight = bh;
    }

    const typeRaw = searchParams.get('type');
    if (typeRaw != null) {
      if (!(EXPERIENCE_TYPES as readonly string[]).includes(typeRaw)) {
        return error(`type must be one of: ${EXPERIENCE_TYPES.join(', ')}`, 400);
      }
      where.experienceType = typeRaw as ExperienceType;
    }

    const statusRaw = searchParams.get('status');
    if (statusRaw != null) {
      if (!(EXPERIENCE_STATUSES as readonly string[]).includes(statusRaw)) {
        return error(`status must be one of: ${EXPERIENCE_STATUSES.join(', ')}`, 400);
      }
      where.status = statusRaw as ExperienceStatus;
    }

    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const [items, total] = await Promise.all([
      prisma.experience.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      prisma.experience.count({ where }),
    ]);

    return success({ experiences: items.map(serializeExperience), total, limit, offset });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
