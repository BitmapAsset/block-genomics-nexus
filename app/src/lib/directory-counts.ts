import prisma from '@/lib/prisma';

/**
 * Single source of truth for the public "verified agents" tally.
 *
 * A verified agent is any verified User OR any verified BlockProfile. Demo/mock
 * agents live only in the frontend directory (MOCK_AGENTS) and are never
 * persisted, so they can never enter these counts. Both /api/v1/stats and
 * /api/v1/users/list derive their totals from here so the homepage headline and
 * the directory list cannot drift apart.
 */
const VERIFIED = { verified: true } as const;

export async function countVerifiedAgents(): Promise<number> {
  const [users, profiles] = await Promise.all([
    prisma.user.count({ where: VERIFIED }),
    prisma.blockProfile.count({ where: VERIFIED }),
  ]);
  return users + profiles;
}
