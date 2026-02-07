// ============================================================================
// Input Validation Middleware
// ============================================================================

import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BITCOIN_ADDRESS_REGEX = /^(1|3|bc1|tb1|m|n|2)[a-zA-Z0-9]{25,62}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AGENT_NAME = 64;
const MAX_BLOCK_HEIGHT = 2_000_000; // generous upper bound
const MAX_SIGNATURE_LENGTH = 512;

function isValidBitcoinAddress(addr: unknown): addr is string {
  return typeof addr === 'string' && BITCOIN_ADDRESS_REGEX.test(addr);
}

function isValidBlockHeight(h: unknown): h is number {
  return typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= MAX_BLOCK_HEIGHT;
}

function isValidAgentName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length >= 1 &&
    name.length <= MAX_AGENT_NAME &&
    /^[a-zA-Z0-9_\-. ]+$/.test(name)
  );
}

function isValidUUID(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

function isValidSignature(sig: unknown): sig is string {
  return typeof sig === 'string' && sig.length > 0 && sig.length <= MAX_SIGNATURE_LENGTH;
}

// ---------------------------------------------------------------------------
// Validation error helper
// ---------------------------------------------------------------------------

function validationError(res: Response, field: string, message: string): void {
  res.status(400).json({
    error: `Validation failed: ${message}`,
    code: 'VALIDATION_ERROR',
    field,
    status: 400,
  });
}

// ---------------------------------------------------------------------------
// Route-specific validators
// ---------------------------------------------------------------------------

/**
 * Validate POST /api/v1/challenge body.
 */
export function validateChallengeRequest(req: Request, res: Response, next: NextFunction): void {
  const { blockHeight, agentName, walletAddress } = req.body ?? {};

  if (!isValidBlockHeight(blockHeight)) {
    validationError(res, 'blockHeight', 'blockHeight must be an integer between 0 and 2,000,000');
    return;
  }
  if (!isValidAgentName(agentName)) {
    validationError(res, 'agentName', 'agentName must be 1-64 characters (alphanumeric, _, -, ., space)');
    return;
  }
  if (!isValidBitcoinAddress(walletAddress)) {
    validationError(res, 'walletAddress', 'walletAddress must be a valid Bitcoin address');
    return;
  }

  next();
}

/**
 * Validate POST /api/v1/verify body.
 */
export function validateVerifyRequest(req: Request, res: Response, next: NextFunction): void {
  const { challengeId, signature, address, blockHeight } = req.body ?? {};

  if (!isValidUUID(challengeId)) {
    validationError(res, 'challengeId', 'challengeId must be a valid UUID v4');
    return;
  }
  if (!isValidSignature(signature)) {
    validationError(res, 'signature', 'signature must be a non-empty string (max 512 chars)');
    return;
  }
  if (!isValidBitcoinAddress(address)) {
    validationError(res, 'address', 'address must be a valid Bitcoin address');
    return;
  }
  if (!isValidBlockHeight(blockHeight)) {
    validationError(res, 'blockHeight', 'blockHeight must be an integer between 0 and 2,000,000');
    return;
  }

  next();
}

/**
 * Validate block height URL param.
 */
export function validateBlockHeight(req: Request, res: Response, next: NextFunction): void {
  const height = parseInt(req.params.height, 10);
  if (isNaN(height) || !isValidBlockHeight(height)) {
    validationError(res, 'height', 'Block height must be an integer between 0 and 2,000,000');
    return;
  }
  next();
}

/**
 * Validate agent ID param (UUID).
 */
export function validateAgentId(req: Request, res: Response, next: NextFunction): void {
  const id = req.params.id;
  if (!isValidUUID(id)) {
    validationError(res, 'id', 'Agent ID must be a valid UUID v4');
    return;
  }
  next();
}

/**
 * Validate search query.
 */
export function validateSearchQuery(req: Request, res: Response, next: NextFunction): void {
  const q = req.query.q;
  if (typeof q !== 'string' || q.trim().length === 0 || q.length > 200) {
    validationError(res, 'q', 'Search query must be 1-200 characters');
    return;
  }
  next();
}
