import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifyAgentSignature } from '@/lib/agent-protocol';
import { consumeChallengeFromMessage } from '@/lib/challenges';
import { mintAgentToken } from '@/lib/agent-tokens';
import { rateLimitDurable, clientIpFrom } from '@/lib/rate-limit-db';

// Durable, cross-instance limit on token rotate/revoke (each does a BIP-322
// verify). Keyed by client IP; fail-open so a limiter outage can't lock out an
// owner recovering a lost key.
const TOKEN_RL_LIMIT = 20;
const TOKEN_RL_WINDOW_MS = 60_000;

/** Shared 429 guard for the token endpoints. Returns a response when limited, else null. */
async function tokenRateLimit(req: NextRequest): Promise<NextResponse | null> {
  const ip = clientIpFrom(req);
  const rl = await rateLimitDurable(`agent-token:${ip}`, TOKEN_RL_LIMIT, TOKEN_RL_WINDOW_MS);
  if (rl.allowed) return null;
  return NextResponse.json(
    { success: false, error: 'Rate limit exceeded — slow down and retry shortly' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
  );
}

/**
 * Agent API-token management — authed by the OWNER WALLET, not by the current
 * token (so a lost or leaked token can still be recovered/rotated).
 *
 *   POST   → rotate/issue a new token (invalidates any prior token). Returns the
 *            plaintext once.
 *   DELETE → revoke the active token. The agent is then LOCKED (runtime routes
 *            401) until a new token is rotated. Revoke never re-opens tokenless
 *            access.
 *
 * Both require a server-issued, single-use `agent-token` challenge signed by the
 * agent-owning wallet (replay-safe, purpose-bound).
 */

async function authorizeOwner(
  agentId: string,
  body: { walletAddress?: string; signature?: string; challenge?: string }
): Promise<
  | { ok: true; agent: { id: string; status: string } }
  | { ok: false; status: number; message: string }
> {
  const { walletAddress, signature, challenge } = body;
  if (!walletAddress || !signature || !challenge) {
    return { ok: false, status: 400, message: 'Missing walletAddress, signature, or challenge' };
  }

  if (!verifyAgentSignature(walletAddress, challenge, signature)) {
    return { ok: false, status: 401, message: 'Invalid wallet signature' };
  }

  // REPLAY PROTECTION: server-issued, single-use challenge bound to purpose
  // 'agent-token'. A signature captured from any other flow cannot be replayed
  // here (wrong purpose), and the same challenge cannot be used twice.
  if (!(await consumeChallengeFromMessage(walletAddress, challenge, { purpose: 'agent-token' }))) {
    return {
      ok: false,
      status: 401,
      message: 'Invalid, expired, or already-used challenge — request one from /api/v1/challenge (purpose "agent-token")',
    };
  }

  const agent = await prisma.bitmapAgent.findUnique({
    where: { id: agentId },
    select: { id: true, walletAddress: true, status: true },
  });
  if (!agent) return { ok: false, status: 404, message: 'Agent not found' };
  if (agent.walletAddress !== walletAddress) return { ok: false, status: 403, message: 'Unauthorized' };
  if (agent.status === 'revoked') return { ok: false, status: 403, message: 'Agent has been revoked' };

  return { ok: true, agent: { id: agent.id, status: agent.status } };
}

/** Rotate (or first-issue) the agent's API token. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const limited = await tokenRateLimit(req);
    if (limited) return limited;
    const { agentId } = await params;
    const auth = await authorizeOwner(agentId, await req.json());
    if (!auth.ok) return error(auth.message, auth.status);

    const minted = mintAgentToken();
    await prisma.bitmapAgent.update({
      where: { id: agentId },
      data: { apiKeyHash: minted.apiKeyHash, apiKeyCreatedAt: minted.apiKeyCreatedAt },
    });

    return success({
      agentId,
      apiKey: minted.token,
      apiKeyCreatedAt: minted.apiKeyCreatedAt.toISOString(),
      apiKeyWarning:
        'Store this token now — it is shown only once. The previous token (if any) is now invalid.',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}

/** Revoke the agent's active API token (locks runtime access until re-rotated). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const limited = await tokenRateLimit(req);
    if (limited) return limited;
    const { agentId } = await params;
    const auth = await authorizeOwner(agentId, await req.json());
    if (!auth.ok) return error(auth.message, auth.status);

    const current = await prisma.bitmapAgent.findUnique({
      where: { id: agentId },
      select: { apiKeyHash: true },
    });
    if (!current?.apiKeyHash) {
      return error('No active API token to revoke', 400);
    }

    // Null the hash but KEEP apiKeyCreatedAt → the (null hash, non-null created)
    // state means "revoked/locked", NOT "legacy tokenless". Runtime routes 401
    // until the owner rotates a fresh key.
    await prisma.bitmapAgent.update({
      where: { id: agentId },
      data: { apiKeyHash: null },
    });

    return success({ agentId, tokenRevoked: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
