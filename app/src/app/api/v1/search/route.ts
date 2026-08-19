import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sandboxGate } from '@/lib/sandbox-keys';
import { enforceRateLimit } from '@/lib/api-rate-limit';

/**
 * Global Search API
 * GET /api/v1/search?q=<query>&limit=8
 * Searches: blocks (by height), users (by handle, displayName)
 */
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-search' });
  if (rl.response) return rl.response;

  const gate = await sandboxGate(req);
  if (gate.response) return gate.response;

  const q = req.nextUrl.searchParams.get('q')?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 8, 20);

  if (!q || q.length < 1) {
    return NextResponse.json(
      { success: true, data: { blocks: [], agents: [], users: [] } },
      { headers: gate.headers }
    );
  }

  const qLower = q.toLowerCase();
  const qNum = Number(q);
  const isNumeric = !isNaN(qNum) && Number.isFinite(qNum) && qNum > 0;

  try {
    const [users, blocks] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { handle: { contains: qLower, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          walletAddress: true,
          handle: true,
          displayName: true,
          tier: true,
          avatar: true,
          verified: true,
          anchorBlock: true,
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),

      isNumeric
        ? prisma.block.findMany({
            where: {
              height: {
                gte: Math.floor(qNum),
                lte: Math.floor(qNum) + (q.length < 6 ? 999 : 0),
              },
            },
            select: {
              height: true,
              ownerAddress: true,
              label: true,
            },
            take: limit,
            orderBy: { height: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    // Check which users have guardians (agents)
    const walletsWithGuardians = users.length > 0
      ? new Set(
          (await prisma.guardianAgent.findMany({
            where: { ownerAddress: { in: users.map((u) => u.walletAddress) } },
            select: { ownerAddress: true },
          })).map((g) => g.ownerAddress)
        )
      : new Set<string>();

    const agents = users.filter((u) => walletsWithGuardians.has(u.walletAddress));
    const regularUsers = users.filter((u) => !walletsWithGuardians.has(u.walletAddress));

    return NextResponse.json({
      success: true,
      data: {
        blocks: blocks.map((b) => ({
          type: 'block' as const,
          height: b.height,
          ownerAddress: b.ownerAddress,
          label: b.label,
          url: `/block/${b.height}`,
        })),
        agents: agents.map((a) => ({
          type: 'agent' as const,
          handle: a.handle,
          displayName: a.displayName,
          tier: a.tier,
          avatarUrl: a.avatar,
          url: a.handle ? `/agent/${a.handle}` : `/verify`,
        })),
        users: regularUsers.map((u) => ({
          type: 'user' as const,
          handle: u.handle,
          displayName: u.displayName,
          tier: u.tier,
          avatarUrl: u.avatar,
          url: u.handle ? `/agent/${u.handle}` : `/verify`,
        })),
      },
    }, { headers: gate.headers });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 });
  }
}
