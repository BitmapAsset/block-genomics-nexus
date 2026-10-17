/**
 * processExpiredAppeals strikes a flagger only against the appealed content
 * (bg58).
 *
 * The strike check re-scanned a target with no text. analyzeContent reads empty
 * text as clean with confidence 1, so shouldIssueStrike approved a strike for
 * every flagger of every restored appeal — including appeals restored only
 * because nobody voted — and enough strikes revoke flagging privileges.
 */

const mockFetchSoul = jest.fn();
jest.mock('@/lib/brain/inscription', () => ({
  __esModule: true,
  fetchSoulFromInscription: (...a: unknown[]) => mockFetchSoul(...a),
  fetchBrainWalletBalance: async () => null,
  verifyMoralCodeInscription: async () => ({ matches: true }),
}));

import { bootBrain, processExpiredAppeals } from '@/lib/brain/runtime';

const soul = {
  protocol: 'block-genomics-brain',
  version: 1,
  identity: { handle: 'nexus_brain', name: 'Nexus Brain', role: 'Guardian', tier: 1 },
  moralCode: ['rule 1'],
  parameters: { falseFlagStrikeLimit: 3 },
  constraints: ['ALWAYS explain'],
  inscriptionRefs: {},
  integrityHash: 'deadbeef',
} as unknown as import('@/lib/brain/types').BrainSoulInscription;

const FLAGGERS = ['bc1qflaggerone', 'bc1qflaggertwo'];

async function run(contentText?: string) {
  const struck: string[] = [];
  await processExpiredAppeals(
    async () => [{ id: 'a1', contentId: 'm1', votesFor: 0, votesAgainst: 0, flaggedBy: FLAGGERS, contentText }],
    async () => {},
    async (wallet) => {
      struck.push(wallet);
      return 1;
    },
    async () => {},
  );
  return struck;
}

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockFetchSoul.mockResolvedValue({ soul, source: 'inscription', verified: true });
  await bootBrain();
});

it('strikes no one when the appealed content is not available', async () => {
  expect(await run()).toEqual([]);
  expect(await run('   ')).toEqual([]);
});

it('still strikes flaggers of restored content that scans clean', async () => {
  expect(await run('gm from block 840000, lovely parcel')).toEqual(FLAGGERS);
});
