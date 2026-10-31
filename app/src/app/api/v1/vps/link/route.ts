import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import { assertSafePublicUrl } from '@/lib/experience-protocol';
import { verifySignedAction, signedActionHelp } from '@/lib/signed-action';
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
      message,
    } = body;

    if (!signature || !message) {
      return error(`Missing signature or message. ${signedActionHelp({ action: 'vps.link', purpose: 'vps' })}`, 401);
    }
    if (!walletAddress || blockHeight == null || !serverUrl || !signature || !message) {
      return error('Missing required fields: walletAddress, blockHeight, serverUrl, signature, message', 400);
    }

    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    const height = parseBlockHeight(String(blockHeight));
    if (height === null) return error(INVALID_BLOCK_HEIGHT_MESSAGE, 400);

    // The holder signs the canonical 'vps.link' message for this block and this
    // body (serverUrl, connection type, parcel), with a one-time 'vps' nonce.
    const auth = await verifySignedAction(walletAddress, message, signature, body, {
      action: 'vps.link', method: 'POST', path: '/api/v1/vps/link', blockHeight: height, purpose: 'vps',
    });
    if (!auth.ok) return error(auth.error, auth.status);

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

    // GET /vps/block/[h] lists this URL publicly as the block's server: a public
    // https or wss host only.
    const urlCheck = assertSafePublicUrl(serverUrl);
    if (!urlCheck.ok) return error(`serverUrl: ${urlCheck.reason ?? 'not a public https or wss URL'}`, 400);

    const link = await prisma.vPSLink.create({
      data: {
        walletAddress,
        blockHeight: height,
        parcelIndex: parcelIndex ?? null,
        serverUrl: serverUrl.trim(),
        connectionType: connType,
        status: 'linked',
        tlsVerified: true,
      },
    });

    return success(link, 201);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
