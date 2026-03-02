import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function getEpochRange(epoch: number): [number, number] {
  const ranges: Record<number, [number, number]> = {
    1: [0, 209999],
    2: [210000, 419999],
    3: [420000, 629999],
    4: [630000, 839999],
    5: [840000, 99999999],
  };
  return ranges[epoch] || [0, 99999999];
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '24'), 100);
    const minPrice = url.searchParams.get('minPrice');
    const maxPrice = url.searchParams.get('maxPrice');
    const epoch = url.searchParams.get('epoch');
    const sort = url.searchParams.get('sort') || 'newest';
    const status = url.searchParams.get('status') || 'active';

    const where: any = { status };

    if (minPrice) where.price = { ...where.price, gte: BigInt(minPrice) };
    if (maxPrice) where.price = { ...where.price, lte: BigInt(maxPrice) };

    if (epoch) {
      const epochs = epoch.split(',').map(Number);
      const ranges = epochs.map(getEpochRange);
      where.OR = ranges.map(([min, max]) => ({
        blockHeight: { gte: min, lte: max },
      }));
    }

    const orderBy: any =
      sort === 'price_asc' ? { price: 'asc' } :
      sort === 'price_desc' ? { price: 'desc' } :
      sort === 'block_asc' ? { blockHeight: 'asc' } :
      sort === 'block_desc' ? { blockHeight: 'desc' } :
      { createdAt: 'desc' };

    const [listings, total] = await Promise.all([
      prisma.bitmapListing.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          seller: { select: { walletAddress: true, handle: true, avatar: true, tier: true, verified: true } },
        },
      }),
      prisma.bitmapListing.count({ where }),
    ]);

    // Serialize BigInt
    const serialized = listings.map((l) => ({
      ...l,
      price: l.price.toString(),
    }));

    return NextResponse.json({
      listings: serialized,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Market listings GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, sellerAddress, price, psbtBase64, inscriptionId, expiresAt } = body;

    if (!blockHeight || !sellerAddress || !price) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check seller exists
    const seller = await prisma.user.findUnique({ where: { walletAddress: sellerAddress } });
    if (!seller) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
    }

    // Check no active listing for this block by this seller
    const existing = await prisma.bitmapListing.findFirst({
      where: { blockHeight, sellerAddress, status: 'active' },
    });
    if (existing) {
      return NextResponse.json({ error: 'Active listing already exists for this block' }, { status: 409 });
    }

    const listing = await prisma.bitmapListing.create({
      data: {
        blockHeight,
        sellerAddress,
        price: BigInt(price),
        psbtBase64,
        inscriptionId,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
    });

    return NextResponse.json({
      ...listing,
      price: listing.price.toString(),
    }, { status: 201 });
  } catch (error: any) {
    console.error('Market listings POST error:', error);
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }
}
