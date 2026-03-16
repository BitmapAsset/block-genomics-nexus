import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import { verifyAgentSignature } from '@/lib/agent-protocol';

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

    /* BIP-322 wallet signature verification */
    if (!verifyAgentSignature(walletAddress, challenge, signature)) {
      return error('Invalid wallet signature', 401);
    }

    const validTypes = ['https', 'websocket', 'webrtc'];
    const connType = connectionType || 'https';
    if (!validTypes.includes(connType)) {
      return error(`connectionType must be one of: ${validTypes.join(', ')}`, 400);
    }

    const link = await prisma.vPSLink.create({
      data: {
        walletAddress,
        blockHeight,
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
