import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const blockHeight = url.searchParams.get('blockHeight');
    const offererAddress = url.searchParams.get('offererAddress');
    const status = url.searchParams.get('status') || 'pending';

    const where: any = { status };
    if (blockHeight) where.blockHeight = parseInt(blockHeight);
    if (offererAddress) where.offererAddress = offererAddress;

    const offers = await prisma.bitmapOffer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        offerer: { select: { walletAddress: true, handle: true, avatar: true, tier: true } },
      },
    });

    return NextResponse.json({
      offers: offers.map((o) => ({ ...o, amount: o.amount.toString() })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, offererAddress, amount, psbtBase64, expiresAt } = body;

    if (!blockHeight || !offererAddress || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const offerer = await prisma.user.findUnique({ where: { walletAddress: offererAddress } });
    if (!offerer) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const offer = await prisma.bitmapOffer.create({
      data: {
        blockHeight,
        offererAddress,
        amount: BigInt(amount),
        psbtBase64,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
    });

    return NextResponse.json({ ...offer, amount: offer.amount.toString() }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
  }
}
