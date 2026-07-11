/**
 * ISOLATED SIMULATION — parcel customize replay closure (OPEN-3) through the
 * REAL route, in-memory Prisma + REAL BIP-322 signatures.
 *
 * Proves: server-issued single-use challenge (replay closed), payload binding
 * (a captured signature can't be re-applied with different fields), self-minted
 * challenge rejected, and ownership scoping preserved.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
      headers: { set: () => {}, get: () => null },
    }),
  },
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { issueChallenge } from '@/lib/challenges';
import { POST as customizePOST } from '@/app/api/v1/blocks/[height]/parcels/[txIndex]/customize/route';
import { parcelCustomizeBindingString, parcelCustomizeBindingLine } from '@/lib/parcel-customize';
import { makeWallet, sign, freshNonce, challengeMessage } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const req = (body: any) => ({ json: async () => body } as any);
const ctx = (h: number, tx: number) => ({ params: Promise.resolve({ height: String(h), txIndex: String(tx) }) });

async function issue(address: string): Promise<string> {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address, purpose: 'parcel-customize' });
  return challengeMessage(nonce);
}

const FIELDS_A = { customColor: '#abcdef', pattern: 'stripes', imageUrl: null, rotation: 90, facing: 'north', emissive: false };
const FIELDS_B = { customColor: '#000000', pattern: 'solid', imageUrl: null, rotation: 0, facing: 'south', emissive: true };

function boundMessage(challenge: string, h: number, tx: number, fields: any): string {
  const hash = crypto.createHash('sha256').update(parcelCustomizeBindingString(h, tx, fields)).digest('hex');
  return `${challenge}\n${parcelCustomizeBindingLine(hash, h, tx)}`;
}

beforeEach(() => db.__reset());

describe('SIM: parcel customize replay closure (OPEN-3)', () => {
  it('block owner initializes a parcel with a bound, server-issued challenge', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 3001, ownerAddress: owner.address } });

    const challenge = await issue(owner.address);
    const message = boundMessage(challenge, 3001, 7, FIELDS_A);
    const signature = sign(owner.wif, owner.address, message);

    const res = await customizePOST(req({ walletAddress: owner.address, signature, message, ...FIELDS_A }), ctx(3001, 7));
    expect(res.status).toBe(200);
    const parcel = await db.parcel.findUnique({ where: { blockHeight_txIndex: { blockHeight: 3001, txIndex: 7 } } });
    expect(parcel.ownerAddress).toBe(owner.address);
    expect(parcel.customColor).toBe('#abcdef');
  });

  it('a replayed (signature, message) is rejected — the challenge is single-use', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 3002, ownerAddress: owner.address } });

    const challenge = await issue(owner.address);
    const message = boundMessage(challenge, 3002, 1, FIELDS_A);
    const signature = sign(owner.wif, owner.address, message);
    const body = { walletAddress: owner.address, signature, message, ...FIELDS_A };

    expect((await customizePOST(req(body), ctx(3002, 1))).status).toBe(200);
    expect((await customizePOST(req(body), ctx(3002, 1))).status).toBe(401); // replay
  });

  it('payload tamper: a signature bound to fields A cannot push fields B', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 3003, ownerAddress: owner.address } });

    const challenge = await issue(owner.address);
    const message = boundMessage(challenge, 3003, 2, FIELDS_A); // signed over A's hash
    const signature = sign(owner.wif, owner.address, message);

    // Send fields B in the body — server recomputes hash(B) which is not in the message.
    const res = await customizePOST(req({ walletAddress: owner.address, signature, message, ...FIELDS_B }), ctx(3003, 2));
    expect(res.status).toBe(400);
    expect(await db.parcel.findUnique({ where: { blockHeight_txIndex: { blockHeight: 3003, txIndex: 2 } } })).toBeNull();
  });

  it('a self-minted challenge (never issued by the server) is rejected', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 3004, ownerAddress: owner.address } });

    // Valid signature over a well-formed bound message, but the nonce was never issued.
    const challenge = challengeMessage(freshNonce());
    const message = boundMessage(challenge, 3004, 3, FIELDS_A);
    const signature = sign(owner.wif, owner.address, message);

    const res = await customizePOST(req({ walletAddress: owner.address, signature, message, ...FIELDS_A }), ctx(3004, 3));
    expect(res.status).toBe(401);
  });

  it('ownership scoping preserved: a stranger cannot initialize a parcel', async () => {
    const owner = makeWallet('p2tr');
    const stranger = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 3005, ownerAddress: owner.address } });

    const challenge = await issue(stranger.address);
    const message = boundMessage(challenge, 3005, 4, FIELDS_A);
    const signature = sign(stranger.wif, stranger.address, message);

    const res = await customizePOST(req({ walletAddress: stranger.address, signature, message, ...FIELDS_A }), ctx(3005, 4));
    expect(res.status).toBe(403);
    expect(await db.parcel.findUnique({ where: { blockHeight_txIndex: { blockHeight: 3005, txIndex: 4 } } })).toBeNull();
  });

  it('rejects a non-string field with a clean 400, not a 500 (sanitizeString type guard)', async () => {
    const owner = makeWallet('p2tr');
    await db.block.create({ data: { height: 3006, ownerAddress: owner.address } });

    // customColor as a number would throw inside sanitizeString → 500 without the
    // type guard. The guard runs before any crypto, so it is a clean 400 and the
    // bogus signature/message are never even evaluated.
    const res = await customizePOST(
      req({ walletAddress: owner.address, signature: 'x', message: 'x', customColor: 12345 }),
      ctx(3006, 5)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/customColor must be a string/);
    expect(await db.parcel.findUnique({ where: { blockHeight_txIndex: { blockHeight: 3006, txIndex: 5 } } })).toBeNull();
  });
});
