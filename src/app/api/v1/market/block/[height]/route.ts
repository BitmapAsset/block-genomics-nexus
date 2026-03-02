import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ height: string }> }) {
  try {
    const { height } = await params;
    const blockHeight = parseInt(height);
    if (isNaN(blockHeight)) return NextResponse.json({ error: 'Invalid block height' }, { status: 400 });

    const [listing, offers, sales, block, guardian, worldObjects] = await Promise.all([
      prisma.bitmapListing.findFirst({
        where: { blockHeight, status: 'active' },
        include: {
          seller: { select: { walletAddress: true, handle: true, avatar: true, tier: true, verified: true } },
        },
      }),
      prisma.bitmapOffer.findMany({
        where: { blockHeight, status: 'pending' },
        orderBy: { amount: 'desc' },
        include: {
          offerer: { select: { walletAddress: true, handle: true, avatar: true, tier: true } },
        },
      }),
      prisma.bitmapSale.findMany({
        where: { blockHeight },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.block.findUnique({
        where: { height: blockHeight },
        include: {
          owner: { select: { walletAddress: true, handle: true, avatar: true, tier: true, verified: true } },
        },
      }),
      prisma.guardianAgent.findFirst({
        where: { blockHeight, status: 'active' },
        select: { id: true, name: true, status: true },
      }),
      prisma.blockObject.count({ where: { blockHeight } }),
    ]);

    return NextResponse.json({
      blockHeight,
      block,
      listing: listing ? { ...listing, price: listing.price.toString() } : null,
      offers: offers.map((o) => ({ ...o, amount: o.amount.toString() })),
      sales: sales.map((s) => ({ ...s, price: s.price.toString() })),
      guardian,
      hasWorldBuilt: worldObjects > 0,
      worldObjectCount: worldObjects,
    });
  } catch (error: any) {
    console.error('Block market data error:', error);
    return NextResponse.json({ error: 'Failed to fetch block market data' }, { status: 500 });
  }
}
