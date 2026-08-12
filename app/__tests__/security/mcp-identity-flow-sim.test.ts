/**
 * ISOLATED SIMULATION — the whole Bitcoin-identity handshake through the REAL
 * routes, with REAL BIP-322 signatures, an in-memory Prisma, and a controllable
 * fake chain. No database, no network, no live indexer.
 *
 * The founder rule under test: an open connection is not an open capability.
 * An agent may connect and read; before it writes it must prove, with a
 * signature from the wallet holding the `.bitmap` inscription, that the block is
 * actually its own — and that proof must keep holding at the moment it acts.
 *
 * Flow covered end to end:
 *   POST /api/v1/session/start   → challenge
 *   (sign it with a real keypair)
 *   POST /api/v1/session/verify  → on-chain check → scoped bg_vfy_ token
 *   GET  /api/v1/session         → the caller's own capability surface
 *   POST /api/v1/world           → ownership-gated build
 *   POST /api/v1/session/username→ claim, subject to availability
 *   DELETE /api/v1/session       → revoke
 *
 * Plus the refusals that make it a gate: unowned block, transferred inscription,
 * replayed nonce, another wallet's signature, expired and revoked tokens.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

// A fake chain we can move under the app's feet, exactly as a real transfer would.
jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: jest.fn(),
  verifyInscriptionOwnership: jest.fn(),
  scanWalletForBitmap: jest.fn(),
}));

import prisma from '@/lib/prisma';
import { verifyBlockOwnedBy } from '@/lib/onchain/bitmap-ownership';
import { POST as sessionStart } from '@/app/api/v1/session/start/route';
import { POST as sessionVerify } from '@/app/api/v1/session/verify/route';
import { GET as sessionGet, DELETE as sessionDelete } from '@/app/api/v1/session/route';
import { POST as usernamePost, GET as usernameGet } from '@/app/api/v1/session/username/route';
import { POST as worldPost } from '@/app/api/v1/world/route';
import { PATCH as worldPatch, DELETE as worldDelete } from '@/app/api/v1/world/[id]/route';
import { makeWallet, sign, type SimWallet } from '../helpers/wallet-sim';
import { VERIFIED_TOKEN_PREFIX } from '@/lib/verified-sessions';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const chain = verifyBlockOwnedBy as jest.Mock;

const OWNED_BLOCK = 840000;
const OTHER_BLOCK = 777777;

/** Request double: routes read `.json()`, `.headers.get()` and `.nextUrl`. */
function req(body: any, headers: Record<string, string> = {}, url = 'http://test.local/api'): any {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    json: async () => body,
    url,
    nextUrl: new URL(url),
    headers: { get: (n: string) => lower[n.toLowerCase()] ?? null },
  };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Run the full handshake and return the minted token. */
async function verifyWallet(
  wallet: SimWallet,
  blocks: number[]
): Promise<{ status: number; body: any; token?: string }> {
  const started: any = await sessionStart(req({ walletAddress: wallet.address }));
  const message: string = started.body.data.message;
  const signature = sign(wallet.wif, wallet.address, message);

  const res: any = await sessionVerify(
    req({ walletAddress: wallet.address, message, signature, blocks })
  );
  return { status: res.status, body: res.body, token: res.body?.data?.token };
}

beforeEach(() => {
  db.__reset();
  chain.mockReset();
  // Default fake chain: the wallet holds whatever it asks about.
  chain.mockImplementation(async () => ({ verified: true }));
});

// ─── The happy path ──────────────────────────────────────────────────────────

describe('SIM: verification handshake', () => {
  it('issues a challenge bound to the wallet', async () => {
    const w = makeWallet('p2tr');
    const res: any = await sessionStart(req({ walletAddress: w.address }));

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('Block Genomics verification:');
    expect(res.body.data.walletAddress).toBe(w.address);
    // The nonce is persisted in the SAME challenge store the rest of the app
    // uses — this flow extends that system rather than forking a second one.
    expect(db.__rows('challenge')).toHaveLength(1);
    expect(db.__rows('challenge')[0].purpose).toBe('session');
  });

  it('mints a scoped token when the signature and on-chain ownership both check out', async () => {
    const w = makeWallet('p2tr');
    const { status, body, token } = await verifyWallet(w, [OWNED_BLOCK]);

    expect(status).toBe(201);
    expect(token!.startsWith(VERIFIED_TOKEN_PREFIX)).toBe(true);
    expect(body.data.verifiedBlocks).toEqual([OWNED_BLOCK]);
    expect(body.data.walletAddress).toBe(w.address);

    // Only the hash is persisted — never the token itself.
    const row = db.__rows('verifiedSession')[0];
    expect(row.tokenHash).toBeDefined();
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it.each(['p2pkh', 'p2wpkh', 'p2tr'] as const)('works for a %s ordinals wallet', async (kind) => {
    const { status } = await verifyWallet(makeWallet(kind), [OWNED_BLOCK]);
    expect(status).toBe(201);
  });

  it('accepts a hex-encoded signature (Leather-style wallets)', async () => {
    const w = makeWallet('p2wpkh');
    const started: any = await sessionStart(req({ walletAddress: w.address }));
    const message = started.body.data.message;
    const hex = Buffer.from(sign(w.wif, w.address, message), 'base64').toString('hex');

    const res: any = await sessionVerify(
      req({ walletAddress: w.address, message, signature: hex, blocks: [OWNED_BLOCK] })
    );
    expect(res.status).toBe(201);
  });

  it('reports the caller its own capability surface', async () => {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);

    const res: any = await sessionGet(req(null, auth(token!)));
    expect(res.status).toBe(200);
    expect(res.body.data.walletAddress).toBe(w.address);
    expect(res.body.data.verifiedBlocks).toEqual([OWNED_BLOCK]);
    expect(res.body.data.canWrite).toBe(true);
  });
});

// ─── Refusals during verification ────────────────────────────────────────────

describe('SIM: verification refusals', () => {
  it('rejects a signature from a DIFFERENT wallet than the one claimed', async () => {
    const claimed = makeWallet('p2tr');
    const attacker = makeWallet('p2tr');

    const started: any = await sessionStart(req({ walletAddress: claimed.address }));
    const message = started.body.data.message;
    // Real signature — just not from the wallet being claimed.
    const signature = sign(attacker.wif, attacker.address, message);

    const res: any = await sessionVerify(
      req({ walletAddress: claimed.address, message, signature, blocks: [OWNED_BLOCK] })
    );
    expect(res.status).toBe(401);
    expect(db.__rows('verifiedSession')).toHaveLength(0);
  });

  it('rejects a replayed challenge — one nonce, one session', async () => {
    const w = makeWallet('p2tr');
    const started: any = await sessionStart(req({ walletAddress: w.address }));
    const message = started.body.data.message;
    const signature = sign(w.wif, w.address, message);
    const payload = { walletAddress: w.address, message, signature, blocks: [OWNED_BLOCK] };

    expect((await sessionVerify(req(payload)) as any).status).toBe(201);
    // Same signature, same nonce, second time.
    const replay: any = await sessionVerify(req(payload));
    expect(replay.status).toBe(401);
    expect(db.__rows('verifiedSession')).toHaveLength(1);
  });

  it('rejects a signed message that carries no issued nonce', async () => {
    const w = makeWallet('p2tr');
    const message = 'Block Genomics verification: nonce-i-made-up';
    const res: any = await sessionVerify(
      req({ walletAddress: w.address, message, signature: sign(w.wif, w.address, message), blocks: [] })
    );
    expect(res.status).toBe(401);
  });

  it('refuses to mint a token for a block the wallet does not own on-chain', async () => {
    chain.mockImplementation(async () => ({ verified: false, reason: 'Inscription is not held by this wallet' }));

    const { status, body } = await verifyWallet(makeWallet('p2tr'), [OTHER_BLOCK]);
    expect(status).toBe(403);
    expect(body.code).toBe('ownership_not_proven');
    expect(db.__rows('verifiedSession')).toHaveLength(0);
  });

  it('returns a retryable 503 rather than a token when no indexer can answer', async () => {
    chain.mockImplementation(async () => ({ verified: false, unavailable: true }));

    const { status, body } = await verifyWallet(makeWallet('p2tr'), [OWNED_BLOCK]);
    expect(status).toBe(503);
    expect(body.code).toBe('onchain_unavailable');
    expect(db.__rows('verifiedSession')).toHaveLength(0);
  });

  it('scopes a partial claim to only the blocks that verified', async () => {
    chain.mockImplementation(async (_w: string, h: number) =>
      h === OWNED_BLOCK ? { verified: true } : { verified: false, reason: 'not yours' }
    );

    const { status, body } = await verifyWallet(makeWallet('p2tr'), [OWNED_BLOCK, OTHER_BLOCK]);
    expect(status).toBe(201);
    expect(body.data.verifiedBlocks).toEqual([OWNED_BLOCK]);
    expect(body.data.rejected).toHaveLength(1);
    expect(body.data.rejected[0].blockHeight).toBe(OTHER_BLOCK);
  });

  it('rejects a malformed blocks list instead of guessing', async () => {
    const w = makeWallet('p2tr');
    const started: any = await sessionStart(req({ walletAddress: w.address }));
    const message = started.body.data.message;
    const res: any = await sessionVerify(
      req({
        walletAddress: w.address,
        message,
        signature: sign(w.wif, w.address, message),
        blocks: ['not-a-block'],
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects an invalid Bitcoin address at the door', async () => {
    const res: any = await sessionStart(req({ walletAddress: 'not-an-address' }));
    expect(res.status).toBe(400);
  });
});

// ─── The gate on a real write ────────────────────────────────────────────────

describe('SIM: ownership-gated build through POST /api/v1/world', () => {
  it('lets a verified owner build on a block it proved', async () => {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);

    const res: any = await worldPost(
      req({ blockHeight: OWNED_BLOCK, objectType: 'cube', color: '#fff' }, auth(token!))
    );

    expect(res.status).toBe(201);
    // Attribution comes from the session, never from the request body.
    expect(res.body.object.ownerAddress).toBe(w.address);
    expect(db.__rows('blockObject')).toHaveLength(1);
  });

  it('refuses an anonymous build and explains how to verify', async () => {
    const res: any = await worldPost(req({ blockHeight: OWNED_BLOCK, objectType: 'cube' }));
    expect(res.status).toBe(401);
    expect(db.__rows('blockObject')).toHaveLength(0);
  });

  it('refuses a block outside the session scope', async () => {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);

    const res: any = await worldPost(
      req({ blockHeight: OTHER_BLOCK, objectType: 'cube' }, auth(token!))
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('out_of_scope');
    expect(db.__rows('blockObject')).toHaveLength(0);
  });

  it('STOPS WORKING the moment the bitmap transfers, mid-session', async () => {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);

    // First build lands while the wallet still holds the inscription.
    expect(((await worldPost(req({ blockHeight: OWNED_BLOCK, objectType: 'cube' }, auth(token!)))) as any).status).toBe(201);

    // The bitmap is sold. The token is still live and still names the block.
    chain.mockImplementation(async () => ({ verified: false, reason: 'Inscription is not held by this wallet' }));

    const after: any = await worldPost(req({ blockHeight: OWNED_BLOCK, objectType: 'sphere' }, auth(token!)));
    expect(after.status).toBe(403);
    expect(after.body.code).toBe('ownership_lost');
    expect(db.__rows('blockObject')).toHaveLength(1);
  });

  it('refuses a build when the chain cannot be reached, without granting', async () => {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);

    chain.mockImplementation(async () => ({ verified: false, unavailable: true }));
    const res: any = await worldPost(req({ blockHeight: OWNED_BLOCK, objectType: 'cube' }, auth(token!)));

    expect(res.status).toBe(503);
    expect(db.__rows('blockObject')).toHaveLength(0);
  });

  it('refuses a REVOKED token immediately', async () => {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);

    const revoked: any = await sessionDelete(req(null, auth(token!)));
    expect(revoked.body.data.revoked).toBe(true);

    const res: any = await worldPost(req({ blockHeight: OWNED_BLOCK, objectType: 'cube' }, auth(token!)));
    expect(res.status).toBe(401);
    expect(db.__rows('blockObject')).toHaveLength(0);
  });

  it('refuses an EXPIRED token', async () => {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);

    // Age the session past its expiry.
    db.__rows('verifiedSession')[0].expiresAt = new Date(Date.now() - 1000);

    const res: any = await worldPost(req({ blockHeight: OWNED_BLOCK, objectType: 'cube' }, auth(token!)));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("refuses one wallet's token for another wallet's verified block", async () => {
    const alice = makeWallet('p2tr');
    const bob = makeWallet('p2tr');
    const { token: aliceToken } = await verifyWallet(alice, [OWNED_BLOCK]);
    const { token: bobToken } = await verifyWallet(bob, [OTHER_BLOCK]);

    expect(((await worldPost(req({ blockHeight: OTHER_BLOCK, objectType: 'cube' }, auth(aliceToken!)))) as any).status).toBe(403);
    expect(((await worldPost(req({ blockHeight: OWNED_BLOCK, objectType: 'cube' }, auth(bobToken!)))) as any).status).toBe(403);
  });
});

// ─── Usernames ───────────────────────────────────────────────────────────────

// Creating an object is gated, but editing and deleting one are separate
// handlers — a gate that stops at POST would let a former owner keep rewriting
// and deleting objects on a block they no longer hold.
describe('SIM: ownership-gated edits through /api/v1/world/[id]', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  /** Verify a wallet, build one object on its proven block, return both. */
  async function ownerWithObject(blocks: number[] = [OWNED_BLOCK]) {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, blocks);
    const created: any = await worldPost(
      req({ blockHeight: blocks[0], objectType: 'cube' }, auth(token!))
    );
    return { wallet: w, token: token!, objectId: created.body.object.id as string };
  }

  it('lets a verified owner edit an object on a block it proved', async () => {
    const { token, objectId } = await ownerWithObject();

    const res: any = await worldPatch(req({ color: '#123456' }, auth(token)), params(objectId));

    expect(res.status).toBe(200);
    expect(res.body.object.color).toBe('#123456');
  });

  it('lets a verified owner delete its own object', async () => {
    const { token, objectId } = await ownerWithObject();

    const res: any = await worldDelete(req({}, auth(token)), params(objectId));

    expect(res.status).toBe(200);
    expect(db.__rows('blockObject')).toHaveLength(0);
  });

  it('refuses an anonymous edit and explains how to verify', async () => {
    const { objectId } = await ownerWithObject();

    const res: any = await worldPatch(req({ color: '#000000' }), params(objectId));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unverified');
    expect(db.__rows('blockObject')[0].color).not.toBe('#000000');
  });

  it('STOPS editing the moment the bitmap transfers, mid-session', async () => {
    const { token, objectId } = await ownerWithObject();

    // The bitmap is sold. The token is still live and still names the block.
    chain.mockImplementation(async () => ({
      verified: false,
      reason: 'Inscription is not held by this wallet',
    }));

    const res: any = await worldPatch(req({ color: '#ff0000' }, auth(token)), params(objectId));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ownership_lost');
    expect(db.__rows('blockObject')[0].color).not.toBe('#ff0000');
  });

  it('STOPS deleting the moment the bitmap transfers, mid-session', async () => {
    const { token, objectId } = await ownerWithObject();

    chain.mockImplementation(async () => ({ verified: false, reason: 'transferred' }));

    const res: any = await worldDelete(req({}, auth(token)), params(objectId));

    expect(res.status).toBe(403);
    expect(db.__rows('blockObject')).toHaveLength(1);
  });

  it("refuses one wallet's token against another wallet's object", async () => {
    const { objectId } = await ownerWithObject();
    // Mallory verifies the SAME block, so scope alone would let her through; the
    // per-object owner check is what stops her.
    const mallory = makeWallet('p2tr');
    const { token: malloryToken } = await verifyWallet(mallory, [OWNED_BLOCK]);

    const res: any = await worldPatch(
      req({ color: '#bad' }, auth(malloryToken!)),
      params(objectId)
    );

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not owner');
  });

  it('refuses a retryable 503 rather than editing when the chain is unreachable', async () => {
    const { token, objectId } = await ownerWithObject();

    chain.mockImplementation(async () => ({ verified: false, unavailable: true }));

    const res: any = await worldPatch(req({ color: '#eeeeee' }, auth(token)), params(objectId));

    expect(res.status).toBe(503);
    expect(db.__rows('blockObject')[0].color).not.toBe('#eeeeee');
  });

  it('refuses a revoked token immediately', async () => {
    const { token, objectId } = await ownerWithObject();
    await sessionDelete(req({}, auth(token)));

    const res: any = await worldPatch(req({ color: '#abcabc' }, auth(token)), params(objectId));

    expect(res.status).toBe(401);
    expect(db.__rows('blockObject')[0].color).not.toBe('#abcabc');
  });

  it('404s an unknown object without revealing anything about the caller', async () => {
    const { token } = await ownerWithObject();

    const res: any = await worldPatch(req({ color: '#fff' }, auth(token)), params('does-not-exist'));

    expect(res.status).toBe(404);
  });

  it('refuses to edit a locked object even for its verified owner', async () => {
    const { token, objectId } = await ownerWithObject();
    db.__rows('blockObject')[0].locked = true;

    const res: any = await worldPatch(req({ color: '#111111' }, auth(token)), params(objectId));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Object is locked');
  });
});

describe('SIM: username claim', () => {
  it('lets a verified wallet claim an available username', async () => {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);

    const res: any = await usernamePost(req({ handle: 'Gravity' }, auth(token!)));
    expect(res.status).toBe(201);
    // Stored in canonical (lowercased) form so lookups and uniqueness agree.
    expect(res.body.data.handle).toBe('gravity');
  });

  it('refuses an anonymous claim — usernames are not squattable', async () => {
    const res: any = await usernamePost(req({ handle: 'gravity' }));
    expect(res.status).toBe(401);
    expect(db.__rows('user')).toHaveLength(0);
  });

  it('refuses a handle already taken by another wallet', async () => {
    const first = makeWallet('p2tr');
    const second = makeWallet('p2tr');
    const { token: t1 } = await verifyWallet(first, [OWNED_BLOCK]);
    const { token: t2 } = await verifyWallet(second, [OTHER_BLOCK]);

    expect(((await usernamePost(req({ handle: 'gravity' }, auth(t1!)))) as any).status).toBe(201);

    const clash: any = await usernamePost(req({ handle: 'gravity' }, auth(t2!)));
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('handle_taken');
  });

  it('treats differently-cased spellings as the same name', async () => {
    const first = makeWallet('p2tr');
    const second = makeWallet('p2tr');
    const { token: t1 } = await verifyWallet(first, [OWNED_BLOCK]);
    const { token: t2 } = await verifyWallet(second, [OTHER_BLOCK]);

    await usernamePost(req({ handle: 'gravity' }, auth(t1!)));
    expect(((await usernamePost(req({ handle: 'GRAVITY' }, auth(t2!)))) as any).status).toBe(409);
  });

  it('rejects an invalid handle before touching the database', async () => {
    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);
    for (const handle of ['has spaces', 'sym!bols', 'x'.repeat(31)]) {
      const res: any = await usernamePost(req({ handle }, auth(token!)));
      expect(res.status).toBe(400);
    }
    expect(db.__rows('user')).toHaveLength(0);
  });

  it('reports availability publicly without a credential', async () => {
    const free: any = await usernameGet(req(null, {}, 'http://test.local/api?handle=nobody'));
    expect(free.status).toBe(200);
    expect(free.body.data.available).toBe(true);

    const w = makeWallet('p2tr');
    const { token } = await verifyWallet(w, [OWNED_BLOCK]);
    await usernamePost(req({ handle: 'taken' }, auth(token!)));

    const used: any = await usernameGet(req(null, {}, 'http://test.local/api?handle=taken'));
    expect(used.body.data.available).toBe(false);
  });
});
