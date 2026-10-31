import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encryptApiKey } from '@/lib/key-encryption';
import { generateGuardianBundle, GUARDIAN_PROTOCOL_VERSION } from '@/lib/guardian-templates';
import { verifySignedAction } from '@/lib/signed-action';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { requireLiveBlockOwner, gateDenialResponse } from '@/lib/ownership-gate';
import { emitGuardianRegistered, emitGuardianTransition } from '@/lib/block-event-emitters';
import { guardianLiveState } from '@/lib/block-events';
import { toOwnerGuardian, toPublicGuardian } from '@/lib/guardian-view';

const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'xai', 'custom'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      blockHeight, ownerAddress, name, soulMd, agentMd, skillsMd, personality,
      llmProvider, llmModel, llmApiKey, llmEndpoint, selfHosted, agentEndpoint,
      autoResponses, escalateTelegram, escalateEmail, autoApproveDelegationUnder,
      signature, message: signedMessage,
    } = body;

    if (!blockHeight || !ownerAddress || !name) {
      return NextResponse.json({ error: 'Missing required fields: blockHeight, ownerAddress, name' }, { status: 400 });
    }

    // Generate default templates if not provided
    const bundle = generateGuardianBundle(blockHeight, name);
    const finalSoulMd = soulMd || bundle.soulMd;
    const finalAgentMd = body.agentMd || bundle.agentMd;
    const finalSkillsMd = body.skillsMd || bundle.skillsMd;

    // The owner signs the canonical message for exactly this request, with a
    // one-time nonce from POST /api/v1/challenge { purpose: 'guardian' }.
    const auth = await verifySignedAction(ownerAddress, signedMessage, signature, body, {
      action: 'guardian.create', method: 'POST', path: '/api/v1/guardian',
      blockHeight: Number(blockHeight), purpose: 'guardian',
    });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // A signature proves the wallet and says nothing about the land. Without
    // this, any wallet could stand an agent up on any block — the upsert key is
    // (blockHeight, ownerAddress), so a squatter got their own row on someone
    // else's block rather than colliding with the real owner's.
    const gate = await requireLiveBlockOwner(ownerAddress, blockHeight);
    if (!gate.ok) return gateDenialResponse(gate);

    // Validate provider
    if (llmProvider && !VALID_PROVIDERS.includes(llmProvider)) {
      return NextResponse.json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` }, { status: 400 });
    }

    // Encrypt API key if provided
    let encryptedKey: string | undefined;
    if (llmApiKey) {
      encryptedKey = encryptApiKey(llmApiKey);
    }

    // Same rule as PATCH /guardian/[id]: the stored key is sent, as a bearer
    // token, wherever the destination points, so moving the destination without
    // re-sending the key clears it. Without this the upsert below kept the key
    // while repointing `llmEndpoint`, sidestepping the PATCH protection.
    const existing = await prisma.guardianAgent.findUnique({
      where: { blockHeight_ownerAddress: { blockHeight, ownerAddress } },
    });
    const destinationChanged =
      !!existing &&
      ((llmEndpoint !== undefined && llmEndpoint !== existing.llmEndpoint) ||
        (llmProvider !== undefined && llmProvider !== existing.llmProvider) ||
        (agentEndpoint !== undefined && agentEndpoint !== existing.agentEndpoint) ||
        (selfHosted !== undefined && selfHosted !== existing.selfHosted));
    const clearKey = !encryptedKey && destinationChanged && !!existing?.llmApiKey;
    // The live state BEFORE the write, as PATCH / DELETE / heartbeat do: the
    // fetched row must not be read again after the upsert.
    const before = existing ? guardianLiveState(existing) : null;

    const guardian = await prisma.guardianAgent.upsert({
      where: { blockHeight_ownerAddress: { blockHeight, ownerAddress } },
      update: {
        name, soulMd,
        ...(agentMd !== undefined && { agentMd }),
        ...(skillsMd !== undefined && { skillsMd }),
        ...(personality !== undefined && { personality }),
        ...(llmProvider !== undefined && { llmProvider }),
        ...(llmModel !== undefined && { llmModel }),
        ...(encryptedKey && { llmApiKey: encryptedKey }),
        ...(clearKey && { llmApiKey: null }),
        ...(llmEndpoint !== undefined && { llmEndpoint }),
        ...(selfHosted !== undefined && { selfHosted }),
        ...(agentEndpoint !== undefined && { agentEndpoint }),
        ...(autoResponses !== undefined && { autoResponses: JSON.stringify(autoResponses) }),
        ...(escalateTelegram !== undefined && { escalateTelegram }),
        ...(escalateEmail !== undefined && { escalateEmail }),
        ...(autoApproveDelegationUnder !== undefined && { autoApproveDelegationUnder }),
      },
      create: {
        blockHeight, ownerAddress, name,
        soulMd: finalSoulMd,
        agentMd: finalAgentMd,
        skillsMd: finalSkillsMd,
        memoryMd: bundle.memoryMd,
        configJson: JSON.stringify(bundle.configJson),
        protocolVersion: GUARDIAN_PROTOCOL_VERSION,
        personality,
        llmProvider, llmModel,
        llmApiKey: encryptedKey,
        llmEndpoint, selfHosted: selfHosted || false,
        agentEndpoint,
        autoResponses: autoResponses ? JSON.stringify(autoResponses) : undefined,
        escalateTelegram, escalateEmail, autoApproveDelegationUnder,
      },
    });

    // Living Block, after the commit. System-signed: the wallet signature is
    // spent here and stays private.
    if (!before) await emitGuardianRegistered(guardian);
    else await emitGuardianTransition(before, guardian);

    // The signer was just verified as the block's owner: the owner view.
    return NextResponse.json({ guardian: toOwnerGuardian(guardian as unknown as Record<string, unknown>) });
  } catch (err: unknown) {
    console.error('[Guardian POST]', err);
    return NextResponse.json({ error: 'Failed to create/update guardian' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-guardian' });
  if (rl.response) return rl.response;

  try {
    const { searchParams } = new URL(req.url);
    const blockHeight = searchParams.get('blockHeight');
    const ownerAddress = searchParams.get('ownerAddress');

    if (!blockHeight && !ownerAddress) {
      return NextResponse.json({ error: 'Provide blockHeight or ownerAddress' }, { status: 400 });
    }

    const where: Record<string, unknown> = {};
    if (blockHeight) where.blockHeight = parseInt(blockHeight);
    if (ownerAddress) where.ownerAddress = ownerAddress;

    // Anonymous: the public view only. The owner reads the full settings
    // through /api/v1/guardian/{id} (monitor token or a signed read).
    const guardians = await prisma.guardianAgent.findMany({ where });
    return NextResponse.json({ guardians: guardians.map(g => toPublicGuardian(g as unknown as Record<string, unknown>)) });
  } catch (err: unknown) {
    console.error('[Guardian GET]', err);
    return NextResponse.json({ error: 'Failed to fetch guardians' }, { status: 500 });
  }
}
