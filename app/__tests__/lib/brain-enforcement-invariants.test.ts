/**
 * Wave 3 — Brain enforcement invariants + public-surface broadening.
 *
 * As the moral scan is broadened beyond chat to public surfaces (briefs,
 * profiles, world objects, delegation-listing labels) this suite pins the
 * community-consensus model so the broadening cannot silently change it:
 *
 *   - moderation thresholds / appeal params stay 10 / 25 / 48h / 60% / 3
 *   - a Brain flag counts as EXACTLY 1 community flag (one persistFlag per hit)
 *   - DEGRADED mode fails closed (detects but NEVER persists a flag)
 *   - the ContentScanner seam defaults to the v1 regex scanner (identical output)
 *     and is the single place a future LLM-assist scanner plugs in
 *   - the regex engine actually flags violations on the NEW public surfaces
 */

// Mock the inscription module BEFORE importing runtime so the Brain boots offline.
const mockFetchSoul = jest.fn();
const mockFetchWalletBalance = jest.fn();
const mockVerifyMoralCode = jest.fn();

jest.mock('@/lib/brain/inscription', () => ({
  __esModule: true,
  fetchSoulFromInscription: (...a: unknown[]) => mockFetchSoul(...a),
  fetchBrainWalletBalance: (...a: unknown[]) => mockFetchWalletBalance(...a),
  verifyMoralCodeInscription: (...a: unknown[]) => mockVerifyMoralCode(...a),
}));

import {
  FLAG_THRESHOLD_SOFT,
  FLAG_THRESHOLD_HARD,
  APPEAL_DURATION_HOURS,
  APPEAL_RESTORE_MAJORITY,
  FALSE_FLAG_STRIKE_LIMIT,
  MORAL_CODE,
} from '@/lib/protocol';
import { bootBrain, executeScanCycle } from '@/lib/brain/runtime';
import {
  analyzeContent,
  resolveAppeal,
  getContentScanner,
  setContentScanner,
  regexScanner,
} from '@/lib/brain/engine';
import type { ScanTarget, BrainSoulInscription, ContentScanner } from '@/lib/brain';

function fakeSoul(): BrainSoulInscription {
  return {
    protocol: 'block-genomics-brain',
    version: 1,
    identity: { handle: 'nexus_brain', name: 'Nexus Brain', role: 'Guardian', tier: 1 },
    moralCode: [...MORAL_CODE],
    parameters: {
      flagThresholdSoft: FLAG_THRESHOLD_SOFT,
      flagThresholdHard: FLAG_THRESHOLD_HARD,
      appealDurationHours: APPEAL_DURATION_HOURS,
      appealRestoreMajority: APPEAL_RESTORE_MAJORITY,
      falseFlagStrikeLimit: FALSE_FLAG_STRIKE_LIMIT,
    },
    constraints: [],
    integrityHash: 'deadbeef',
  } as unknown as BrainSoulInscription;
}

function target(contentType: ScanTarget['contentType'], text: string, id = 'c1'): ScanTarget {
  return { contentType, contentId: id, text, authorAddress: 'bc1qauthor', blockHeight: 840000, createdAt: new Date() };
}

beforeEach(() => {
  mockFetchSoul.mockReset();
  mockFetchWalletBalance.mockReset();
  mockVerifyMoralCode.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockFetchWalletBalance.mockResolvedValue(null);
  mockVerifyMoralCode.mockResolvedValue({ matches: true });
});

afterEach(() => {
  setContentScanner(); // reset the seam so a swapped scanner never leaks across tests
});

describe('moderation thresholds are immutable (regression)', () => {
  it('keeps the soft/hard flag thresholds at 10 / 25', () => {
    expect(FLAG_THRESHOLD_SOFT).toBe(10);
    expect(FLAG_THRESHOLD_HARD).toBe(25);
  });

  it('keeps the appeal window at 48h and restore majority at 60%', () => {
    expect(APPEAL_DURATION_HOURS).toBe(48);
    expect(APPEAL_RESTORE_MAJORITY).toBe(0.6);
  });

  it('keeps the false-flag strike limit at 3', () => {
    expect(FALSE_FLAG_STRIKE_LIMIT).toBe(3);
  });
});

describe('appeal resolution honors the 60% restore majority', () => {
  const soul = fakeSoul();

  it('restores at exactly 60% (6 of 10)', () => {
    expect(resolveAppeal(6, 4, soul).outcome).toBe('restored');
  });

  it('upholds below 60% (5 of 10)', () => {
    expect(resolveAppeal(5, 5, soul).outcome).toBe('upheld');
  });

  it('restores when no community votes are cast (benefit of the doubt)', () => {
    expect(resolveAppeal(0, 0, soul).outcome).toBe('restored');
  });
});

describe('a Brain flag counts as exactly one community flag', () => {
  it('persists exactly one flag per violation in ONLINE mode', async () => {
    mockFetchSoul.mockResolvedValue({ soul: fakeSoul(), source: 'inscription', verified: true });
    await bootBrain();

    const persistFlag = jest.fn().mockResolvedValue(undefined);
    const persistDecision = jest.fn().mockResolvedValue(undefined);
    const fetchContent = async (): Promise<ScanTarget[]> => [
      target('chat_message', 'Double your Bitcoin — guaranteed 10x returns, send now!'),
    ];

    await executeScanCycle(fetchContent, persistDecision, persistFlag);

    expect(persistFlag).toHaveBeenCalledTimes(1);
    expect(persistFlag).toHaveBeenCalledWith('c1', 'chat_message', 3);
    // One flag persisted → the Brain contributes a single community flag, never a bulk hide.
    expect(persistDecision).toHaveBeenCalledTimes(1);
  });
});

describe('DEGRADED mode fails closed', () => {
  it('detects a violation but persists NO flag when the soul is unverified', async () => {
    mockFetchSoul.mockResolvedValue({ soul: fakeSoul(), source: 'fallback', verified: false });
    const state = await bootBrain();
    expect(state.status).toBe('degraded');

    const persistFlag = jest.fn().mockResolvedValue(undefined);
    const persistDecision = jest.fn().mockResolvedValue(undefined);
    const fetchContent = async (): Promise<ScanTarget[]> => [
      target('chat_message', 'Double your Bitcoin — guaranteed 10x returns, send now!'),
    ];

    const decisions = await executeScanCycle(fetchContent, persistDecision, persistFlag);

    // Fail-closed: no persistence in degraded mode…
    expect(persistFlag).not.toHaveBeenCalled();
    expect(persistDecision).not.toHaveBeenCalled();
    // …but the detection is still recorded transparently ("would flag").
    expect(decisions.some((d) => d.type === 'flag')).toBe(true);
  });
});

describe('ContentScanner seam', () => {
  it('defaults to the v1 regex scanner', () => {
    expect(getContentScanner()).toBe(regexScanner);
  });

  it('produces output identical to analyzeContent (v1 semantics unchanged)', () => {
    const soul = fakeSoul();
    const violation = target('brief', 'Double your Bitcoin instantly — guaranteed returns!');
    const clean = target('brief', 'Weekly summary: three delegated tasks completed.');
    expect(getContentScanner().analyze(violation, soul)).toEqual(analyzeContent(violation, soul));
    expect(getContentScanner().analyze(clean, soul)).toEqual(analyzeContent(clean, soul));
  });

  it('is swappable and is the seam the runtime resolves through', async () => {
    mockFetchSoul.mockResolvedValue({ soul: fakeSoul(), source: 'inscription', verified: true });
    await bootBrain();

    // A stand-in for a future LLM-assist scanner — flags everything.
    const stubScanner: ContentScanner = {
      analyze: () => ({ violated: true, ruleIndex: 0, confidence: 0.9, reasoning: 'stub scanner' }),
    };
    setContentScanner(stubScanner);

    const persistFlag = jest.fn().mockResolvedValue(undefined);
    const persistDecision = jest.fn().mockResolvedValue(undefined);
    // Text the regex engine would consider CLEAN — only the swapped scanner flags it.
    const fetchContent = async (): Promise<ScanTarget[]> => [target('chat_message', 'gm, lovely block today')];

    await executeScanCycle(fetchContent, persistDecision, persistFlag);
    expect(persistFlag).toHaveBeenCalledTimes(1);
    expect(persistFlag).toHaveBeenCalledWith('c1', 'chat_message', 0);

    setContentScanner();
    expect(getContentScanner()).toBe(regexScanner);
  });
});

describe('public surfaces are scanned by the regex engine', () => {
  const soul = fakeSoul();

  // The engine is content-type agnostic (it reads target.text), so these cases
  // pin that each newly-broadened PUBLIC surface flows through detection.
  const cases: Array<{ surface: ScanTarget['contentType']; scam: string; rule: number; clean: string }> = [
    { surface: 'brief', scam: 'Double your Bitcoin — guaranteed 10x returns!', rule: 3, clean: 'Completed 3 delegated tasks this week. All nominal.' },
    { surface: 'profile', scam: 'Find him at his home address, 123 Main Street.', rule: 2, clean: 'Voxel artist and block owner. GM.' },
    { surface: 'world_object', scam: "I'll kill you the moment you enter this arena.", rule: 1, clean: 'Welcome Fountain' },
    { surface: 'listing', scam: 'Send 1 BTC get 2 BTC back — limited spots!', rule: 3, clean: 'Downtown Plaza' },
  ];

  it.each(cases)('flags a clear violation on $surface (rule $rule)', ({ surface, scam, rule }) => {
    const r = analyzeContent(target(surface, scam), soul);
    expect(r.violated).toBe(true);
    expect(r.ruleIndex).toBe(rule);
  });

  it.each(cases)('passes clean text on $surface', ({ surface, clean }) => {
    const r = analyzeContent(target(surface, clean), soul);
    expect(r.violated).toBe(false);
  });
});
