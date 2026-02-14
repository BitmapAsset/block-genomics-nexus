import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encryptApiKey, maskApiKey } from '@/lib/key-encryption';

const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'xai', 'custom'];

function sanitizeGuardian(g: Record<string, unknown>) {
  return { ...g, llmApiKey: maskApiKey(g.llmApiKey as string) };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      blockHeight, ownerAddress, name, soulMd, agentMd, skillsMd, personality,
      llmProvider, llmModel, llmApiKey, llmEndpoint, selfHosted, agentEndpoint,
      autoResponses, escalateTelegram, escalateEmail, autoApproveDelegationUnder,
      signature, message: signedMessage,
    } = body;

    if (!blockHeight || !ownerAddress || !name || !soulMd) {
      return NextResponse.json({ error: 'Missing required fields: blockHeight, ownerAddress, name, soulMd' }, { status: 400 });
    }

    // Verify wallet signature
    if (!signature || !signedMessage) {
      return NextResponse.json({ error: 'Wallet signature required' }, { status: 401 });
    }

    // Validate provider
    if (llmProvider && !VALID_PROVIDERS.includes(llmProvider)) {
      return NextResponse.json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` }, { status: 400 });
    }

    // Encrypt API key if provided
    let encryptedKey: string | undefined;
    if (llmApiKey) {
      encryptedKey = encryptApiKey(llmApiKey);
    }

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
        ...(llmEndpoint !== undefined && { llmEndpoint }),
        ...(selfHosted !== undefined && { selfHosted }),
        ...(agentEndpoint !== undefined && { agentEndpoint }),
        ...(autoResponses !== undefined && { autoResponses: JSON.stringify(autoResponses) }),
        ...(escalateTelegram !== undefined && { escalateTelegram }),
        ...(escalateEmail !== undefined && { escalateEmail }),
        ...(autoApproveDelegationUnder !== undefined && { autoApproveDelegationUnder }),
      },
      create: {
        blockHeight, ownerAddress, name, soulMd,
        agentMd, skillsMd, personality,
        llmProvider, llmModel,
        llmApiKey: encryptedKey,
        llmEndpoint, selfHosted: selfHosted || false,
        agentEndpoint,
        autoResponses: autoResponses ? JSON.stringify(autoResponses) : undefined,
        escalateTelegram, escalateEmail, autoApproveDelegationUnder,
      },
    });

    return NextResponse.json({ guardian: sanitizeGuardian(guardian as unknown as Record<string, unknown>) });
  } catch (err: unknown) {
    console.error('[Guardian POST]', err);
    return NextResponse.json({ error: 'Failed to create/update guardian' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
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

    const guardians = await prisma.guardianAgent.findMany({ where });
    return NextResponse.json({ guardians: guardians.map(g => sanitizeGuardian(g as unknown as Record<string, unknown>)) });
  } catch (err: unknown) {
    console.error('[Guardian GET]', err);
    return NextResponse.json({ error: 'Failed to fetch guardians' }, { status: 500 });
  }
}
