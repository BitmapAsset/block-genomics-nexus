/**
 * Tests for the Brain moral-judge hook on experience manifests. Mocks the
 * inscription module (like brain-soul-verified.test.ts) so the Brain boots
 * without network, then feeds clean vs. clearly-violating manifest text.
 */

const mockFetchSoul = jest.fn();
const mockFetchWalletBalance = jest.fn();
const mockVerifyMoralCode = jest.fn();

jest.mock('@/lib/brain/inscription', () => ({
  __esModule: true,
  fetchSoulFromInscription: (...a: unknown[]) => mockFetchSoul(...a),
  fetchBrainWalletBalance: (...a: unknown[]) => mockFetchWalletBalance(...a),
  verifyMoralCodeInscription: (...a: unknown[]) => mockVerifyMoralCode(...a),
}));

import { judgeExperienceManifest } from '@/lib/experience-judge';
import { MORAL_CODE } from '@/lib/protocol';

function fakeSoul() {
  return {
    protocol: 'block-genomics-brain',
    version: 1,
    identity: { handle: 'nexus_brain', name: 'Nexus Brain', role: 'Guardian', tier: 1 },
    moralCode: [...MORAL_CODE],
    parameters: {},
    constraints: [],
    integrityHash: 'deadbeef',
  } as unknown as import('@/lib/brain/types').BrainSoulInscription;
}

const owner = 'bc1qexampleowner';

beforeEach(() => {
  mockFetchSoul.mockReset();
  mockFetchWalletBalance.mockReset();
  mockVerifyMoralCode.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockFetchWalletBalance.mockResolvedValue(null);
  mockVerifyMoralCode.mockResolvedValue({ matches: true });
  mockFetchSoul.mockResolvedValue({ soul: fakeSoul(), source: 'inscription', verified: true });
});

describe('judgeExperienceManifest', () => {
  it('passes a clean manifest', async () => {
    const r = await judgeExperienceManifest({
      name: 'Pixel Plaza',
      description: 'A cozy 3D hangout world for the community.',
      walletAddress: owner,
      blockHeight: 840000,
    });
    expect(r.violated).toBe(false);
    expect(r.brainStatus).toBe('online');
  });

  it('rejects fraud/scam text (Rule 3)', async () => {
    const r = await judgeExperienceManifest({
      name: 'Bitcoin Doubler',
      description: 'Double your Bitcoin instantly — guaranteed returns!',
      walletAddress: owner,
      blockHeight: 840000,
    });
    expect(r.violated).toBe(true);
    expect(r.ruleIndex).toBe(3);
  });

  it('rejects a direct threat of violence (Rule 1)', async () => {
    const r = await judgeExperienceManifest({
      name: 'Arena',
      description: "I'll kill you the moment you enter this place.",
      walletAddress: owner,
      blockHeight: 840000,
    });
    expect(r.violated).toBe(true);
    expect(r.ruleIndex).toBe(1);
  });

  it('does not false-positive on benign gaming language (fiction exemption)', async () => {
    const r = await judgeExperienceManifest({
      name: 'Zombie Shooter',
      description: 'A fun fiction game where you shoot zombies in a story campaign.',
      walletAddress: owner,
      blockHeight: 840000,
    });
    expect(r.violated).toBe(false);
  });
});
