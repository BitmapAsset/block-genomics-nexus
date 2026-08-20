/**
 * Tests for src/lib/publicOwnerLookup.ts
 *
 * The contract that matters: a public page render must never wait on the ord
 * client's ~1 req/sec throttle, because a crawler walking distinct blocks would
 * otherwise serialise behind it. Unconfirmed-but-instant beats confirmed-in-55s.
 */

const mockGetInscriptionOwner = jest.fn();

jest.mock('@/lib/ownership-sync', () => ({
  getInscriptionOwner: (...a: unknown[]) => mockGetInscriptionOwner(...a),
}));

import {
  lookupOwnerForRender,
  __resetPublicOwnerLookup,
  __publicOwnerLookupStats,
} from '@/lib/publicOwnerLookup';

const INSCRIPTION = 'abc123i0';
const ALICE = 'bc1pseller0000000000000000000000000000000000';

/** Let the fire-and-forget warm settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  __resetPublicOwnerLookup();
  mockGetInscriptionOwner.mockResolvedValue(ALICE);
});

describe('lookupOwnerForRender()', () => {
  it('returns immediately as pending on a cold cache rather than awaiting the throttle', () => {
    const result = lookupOwnerForRender(INSCRIPTION);

    expect(result).toEqual({ address: null, pending: true });
  });

  it('serves the warmed answer on the next render', async () => {
    lookupOwnerForRender(INSCRIPTION);
    await settle();

    expect(lookupOwnerForRender(INSCRIPTION)).toEqual({ address: ALICE, pending: false });
  });

  it('is not pending when there is no inscription — that is a known absence, not a wait', () => {
    expect(lookupOwnerForRender(null)).toEqual({ address: null, pending: false });
    expect(mockGetInscriptionOwner).not.toHaveBeenCalled();
  });

  it('warms a given inscription once even under a burst of concurrent renders', async () => {
    for (let i = 0; i < 25; i++) lookupOwnerForRender(INSCRIPTION);
    await settle();

    expect(mockGetInscriptionOwner).toHaveBeenCalledTimes(1);
  });

  it('caps pending warms so a crawler burst cannot queue work that outlives it', () => {
    // Never resolves — every warm stays in flight.
    mockGetInscriptionOwner.mockReturnValue(new Promise(() => {}));

    for (let i = 0; i < 200; i++) lookupOwnerForRender(`inscription-${i}i0`);

    expect(__publicOwnerLookupStats().pending).toBeLessThanOrEqual(16);
    expect(mockGetInscriptionOwner.mock.calls.length).toBeLessThanOrEqual(16);
  });

  it('does not cache a failed warm as "no owner"', async () => {
    mockGetInscriptionOwner.mockRejectedValue(new Error('ord exploded'));

    lookupOwnerForRender(INSCRIPTION);
    await settle();

    // Still a miss, so the next render retries instead of showing the block as
    // unowned for the rest of the TTL.
    expect(lookupOwnerForRender(INSCRIPTION)).toEqual({ address: null, pending: true });
  });

  it('caches a genuine "no owner" answer', async () => {
    mockGetInscriptionOwner.mockResolvedValue(null);

    lookupOwnerForRender(INSCRIPTION);
    await settle();

    expect(lookupOwnerForRender(INSCRIPTION)).toEqual({ address: null, pending: false });
  });

  it('never rejects when the underlying lookup throws synchronously', () => {
    mockGetInscriptionOwner.mockImplementation(() => {
      throw new Error('sync boom');
    });

    expect(() => lookupOwnerForRender(INSCRIPTION)).not.toThrow();
  });
});
