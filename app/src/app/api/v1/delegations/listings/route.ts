import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString } from '@/lib/api-helpers';
import { verifySignedAction } from '@/lib/signed-action';
import { emitAgentEvent } from '@/lib/agent-events';
import { requireLiveBlockOwner } from '@/lib/ownership-gate';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-delegations-listings' });
  if (rl.response) return rl.response;

  try {
    const url = new URL(req.url);
    const blockHeight = url.searchParams.get('blockHeight');
    const tier = url.searchParams.get('tier');
    const active = url.searchParams.get('active');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const where: Record<string, unknown> = {};
    if (blockHeight) where.blockHeight = parseInt(blockHeight, 10);
    if (tier) where.tier = parseInt(tier, 10);
    if (active !== null) where.active = active !== 'false';

    const [listings, total] = await Promise.all([
      prisma.delegationListing.findMany({
        where,
        include: {
          owner: { select: { walletAddress: true, handle: true, tier: true, resolvedTier: true } },
          block: { select: { height: true, label: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.delegationListing.count({ where }),
    ]);

    return success({ listings, total, limit, offset });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

// Rate limiting: in-memory (upgrade to Redis for production scale)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, blockHeight, parcelTxIndex, tier, spotsTotal, price30d, price365d } = body;

    if (!walletAddress || !signature || !message) return error('Auth required', 400);
    if (!blockHeight || !price30d || !price365d) return error('blockHeight, price30d, price365d required', 400);
    if (![2, 3].includes(tier)) return error('tier must be 2 or 3', 400);
    if (price30d < 0 || price365d < 0) return error('Prices must be non-negative', 400);

    // The canonical 'delegation.list' message for this block and body, with a
    // one-time 'delegation' nonce.
    const auth = await verifySignedAction(walletAddress, message, signature, body, {
      action: 'delegation.list', method: 'POST', path: '/api/v1/delegations/listings',
      blockHeight: Number(blockHeight), purpose: 'delegation',
    });
    if (!auth.ok) return error(auth.error, auth.status);

    // An update is authorized against the listing's OWN block. The ownership
    // check below used to run on body.blockHeight while the upsert edited
    // body.listingId, so the owner of any block A could re-price and re-activate
    // a listing on block B (bg48 Q-04). Load it first; a block mismatch is refused.
    let existing: { id: string; blockHeight: number } | null = null;
    if (body.listingId) {
      existing = await prisma.delegationListing.findUnique({
        where: { id: String(body.listingId) },
        select: { id: true, blockHeight: true },
      });
      if (!existing) return error('Listing not found', 404);
      if (existing.blockHeight !== blockHeight) {
        return error('listingId belongs to a different block than blockHeight', 400);
      }
    }

    // OWNERSHIP — asked of the chain, not of our cache. This route had the check
    // inverted: `Block.ownerAddress === walletAddress` granted outright, and the
    // chain was consulted ONLY when the cache disagreed. The cache could grant but
    // never deny, so a seller kept renting out land they had sold for as long as
    // the background sync lagged. An outage is a retryable 503, never a grant.
    const owns = await requireLiveBlockOwner(walletAddress, existing ? existing.blockHeight : blockHeight);
    if (!owns.ok) {
      return error(owns.reason ?? 'Not the block owner', owns.status);
    }

    const listing = existing
      ? await prisma.delegationListing.update({
          where: { id: existing.id },
          data: {
            tier,
            spotsTotal: spotsTotal ?? -1,
            price30d,
            price365d,
            active: true,
          },
        })
      : await prisma.delegationListing.create({
          data: {
            blockHeight,
            parcelTxIndex: parcelTxIndex ?? null,
            ownerAddress: walletAddress,
            tier,
            spotsTotal: spotsTotal ?? -1,
            price30d,
            price365d,
          },
        });

    // Fire-and-forget: notify BitmapAgents on this block that a delegation
    // listing was created/updated.
    void emitAgentEvent(blockHeight, 'listing_created', {
      actor: walletAddress,
      listingId: listing.id,
      tier,
      price30d,
      price365d,
      spotsTotal: spotsTotal ?? -1,
      summary: `Delegation listing on block #${blockHeight}: tier ${tier}, ${price30d} sats/30d, ${price365d} sats/365d`,
    });

    return success(listing);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
