import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    const { linkId } = await params;

    const link = await prisma.vPSLink.findUnique({ where: { id: linkId } });
    if (!link) return error('VPS link not found', 404);
    if (link.status === 'unlinked') return error('VPS link is unlinked', 403);

    const now = new Date();
    await prisma.vPSLink.update({
      where: { id: linkId },
      data: { lastHealthCheck: now, status: 'linked' },
    });

    return success({ healthy: true, lastHealthCheck: now.toISOString() });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
