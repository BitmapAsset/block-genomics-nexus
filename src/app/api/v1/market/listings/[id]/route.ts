import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const listing = await prisma.bitmapListing.findUnique({
      where: { id },
      include: {
        seller: { select: { walletAddress: true, handle: true, avatar: true, tier: true, verified: true } },
        buyer: { select: { walletAddress: true, handle: true, avatar: true, tier: true } },
      },
    });
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    return NextResponse.json({ ...listing, price: listing.price.toString() });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch listing' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { price, sellerAddress } = body;

    const listing = await prisma.bitmapListing.findUnique({ where: { id } });
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    if (listing.sellerAddress !== sellerAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (listing.status !== 'active') {
      return NextResponse.json({ error: 'Listing is not active' }, { status: 400 });
    }

    const updated = await prisma.bitmapListing.update({
      where: { id },
      data: { price: BigInt(price) },
    });

    return NextResponse.json({ ...updated, price: updated.price.toString() });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = req.nextUrl;
    const sellerAddress = url.searchParams.get('sellerAddress');

    const listing = await prisma.bitmapListing.findUnique({ where: { id } });
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    if (listing.sellerAddress !== sellerAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updated = await prisma.bitmapListing.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return NextResponse.json({ ...updated, price: updated.price.toString() });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to cancel listing' }, { status: 500 });
  }
}
