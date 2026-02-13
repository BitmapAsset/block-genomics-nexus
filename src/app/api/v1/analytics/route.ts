import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

const ADMIN_WALLETS = [
  'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978',
];

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet');
    if (!wallet || !ADMIN_WALLETS.includes(wallet)) {
      return error('Unauthorized', 403);
    }

    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      verifiedUsers,
      sessionsToday,
      activities24h,
      activities7d,
      activities30d,
      topProfiles,
      topSearches,
      topPages,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { verified: true } }),
      prisma.userSession.count({ where: { connectedAt: { gte: todayStart } } }),
      prisma.activityLog.groupBy({ by: ['action'], _count: true, where: { createdAt: { gte: h24 } }, orderBy: { _count: { action: 'desc' } } }),
      prisma.activityLog.groupBy({ by: ['action'], _count: true, where: { createdAt: { gte: d7 } }, orderBy: { _count: { action: 'desc' } } }),
      prisma.activityLog.groupBy({ by: ['action'], _count: true, where: { createdAt: { gte: d30 } }, orderBy: { _count: { action: 'desc' } } }),
      prisma.profileView.groupBy({ by: ['viewedHandle'], _count: true, orderBy: { _count: { viewedHandle: 'desc' } }, take: 10 }),
      prisma.searchLog.groupBy({ by: ['query'], _count: true, orderBy: { _count: { query: 'desc' } }, take: 10 }),
      prisma.pageView.groupBy({ by: ['path'], _count: true, orderBy: { _count: { path: 'desc' } }, take: 10 }),
    ]);

    return success({
      totalUsers,
      verifiedUsers,
      sessionsToday,
      activities: { last24h: activities24h, last7d: activities7d, last30d: activities30d },
      topProfiles: topProfiles.map(p => ({ handle: p.viewedHandle, views: p._count })),
      topSearches: topSearches.map(s => ({ query: s.query, count: s._count })),
      topPages: topPages.map(p => ({ path: p.path, views: p._count })),
    });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
