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

// TODO: Add rate limiting
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, blockHeight, parcelTxIndex, tier, spotsTotal, price30d, price365d } = body;

    if (!walletAddress || !signature || !message) return error('Auth required', 400);
    if (!blockHeight || !price30d || !price365d) return error('blockHeight, price30d, price365d required', 400);
    if (![2, 3].includes(tier)) return error('tier must be 2 or 3', 400);
    if (price30d < 0 || price365d < 0) return error('Prices must be non-negative', 400);

    /* MOCK — replace with real BIP-322 */
    if (!verifyWalletSignature(walletAddress, message, signature)) return error('Invalid signature', 401);

    // Verify owner owns the block
    const block = await prisma.block.findUnique({ where: { height: blockHeight } });
    if (!block) {
      console.log(`[Delegation] Block ${blockHeight} not found in DB`);
      return error(`Block ${blockHeight} not found in database. Verify ownership first.`, 404);
    }
    if (block.ownerAddress !== walletAddress) {
      console.log(`[Delegation] Owner mismatch: DB="${block.ownerAddress}" vs Request="${walletAddress}"`);
      return error(`Wallet mismatch. Block owner: ${block.ownerAddress?.slice(0, 12)}... Your wallet: ${walletAddress?.slice(0, 12)}...`, 403);
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
