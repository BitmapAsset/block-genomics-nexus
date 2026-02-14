import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encryptApiKey, maskApiKey } from '@/lib/key-encryption';

function sanitizeGuardian(g: Record<string, unknown>) {
  return { ...g, llmApiKey: maskApiKey(g.llmApiKey as string) };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guardian = await prisma.guardianAgent.findUnique({ where: { id } });
    if (!guardian) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
    return NextResponse.json({ guardian: sanitizeGuardian(guardian as unknown as Record<string, unknown>) });
  } catch (err: unknown) {
    console.error('[Guardian GET/:id]', err);
    return NextResponse.json({ error: 'Failed to fetch guardian' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Build update data from allowed fields
    const allowed = [
      'name', 'soulMd', 'agentMd', 'skillsMd', 'memoryMd', 'personality',
      'llmProvider', 'llmModel', 'llmEndpoint', 'selfHosted', 'agentEndpoint',
      'autoResponses', 'escalateTelegram', 'escalateEmail', 'autoApproveDelegationUnder',
      'status',
    ];

    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        data[key] = key === 'autoResponses' ? JSON.stringify(body[key]) : body[key];
      }
    }

    // Handle API key separately (encrypt)
    if (body.llmApiKey) {
      data.llmApiKey = encryptApiKey(body.llmApiKey);
    }

    const guardian = await prisma.guardianAgent.update({ where: { id }, data });
    return NextResponse.json({ guardian: sanitizeGuardian(guardian as unknown as Record<string, unknown>) });
  } catch (err: unknown) {
    console.error('[Guardian PATCH]', err);
    return NextResponse.json({ error: 'Failed to update guardian' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.guardianAgent.update({ where: { id }, data: { status: 'stopped' } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[Guardian DELETE]', err);
    return NextResponse.json({ error: 'Failed to deactivate guardian' }, { status: 500 });
  }
}
