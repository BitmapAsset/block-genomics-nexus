import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { sandboxGate } from '@/lib/sandbox-keys';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { getBlockHashAtHeight } from '@/lib/onchain/esplora';

/**
 * Fetch the chain's hash for a block whose row is missing one, and keep it.
 *
 * Returns `null` when no indexer answers, so an outage shows an empty field
 * rather than failing a public read or storing a guess.
 */
async function backfillBlockHash(height: number): Promise<string | null> {
  const hash = await getBlockHashAtHeight(height);
  if (!hash) return null;
  try {
    await prisma.block.update({ where: { height }, data: { hash } });
  } catch {
    /* The read still answers correctly; the next request retries the write. */
  }
  return hash;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-height' });
  if (rl.response) return rl.response;

  try {
    const gate = await sandboxGate(req);
    if (gate.response) return gate.response;

    const { height } = await params;
    const h = parseBlockHeight(height);
    if (h === null) return error(INVALID_BLOCK_HEIGHT_MESSAGE, 400);

    const block = await prisma.block.findUnique({
      where: { height: h },
      include: {
        owner: { select: { walletAddress: true, handle: true, avatar: true, tier: true, resolvedTier: true } },
        _count: { select: { parcels: true } },
      },
    });

    if (!block) return error('Block not found', 404);

    // Rows created by the ownership and estate paths never carried a hash, so
    // most blocks reported `hash: null` for a block that demonstrably has one.
    // A block hash is immutable, so the first read that needs it can fetch it
    // and the row is correct from then on. Best-effort: if no indexer answers we
    // still return the block, with the field honestly empty.
    const hash = block.hash ?? (await backfillBlockHash(h));

    return success(
      {
        ...block,
        hash,
        parcelCount: block._count.parcels,
        _count: undefined,
      },
      200,
      gate.headers
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
