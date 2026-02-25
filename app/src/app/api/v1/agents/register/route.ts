import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import {
  validatePermissions,
  maxAgentsForTier,
  REGISTRATION_COOLDOWN_MS,
  verifyAgentSignature,
} from '@/lib/agent-protocol';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      walletAddress,
      endpointUrl,
      blockHeight,
      parcelIndex,
      tier,
      permissions,
      signature,
      challenge,
    } = body;

    // Validate required fields
    if (!walletAddress || !endpointUrl || blockHeight == null || !tier || !permissions || !signature || !challenge) {
      return error('Missing required fields: walletAddress, endpointUrl, blockHeight, tier, permissions, signature, challenge', 400);
    }

    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    // Verify wallet signature
    /* BIP-322 wallet signature verification */
    if (!verifyAgentSignature(walletAddress, challenge, signature)) {
      return error('Invalid wallet signature', 401);
    }

    // Validate permissions
    const permCheck = validatePermissions(permissions);
    if (!permCheck.valid) {
      return error(`Invalid permissions: ${permCheck.invalid.join(', ')}`, 400);
    }

    // Validate tier
    if (![1, 2, 3].includes(tier)) {
      return error('Tier must be 1, 2, or 3', 400);
    }

    // Enforce tier-based agent cap
    const existingCount = await prisma.bitmapAgent.count({
      where: { blockHeight, status: 'active' },
    });
    if (existingCount >= maxAgentsForTier(tier)) {
      return error(`Agent cap reached for tier ${tier} (max ${maxAgentsForTier(tier)})`, 409);
    }

    // Enforce 24hr registration cooldown per wallet
    const lastRegistration = await prisma.bitmapAgent.findFirst({
      where: { walletAddress },
      orderBy: { createdAt: 'desc' },
    });
    if (lastRegistration && Date.now() - lastRegistration.createdAt.getTime() < REGISTRATION_COOLDOWN_MS) {
      return error('Registration cooldown: 24 hours between registrations per wallet', 429);
    }

    const agent = await prisma.bitmapAgent.create({
      data: {
        walletAddress,
        endpointUrl,
        blockHeight,
        parcelIndex: parcelIndex ?? null,
        tier,
        permissions: JSON.stringify(permissions),
        status: 'active',
      },
    });

    return success({ ...agent, permissions: JSON.parse(agent.permissions) }, 201);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
