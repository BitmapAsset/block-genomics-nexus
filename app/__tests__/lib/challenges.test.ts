/**
 * Tests for src/lib/challenges.ts (Postgres-backed, serverless-safe store)
 * Covers: issue/persist, atomic one-time consume, expiry/cleanup, anti-replay,
 * address + purpose binding, and message-embedded nonce consume.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// In-memory stand-in for prisma.challenge so we can exercise the real consume
// logic without a live database.
jest.mock('@/lib/prisma', () => {
  const rows: any[] = [];
  let id = 0;
  const matches = (row: any, where: any): boolean => {
    if (!where) return true;
    if (where.OR && !where.OR.some((o: any) => matches(row, o))) return false;
    if (where.challenge !== undefined && row.challenge !== where.challenge) return false;
    if (where.address !== undefined && row.address !== where.address) return false;
    if (where.purpose !== undefined && row.purpose !== where.purpose) return false;
    if (where.consumedAt === null && row.consumedAt !== null) return false;
    if (where.consumedAt && typeof where.consumedAt === 'object' && where.consumedAt.lt !== undefined) {
      if (!(row.consumedAt && row.consumedAt < where.consumedAt.lt)) return false;
    }
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
});

import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { issueChallenge, consumeChallenge, consumeChallengeFromMessage, cleanupChallenges } from '@/lib/challenges';

const WALLET = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const WALLET2 = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

/** What every issuer mints: 32 random bytes, lowercase hex. */
const mint = () => crypto.randomBytes(32).toString('hex');

describe('challenges (DB-backed)', () => {
  beforeEach(() => { (prisma.challenge as any).__reset(); });

  describe('issueChallenge / consumeChallenge', () => {
    it('persists a challenge that can be consumed once', async () => {
      await issueChallenge('nonce-123', { address: WALLET, purpose: 'auth' });
      expect(await consumeChallenge('nonce-123')).toBe(true);
    });

    it('returns false for an unknown nonce', async () => {
      expect(await consumeChallenge('does-not-exist')).toBe(false);
    });

    it('binds to address + purpose when requested', async () => {
      await issueChallenge('bound', { address: WALLET, purpose: 'world' });
      expect(await consumeChallenge('bound', { address: WALLET2 })).toBe(false);
      expect(await consumeChallenge('bound', { address: WALLET, purpose: 'auth' })).toBe(false);
      expect(await consumeChallenge('bound', { address: WALLET, purpose: 'world' })).toBe(true);
    });
  });

  describe('SECURITY: atomic one-time use (anti-replay)', () => {
    it('a nonce cannot be consumed twice', async () => {
      await issueChallenge('replay-nonce', { address: WALLET });
      expect(await consumeChallenge('replay-nonce')).toBe(true);
      expect(await consumeChallenge('replay-nonce')).toBe(false);
    });

    it('expired challenges cannot be consumed', async () => {
      await issueChallenge('expired', { address: WALLET, ttlMs: -1000 });
      expect(await consumeChallenge('expired')).toBe(false);
    });
  });

  describe('consumeChallengeFromMessage', () => {
    it('consumes the nonce embedded in a signed message', async () => {
      const nonce = mint();
      await issueChallenge(nonce, { address: WALLET, purpose: 'auth' });
      const message = `Block Genomics verification: ${nonce}`;
      expect(await consumeChallengeFromMessage(WALLET, message, { purpose: 'auth' })).toBe(true);
      // replay of the same message now fails
      expect(await consumeChallengeFromMessage(WALLET, message, { purpose: 'auth' })).toBe(false);
    });

    it('rejects a message for a different wallet', async () => {
      const nonce = mint();
      await issueChallenge(nonce, { address: WALLET, purpose: 'auth' });
      expect(await consumeChallengeFromMessage(WALLET2, `sign: ${nonce}`, { purpose: 'auth' })).toBe(false);
    });

    it('rejects a message that does not contain a live nonce', async () => {
      await issueChallenge(mint(), { address: WALLET, purpose: 'auth' });
      expect(await consumeChallengeFromMessage(WALLET, `sign: ${mint()}`, { purpose: 'auth' })).toBe(false);
    });

    it('rejects a nonce minted for another purpose', async () => {
      const nonce = mint();
      await issueChallenge(nonce, { address: WALLET, purpose: 'world' });
      expect(await consumeChallengeFromMessage(WALLET, `Block Genomics verification: ${nonce}`, { purpose: 'auth' })).toBe(false);
    });

    it('finds the nonce beside a signed body hash (action-message shape)', async () => {
      const nonce = mint();
      await issueChallenge(nonce, { address: WALLET, purpose: 'auth' });
      const message = ['Block Genomics Authorization v1', `Body: ${mint()}`, `Nonce: ${nonce}`].join('\n');
      expect(await consumeChallengeFromMessage(WALLET, message, { purpose: 'auth' })).toBe(true);
    });
  });

  describe('SECURITY: nonce flooding (bg48 Q-10)', () => {
    it("25 attacker-requested challenges for the victim's wallet do not lock the victim out", async () => {
      const victimNonce = mint();
      await issueChallenge(victimNonce, { address: WALLET, purpose: 'session' });
      // Anyone may request challenges for any address; the old lookup scanned only
      // the 20 newest outstanding rows, so these pushed the victim's out of view.
      for (let i = 0; i < 25; i++) await issueChallenge(mint(), { address: WALLET, purpose: 'session' });
      // Same-millisecond inserts would tie on createdAt; make the flood strictly newer, as it is in production.
      const rows = await (prisma.challenge as any).findMany({ where: { address: WALLET } });
      rows.forEach((r: any, i: number) => { r.createdAt = new Date(1_700_000_000_000 + i); });

      expect(
        await consumeChallengeFromMessage(WALLET, `Block Genomics verification: ${victimNonce}`, { purpose: 'session' })
      ).toBe(true);
    });

    it('the flood does not make any other outstanding nonce consumable for the wrong purpose', async () => {
      const victimNonce = mint();
      await issueChallenge(victimNonce, { address: WALLET, purpose: 'session' });
      for (let i = 0; i < 25; i++) await issueChallenge(mint(), { address: WALLET, purpose: 'world' });

      expect(
        await consumeChallengeFromMessage(WALLET, `Block Genomics verification: ${victimNonce}`, { purpose: 'world' })
      ).toBe(false);
      expect(
        await consumeChallengeFromMessage(WALLET, `Block Genomics verification: ${victimNonce}`, { purpose: 'session' })
      ).toBe(true);
    });
  });

  describe('cleanupChallenges', () => {
    it('removes expired challenges and preserves fresh ones', async () => {
      await issueChallenge('stale', { address: WALLET, ttlMs: -1000 });
      await issueChallenge('fresh', { address: WALLET });
      await cleanupChallenges();
      expect(await consumeChallenge('stale')).toBe(false);
      expect(await consumeChallenge('fresh')).toBe(true);
    });

    it('handles an empty store', async () => {
      await expect(cleanupChallenges()).resolves.not.toThrow();
    });
  });
});
