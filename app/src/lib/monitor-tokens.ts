import crypto from 'crypto';
import prisma from '@/lib/prisma';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function generateMonitorToken(
  guardianId: string,
  ownerAddress: string
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  await prisma.guardianAgent.update({
    where: { id: guardianId },
    data: {
      monitorTokenHash: tokenHash,
      monitorTokenCreatedAt: new Date(),
    },
  });

  return token;
}

export async function validateMonitorToken(
  token: string,
  guardianId: string
): Promise<boolean> {
  const tokenHash = hashToken(token);

  const guardian = await prisma.guardianAgent.findUnique({
    where: { id: guardianId },
    select: { monitorTokenHash: true },
  });

  if (!guardian?.monitorTokenHash) return false;
  return crypto.timingSafeEqual(
    Buffer.from(guardian.monitorTokenHash),
    Buffer.from(tokenHash)
  );
}

export async function revokeMonitorToken(guardianId: string): Promise<void> {
  await prisma.guardianAgent.update({
    where: { id: guardianId },
    data: {
      monitorTokenHash: null,
      monitorTokenCreatedAt: null,
    },
  });
}

/**
 * Shared auth middleware for monitor API routes.
 * Extracts Bearer token, validates against guardian, returns guardian or null.
 */
export async function validateMonitorAuth(
  authHeader: string | null,
  guardianId: string
) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  if (!token) return null;

  const valid = await validateMonitorToken(token, guardianId);
  if (!valid) return null;

  const guardian = await prisma.guardianAgent.findUnique({
    where: { id: guardianId },
  });

  return guardian;
}
