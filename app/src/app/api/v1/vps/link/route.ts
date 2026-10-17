import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import { verifyAgentSignature } from '@/lib/agent-protocol';
import { requireLiveBlockOwner, gateDenialResponse } from '@/lib/ownership-gate';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      walletAddress,
      blockHeight,
      parcelIndex,
      serverUrl,
      connectionType,
      signature,
      challenge,
    } = body;

    if (!walletAddress || blockHeight == null || !serverUrl || !signature || !challenge) {
      return error('Missing required fields: walletAddress, blockHeight, serverUrl, signature, challenge', 400);
    }

    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    const height = parseBlockHeight(String(blockHeight));
    if (height === null) return error(INVALID_BLOCK_HEIGHT_MESSAGE, 400);

    /* BIP-322 wallet signature verification */
    if (!verifyAgentSignature(walletAddress, challenge, signature)) {
      return error('Invalid wallet signature', 401);
    }

    // A signature proves the wallet and says nothing about the land. Only the
    // block's live holder may attach a server to it: GET /vps/block/[h] lists
    // these links publicly as the block's servers.
    const gate = await requireLiveBlockOwner(walletAddress, height);
    if (!gate.ok) return gateDenialResponse(gate);

    const validTypes = ['https', 'websocket', 'webrtc'];
    const connType = connectionType || 'https';
    if (!validTypes.includes(connType)) {
      return error(`connectionType must be one of: ${validTypes.join(', ')}`, 400);
    }

    const link = await prisma.vPSLink.create({
      data: {
        walletAddress,
        blockHeight: height,
        parcelIndex: parcelIndex ?? null,
        serverUrl,
        connectionType: connType,
        status: 'linked',
        tlsVerified: serverUrl.startsWith('https://') || serverUrl.startsWith('wss://'),
      },
    });

    return success(link, 201);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
