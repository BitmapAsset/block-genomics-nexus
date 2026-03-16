import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, verifyWalletSignature } from '@/lib/api-helpers';
import { calculateDelegationFee } from '@/lib/protocol';

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

    // SECURITY: On-chain transaction verification is required before granting delegation access.
    // This needs proper implementation using mempool.space or ordinals.com API to verify:
    // 1. The txId exists and has sufficient confirmations
    // 2. Outputs match the expected fee split (owner + protocol)
    // 3. The transaction was sent from the walletAddress
    // Blocked until verification is implemented to prevent fake transaction attacks.
    return error('Transaction verification not yet implemented — delegation purchases are disabled', 503);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
