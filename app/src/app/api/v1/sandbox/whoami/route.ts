/**
 * GET /api/v1/sandbox/whoami — validate a sandbox key and report its quota.
 *
 * This is the canonical "is my key working?" call and the reference implementation
 * of sandbox metering: it charges one request against the key's daily quota and
 * returns the standard `X-RateLimit-*` headers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import {
  authenticateSandboxKey,
  touchSandboxKey,
  sandboxRateHeaders,
} from '@/lib/sandbox-keys';
import {
  sandboxKeyFromHeaders,
  SANDBOX_DAILY_LIMIT,
  SANDBOX_UPGRADE_URL,
} from '@/lib/sandbox-tier';

export async function GET(req: NextRequest) {
  try {
    const key = sandboxKeyFromHeaders(req.headers);
    if (!key) {
      return NextResponse.json(
        {
          success: false,
          error: 'No sandbox key presented — send `Authorization: Bearer bg_sbx_...` or `X-API-Key`.',
          code: 'missing_key',
          hint: 'Mint one with POST /api/v1/sandbox/key (no wallet required).',
        },
        { status: 401 }
      );
    }

    const auth = await authenticateSandboxKey(key);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.reason, code: auth.code },
        {
          status: auth.status,
          headers: auth.quota
            ? { ...sandboxRateHeaders(auth.quota), 'Retry-After': String(auth.quota.retryAfterSec) }
            : undefined,
        }
      );
    }

    await touchSandboxKey(auth.key!.id);

    const quota = auth.quota!;
    return NextResponse.json(
      {
        success: true,
        data: {
          tier: 'sandbox',
          access: 'read-only',
          keyId: auth.key!.id,
          keyPrefix: auth.key!.keyPrefix,
          label: auth.key!.label,
          createdAt: auth.key!.createdAt.toISOString(),
          quota: {
            limit: SANDBOX_DAILY_LIMIT,
            used: quota.count,
            remaining: Math.max(0, quota.limit - quota.count),
            resetsAt: new Date(quota.resetAt).toISOString(),
          },
          writes: 'blocked — requires Bitmap ownership verification',
          upgrade: SANDBOX_UPGRADE_URL,
        },
      },
      { status: 200, headers: sandboxRateHeaders(quota) }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
