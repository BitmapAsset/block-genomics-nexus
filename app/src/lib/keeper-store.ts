// The only reader and writer of KeeperGrant rows, and the answers every keeper
// route refuses with.
//
// Fail closed: a missing table (the migration not applied yet) or any other
// store error becomes `KeeperUnavailable`, which the routes answer with 503
// `keeper_unavailable` and nothing written. A grant cannot be computed, so there
// is no fallback. Logs carry the store's short error code only.

import { NextResponse } from 'next/server';
import type { KeeperGrant } from '@prisma/client';
import prisma from '@/lib/prisma';
import { KEEPER_SENTENCES, type KeeperCode } from '@/lib/keeper-grant';

export class KeeperUnavailable extends Error {}

export type KeeperGrantRow = KeeperGrant;

export async function readGrant(blockHeight: number): Promise<KeeperGrantRow | null> {
  try {
    return await prisma.keeperGrant.findUnique({ where: { blockHeight } });
  } catch (e) {
    console.error('[keeper] store unavailable:', (e as { code?: string })?.code ?? 'unknown');
    throw new KeeperUnavailable();
  }
}

/** Write the block's one grant, replacing any earlier one in the same upsert. */
export async function putGrant(data: {
  blockHeight: number;
  walletAddress: string;
  agentName: string;
  agentKey: string;
  scopes: string[];
  message: string;
  signature: string;
  validUntil: Date;
}): Promise<{ replaced: boolean }> {
  const { blockHeight } = data;
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.keeperGrant.findUnique({ where: { blockHeight } });
      await tx.keeperGrant.upsert({ where: { blockHeight }, create: { ...data }, update: { ...data, createdAt: new Date() } });
      return { replaced: before !== null };
    });
  } catch (e) {
    console.error('[keeper] store unavailable:', (e as { code?: string })?.code ?? 'unknown');
    throw new KeeperUnavailable();
  }
}

/**
 * Remove exactly the grant that was read: a grant that replaced it in between
 * keeps the row's id but names another wallet or key, so it matches nothing.
 */
export async function deleteGrant(g: { id: string; walletAddress: string; agentKey: string }): Promise<number> {
  if (!g.id) return 0;
  try {
    return (await prisma.keeperGrant.deleteMany({ where: { id: g.id, walletAddress: g.walletAddress, agentKey: g.agentKey } })).count;
  } catch (e) {
    console.error('[keeper] store unavailable:', (e as { code?: string })?.code ?? 'unknown');
    throw new KeeperUnavailable();
  }
}

export function keeperRefusal(code: KeeperCode, status: number, opts: { headers?: Record<string, string>; error?: string } = {}): NextResponse {
  if (code !== 'rate_limited' && code !== 'keeper_unavailable') console.warn('[keeper] refused:', code);
  return NextResponse.json({ success: false, error: opts.error ?? KEEPER_SENTENCES[code], code }, { status, headers: { 'Cache-Control': 'no-store', ...opts.headers } });
}

export function keeperUnavailableResponse(): NextResponse {
  return keeperRefusal('keeper_unavailable', 503, { headers: { 'Retry-After': '60' } });
}
