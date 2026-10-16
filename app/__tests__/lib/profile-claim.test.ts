/**
 * The handle claim must produce exactly what POST /api/v1/profiles/create
 * verifies: the server hashes the parsed request body (signature and message
 * excluded) and checks the signed binding against its own path and block.
 */

import { hashBody, verifyActionBinding, parseActionMessage } from '@/lib/action-message';
import { buildProfileClaim, checkHandle, PROFILE_CREATE_PATH } from '@/lib/profile-claim';

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
