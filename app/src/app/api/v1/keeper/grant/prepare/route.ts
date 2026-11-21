// POST /api/v1/keeper/grant/prepare: the exact bg-grant/1 text a block's holder
// signs to connect one agent key, with its one-time nonce.
//
// Unauthenticated and reads no chain: it stores nothing but the nonce, answers
// nothing about the block's current grant, and the text it returns counts only
// once the wallet it names has signed it (POST /api/v1/keeper/grant).

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { success } from '@/lib/api-helpers';
import { issueChallenge } from '@/lib/challenges';
import { rateLimitDurable, clientIpFrom } from '@/lib/rate-limit-db';
import {
  buildGrantMessage,
  checkAgentKey,
  checkAgentName,
  checkHeight,
  checkWallet,
  keyCheck,
  normalizeScopes,
  DEFAULT_GRANT_DAYS,
  DEFAULT_SCOPES,
  GRANT_DAYS,
  GRANT_NONCE_TTL_MS,
} from '@/lib/keeper-grant';
import { KeeperUnavailable, keeperRefusal, keeperUnavailableResponse, readGrant } from '@/lib/keeper-store';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const rl = await rateLimitDurable(`keeper-prepare:${clientIpFrom(req)}`, 20, 600_000);
    if (!rl.allowed) return keeperRefusal('rate_limited', 429, { headers: { 'Retry-After': String(rl.retryAfterSec) } });
    let body: unknown;
    try { body = await req.json(); } catch { return keeperRefusal('bad_json', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return keeperRefusal('bad_json', 400);
    const b = body as Record<string, unknown>;

    const { blockHeight, walletAddress, agentName, agentKey, scopes, days } = b;
    if (!checkHeight(blockHeight)) return keeperRefusal('bad_block', 400);
    if (!checkWallet(walletAddress)) return keeperRefusal('bad_wallet', 400);
    if (!checkAgentName(agentName)) return keeperRefusal('bad_agent_name', 400);
    if (!checkAgentKey(agentKey)) return keeperRefusal('bad_agent_key', 400);
    const scopeList = scopes === undefined ? DEFAULT_SCOPES : normalizeScopes(scopes);
    if (!scopeList) return keeperRefusal('bad_scopes', 400);
    const grantDays = days === undefined ? DEFAULT_GRANT_DAYS : GRANT_DAYS.find((d) => d === days);
    if (grantDays === undefined) return keeperRefusal('bad_days', 400);

    // Only so that a missing table answers 503 before a holder signs; nothing of
    // the current grant is answered.
    await readGrant(blockHeight);

    const nonce = crypto.randomBytes(32).toString('hex');
    const issued = await issueChallenge(nonce, { address: walletAddress, purpose: 'keeper', ttlMs: GRANT_NONCE_TTL_MS });
    const validUntil = new Date(Math.floor((Date.now() + grantDays * DAY_MS) / 1000) * 1000).toISOString();
    const expiresAt = issued.expiresAt.toISOString();
    const message = buildGrantMessage({
      blockHeight,
      walletAddress,
      agentName,
      agentKey,
      scopes: scopeList,
      validUntil,
      nonce,
      expiresAt,
    });
    return success({ message, keyCheck: keyCheck(agentKey), expiresAt }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    if (!(e instanceof KeeperUnavailable)) console.error('[keeper] route failed:', (e as { code?: string })?.code ?? 'unknown');
    return keeperUnavailableResponse();
  }
}
