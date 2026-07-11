import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, isValidBitcoinAddress } from '@/lib/api-helpers';
import {
  validatePermissions,
  maxAgentsForTier,
  REGISTRATION_COOLDOWN_MS,
  verifyAgentSignature,
} from '@/lib/agent-protocol';
import { consumeChallengeFromMessage } from '@/lib/challenges';
import { mintAgentToken } from '@/lib/agent-tokens';
import { verifyAndSyncBlock } from '@/lib/ownership-sync';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      walletAddress,
      endpointUrl,
      blockHeight,
      parcelIndex,
      tier,
      permissions,
      signature,
      challenge,
    } = body;

    // Validate required fields
    if (!walletAddress || !endpointUrl || blockHeight == null || !tier || !permissions || !signature || !challenge) {
      return error('Missing required fields: walletAddress, endpointUrl, blockHeight, tier, permissions, signature, challenge', 400);
    }

    if (!isValidBitcoinAddress(walletAddress)) {
      return error('Invalid Bitcoin address', 400);
    }

    // Verify wallet signature
    /* BIP-322 wallet signature verification */
    if (!verifyAgentSignature(walletAddress, challenge, signature)) {
      return error('Invalid wallet signature', 401);
    }

    // REPLAY PROTECTION: the challenge must be server-issued (via /api/v1/challenge
    // with purpose 'agent-register') and is atomically consumed — a self-supplied
    // or replayed challenge is rejected.
    if (!(await consumeChallengeFromMessage(walletAddress, challenge, { purpose: 'agent-register' }))) {
      return error('Invalid, expired, or already-used challenge — request one from /api/v1/challenge', 401);
    }

    // OWNERSHIP (DB snapshot): the Block row is kept fresh by the ownership-sync
    // cron; the verified User record covers wallet-scan-discovered blocks. Used as
    // the fast path AND as the fallback when live on-chain truth is unavailable.
    const [block, user] = await Promise.all([
      prisma.block.findUnique({ where: { height: blockHeight }, select: { ownerAddress: true } }),
      prisma.user.findUnique({ where: { walletAddress }, select: { verified: true, anchorBlock: true, ownedBlocks: true } }),
    ]);
    const ownsBlockSnapshot =
      block?.ownerAddress === walletAddress ||
      (user?.verified === true && (user.anchorBlock === blockHeight || user.ownedBlocks.includes(blockHeight)));

    // LIVE ON-CHAIN RE-VERIFY (OPEN-2): force a fresh ownership check so a FORMER
    // owner cannot register in the lag window between an on-chain sale and the
    // next ownership-sync cron run. Semantics:
    //   • definitive live truth → trust it. A live mismatch FAILS CLOSED even if
    //     the (stale) DB snapshot still says the caller owns the block.
    //   • live truth unavailable (no inscription linked / indexer outage) →
    //     `indeterminate`; fall back to the DB snapshot with a logged warning.
    //     We NEVER fail open on a mismatch — only on an outage do we defer to the
    //     snapshot, matching the fail-closed posture of the sync layer.
    let verified: boolean;
    try {
      const live = await verifyAndSyncBlock(blockHeight, walletAddress);
      if (live.check.indeterminate) {
        console.warn(`[agents/register] live re-verify indeterminate for block ${blockHeight} (no inscription linked or indexer unavailable) — falling back to DB snapshot`);
        verified = ownsBlockSnapshot;
      } else if (!live.isOwner) {
        return error('On-chain ownership check failed — wallet does not currently own this block on-chain', 403);
      } else {
        verified = true;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      console.warn(`[agents/register] live re-verify threw for block ${blockHeight}; falling back to DB snapshot: ${msg}`);
      verified = ownsBlockSnapshot;
    }
    if (!verified) {
      return error('Wallet does not own this block — only the block owner can register an agent', 403);
    }

    // Validate permissions
    const permCheck = validatePermissions(permissions);
    if (!permCheck.valid) {
      return error(`Invalid permissions: ${permCheck.invalid.join(', ')}`, 400);
    }

    // Validate tier
    if (![1, 2, 3].includes(tier)) {
      return error('Tier must be 1, 2, or 3', 400);
    }

    // Enforce tier-based agent cap
    const existingCount = await prisma.bitmapAgent.count({
      where: { blockHeight, status: 'active' },
    });
    if (existingCount >= maxAgentsForTier(tier)) {
      return error(`Agent cap reached for tier ${tier} (max ${maxAgentsForTier(tier)})`, 409);
    }

    // Enforce 24hr registration cooldown per wallet
    const lastRegistration = await prisma.bitmapAgent.findFirst({
      where: { walletAddress },
      orderBy: { createdAt: 'desc' },
    });
    if (lastRegistration && Date.now() - lastRegistration.createdAt.getTime() < REGISTRATION_COOLDOWN_MS) {
      return error('Registration cooldown: 24 hours between registrations per wallet', 429);
    }

    // Mint the agent's API token INLINE with the create so the row is never
    // persisted without a key (no tokenless window for a freshly-registered
    // agent). Only the SHA-256 hash is stored; the plaintext is returned once.
    const minted = mintAgentToken();

    const agent = await prisma.bitmapAgent.create({
      data: {
        walletAddress,
        endpointUrl,
        blockHeight,
        parcelIndex: parcelIndex ?? null,
        tier,
        permissions: JSON.stringify(permissions),
        status: 'active',
        apiKeyHash: minted.apiKeyHash,
        apiKeyCreatedAt: minted.apiKeyCreatedAt,
      },
    });

    // Never echo the stored hash. Return the one-time plaintext token separately.
    const { apiKeyHash: _hash, ...safeAgent } = agent;
    void _hash;
    return success(
      {
        ...safeAgent,
        permissions: JSON.parse(agent.permissions),
        apiKey: minted.token,
        apiKeyWarning:
          'Store this token now — it is shown only once and cannot be recovered. ' +
          'Send it as `Authorization: Bearer <token>` on heartbeat, brief, and events calls. ' +
          'Lost it? Rotate a new one with the owner wallet via POST /api/v1/agents/{agentId}/token.',
      },
      201
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
