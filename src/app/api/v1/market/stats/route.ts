import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalListings, floorResult, totalVolumeResult, dayVolumeResult, recentSales, totalSales] = await Promise.all([
      prisma.bitmapListing.count({ where: { status: 'active' } }),
      prisma.bitmapListing.findFirst({
        where: { status: 'active' },
        orderBy: { price: 'asc' },
        select: { price: true },
      }),
      prisma.bitmapSale.aggregate({ _sum: { price: true } }),
      prisma.bitmapSale.aggregate({
        where: { createdAt: { gte: dayAgo } },
        _sum: { price: true },
      }),
      prisma.bitmapSale.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { blockHeight: true, price: true, createdAt: true, sellerAddress: true, buyerAddress: true },
      }),
      prisma.bitmapSale.count(),
    ]);

    return NextResponse.json({
      totalListings,
      floorPrice: floorResult?.price?.toString() || '0',
      totalVolume: totalVolumeResult._sum.price?.toString() || '0',
      volume24h: dayVolumeResult._sum.price?.toString() || '0',
      totalSales,
      recentSales: recentSales.map((s) => ({ ...s, price: s.price.toString() })),
    });
  } catch (error: any) {
    console.error('Market stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
