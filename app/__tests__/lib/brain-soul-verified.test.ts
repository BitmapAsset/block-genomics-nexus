/**
 * Tests for src/lib/brain/runtime.ts — getBrainStatus().soulVerified.
 *
 * Regression: previously computed as `lastSoulVerification !== null`, which
 * was true after any boot attempt, including DEGRADED mode where the soul
 * was NOT verified from the Bitcoin inscription. The correct semantics:
 * true only when the soul was fetched from the inscription AND passed
 * integrity/content verification.
 */

// Mock the inscription module BEFORE importing runtime so runtime binds to the mock.
const mockFetchSoul = jest.fn();
const mockFetchWalletBalance = jest.fn();
const mockVerifyMoralCode = jest.fn();

jest.mock('@/lib/brain/inscription', () => ({
  __esModule: true,
  fetchSoulFromInscription: (...a: unknown[]) => mockFetchSoul(...a),
  fetchBrainWalletBalance: (...a: unknown[]) => mockFetchWalletBalance(...a),
  verifyMoralCodeInscription: (...a: unknown[]) => mockVerifyMoralCode(...a),
}));

import { bootBrain, verifySoul, getBrainStatus } from '@/lib/brain/runtime';

function fakeSoul() {
  return {
    protocol: 'block-genomics-brain',
    version: 1,
    identity: { handle: 'nexus_brain', name: 'Nexus Brain', role: 'Guardian', tier: 1 },
    moralCode: ['rule 1', 'rule 2'],
    parameters: {},
    constraints: ['NEVER censor alone', 'ALWAYS explain'],
    inscriptionRefs: {},
    integrityHash: 'deadbeef',
  } as unknown as import('@/lib/brain/types').BrainSoulInscription;
}

describe('getBrainStatus().soulVerified', () => {
  beforeEach(() => {
    mockFetchSoul.mockReset();
    mockFetchWalletBalance.mockReset();
    mockVerifyMoralCode.mockReset();

    // Silence noisy runtime console output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Sensible defaults for the two auxiliary calls
    mockFetchWalletBalance.mockResolvedValue(null);
    mockVerifyMoralCode.mockResolvedValue({ matches: true });
  });

  it('is TRUE only when boot fetched soul from inscription AND verified it', async () => {
    mockFetchSoul.mockResolvedValue({ soul: fakeSoul(), source: 'inscription', verified: true });

    await bootBrain();

    const status = getBrainStatus();
    expect(status?.status).toBe('online');
    expect(status?.soulVerified).toBe(true);
  });

  it('is FALSE when boot enters DEGRADED mode (source=fallback)', async () => {
    mockFetchSoul.mockResolvedValue({ soul: fakeSoul(), source: 'fallback', verified: false });

    await bootBrain();

    const status = getBrainStatus();
    expect(status?.status).toBe('degraded');
    // The critical regression: this used to be TRUE because lastSoulVerification
    // was set to `new Date()` even in DEGRADED mode. It must now be FALSE.
    expect(status?.soulVerified).toBe(false);
  });

  it('is FALSE when boot fetched from inscription but verification failed', async () => {
    mockFetchSoul.mockResolvedValue({ soul: fakeSoul(), source: 'inscription', verified: false });

    await bootBrain();

    const status = getBrainStatus();
    expect(status?.status).toBe('degraded');
    expect(status?.soulVerified).toBe(false);
  });

  it('flips FALSE → TRUE when verifySoul later succeeds (DEGRADED → ONLINE)', async () => {
    // Boot degraded
    mockFetchSoul.mockResolvedValueOnce({ soul: fakeSoul(), source: 'fallback', verified: false });
    await bootBrain();
    expect(getBrainStatus()?.soulVerified).toBe(false);

    // Now inscription comes back
    mockFetchSoul.mockResolvedValueOnce({ soul: fakeSoul(), source: 'inscription', verified: true });
    await verifySoul();

    const status = getBrainStatus();
    expect(status?.status).toBe('online');
    expect(status?.soulVerified).toBe(true);
  });

  it('flips TRUE → FALSE when verifySoul later fails (ONLINE → DEGRADED)', async () => {
    // Boot online
    mockFetchSoul.mockResolvedValueOnce({ soul: fakeSoul(), source: 'inscription', verified: true });
    await bootBrain();
    expect(getBrainStatus()?.soulVerified).toBe(true);

    // Inscription becomes unreachable
    mockFetchSoul.mockResolvedValueOnce({ soul: fakeSoul(), source: 'fallback', verified: false });
    await verifySoul();

    const status = getBrainStatus();
    expect(status?.status).toBe('degraded');
    expect(status?.soulVerified).toBe(false);
  });

  it('soulVerified is consistent with status === "online" (contract)', async () => {
    // Case 1: online + verified
    mockFetchSoul.mockResolvedValueOnce({ soul: fakeSoul(), source: 'inscription', verified: true });
    await bootBrain();
    const s1 = getBrainStatus();
    expect(s1?.soulVerified).toBe(s1?.status === 'online');

    // Case 2: degraded
    mockFetchSoul.mockResolvedValueOnce({ soul: fakeSoul(), source: 'fallback', verified: false });
    await verifySoul();
    const s2 = getBrainStatus();
    expect(s2?.soulVerified).toBe(s2?.status === 'online');
  });
});
