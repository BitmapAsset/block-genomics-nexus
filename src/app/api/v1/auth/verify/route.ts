import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import crypto from 'crypto';
import { logActivity } from '@/lib/activity';

/**
 * POST /api/v1/auth/verify
 * Body: { walletAddress, signature, message, blockHeight?, handle?, displayName? }
 * 
 * Step 1: Verify wallet signature (BIP-322 — currently accepts any non-empty sig)
 * Step 2: Generate genome hash from wallet + block
 * Step 3: Upsert user with tier, handle, genome
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, blockHeight, handle, displayName } = body;

    if (!walletAddress || !signature || !message) {
      return error('walletAddress, signature, and message are required', 400);
    }

    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    // BIP-322 verification
    // TODO: Real BIP-322 verification library (e.g. bip322-js)
    // For now we accept any signature > 10 chars from a valid wallet
    // The wallet extension itself handles the actual signing
    const isValid = !!signature && signature.length > 10;
    if (!isValid) {
      return error('Invalid signature', 401);
    }

    // Generate genome hash: SHA-256 of wallet + block + signature
    const genomeInput = `${walletAddress}:${blockHeight || 0}:${signature}`;
    const genomeHash = '0x' + crypto.createHash('sha256').update(genomeInput).digest('hex');

    // Determine tier based on block ownership
    // Tier 1 = block owner (has blockHeight), Tier 2 = parcel, Tier 3 = delegated
    const tier = blockHeight ? 1 : 3;

    // Normalize handle to lowercase
    const normalizedHandle = handle?.toLowerCase();

    // Check handle uniqueness if provided
    if (normalizedHandle) {
      const existing = await prisma.user.findUnique({ where: { handle: normalizedHandle } });
      if (existing && existing.walletAddress !== walletAddress) {
        return error('Handle already taken', 409);
      }
    }

    // Upsert user
    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: {
        verified: true,
        tier,
        genomeHash,
        ...(blockHeight && { anchorBlock: blockHeight }),
        ...(normalizedHandle && { handle: normalizedHandle }),
        ...(displayName !== undefined && { displayName }),
      },
      create: {
        walletAddress,
        verified: true,
        tier,
        genomeHash,
        anchorBlock: blockHeight || null,
        handle: normalizedHandle || null,
        displayName: displayName || null,
      },
    });

    // Record handle history if handle was set
    if (normalizedHandle) {
      await prisma.handleHistory.create({
        data: { handle: normalizedHandle, walletAddress, action: 'claimed' },
      });
    }

    // Create/update block record if blockHeight provided
    if (blockHeight) {
      await prisma.block.upsert({
        where: { height: blockHeight },
        update: { ownerAddress: walletAddress },
        create: { height: blockHeight, ownerAddress: walletAddress },
      });
    }

    // Log activity
    logActivity(walletAddress, 'verification', { tier, blockHeight, handle: normalizedHandle });

    return success({
      verified: true,
      walletAddress: user.walletAddress,
      handle: user.handle,
      displayName: user.displayName,
      genomeHash: user.genomeHash,
      tier: user.tier,
      anchorBlock: user.anchorBlock,
    });
  } catch (e: any) {
    return error(e.message, 500);
  }
}

/**
 * GET /api/v1/auth/verify?handle=xxx
 * Check handle availability
 */
export async function GET(req: NextRequest) {
  try {
    const handle = req.nextUrl.searchParams.get('handle');
    if (!handle) return error('handle query param required', 400);

    if (handle.length < 3 || handle.length > 20) return error('Handle must be 3-20 characters', 400);
    if (!/^[a-zA-Z0-9_]+$/.test(handle)) return error('Only letters, numbers, underscores', 400);

    const normalizedHandle = handle.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { handle: normalizedHandle } });
    return success({ handle, available: !existing });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
