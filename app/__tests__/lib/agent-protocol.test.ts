/**
 * Tests for src/lib/agent-protocol.ts
 * Covers: permissions, tier limits, challenge generation, signature verification
 */

jest.mock('@/lib/bip322-verify', () => ({
  verifyBip322Signature: jest.fn(),
}));

import {
  AgentPermission,
  maxAgentsForTier,
  validatePermissions,
  canPerformAction,
  generateAgentChallenge,
  verifyAgentSignature,
  MAX_AGENTS_TIER1,
  MAX_AGENTS_TIER2,
  MAX_AGENTS_TIER3,
  HEARTBEAT_INTERVAL_MS,
  HEALTH_CHECK_INTERVAL_MS,
  REGISTRATION_COOLDOWN_MS,
} from '@/lib/agent-protocol';

import { VALID_ADDRESSES, MOCK_SIGNATURE } from '../fixtures';

describe('agent-protocol', () => {
  describe('constants', () => {
    it('tier 1 allows 10 agents', () => expect(MAX_AGENTS_TIER1).toBe(10));
    it('tier 2 allows 3 agents', () => expect(MAX_AGENTS_TIER2).toBe(3));
    it('tier 3 allows 1 agent', () => expect(MAX_AGENTS_TIER3).toBe(1));
    it('heartbeat interval is 30s', () => expect(HEARTBEAT_INTERVAL_MS).toBe(30_000));
    it('health check interval is 60s', () => expect(HEALTH_CHECK_INTERVAL_MS).toBe(60_000));
    it('registration cooldown is 24h', () => expect(REGISTRATION_COOLDOWN_MS).toBe(86_400_000));
  });

  describe('maxAgentsForTier()', () => {
    it('tier 1 = 10', () => expect(maxAgentsForTier(1)).toBe(10));
    it('tier 2 = 3', () => expect(maxAgentsForTier(2)).toBe(3));
    it('tier 3 = 1', () => expect(maxAgentsForTier(3)).toBe(1));
    it('unknown tier = 0', () => expect(maxAgentsForTier(0)).toBe(0));
    it('negative tier = 0', () => expect(maxAgentsForTier(-1)).toBe(0));
    it('tier 4+ = 0', () => expect(maxAgentsForTier(4)).toBe(0));
  });

  describe('validatePermissions()', () => {
    it('validates known permissions', () => {
      const result = validatePermissions(['READ_DMS', 'SEND_DMS']);
      expect(result.valid).toBe(true);
      expect(result.invalid).toEqual([]);
    });

    it('rejects unknown permissions', () => {
      const result = validatePermissions(['READ_DMS', 'HACK_PLANET']);
      expect(result.valid).toBe(false);
      expect(result.invalid).toContain('HACK_PLANET');
    });

    it('empty array is valid', () => {
      const result = validatePermissions([]);
      expect(result.valid).toBe(true);
    });

    it('validates all enum values', () => {
      const allPerms = Object.values(AgentPermission);
      const result = validatePermissions(allPerms);
      expect(result.valid).toBe(true);
    });

    it('case-sensitive (lowercase fails)', () => {
      const result = validatePermissions(['read_dms']);
      expect(result.valid).toBe(false);
    });
  });

  describe('canPerformAction()', () => {
    it('allows action when granted', () => {
      expect(canPerformAction(
        [AgentPermission.READ_DMS],
        AgentPermission.READ_DMS
      )).toBe(true);
    });

    it('denies action when not granted', () => {
      expect(canPerformAction(
        [AgentPermission.READ_DMS],
        AgentPermission.SEND_DMS
      )).toBe(false);
    });

    it('FULL_AUTONOMY grants all permissions', () => {
      expect(canPerformAction(
        [AgentPermission.FULL_AUTONOMY],
        AgentPermission.HANDLE_OFFERS
      )).toBe(true);
      expect(canPerformAction(
        [AgentPermission.FULL_AUTONOMY],
        AgentPermission.READ_DMS
      )).toBe(true);
      expect(canPerformAction(
        [AgentPermission.FULL_AUTONOMY],
        AgentPermission.BUILD_DECORATE
      )).toBe(true);
    });

    it('empty permissions denies everything', () => {
      expect(canPerformAction([], AgentPermission.READ_DMS)).toBe(false);
    });

    it('multiple permissions allow multiple actions', () => {
      const perms = [AgentPermission.READ_DMS, AgentPermission.SEND_DMS];
      expect(canPerformAction(perms, AgentPermission.READ_DMS)).toBe(true);
      expect(canPerformAction(perms, AgentPermission.SEND_DMS)).toBe(true);
      expect(canPerformAction(perms, AgentPermission.MANAGE_CONTENT)).toBe(false);
    });
  });

  describe('generateAgentChallenge()', () => {
    it('returns string with bitmap-agent-challenge prefix', () => {
      const challenge = generateAgentChallenge();
      expect(challenge).toMatch(/^bitmap-agent-challenge:/);
    });

    it('includes UUID', () => {
      const challenge = generateAgentChallenge();
      const parts = challenge.split(':');
      expect(parts.length).toBe(3);
      // UUID format
      expect(parts[1]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('includes timestamp', () => {
      const challenge = generateAgentChallenge();
      const ts = parseInt(challenge.split(':')[2]);
      expect(ts).toBeGreaterThan(0);
      expect(ts).toBeLessThanOrEqual(Date.now());
    });

    it('generates unique challenges', () => {
      const c1 = generateAgentChallenge();
      const c2 = generateAgentChallenge();
      expect(c1).not.toBe(c2);
    });
  });

  describe('verifyAgentSignature()', () => {
    const { verifyBip322Signature } = require('@/lib/bip322-verify');

    beforeEach(() => jest.clearAllMocks());

    it('returns false for empty signature', () => {
      expect(verifyAgentSignature(VALID_ADDRESSES.segwit, 'challenge', '')).toBe(false);
    });

    it('returns false for empty address', () => {
      expect(verifyAgentSignature('', 'challenge', MOCK_SIGNATURE)).toBe(false);
    });

    it('returns false for empty challenge', () => {
      expect(verifyAgentSignature(VALID_ADDRESSES.segwit, '', MOCK_SIGNATURE)).toBe(false);
    });

    it('uses the BIP-322 verifier', () => {
      verifyBip322Signature.mockReturnValue(true);
      const result = verifyAgentSignature(VALID_ADDRESSES.segwit, 'challenge', MOCK_SIGNATURE);
      expect(result).toBe(true);
      expect(verifyBip322Signature).toHaveBeenCalled();
    });

    it('SECURITY: returns false on verifier error (no length-only fallback)', () => {
      verifyBip322Signature.mockImplementation(() => {
        throw new Error('Taproot not supported');
      });
      expect(verifyAgentSignature(VALID_ADDRESSES.taproot, 'challenge', MOCK_SIGNATURE)).toBe(false);
    });

    it('SECURITY: rejects crafted 64-byte base64 (audit fix)', () => {
      verifyBip322Signature.mockImplementation(() => {
        throw new Error('p2tr not supported');
      });
      const fake64 = Buffer.alloc(64, 0x42).toString('base64');
      expect(verifyAgentSignature(VALID_ADDRESSES.taproot, 'challenge', fake64)).toBe(false);
    });
  });
});
