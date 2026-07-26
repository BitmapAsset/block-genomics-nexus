/**
 * POST /api/v1/sandbox/key — mint a read-only sandbox API key.
 *
 * Deliberately unauthenticated: the whole point of the sandbox tier is that a
 * developer can call the API before owning a Bitmap block. Abuse control is a
 * per-IP daily issuance cap, not identity. The key grants read-only access to
 * endpoints that are already public, so a leaked or farmed sandbox key exposes
 * nothing beyond what an anonymous caller can already fetch — it only burns quota.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, sanitizeString } from '@/lib/api-helpers';
import { clientIpFrom, cleanupRateLimits } from '@/lib/rate-limit-db';
import {
  generateSandboxKey,
  hashSandboxKey,
  sandboxKeyPrefix,
  hashIp,
  checkIssuanceAllowance,
} from '@/lib/sandbox-keys';
import {
  SANDBOX_DAILY_LIMIT,
  SANDBOX_ISSUE_PER_IP_PER_DAY,
  SANDBOX_UPGRADE_URL,
} from '@/lib/sandbox-tier';

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFrom(req);
    const ipHash = hashIp(ip);

    const issuance = await checkIssuanceAllowance(ipHash);
    if (!issuance.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Sandbox key issuance limit reached — ${SANDBOX_ISSUE_PER_IP_PER_DAY} keys per source per UTC day. Reuse an existing key or retry in ${issuance.retryAfterSec}s.`,
          code: 'issuance_limit',
        },
        { status: 429, headers: { 'Retry-After': String(issuance.retryAfterSec) } }
      );
    }

    // Body is optional — a bare POST with no body must still work.
    let label: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.label === 'string') {
        label = sanitizeString(body.label, 80) || null;
      }
    } catch {
      /* no body supplied */
    }

    const key = generateSandboxKey();
    const record = await prisma.sandboxKey.create({
      data: { keyHash: hashSandboxKey(key), keyPrefix: sandboxKeyPrefix(key), label, ipHash },
      select: { id: true, keyPrefix: true, createdAt: true },
    });

    void cleanupRateLimits();

    return success(
      {
        // Returned exactly once — only the hash is stored server-side.
        apiKey: key,
        keyId: record.id,
        keyPrefix: record.keyPrefix,
        label,
        tier: 'sandbox',
        access: 'read-only',
        dailyLimit: SANDBOX_DAILY_LIMIT,
        createdAt: record.createdAt.toISOString(),
        usage: {
          header: 'Authorization: Bearer <apiKey>',
          alternateHeader: 'X-API-Key: <apiKey>',
          check: 'GET /api/v1/sandbox/whoami',
        },
        notice:
          'Store this key now — it cannot be retrieved again. Sandbox keys are read-only; ' +
          'writes require Bitmap ownership verification.',
        upgrade: SANDBOX_UPGRADE_URL,
      },
      201,
      // The body carries the plaintext key — no intermediary may retain it.
      { 'Cache-Control': 'private, no-store, max-age=0' }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
