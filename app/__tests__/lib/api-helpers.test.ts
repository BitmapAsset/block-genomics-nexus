/**
 * Tests for src/lib/api-helpers.ts
 * Covers: success/error responses, sanitization, Bitcoin address validation, BIP-322 signature verification
 */

import { VALID_ADDRESSES, INVALID_ADDRESSES, MOCK_SIGNATURE } from '../fixtures';

// Mock bip322-js before importing the module
jest.mock('bip322-js', () => ({
  Verifier: {
    verifySignature: jest.fn(),
  },
}));

// Mock next/server
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { success, error, sanitizeString, isValidBitcoinAddress, verifyWalletSignature } from '@/lib/api-helpers';

describe('api-helpers', () => {
  describe('success()', () => {
    it('returns success response with data', () => {
      const res = success({ foo: 'bar' }) as any;
      expect(res.body).toEqual({ success: true, data: { foo: 'bar' } });
      expect(res.status).toBe(200);
    });

    it('accepts custom status code', () => {
      const res = success({ created: true }, 201) as any;
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('handles null data', () => {
      const res = success(null) as any;
      expect(res.body).toEqual({ success: true, data: null });
    });

    it('handles array data', () => {
      const res = success([1, 2, 3]) as any;
      expect(res.body.data).toEqual([1, 2, 3]);
    });
  });

  describe('error()', () => {
    it('returns error response with message', () => {
      const res = error('Something went wrong') as any;
      expect(res.body).toEqual({ success: false, error: 'Something went wrong' });
      expect(res.status).toBe(400);
    });

    it('accepts custom status code', () => {
      const res = error('Not found', 404) as any;
      expect(res.status).toBe(404);
    });

    it('masks 500+ errors in production', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const res = error('Database connection details leaked', 500) as any;
      expect(res.body.error).toBe('Internal server error');
      process.env.NODE_ENV = origEnv;
    });

    it('shows full error in development for 500+', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const res = error('Database details', 500) as any;
      expect(res.body.error).toBe('Database details');
      process.env.NODE_ENV = origEnv;
    });

    it('does not mask 4xx errors in production', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const res = error('Bad request details', 400) as any;
      expect(res.body.error).toBe('Bad request details');
      process.env.NODE_ENV = origEnv;
    });
  });

  describe('sanitizeString()', () => {
    it('trims whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('removes HTML tags', () => {
      expect(sanitizeString('<script>alert("xss")</script>hello')).toBe('alert("xss")hello');
    });

    it('truncates to default max length', () => {
      const long = 'a'.repeat(600);
      expect(sanitizeString(long).length).toBe(500);
    });

    it('truncates to custom max length', () => {
      expect(sanitizeString('hello world', 5)).toBe('hello');
    });

    it('handles nested HTML', () => {
      expect(sanitizeString('<div><p>text</p></div>')).toBe('text');
    });

    it('handles empty string', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('removes img tags with onerror XSS', () => {
      expect(sanitizeString('<img src=x onerror=alert(1)>')).toBe('');
    });
  });

  describe('isValidBitcoinAddress()', () => {
    it('accepts valid SegWit address (bc1q)', () => {
      expect(isValidBitcoinAddress(VALID_ADDRESSES.segwit)).toBe(true);
    });

    it('accepts valid taproot address (bc1p)', () => {
      expect(isValidBitcoinAddress(VALID_ADDRESSES.taproot)).toBe(true);
    });

    it('accepts valid legacy address (1...)', () => {
      expect(isValidBitcoinAddress(VALID_ADDRESSES.legacy)).toBe(true);
    });

    it('accepts valid P2SH address (3...)', () => {
      expect(isValidBitcoinAddress(VALID_ADDRESSES.p2sh)).toBe(true);
    });

    it.each(INVALID_ADDRESSES)('rejects invalid address: "%s"', (addr) => {
      expect(isValidBitcoinAddress(addr)).toBe(false);
    });

    it('rejects Ethereum addresses', () => {
      expect(isValidBitcoinAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28')).toBe(false);
    });
  });

  describe('verifyWalletSignature()', () => {
    const bip322 = require('bip322-js');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns false for empty address', () => {
      expect(verifyWalletSignature('', 'message', 'sig')).toBe(false);
    });

    it('returns false for empty message', () => {
      expect(verifyWalletSignature(VALID_ADDRESSES.segwit, '', 'sig')).toBe(false);
    });

    it('returns false for empty signature', () => {
      expect(verifyWalletSignature(VALID_ADDRESSES.segwit, 'message', '')).toBe(false);
    });

    it('delegates to bip322-js Verifier for valid inputs', () => {
      bip322.Verifier.verifySignature.mockReturnValue(true);
      const result = verifyWalletSignature(VALID_ADDRESSES.segwit, 'test message', MOCK_SIGNATURE);
      expect(result).toBe(true);
      expect(bip322.Verifier.verifySignature).toHaveBeenCalledWith(
        VALID_ADDRESSES.segwit,
        'test message',
        MOCK_SIGNATURE
      );
    });

    it('returns false when bip322-js returns false', () => {
      bip322.Verifier.verifySignature.mockReturnValue(false);
      expect(verifyWalletSignature(VALID_ADDRESSES.segwit, 'msg', 'bad-sig')).toBe(false);
    });

    it('SECURITY: returns false on bip322-js exception (no fallback for taproot)', () => {
      bip322.Verifier.verifySignature.mockImplementation(() => {
        throw new Error('Taproot not supported');
      });
      const result = verifyWalletSignature(VALID_ADDRESSES.taproot, 'msg', MOCK_SIGNATURE);
      expect(result).toBe(false);
    });

    it('SECURITY: does NOT accept any 64-byte base64 as valid (audit finding)', () => {
      // This tests the critical security fix: previously ANY 64-byte base64 string
      // would pass as a valid taproot signature, enabling complete auth bypass
      bip322.Verifier.verifySignature.mockImplementation(() => {
        throw new Error('Taproot address not supported');
      });
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const fakeSignature = Buffer.alloc(64).toString('base64');
      expect(verifyWalletSignature(VALID_ADDRESSES.taproot, 'msg', fakeSignature)).toBe(false);
      consoleSpy.mockRestore();
    });
  });
});
