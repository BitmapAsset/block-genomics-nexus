import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString, verifyWalletSignature } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const blockHeight = url.searchParams.get('blockHeight');
    const tier = url.searchParams.get('tier');
    const active = url.searchParams.get('active');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const where: any = {};
    if (blockHeight) where.blockHeight = parseInt(blockHeight, 10);
    if (tier) where.tier = parseInt(tier, 10);
    if (active !== null) where.active = active !== 'false';

    const [listings, total] = await Promise.all([
      prisma.delegationListing.findMany({
        where,
        include: {
          owner: { select: { walletAddress: true, handle: true, tier: true } },
          block: { select: { height: true, label: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.delegationListing.count({ where }),
    ]);

    return success({ listings, total, limit, offset });
  } catch (e: any) {
    return error(e.message, 500);
  }
}

// Rate limiting: in-memory (upgrade to Redis for production scale)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, blockHeight, parcelTxIndex, tier, spotsTotal, price30d, price365d } = body;

    if (!walletAddress || !signature || !message) return error('Auth required', 400);
    if (!blockHeight || !price30d || !price365d) return error('blockHeight, price30d, price365d required', 400);
    if (![2, 3].includes(tier)) return error('tier must be 2 or 3', 400);
    if (price30d < 0 || price365d < 0) return error('Prices must be non-negative', 400);

    /* BIP-322 wallet signature verification */
    if (!verifyWalletSignature(walletAddress, message, signature)) return error('Invalid signature', 401);

    // Verify owner owns the block — check DB first, then on-chain as fallback
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block) {
      return error(`Block ${blockHeight} not found. Verify ownership first at /verify.`, 404);
    }
    if (block.ownerAddress !== walletAddress) {
      // DB mismatch — try on-chain verification as fallback
      const { verifyAndSyncBlock } = await import('@/lib/ownership-sync');
      const check = await verifyAndSyncBlock(blockHeight, walletAddress);
      if (!check.isOwner) {
        return error(`Not the block owner. DB owner: ${block.ownerAddress?.slice(0, 12)}... On-chain check also failed.`, 403);
      }
      // If on-chain check passed, the sync function already updated the DB
    }

    const listing = await prisma.delegationListing.upsert({
      where: { id: body.listingId || '' },
      update: {
        tier,
        spotsTotal: spotsTotal ?? -1,
        price30d,
        price365d,
        active: true,
      },
      create: {
        blockHeight,
        parcelTxIndex: parcelTxIndex ?? null,
        ownerAddress: walletAddress,
        tier,
        spotsTotal: spotsTotal ?? -1,
        price30d,
        price365d,
      },
    });

    return success(listing);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
