/**
 * SECURITY TESTS — Critical audit findings
 * Tests that verify fixes for known security vulnerabilities
 */

jest.mock('bip322-js', () => ({
  Verifier: {
    verifySignature: jest.fn(),
  },
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

import { verifyWalletSignature, isValidBitcoinAddress, sanitizeString } from '@/lib/api-helpers';
import { verifyAgentSignature, validatePermissions, canPerformAction, AgentPermission } from '@/lib/agent-protocol';
import { setChallenge, getChallenge, deleteChallenge } from '@/lib/challenges';

const bip322 = require('bip322-js');

describe('SECURITY: Signature bypass prevention', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('Taproot signature bypass (CRITICAL — audit finding)', () => {
    it('MUST NOT accept any base64 string as valid taproot signature', () => {
      // The original code had a fallback that accepted ANY 64-byte base64
      // string as a valid signature when bip322-js threw for taproot addresses.
      // This was a complete authentication bypass.
      bip322.Verifier.verifySignature.mockImplementation(() => {
        throw new Error('Taproot (P2TR/bc1p) addresses are not supported');
      });

      const taprootAddr = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';
      const fake64ByteSig = Buffer.alloc(64, 0xFF).toString('base64');

      expect(verifyWalletSignature(taprootAddr, 'login message', fake64ByteSig)).toBe(false);
    });

    it('MUST NOT accept randomly generated signatures', () => {
      bip322.Verifier.verifySignature.mockImplementation(() => {
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
      bip322.Verifier.verifySignature.mockImplementation(() => {
        throw new Error('p2tr not supported');
      });

      const taprootAddr = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';
      expect(verifyAgentSignature(taprootAddr, 'challenge', Buffer.alloc(64).toString('base64'))).toBe(false);
    });
  });

  describe('Challenge replay attacks', () => {
    const wallet = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

    it('challenge is consumed after use (one-time use)', () => {
      setChallenge(wallet, 'replay-nonce-1');
      expect(getChallenge(wallet)).toBeDefined();

      // Simulate verification consuming the challenge
      deleteChallenge(wallet);

      // Replay attempt should fail
      expect(getChallenge(wallet)).toBeUndefined();
    });

    it('cannot use challenge from different wallet', () => {
      const wallet2 = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      setChallenge(wallet, 'nonce-for-wallet-1');

      // Attacker tries to use wallet1's challenge with wallet2
      expect(getChallenge(wallet2)).toBeUndefined();
    });

    it('overwriting challenge invalidates previous one', () => {
      setChallenge(wallet, 'nonce-old');
      setChallenge(wallet, 'nonce-new');

      const challenge = getChallenge(wallet);
      expect(challenge!.nonce).toBe('nonce-new');
      // Old nonce is gone — can't be replayed
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
