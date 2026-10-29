/**
 * POST /api/v1/blocks/<h>/world/remove: one `world.remove` event (by placement
 * id) on the block's signed record (`bg-world/1`). The placement's own event
 * stays in the chain; the manifest simply stops listing it.
 * Auth, validation and errors: `lib/world/server.ts`.
 */

import { NextRequest } from 'next/server';
import { handleWorldWrite } from '@/lib/world/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ height: string }> }) {
  const { height } = await params;
  return handleWorldWrite(req, height, 'world.remove');
}
