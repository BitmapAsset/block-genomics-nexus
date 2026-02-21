import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    if (!address) return error('Address required', 400);

    // Get user's owned blocks from multiple sources
    const [user, blocksFromBlock, blocksFromProfile] = await Promise.all([
      prisma.user.findUnique({
        where: { walletAddress: address },
        select: { ownedBlocks: true },
      }),
      prisma.block.findMany({
        where: { ownerAddress: address },
        select: { height: true },
      }),
      prisma.blockProfile.findMany({
        where: { walletAddress: address },
        select: { blockHeight: true },
      }),
    ]);

    const ownedBlocks = [
      ...new Set([
        ...(user?.ownedBlocks || []),
        ...blocksFromBlock.map((b) => b.height),
        ...blocksFromProfile.map((bp) => bp.blockHeight),
      ]),
    ];

    // Get all guardians for this owner
    const guardians = await prisma.guardianAgent.findMany({
      where: { ownerAddress: address },
      select: {
        id: true,
        blockHeight: true,
        status: true,
        lastHeartbeat: true,
        name: true,
      },
    });

    // Get block object counts grouped by block
    const blockObjects = await prisma.blockObject.groupBy({
      by: ['blockHeight'],
      where: {
        blockHeight: { in: ownedBlocks },
      },
      _count: { id: true },
    });

    const objectCountMap = new Map(
      blockObjects.map((bo) => [bo.blockHeight, bo._count.id])
    );

    // Get latest guardian events for each guardian (last action)
    const guardianIds = guardians.map((g) => g.id);
    const latestEvents = guardianIds.length > 0
      ? await prisma.guardianEvent.findMany({
          where: { guardianId: { in: guardianIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['guardianId'],
          select: {
            guardianId: true,
            eventType: true,
            data: true,
            createdAt: true,
          },
        })
      : [];

    const eventMap = new Map(latestEvents.map((e) => [e.guardianId, e]));

    const activeGuardians = guardians.filter(
      (g) => g.status === 'active' || g.status === 'Online'
    ).length;

    const totalWorldObjects = blockObjects.reduce(
      (sum, bo) => sum + bo._count.id,
      0
    );

    // Mock visitors for now
    const totalVisitors = Math.floor(Math.random() * 451) + 50;

    const guardianDetails = guardians.map((g) => {
      const event = eventMap.get(g.id);
      let lastAction: string | null = null;
      if (event) {
        try {
          const data = event.data ? JSON.parse(event.data) : {};
          lastAction = data.summary || data.message || event.eventType;
        } catch {
          lastAction = event.eventType;
        }
      }
      return {
        blockHeight: g.blockHeight,
        status: g.status,
        lastHeartbeat: g.lastHeartbeat,
        lastAction,
        lastActionTime: event?.createdAt || null,
        worldObjectCount: objectCountMap.get(g.blockHeight) || 0,
        name: g.name,
      };
    });

    return success({
      totalBlocks: ownedBlocks.length,
      activeGuardians,
      totalWorldObjects,
      totalVisitors,
      guardianDetails,
      ownedBlocks,
    });
  } catch (err) {
    console.error('Empire stats error:', err);
    return error('Failed to fetch empire stats', 500);
  }
}
