import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';

// TODO: Add rate limiting
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message } = body;

    if (!walletAddress || !signature || !message) {
      return error('walletAddress, signature, and message are required', 400);
    }

    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    /* MOCK — replace with real BIP-322 */
    // TODO: Implement real BIP-322 signature verification
    // 1. Parse the BIP-322 signature
    // 2. Recover the public key from the signature
    // 3. Derive the address from the public key
    // 4. Compare derived address with provided walletAddress
    // 5. Verify the signature against the message
    const isValid = !!signature && signature.length > 10;

    if (!isValid) {
      return error('Invalid signature', 401);
    }

    // Upsert user
    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: { verified: true },
      create: { walletAddress, verified: true, tier: 3 },
    });

    return success({
      verified: true,
      walletAddress: user.walletAddress,
      handle: user.handle,
      tier: user.tier,
    });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
