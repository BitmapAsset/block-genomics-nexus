import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, verifyWalletSignature } from '@/lib/api-helpers';
import { calculateDelegationFee } from '@/lib/protocol';

// Rate limiting: in-memory (upgrade to Redis for production scale)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, listingId, durationDays, txId } = body;

    if (!walletAddress || !signature || !message) return error('Auth required', 400);
    if (!listingId || !durationDays || !txId) return error('listingId, durationDays, txId required', 400);
    if (![30, 365].includes(durationDays)) return error('durationDays must be 30 or 365', 400);

    /* BIP-322 wallet signature verification */
    if (!verifyWalletSignature(walletAddress, message, signature)) return error('Invalid signature', 401);

    const listing = await prisma.delegationListing.findUnique({ where: { id: listingId } });
    if (!listing || !listing.active) return error('Listing not found or inactive', 404);

    // Check spots
    if (listing.spotsTotal !== -1 && listing.spotsUsed >= listing.spotsTotal) {
      return error('No spots available', 400);
    }

    const priceSats = durationDays === 30 ? listing.price30d : listing.price365d;
    const fee = calculateDelegationFee(priceSats, listing.ownerAddress);

    /* MOCK — replace with real tx verification against Bitcoin network */
    // TODO: Verify txId on-chain: correct outputs, amounts, confirmations

    // Ensure delegatee user exists
    await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress, tier: 3 },
    });

    const now = new Date();
    const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const [delegation] = await prisma.$transaction([
      prisma.delegation.create({
        data: {
          blockHeight: listing.blockHeight,
          parcelTxIndex: listing.parcelTxIndex,
          ownerAddress: listing.ownerAddress,
          delegateeAddress: walletAddress,
          tier: listing.tier,
          durationDays,
          priceSats,
          protocolFeeSats: fee.protocolFeeSats,
          startDate: now,
          endDate,
          txId,
        },
      }),
      prisma.delegationListing.update({
        where: { id: listingId },
        data: { spotsUsed: { increment: 1 } },
      }),
    ]);

    return success(delegation);
  } catch (e: any) {
    return error(e.message, 500);
  }
}
