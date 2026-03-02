import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const filter = url.searchParams.get('filter') || 'all'; // all, sales, listings, offers
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

    const activities: any[] = [];

    if (filter === 'all' || filter === 'sales') {
      const sales = await prisma.bitmapSale.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      activities.push(...sales.map((s) => ({
        type: 'sale',
        blockHeight: s.blockHeight,
        price: s.price.toString(),
        from: s.sellerAddress,
        to: s.buyerAddress,
        createdAt: s.createdAt,
      })));
    }

    if (filter === 'all' || filter === 'listings') {
      const listings = await prisma.bitmapListing.findMany({
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      activities.push(...listings.map((l) => ({
        type: 'listing',
        blockHeight: l.blockHeight,
        price: l.price.toString(),
        from: l.sellerAddress,
        createdAt: l.createdAt,
      })));
    }

    if (filter === 'all' || filter === 'offers') {
      const offers = await prisma.bitmapOffer.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      activities.push(...offers.map((o) => ({
        type: 'offer',
        blockHeight: o.blockHeight,
        price: o.amount.toString(),
        from: o.offererAddress,
        createdAt: o.createdAt,
      })));
    }

    // Sort by date desc
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ activities: activities.slice(0, limit) });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }
}
