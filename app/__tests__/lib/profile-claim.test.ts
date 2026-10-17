/**
 * The handle claim must produce exactly what POST /api/v1/profiles/create
 * verifies: the server hashes the parsed request body (signature and message
 * excluded) and checks the signed binding against its own path and block.
 */

import { hashBody, verifyActionBinding, parseActionMessage } from '@/lib/action-message';
import { buildProfileClaim, checkHandle, describeClaimFailure, PROFILE_CREATE_PATH } from '@/lib/profile-claim';

const W = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const NOW = 1_790_000_000_000;

describe('buildProfileClaim', () => {
  it('signs a binding the server-side check accepts for the same request', async () => {
    const { body, message } = await buildProfileClaim({ walletAddress: W, blockHeight: 718840, handle: 'ribbit' }, 'n0nce', NOW);

    // What the route does after req.json(): the body arrives with the auth fields.
    const received = JSON.parse(JSON.stringify({ ...body, signature: 'sig', message }));
    const result = verifyActionBinding(
      received.message,
      { action: 'profile.create', method: 'POST', path: PROFILE_CREATE_PATH, blockHeight: received.blockHeight, bodyHash: await hashBody(received) },
      NOW + 1000,
    );

    expect(result).toEqual({ ok: true, nonce: 'n0nce' });
  });

  it('binds the block: the same signature cannot claim on another block', async () => {
    const { message } = await buildProfileClaim({ walletAddress: W, blockHeight: 718840, handle: 'ribbit' }, 'n0nce', NOW);
    const other = await hashBody({ walletAddress: W, blockHeight: 720143, handle: 'ribbit' });

    expect(
      verifyActionBinding(message, { action: 'profile.create', method: 'POST', path: PROFILE_CREATE_PATH, blockHeight: 720143, bodyHash: other }, NOW),
    ).toMatchObject({ ok: false });
  });

  it('expires after five minutes', async () => {
    const { message } = await buildProfileClaim({ walletAddress: W, blockHeight: 1, handle: 'a' }, 'n', NOW);
    expect(parseActionMessage(message)!.expiresAt).toBe(NOW + 5 * 60 * 1000);
  });

  it('includes the display name only when given', async () => {
    const withName = await buildProfileClaim({ walletAddress: W, blockHeight: 1, handle: 'a', displayName: 'Ribbit' }, 'n', NOW);
    const without = await buildProfileClaim({ walletAddress: W, blockHeight: 1, handle: 'a', displayName: '' }, 'n', NOW);
    expect(withName.body).toHaveProperty('displayName', 'Ribbit');
    expect(without.body).not.toHaveProperty('displayName');
  });
});

describe('checkHandle', () => {
  it('normalizes like the server (lowercase, @ and dashes)', () => {
    expect(checkHandle('@Ribbit-Frog')).toEqual({ ok: true, handle: 'ribbit_frog' });
  });

  it('rejects what the server rejects', () => {
    expect(checkHandle('no spaces').ok).toBe(false);
    expect(checkHandle('').ok).toBe(false);
    expect(checkHandle('x'.repeat(31)).ok).toBe(false);
  });
});

describe('describeClaimFailure (REVIEW bg57 P1-2: the 403 is a step to take, not an API path)', () => {
  it('turns "verified first" into the verify action, with no route in the words', () => {
    const f = describeClaimFailure(403, 'Wallet must be verified first via /auth/verify');

    expect(f.needsVerify).toBe(true);
    expect(f.message).toMatch(/^Verify this bitmap first/);
    expect(f.message).toMatch(/Nothing was created\.$/);
    expect(f.message).not.toMatch(/\/auth|\/api|verify\b.*\//);
  });

  it('keeps the other 403 (not held on-chain) as the server says it, with no verify action', () => {
    const f = describeClaimFailure(403, 'Block 718840 is not held by this wallet on-chain. Ownership check failed.');

    expect(f).toEqual({
      needsVerify: false,
      message: 'Block 718840 is not held by this wallet on-chain. Ownership check failed. Nothing was created.',
    });
  });

  it('says a 503 is the chain, not the signature', () => {
    expect(describeClaimFailure(503, 'On-chain ownership could not be confirmed right now. Retry shortly.')).toMatchObject({
      needsVerify: false,
      message: expect.stringMatching(/couldn't confirm the holder right now/),
    });
  });

  it('never shows a route, whatever the server sentence', () => {
    for (const error of ['Request a challenge first via /api/v1/challenge.', 'see /auth/verify for details']) {
      expect(describeClaimFailure(400, error).message).not.toMatch(/\/(api|auth)\//);
    }
    expect(describeClaimFailure(409, 'Handle already taken').message).toBe('Handle already taken. Nothing was created.');
    expect(describeClaimFailure(500, undefined).message).toBe('The claim failed (HTTP 500). Nothing was created.');
  });
});
