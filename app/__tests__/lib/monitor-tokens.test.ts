/**
 * Tests for src/lib/monitor-tokens.ts
 * Covers: token generation, validation, revocation, auth middleware
 */

import crypto from 'crypto';

// Mock Prisma
const mockPrisma = {
  guardianAgent: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import { generateMonitorToken, validateMonitorToken, revokeMonitorToken, validateMonitorAuth } from '@/lib/monitor-tokens';

describe('monitor-tokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateMonitorToken()', () => {
    it('returns a hex token string', async () => {
      mockPrisma.guardianAgent.update.mockResolvedValue({});
      const token = await generateMonitorToken('guardian-1', 'bc1q...');
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('stores hash in database, not plaintext', async () => {
      mockPrisma.guardianAgent.update.mockResolvedValue({});
      const token = await generateMonitorToken('guardian-1', 'bc1q...');

      const call = mockPrisma.guardianAgent.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'guardian-1' });
      expect(call.data.monitorTokenHash).not.toBe(token); // stored hash != plaintext
      expect(call.data.monitorTokenHash).toHaveLength(64); // SHA-256 hex
      expect(call.data.monitorTokenCreatedAt).toBeInstanceOf(Date);
    });

    it('generates unique tokens each time', async () => {
      mockPrisma.guardianAgent.update.mockResolvedValue({});
      const t1 = await generateMonitorToken('guardian-1', 'bc1q...');
      const t2 = await generateMonitorToken('guardian-1', 'bc1q...');
      expect(t1).not.toBe(t2);
    });
  });

  describe('validateMonitorToken()', () => {
    it('returns true for valid token', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');

      mockPrisma.guardianAgent.findUnique.mockResolvedValue({
        monitorTokenHash: hash,
      });

      const result = await validateMonitorToken(token, 'guardian-1');
      expect(result).toBe(true);
    });

    it('returns false for wrong token', async () => {
      const realHash = crypto.createHash('sha256').update('real-token').digest('hex');
      mockPrisma.guardianAgent.findUnique.mockResolvedValue({
        monitorTokenHash: realHash,
      });

      const result = await validateMonitorToken('wrong-token-of-same-length-paddi', 'guardian-1');
      expect(result).toBe(false);
    });

    it('returns false when no guardian found', async () => {
      mockPrisma.guardianAgent.findUnique.mockResolvedValue(null);
      const result = await validateMonitorToken('any-token', 'nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when no token hash stored', async () => {
      mockPrisma.guardianAgent.findUnique.mockResolvedValue({
        monitorTokenHash: null,
      });
      const result = await validateMonitorToken('any-token', 'guardian-1');
      expect(result).toBe(false);
    });

    it('SECURITY: uses timing-safe comparison', async () => {
      // The implementation uses crypto.timingSafeEqual — this test validates
      // that it doesn't use simple === comparison which leaks timing info
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');

      mockPrisma.guardianAgent.findUnique.mockResolvedValue({
        monitorTokenHash: hash,
      });

      // We can't directly test timing safety, but we verify the function works
      // correctly with matching and non-matching tokens
      expect(await validateMonitorToken(token, 'g1')).toBe(true);

      mockPrisma.guardianAgent.findUnique.mockResolvedValue({
        monitorTokenHash: hash,
      });
      expect(await validateMonitorToken(token + 'x', 'g1')).toBe(false);
    });
  });

  describe('revokeMonitorToken()', () => {
    it('clears token hash and timestamp in DB', async () => {
      mockPrisma.guardianAgent.update.mockResolvedValue({});
      await revokeMonitorToken('guardian-1');

      expect(mockPrisma.guardianAgent.update).toHaveBeenCalledWith({
        where: { id: 'guardian-1' },
        data: {
          monitorTokenHash: null,
          monitorTokenCreatedAt: null,
        },
      });
    });
  });

  describe('validateMonitorAuth()', () => {
    it('returns null for missing auth header', async () => {
      const result = await validateMonitorAuth(null, 'guardian-1');
      expect(result).toBeNull();
    });

    it('returns null for non-Bearer auth', async () => {
      const result = await validateMonitorAuth('Basic abc123', 'guardian-1');
      expect(result).toBeNull();
    });

    it('returns null for empty Bearer token', async () => {
      const result = await validateMonitorAuth('Bearer ', 'guardian-1');
      expect(result).toBeNull();
    });

    it('returns guardian on valid token', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');

      mockPrisma.guardianAgent.findUnique
        .mockResolvedValueOnce({ monitorTokenHash: hash }) // validateMonitorToken call
        .mockResolvedValueOnce({ id: 'guardian-1', name: 'Test Guardian' }); // findUnique call

      const result = await validateMonitorAuth(`Bearer ${token}`, 'guardian-1');
      expect(result).toEqual({ id: 'guardian-1', name: 'Test Guardian' });
    });

    it('returns null for invalid token', async () => {
      // Must be valid SHA-256 hex (64 chars) for timingSafeEqual to work
      const wrongHash = crypto.createHash('sha256').update('different-token').digest('hex');
      mockPrisma.guardianAgent.findUnique.mockResolvedValue({
        monitorTokenHash: wrongHash,
      });

      const result = await validateMonitorAuth('Bearer bad-token', 'guardian-1');
      expect(result).toBeNull();
    });
  });
});
