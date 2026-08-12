/**
 * GET  /api/v1/session/username?handle=x — availability check (public)
 * POST /api/v1/session/username            — claim it (verified session required)
 *
 * Usernames are the human-readable face of a verified identity, so claiming one
 * is gated on the same proof as any other write: a live `bg_vfy_` token, which
 * only exists behind BIP-322 + on-chain bitmap ownership. Anonymous handle
 * squatting is the exact thing that gate is for.
 *
 * Availability spans BOTH namespaces (`User.handle` and `BlockProfile.handle`) —
 * a handle taken in either is taken everywhere. The check is advisory; the
 * authoritative decision is the database unique constraint at write time, which
 * is what makes two simultaneous claims resolve to one winner rather than both
 * reading "available" and both proceeding.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { normalizeHandle, isValidHandle, HANDLE_ERROR } from '@/lib/handle';
import { sessionTokenFromHeaders, gateDenialResponse } from '@/lib/ownership-gate';
import { authenticateSession, touchSession } from '@/lib/verified-sessions';
import { rateLimitDurable, clientIpFrom } from '@/lib/rate-limit-db';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Is this handle free across both namespaces? `owner` may keep their own. */
async function handleAvailability(handle: string, owner?: string) {
  const [inUser, inProfile] = await Promise.all([
    prisma.user.findUnique({ where: { handle } }),
    prisma.blockProfile.findUnique({ where: { handle } }),
  ]);
  if (inProfile) return { available: false, reason: 'Handle already taken (registered as a block profile handle)' };
  if (inUser && (!owner || inUser.walletAddress !== owner)) {
    return { available: false, reason: 'Handle already taken' };
  }
  return { available: true as const, reason: undefined };
}

export async function GET(req: NextRequest) {
  try {
    const ip = clientIpFrom(req);
    const rl = await rateLimitDurable(`username-check:${ip}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded — slow down and retry shortly' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), ...NO_STORE } }
      );
    }

    const raw = req.nextUrl.searchParams.get('handle');
    if (!raw) return error('handle query param required', 400);

    const handle = normalizeHandle(raw);
    if (!isValidHandle(handle)) return error(HANDLE_ERROR, 400);

    const { available } = await handleAvailability(handle);
    return success({ handle, available }, 200, NO_STORE);
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateSession(sessionTokenFromHeaders(req.headers));
    if (!auth.ok || !auth.session) {
      return gateDenialResponse({
        ok: false,
        status: auth.status,
        code: auth.status === 503 ? 'onchain_unavailable' : 'unverified',
        reason: auth.reason,
      });
    }
    const walletAddress = auth.session.walletAddress;

    const body = await req.json().catch(() => null);
    const handle = normalizeHandle(typeof body?.handle === 'string' ? body.handle : '');
    if (!handle) return error('handle required', 400);
    if (!isValidHandle(handle)) return error(HANDLE_ERROR, 400);

    const { available, reason } = await handleAvailability(handle, walletAddress);
    if (!available) {
      return NextResponse.json(
        { success: false, error: reason, code: 'handle_taken' },
        { status: 409, headers: NO_STORE }
      );
    }

    try {
      const user = await prisma.user.upsert({
        where: { walletAddress },
        update: { handle },
        create: {
          walletAddress,
          handle,
          verified: true,
          // A session only exists behind proven ownership, so a wallet holding at
          // least one bitmap is Tier 1; a verified wallet holding none stays Tier 3.
          tier: auth.session.verifiedBlocks.length > 0 ? 1 : 3,
          anchorBlock: auth.session.verifiedBlocks[0] ?? null,
        },
      });

      await prisma.handleHistory.create({ data: { handle, walletAddress, action: 'claimed' } });
      void touchSession(auth.session.id);
      logActivity(walletAddress, 'handle_claimed', { handle });

      return success({ handle: user.handle, walletAddress, displayName: user.displayName }, 201, NO_STORE);
    } catch (e: unknown) {
      // P2002 = unique violation. Someone else won the race between the
      // availability read and this write; the constraint is the real arbiter.
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
        return NextResponse.json(
          { success: false, error: 'Handle already taken', code: 'handle_taken' },
          { status: 409, headers: NO_STORE }
        );
      }
      throw e;
    }
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
