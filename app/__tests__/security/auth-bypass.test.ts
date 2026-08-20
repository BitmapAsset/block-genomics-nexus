/**
 * SECURITY TESTS — Critical audit findings
 * Tests that verify fixes for known security vulnerabilities
 */

jest.mock('@/lib/bip322-verify', () => ({
  verifyBip322Signature: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// In-memory stand-in for prisma.challenge (DB-backed challenge store).
jest.mock('@/lib/prisma', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rows: any[] = [];
  let id = 0;
  const matches = (row: any, where: any): boolean => {
    if (!where) return true;
    if (where.OR && !where.OR.some((o: any) => matches(row, o))) return false;
    if (where.challenge !== undefined && row.challenge !== where.challenge) return false;
    if (where.address !== undefined && row.address !== where.address) return false;
    if (where.purpose !== undefined && row.purpose !== where.purpose) return false;
    if (where.consumedAt === null && row.consumedAt !== null) return false;
    if (where.expiresAt?.gt !== undefined && !(row.expiresAt > where.expiresAt.gt)) return false;
    if (where.expiresAt?.lt !== undefined && !(row.expiresAt < where.expiresAt.lt)) return false;
    return true;
  };
  return {
    __esModule: true,
    default: {
      challenge: {
        create: async ({ data }: any) => {
          const r = { id: String(++id), consumedAt: null, createdAt: new Date(), address: null, purpose: null, ...data };
          rows.push(r);
          return r;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const r of rows) if (matches(r, where)) { Object.assign(r, data); count++; }
          return { count };
        },
        findMany: async ({ where, orderBy, take }: any) => {
          let res = rows.filter((r) => matches(r, where));
          if (orderBy?.createdAt === 'desc') res = res.slice().sort((a, b) => b.createdAt - a.createdAt);
          if (take) res = res.slice(0, take);
          return res;
        },
        deleteMany: async ({ where }: any) => {
          let count = 0;
          for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) { rows.splice(i, 1); count++; }
          return { count };
        },
        __reset: () => { rows.length = 0; },
      },
    },
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
});

import { verifyWalletSignature, isValidBitcoinAddress, sanitizeString } from '@/lib/api-helpers';
import { verifyAgentSignature, validatePermissions, canPerformAction, AgentPermission } from '@/lib/agent-protocol';
import { issueChallenge, consumeChallenge } from '@/lib/challenges';

const { verifyBip322Signature } = require('@/lib/bip322-verify');

describe('SECURITY: Signature bypass prevention', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('Taproot signature bypass (CRITICAL — audit finding)', () => {
    it('MUST NOT accept any base64 string as valid taproot signature', () => {
      // The original code had a fallback that accepted ANY 64-byte base64
      // string as a valid signature when the verifier threw for taproot addresses.
      // This was a complete authentication bypass.
      verifyBip322Signature.mockImplementation(() => {
        throw new Error('Taproot (P2TR/bc1p) addresses are not supported');
      });

      const taprootAddr = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';
      const fake64ByteSig = Buffer.alloc(64, 0xFF).toString('base64');

      expect(verifyWalletSignature(taprootAddr, 'login message', fake64ByteSig)).toBe(false);
    });

    it('MUST NOT accept randomly generated signatures', () => {
      verifyBip322Signature.mockImplementation(() => {
        throw new Error('Unsupported address type');
      });

      const taprootAddr = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';

      // Try various crafted signatures
      const attacks = [
        Buffer.alloc(64, 0x00).toString('base64'),
        Buffer.alloc(64, 0xFF).toString('base64'),
        Buffer.from('A'.repeat(88)).toString('base64'),
        'AAAA'.repeat(22), // ~66 bytes base64
      ];

      for (const sig of attacks) {
        expect(verifyWalletSignature(taprootAddr, 'any message', sig)).toBe(false);
      }
    });

    it('agent signature also rejects taproot bypass', () => {
      verifyBip322Signature.mockImplementation(() => {
        throw new Error('p2tr not supported');
      });

      const taprootAddr = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';
      expect(verifyAgentSignature(taprootAddr, 'challenge', Buffer.alloc(64).toString('base64'))).toBe(false);
    });
  });

  describe('Challenge replay attacks', () => {
    const wallet = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

    it('challenge is consumed after use (one-time use)', async () => {
      await issueChallenge('replay-nonce-1', { address: wallet, purpose: 'auth' });
      // First consume succeeds, replay attempt fails — atomic one-time use.
      expect(await consumeChallenge('replay-nonce-1')).toBe(true);
      expect(await consumeChallenge('replay-nonce-1')).toBe(false);
    });

    it('challenge bound to a wallet cannot be consumed by another wallet', async () => {
      const wallet2 = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      await issueChallenge('nonce-for-wallet-1', { address: wallet, purpose: 'auth' });

      // Attacker tries to consume wallet1's challenge while binding to wallet2.
      expect(await consumeChallenge('nonce-for-wallet-1', { address: wallet2 })).toBe(false);
    });
  });

  describe('Input validation — XSS prevention', () => {
    it('sanitizeString removes script tags', () => {
      expect(sanitizeString('<script>document.cookie</script>')).not.toContain('<script>');
    });

    it('sanitizeString removes event handlers', () => {
      expect(sanitizeString('<img onerror=alert(1)>')).not.toContain('onerror');
    });

    it('sanitizeString removes nested tags', () => {
      expect(sanitizeString('<div><script>xss</script></div>')).not.toContain('<');
    });

    it('sanitizeString enforces length limit', () => {
      const payload = '<script>' + 'a'.repeat(1000) + '</script>';
      expect(sanitizeString(payload).length).toBeLessThanOrEqual(500);
    });
  });

  describe('Bitcoin address validation', () => {
    it('rejects Ethereum addresses (cross-chain confusion)', () => {
      expect(isValidBitcoinAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28')).toBe(false);
    });

    it('rejects SQL injection in address field', () => {
      expect(isValidBitcoinAddress("' OR 1=1 --")).toBe(false);
    });

    it('rejects path traversal in address field', () => {
      expect(isValidBitcoinAddress('../../etc/passwd')).toBe(false);
    });

    it('rejects null bytes', () => {
      expect(isValidBitcoinAddress('bc1q\x00malicious')).toBe(false);
    });
  });

  describe('Permission escalation prevention', () => {
    it('rejects unknown permission strings', () => {
      const result = validatePermissions(['ADMIN', 'ROOT', 'FULL_AUTONOMY']);
      expect(result.valid).toBe(false);
      expect(result.invalid).toContain('ADMIN');
      expect(result.invalid).toContain('ROOT');
    });

    it('case-sensitive permissions prevent bypass', () => {
      const result = validatePermissions(['full_autonomy']); // lowercase
      expect(result.valid).toBe(false);
    });

    it('FULL_AUTONOMY properly grants all actions', () => {
      // This is intentional behavior, not a bug — but verify it's explicit
      const allPerms = Object.values(AgentPermission);
      for (const perm of allPerms) {
        expect(canPerformAction([AgentPermission.FULL_AUTONOMY], perm)).toBe(true);
      }
    });

    it('empty permissions deny all actions', () => {
      const allPerms = Object.values(AgentPermission);
      for (const perm of allPerms) {
        expect(canPerformAction([], perm)).toBe(false);
      }
    });
  });

  describe('Empty/null input handling', () => {
    it('verifyWalletSignature rejects all-empty inputs', () => {
      expect(verifyWalletSignature('', '', '')).toBe(false);
    });

    it('verifyAgentSignature rejects all-empty inputs', () => {
      expect(verifyAgentSignature('', '', '')).toBe(false);
    });

    it('verifyWalletSignature rejects null-ish values', () => {
      expect(verifyWalletSignature(null as any, 'msg', 'sig')).toBe(false);
      expect(verifyWalletSignature('addr', null as any, 'sig')).toBe(false);
      expect(verifyWalletSignature('addr', 'msg', null as any)).toBe(false);
    });
  });
});
