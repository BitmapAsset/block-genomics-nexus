import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, ownerAddress } = body; // action: 'accept' | 'reject'

    const offer = await prisma.bitmapOffer.findUnique({ where: { id } });
    if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    if (offer.status !== 'pending') {
      return NextResponse.json({ error: 'Offer is not pending' }, { status: 400 });
    }

    // Verify the requester owns the block
    const block = await prisma.block.findUnique({ where: { height: offer.blockHeight } });
    if (!block || block.ownerAddress !== ownerAddress) {
      return NextResponse.json({ error: 'Unauthorized — not block owner' }, { status: 403 });
    }

    if (action === 'accept') {
      const [updated] = await prisma.$transaction([
        prisma.bitmapOffer.update({
          where: { id },
          data: { status: 'accepted' },
        }),
        prisma.bitmapSale.create({
          data: {
            blockHeight: offer.blockHeight,
            sellerAddress: ownerAddress,
            buyerAddress: offer.offererAddress,
            price: offer.amount,
            offerId: offer.id,
          },
        }),
        // Cancel other pending offers for the same block
        prisma.bitmapOffer.updateMany({
          where: { blockHeight: offer.blockHeight, status: 'pending', id: { not: id } },
          data: { status: 'cancelled' },
        }),
        // Cancel active listing if exists
        prisma.bitmapListing.updateMany({
          where: { blockHeight: offer.blockHeight, status: 'active' },
          data: { status: 'sold', buyerAddress: offer.offererAddress, soldAt: new Date() },
        }),
      ]);

      return NextResponse.json({ ...updated, amount: updated.amount.toString() });
    } else if (action === 'reject') {
      const updated = await prisma.bitmapOffer.update({
        where: { id },
        data: { status: 'rejected' },
      });
      return NextResponse.json({ ...updated, amount: updated.amount.toString() });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Offer PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 });
  }
}
