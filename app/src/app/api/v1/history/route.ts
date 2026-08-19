import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from '@/lib/api-rate-limit';

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-history' });
  if (rl.response) return rl.response;

  const { searchParams } = req.nextUrl;
  const wallet = searchParams.get("wallet");
  if (!wallet) return error("wallet param required", 400);

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const typeFilter = searchParams.get("type"); // verification | delegation | transfer | all

  try {
    // Build where clause for ActivityLog
    const where: Record<string, unknown> = { walletAddress: wallet };
    if (typeFilter && typeFilter !== "all") {
      const actionMap: Record<string, string[]> = {
        verification: ["verify_start", "wallet_connect"],
        delegation: ["delegation_purchase", "delegation_list", "delegation_view"],
        transfer: ["delegation_purchase"],
      };
      const actions = actionMap[typeFilter];
      if (actions) where.action = { in: actions };
    }

    const [activities, total, delegations, transfers] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.activityLog.count({ where }),
      prisma.delegation.findMany({
        where: {
          OR: [{ ownerAddress: wallet }, { delegateeAddress: wallet }],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          blockHeight: true,
          tier: true,
          priceSats: true,
          startDate: true,
          endDate: true,
          active: true,
          createdAt: true,
          ownerAddress: true,
          delegateeAddress: true,
        },
      }),
      prisma.ownershipTransfer.findMany({
        where: {
          OR: [{ previousOwner: wallet }, { newOwner: wallet }],
        },
        orderBy: { detectedAt: "desc" },
        take: 50,
        select: {
          id: true,
          blockHeight: true,
          previousOwner: true,
          newOwner: true,
          detectedAt: true,
        },
      }),
    ]);

    return success({
      activities,
      delegations,
      transfers,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return error(msg, 500);
  }
}
