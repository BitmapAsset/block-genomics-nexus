/**
 * REVIEW bg57 P1-5: a handle claimed in My Bitmaps lives on a BlockProfile,
 * never on User.handle, and Account, the wallet menu and the badge read only
 * User.handle, so the claim never showed. They now share one rule.
 */

import { badgeId, resolvePublicHandle } from '@/lib/public-handle';

const W = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';

describe('resolvePublicHandle', () => {
  it('prefers the account handle (User.handle)', () => {
    expect(resolvePublicHandle({ handle: 'elonmusk', blockProfiles: [{ blockHeight: 718840, handle: 'ribbit' }] })).toEqual({
      handle: 'elonmusk',
      source: 'user',
      blockHeight: null,
    });
  });

  it('falls back to the block profile a claim leaves behind (User.handle null)', () => {
    expect(resolvePublicHandle({ handle: null, blockProfiles: [{ blockHeight: 718840, handle: 'ribbit' }] })).toEqual({
      handle: 'ribbit',
      source: 'block',
      blockHeight: 718840,
    });
  });

  it('takes the block profile on the lowest height, whatever the order', () => {
    const profiles = [
      { blockHeight: 745506, handle: 'later' },
      { blockHeight: 0, handle: 'genesis' },
      { blockHeight: 720143, handle: 'middle' },
    ];
    expect(resolvePublicHandle({ handle: '', blockProfiles: profiles })).toMatchObject({ handle: 'genesis', blockHeight: 0 });
  });

  it('skips blank or malformed block profiles', () => {
    const profiles = [
      { blockHeight: 1, handle: '  ' },
      { blockHeight: -1, handle: 'negative' },
      { blockHeight: 1.5, handle: 'fraction' },
      { blockHeight: 9, handle: 'ok' },
    ];
    expect(resolvePublicHandle({ handle: '   ', blockProfiles: profiles })).toMatchObject({ handle: 'ok', source: 'block' });
  });

  it('is none when neither source has one', () => {
    expect(resolvePublicHandle(null)).toBeNull();
    expect(resolvePublicHandle(undefined)).toBeNull();
    expect(resolvePublicHandle({ handle: null })).toBeNull();
    expect(resolvePublicHandle({ handle: null, blockProfiles: [] })).toBeNull();
  });
});

describe('badgeId', () => {
  it('badges by account handle, which the badge route resolves', () => {
    expect(badgeId({ handle: 'elonmusk', source: 'user', blockHeight: null }, W)).toBe('elonmusk');
  });

  it('badges by address for a block-profile handle (the route cannot resolve one)', () => {
    expect(badgeId({ handle: 'ribbit', source: 'block', blockHeight: 718840 }, W)).toBe(W);
  });

  it('badges by address with no handle', () => {
    expect(badgeId(null, W)).toBe(W);
  });
});
