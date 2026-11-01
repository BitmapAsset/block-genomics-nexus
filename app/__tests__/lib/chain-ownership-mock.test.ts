/**
 * The deed test helper answers from the seeded block row only when a suite
 * asks for it. By default an unregistered height is `undetermined`, so a gate
 * suite cannot pass on a seeded inscription id that no resolver ever named.
 */

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

import prisma from '@/lib/prisma';
import { canonicalDeedFromFixture, clearDeeds, setDeed } from '../helpers/chain-ownership-mock';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const SEEDED = 'aa'.repeat(32) + 'i0';
const REGISTERED = 'bb'.repeat(32) + 'i0';

beforeEach(async () => {
  db.__reset();
  clearDeeds();
  await db.block.create({ data: { height: BLOCK, ownerAddress: 'bc1powner', inscriptionId: SEEDED } });
});

afterAll(() => clearDeeds());

it('a seeded row with an inscription id and no registered deed: undetermined by default', async () => {
  const deed = await canonicalDeedFromFixture().canonicalDeedFor(BLOCK);
  expect(deed).toMatchObject({ verdict: 'undetermined', inscriptionId: null });
});

it('with seededRowIsDeed: true the seeded id is the deed', async () => {
  const deed = await canonicalDeedFromFixture({ seededRowIsDeed: true }).canonicalDeedFor(BLOCK);
  expect(deed).toMatchObject({ verdict: 'canonical', inscriptionId: SEEDED });
});

it.each([{}, { seededRowIsDeed: true }])('a registered deed wins (%o)', async (opts) => {
  setDeed(BLOCK, REGISTERED);
  const deed = await canonicalDeedFromFixture(opts).canonicalDeedFor(BLOCK);
  expect(deed).toMatchObject({ verdict: 'canonical', inscriptionId: REGISTERED });
});

it('prewarmDeeds follows the same rule', async () => {
  expect(await canonicalDeedFromFixture().prewarmDeeds([BLOCK])).toEqual([
    { height: BLOCK, verdict: 'undetermined', source: 'memory' },
  ]);
  expect(await canonicalDeedFromFixture({ seededRowIsDeed: true }).prewarmDeeds([BLOCK])).toEqual([
    { height: BLOCK, verdict: 'canonical', source: 'memory' },
  ]);
});
