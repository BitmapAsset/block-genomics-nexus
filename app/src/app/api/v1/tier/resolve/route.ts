import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { resolveTier } from '@/lib/tier-resolver';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, force } = body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return error('walletAddress is required', 400);
    }

    if (walletAddress.length < 20 || walletAddress.length > 100) {
      return error('Invalid wallet address', 400);
    }

    const baseUrl = req.nextUrl.origin;
    const resolution = await resolveTier(walletAddress, { force: !!force, baseUrl });

    return success(resolution);
  } catch (e: unknown) {
    console.error('[tier/resolve] Error:', e);
    return error('Failed to resolve tier', 500);
  }
}
