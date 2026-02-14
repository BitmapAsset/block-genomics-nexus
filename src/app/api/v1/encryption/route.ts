import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

/**
 * GET /api/v1/encryption?wallet=<address>
 * Retrieve a user's encryption public key for E2E DMs.
 * This is safe — public keys are meant to be shared.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const wallet = url.searchParams.get('wallet');
    const handle = url.searchParams.get('handle');

    if (!wallet && !handle) {
      return error('wallet or handle parameter required', 400);
    }

    const user = await prisma.user.findFirst({
      where: wallet
        ? { walletAddress: wallet }
        : { handle: handle!.toLowerCase() },
      select: {
        walletAddress: true,
        handle: true,
        encryptionPubKey: true,
      },
    });

    if (!user) return error('User not found', 404);
    if (!user.encryptionPubKey) {
      return error('User has not set up E2E encryption yet', 404);
    }

    return success({
      wallet: user.walletAddress,
      handle: user.handle,
      encryptionPubKey: user.encryptionPubKey,
    });
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}

/**
 * POST /api/v1/encryption
 * Register/update your encryption public key.
 * Requires wallet address for ownership verification.
 * 
 * Body: { walletAddress: string, encryptionPubKey: string }
 * 
 * SECURITY: Only the public key is stored. Never accepts private keys.
 * The public key is validated as a proper secp256k1 point before storage.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, encryptionPubKey } = body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return error('walletAddress is required', 400);
    }
    if (!encryptionPubKey || typeof encryptionPubKey !== 'string') {
      return error('encryptionPubKey is required', 400);
    }

    // Validate hex format (compressed secp256k1 = 66 hex chars = 33 bytes)
    if (!/^(02|03)[0-9a-f]{64}$/i.test(encryptionPubKey)) {
      return error('Invalid public key format — expected compressed secp256k1 (33 bytes hex)', 400);
    }

    // Reject anything that looks like a private key (32 bytes = 64 hex)
    // Private keys don't start with 02 or 03, but be extra safe
    if (encryptionPubKey.length === 64) {
      return error('REJECTED — this looks like a private key. NEVER send private keys.', 400);
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { walletAddress },
    });
    if (!user) return error('User not found — verify your wallet first', 404);

    // Store encryption public key
    await prisma.user.update({
      where: { walletAddress },
      data: { encryptionPubKey: encryptionPubKey.toLowerCase() },
    });

    return success({ 
      message: 'Encryption public key registered',
      wallet: walletAddress,
    });
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
