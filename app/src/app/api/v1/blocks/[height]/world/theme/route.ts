/**
 * POST /api/v1/blocks/<h>/world/theme: one `world.theme` event on the block's
 * signed record (`bg-world/1`). Auth, validation and errors: `lib/world/server.ts`.
 */

import { NextRequest } from 'next/server';
import { handleWorldWrite } from '@/lib/world/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ height: string }> }) {
  const { height } = await params;
  return handleWorldWrite(req, height, 'world.theme');
}
