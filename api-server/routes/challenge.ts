// ============================================================================
// POST /api/v1/challenge — Generate verification challenge
// ============================================================================

import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { challengeDAO } from '../lib/db.js';
import type { ChallengeRecord, ChallengeRequest, ChallengeResponse } from '../types.js';
import { challengeRateLimiter } from '../middleware/rate-limit.js';
import { validateChallengeRequest } from '../middleware/validate.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

router.post(
  '/',
  challengeRateLimiter,
  validateChallengeRequest,
  (req, res) => {
    const { blockHeight, agentName, walletAddress } = req.body as ChallengeRequest;

    const challengeId = randomUUID();
    const nonce = randomBytes(32).toString('hex');
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

    const message = [
      'Block Genomics Verification',
      '===========================',
      `Block: ${blockHeight}`,
      `Agent: ${agentName}`,
      `Address: ${walletAddress}`,
      `Nonce: ${nonce}`,
      `Timestamp: ${timestamp}`,
      'Chain: bitcoin-mainnet',
    ].join('\n');

    const record: ChallengeRecord = {
      id: challengeId,
      nonce,
      message,
      blockHeight,
      agentName,
      walletAddress,
      createdAt: timestamp,
      expiresAt,
      used: false,
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    };

    // Persist to SQLite
    challengeDAO.create(record);

    const response: ChallengeResponse = {
      challengeId,
      challengeMessage: message,
      expiresAt,
    };

    console.log(`[challenge] Created ${challengeId} for block ${blockHeight} / ${agentName}`);
    res.status(201).json(response);
  },
);

export default router;
