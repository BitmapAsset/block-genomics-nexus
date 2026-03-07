// ============================================================================
// POST /api/v1/verify — Verify BIP-322 signature + bitmap ownership
// ============================================================================

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { challengeDAO, agentDAO } from '../lib/db.js';
import { verifySignature } from '../lib/bip322.js';
import { checkBitmapOwnership } from '../lib/bitmap.js';
import { generateGenome, GENOME_VERSION } from '../lib/genome.js';
import { calculateTrustScore, detectAddressFormat } from '../lib/trust-score.js';
import { verifyRateLimiter } from '../middleware/rate-limit.js';
import { validateVerifyRequest } from '../middleware/validate.js';
import type {
  AgentPublic,
  AgentRecord,
  BlockData,
  TrustFactors,
  VerifyRequest,
  VerifyResponse,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function fetchBlockData(height: number): Promise<BlockData | null> {
  try {
    // Fetch block hash first
    const hashRes = await fetch(`https://blockstream.info/api/block-height/${height}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!hashRes.ok) return null;
    const hash = await hashRes.text();

    // Fetch full block data
    const blockRes = await fetch(`https://blockstream.info/api/block/${hash}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!blockRes.ok) return null;

    const b = (await blockRes.json()) as Record<string, unknown>;

    return {
      height:            b.height as number,
      hash:              b.id as string,
      merkleRoot:        b.merkle_root as string,
      timestamp:         b.timestamp as number,
      nonce:             b.nonce as number,
      bits:              String(b.bits),
      difficulty:        b.difficulty as number,
      txCount:           b.tx_count as number,
      size:              b.size as number,
      weight:            b.weight as number,
      previousBlockHash: b.previousblockhash as string,
    };
  } catch (err) {
    console.error(`[verify] Failed to fetch block ${height}:`, err);
    return null;
  }
}

export function toPublic(agent: AgentRecord): AgentPublic {
  return {
    id: agent.id,
    name: agent.name,
    blockHeight: agent.blockHeight,
    genome: agent.genome,
    genomeVersion: agent.genomeVersion,
    trustScore: agent.trustScore,
    trustFactors: agent.trustFactors,
    verifiedAt: agent.verifiedAt,
    createdAt: agent.createdAt,
    signatureType: agent.signatureType,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

router.post(
  '/',
  verifyRateLimiter,
  validateVerifyRequest,
  async (req, res) => {
    const { challengeId, signature, address, blockHeight } = req.body as VerifyRequest;

    // 1. Look up challenge from SQLite
    const challenge = challengeDAO.getById(challengeId);

    if (!challenge) {
      res.status(404).json({
        verified: false,
        error: 'Challenge not found or expired',
      } satisfies VerifyResponse);
      return;
    }

    if (challenge.used) {
      res.status(409).json({
        verified: false,
        error: 'Challenge has already been used (replay protection)',
      } satisfies VerifyResponse);
      return;
    }

    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      res.status(410).json({
        verified: false,
        error: 'Challenge has expired',
      } satisfies VerifyResponse);
      return;
    }

    // Verify the address and block height match the challenge
    if (challenge.walletAddress !== address) {
      res.status(400).json({
        verified: false,
        error: 'Address does not match the challenge',
      } satisfies VerifyResponse);
      return;
    }

    if (challenge.blockHeight !== blockHeight) {
      res.status(400).json({
        verified: false,
        error: 'Block height does not match the challenge',
      } satisfies VerifyResponse);
      return;
    }

    // Mark challenge as used IMMEDIATELY (one-time use)
    challengeDAO.markUsed(challengeId);

    // 2. Verify BIP-322 signature
    const sigResult = verifySignature(challenge.message, address, signature);

    if (!sigResult.valid && sigResult.signatureType !== 'taproot-pending') {
      res.status(401).json({
        verified: false,
        error: sigResult.error ?? 'Invalid signature',
      } satisfies VerifyResponse);
      return;
    }

    // 3. Fetch block data
    const blockData = await fetchBlockData(blockHeight);

    if (!blockData) {
      res.status(502).json({
        verified: false,
        error: 'Could not fetch block data from the Bitcoin network',
      } satisfies VerifyResponse);
      return;
    }

    // 4. Check bitmap ownership
    const bitmapResult = await checkBitmapOwnership(address, blockHeight);

    // 5. Build trust factors
    const blockAgeDays = Math.floor((Date.now() / 1000 - blockData.timestamp) / 86400);

    const trustFactors: TrustFactors = {
      signatureValid: sigResult.valid,
      bitmapOwnership: bitmapResult.owns,
      blockExists: true,
      addressFormat: detectAddressFormat(address),
      inscriptionAge: bitmapResult.inscriptionAge,
      blockAge: blockAgeDays,
    };

    // 6. Calculate trust score
    const trustScore = calculateTrustScore(trustFactors);

    // For taproot-pending with bitmap ownership, allow through with reduced trust
    const isVerified = sigResult.valid || (sigResult.signatureType === 'taproot-pending' && bitmapResult.owns);

    if (!isVerified) {
      res.status(401).json({
        verified: false,
        error: 'Verification failed: signature invalid and no bitmap ownership confirmed',
      } satisfies VerifyResponse);
      return;
    }

    // 7. Generate genome
    const genome = generateGenome(blockData);

    // 8. Create or update agent record in SQLite
    const now = new Date().toISOString();
    const existing = agentDAO.getByWalletAndBlock(address, blockHeight);

    let agent: AgentRecord;

    if (existing) {
      agent = {
        ...existing,
        name: challenge.agentName,
        trustScore,
        trustFactors,
        genome,
        genomeVersion: GENOME_VERSION,
        signatureType: sigResult.signatureType,
        bitmapInscriptionId: bitmapResult.inscriptionId,
        updatedAt: now,
        verifiedAt: now,
      };
      agentDAO.update(agent);
    } else {
      agent = {
        id: randomUUID(),
        name: challenge.agentName,
        walletAddress: address,
        blockHeight,
        genome,
        genomeVersion: GENOME_VERSION,
        trustScore,
        trustFactors,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
        signatureType: sigResult.signatureType,
        bitmapInscriptionId: bitmapResult.inscriptionId,
      };
      agentDAO.create(agent);
    }

    console.log(
      `[verify] ✓ Agent ${agent.id} verified — block ${blockHeight}, trust ${trustScore}, sig ${sigResult.signatureType}`,
    );

    const response: VerifyResponse = {
      verified: true,
      agent: toPublic(agent),
    };

    res.status(200).json(response);
  },
);

export default router;
