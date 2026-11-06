/**
 * Tests for src/lib/blockPageData.ts
 *
 * `/block/[height]` is the link people paste into X, so the contracts that
 * matter are: never throw, never imply "nothing is here" when we simply could
 * not look, and never report a chain/record match that the indexer did not
 * actually confirm.
 */

const mockBlockFindUnique = jest.fn();
const mockObjectFindMany = jest.fn();
const mockObjectCount = jest.fn();
const mockParcelFindMany = jest.fn();
const mockParcelCount = jest.fn();
const mockExperienceFindMany = jest.fn();
const mockExperienceCount = jest.fn();
const mockUserFindMany = jest.fn();
const mockProfileFindMany = jest.fn();
const mockGetInscriptionOwner = jest.fn();
const mockFetchOgSummary = jest.fn();
const mockCanonicalDeedFor = jest.fn();
const mockDeedVerdictFindUnique = jest.fn();
const mockVerifyBlockOwnership = jest.fn();
const mockBlockWrite = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    block: {
      findUnique: (...a: unknown[]) => mockBlockFindUnique(...a),
      update: (...a: unknown[]) => mockBlockWrite('update', ...a),
      updateMany: (...a: unknown[]) => mockBlockWrite('updateMany', ...a),
      upsert: (...a: unknown[]) => mockBlockWrite('upsert', ...a),
      create: (...a: unknown[]) => mockBlockWrite('create', ...a),
      delete: (...a: unknown[]) => mockBlockWrite('delete', ...a),
    },
    blockObject: {
      findMany: (...a: unknown[]) => mockObjectFindMany(...a),
      count: (...a: unknown[]) => mockObjectCount(...a),
    },
    parcel: {
      findMany: (...a: unknown[]) => mockParcelFindMany(...a),
      count: (...a: unknown[]) => mockParcelCount(...a),
    },
    experience: {
      findMany: (...a: unknown[]) => mockExperienceFindMany(...a),
      count: (...a: unknown[]) => mockExperienceCount(...a),
    },
    user: { findMany: (...a: unknown[]) => mockUserFindMany(...a) },
    blockProfile: { findMany: (...a: unknown[]) => mockProfileFindMany(...a) },
    deedVerdict: { findUnique: (...a: unknown[]) => mockDeedVerdictFindUnique(...a) },
  },
}));

jest.mock('@/lib/ownership-sync', () => ({
  getInscriptionOwner: (...a: unknown[]) => mockGetInscriptionOwner(...a),
  verifyBlockOwnership: (...a: unknown[]) => mockVerifyBlockOwnership(...a),
}));

jest.mock('@/lib/onchain/deed', () => ({
  canonicalDeedFor: (...a: unknown[]) => mockCanonicalDeedFor(...a),
  DEED_RULE_ID: 'test-rule',
  CANONICAL_TTL_MS: 6 * 60 * 60 * 1000,
}));

jest.mock('@/lib/blockOgData', () => ({
  fetchBlockOgSummary: (...a: unknown[]) => mockFetchOgSummary(...a),
}));

import {
  fetchBlockPageData,
  fetchBlockCardFacts,
  resolveOwnership,
  resolveDeedOwnership,
  buildCreatorIndex,
  describeBlock,
  displayOwner,
  shortenAddress,
  creatorLabel,
  type BlockPageData,
} from '@/lib/blockPageData';
import * as blockPageData from '@/lib/blockPageData';
import { __resetPublicOwnerLookup } from '@/lib/publicOwnerLookup';

// Absent before the page-check cap; the suites that need it fail rather than crash the file.
const resetPageDeedState = (blockPageData as Record<string, unknown>).__resetPageDeedChecks as (() => void) | undefined;

const ALICE = 'bc1pseller0000000000000000000000000000000000';
const BOB = 'bc1pbuyer00000000000000000000000000000000000';
const BLOCK = 840000;
const INSCRIPTION = 'abc123i0';

/** A block with nothing built on it and no identities to resolve. */
function emptyBlockFixture(block: unknown) {
  mockBlockFindUnique.mockResolvedValue(block);
  mockObjectFindMany.mockResolvedValue([]);
  mockObjectCount.mockResolvedValue(0);
  mockParcelFindMany.mockResolvedValue([]);
  mockParcelCount.mockResolvedValue(0);
  mockExperienceFindMany.mockResolvedValue([]);
  mockExperienceCount.mockResolvedValue(0);
  mockUserFindMany.mockResolvedValue([]);
  mockProfileFindMany.mockResolvedValue([]);
}

/** A deed-rule answer, as `canonicalDeedFor` returns it. */
function deedAnswer(height: number, verdict: string, inscriptionId: string | null, reason?: string) {
  return {
    height,
    inscriptionId,
    ruleId: 'test-rule',
    verdict,
    resolvedAt: '2026-11-02T11:40:00.000Z',
    source: 'memory',
    ...(reason ? { reason } : {}),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetPublicOwnerLookup();
  resetPageDeedState?.();
  mockDeedVerdictFindUnique.mockResolvedValue(null);
  mockFetchOgSummary.mockResolvedValue(null);
  mockGetInscriptionOwner.mockResolvedValue(null);
  // By default the deed rule names the inscription the fixtures store.
  mockCanonicalDeedFor.mockImplementation(async (h: number) => deedAnswer(h, 'canonical', INSCRIPTION));
});

/** Let a fire-and-forget deed warm settle. */
const settleWarm = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The render path never awaits the throttled indexer call, so the first render
 * of a block is always unconfirmed and only a later one can report the deed.
 * Assertions about a confirmed holder go through here.
 */
async function fetchAfterWarm(height: number) {
  await fetchBlockPageData(height);
  await settleWarm();
  return fetchBlockPageData(height);
}

// ── Pure helpers ────────────────────────────────────────────────────────

describe('shortenAddress()', () => {
  it('middle-truncates a long address keeping both ends', () => {
    expect(shortenAddress(ALICE)).toBe(`bc1pse…${ALICE.slice(-4)}`);
  });

  it('returns short strings whole rather than making them longer', () => {
    expect(shortenAddress('bc1p')).toBe('bc1p');
  });
});

describe('creatorLabel()', () => {
  it('prefers a handle', () => {
    expect(creatorLabel({ address: ALICE, handle: 'satoshi', displayName: 'Sat' })).toBe('@satoshi');
  });

  it('falls back to display name, then to a short address', () => {
    expect(creatorLabel({ address: ALICE, handle: null, displayName: 'Sat' })).toBe('Sat');
    expect(creatorLabel({ address: ALICE, handle: null, displayName: null })).toBe(
      shortenAddress(ALICE),
    );
  });
});

describe('resolveOwnership()', () => {
  it('reports a match only on a live positive equality', () => {
    const o = resolveOwnership({ ownerAddress: ALICE, inscriptionId: INSCRIPTION }, ALICE);
    expect(o.inSync).toBe(true);
    expect(o.indeterminate).toBe(false);
    expect(o.onChainOwner).toBe(ALICE);
  });

  it('treats an indexer outage as indeterminate, never as a match or a mismatch', () => {
    const o = resolveOwnership({ ownerAddress: ALICE, inscriptionId: INSCRIPTION }, null);
    expect(o.inSync).toBe(false);
    expect(o.indeterminate).toBe(true);
    // The app's record survives so the page can still show something, flagged.
    expect(o.registeredOwner).toBe(ALICE);
  });

  it('surfaces a real mismatch when the deed has moved but the record has not', () => {
    const o = resolveOwnership({ ownerAddress: ALICE, inscriptionId: INSCRIPTION }, BOB);
    expect(o.inSync).toBe(false);
    expect(o.indeterminate).toBe(false);
    expect(o.onChainOwner).toBe(BOB);
    expect(o.registeredOwner).toBe(ALICE);
  });

  it('is indeterminate for a block with no record at all', () => {
    const o = resolveOwnership(null, null);
    expect(o).toEqual({
      onChainOwner: null,
      registeredOwner: null,
      inscriptionId: null,
      inSync: false,
      indeterminate: true,
      checkPending: false,
    });
  });

  it('does not claim a match when both sides are absent', () => {
    // null === null must not read as "in sync" — that would show an unowned
    // block as verified.
    const o = resolveOwnership({ ownerAddress: null, inscriptionId: null }, null);
    expect(o.inSync).toBe(false);
  });
});

describe('resolveDeedOwnership()', () => {
  const record = { ownerAddress: ALICE, inscriptionId: INSCRIPTION };
  const holderFor = () => ({ address: null, pending: false });
  const availabilityFor = () => ({ chain: 'unchecked' as const, checkedAt: null, lastVerifiedAt: null, unavailableSince: null });
  const failedCheck = (resolvedAt: string) => ({
    ...deedAnswer(BLOCK, 'undetermined', null, 'ord answered 403'),
    verdict: 'undetermined' as const,
    source: 'resolver' as const,
    resolvedAt,
  });

  it('a failed deed check names no outage start: the answer time is only the latest retry', () => {
    const o = resolveDeedOwnership(record, failedCheck('2026-11-02T11:40:00.000Z'), holderFor, availabilityFor);
    expect(o.deed?.verdict).toBe('undetermined');
    expect(o.checkPending).toBe(false);
    expect(o.deed?.unreachableSince).toBeNull();
    // The page falls back to `availability.unavailableSince`; none is set here.
    expect(o.availability).toBeUndefined();
  });

  it('two failed deed checks 12 s apart give the same deed', () => {
    const first = resolveDeedOwnership(record, failedCheck('2026-11-02T11:40:00.000Z'), holderFor, availabilityFor);
    const second = resolveDeedOwnership(record, failedCheck('2026-11-02T11:40:12.000Z'), holderFor, availabilityFor);
    expect(second.deed).toEqual(first.deed);
  });
});

describe('displayOwner()', () => {
  it('prefers the chain over the app record', () => {
    expect(
      displayOwner(resolveOwnership({ ownerAddress: ALICE, inscriptionId: INSCRIPTION }, BOB)),
    ).toBe(BOB);
  });

  it('falls back to the record when the indexer is silent', () => {
    expect(
      displayOwner(resolveOwnership({ ownerAddress: ALICE, inscriptionId: INSCRIPTION }, null)),
    ).toBe(ALICE);
  });
});

describe('buildCreatorIndex()', () => {
  it('prefers a block-scoped profile handle over the global account handle', () => {
    const index = buildCreatorIndex(
      [{ walletAddress: ALICE, handle: 'global', displayName: 'Global Name' }],
      [{ walletAddress: ALICE, handle: 'onthisblock', displayName: 'Local Name' }],
    );
    expect(index.get(ALICE)).toEqual({
      address: ALICE,
      handle: 'onthisblock',
      displayName: 'Local Name',
    });
  });

  it('keeps accounts that have no block-scoped profile', () => {
    const index = buildCreatorIndex(
      [{ walletAddress: BOB, handle: 'bob', displayName: null }],
      [],
    );
    expect(index.get(BOB)?.handle).toBe('bob');
  });
});

describe('describeBlock()', () => {
  function data(over: Partial<BlockPageData> = {}): BlockPageData {
    return {
      height: BLOCK,
      claimed: false,
      label: null,
      ownership: resolveOwnership(null, null),
      objects: [],
      objectCount: 0,
      parcels: [],
      parcelCount: 0,
      experiences: [],
      experienceCount: 0,
      chain: null,
      market: null,
      degraded: false,
      ...over,
    };
  }

  it('says "Not yet on Block Genomics" only when we actually looked and found no record', () => {
    // Never "Unclaimed": no row here says nothing about who holds the
    // inscription on Bitcoin.
    expect(describeBlock(data())).toBe('Not yet on Block Genomics');
    expect(describeBlock(data())).not.toContain('Unclaimed');
  });

  it('stays silent about ownership when the lookup was degraded', () => {
    // The regression this guards: a database blip must never publish a claim
    // about the deed of a block somebody owns.
    expect(describeBlock(data({ degraded: true }))).toBe('');
    expect(describeBlock(data({ degraded: true }))).not.toContain('Not yet on Block Genomics');
  });

  it('names the holder when the chain confirmed the record on the deed rule', () => {
    const out = describeBlock(
      data({
        ownership: {
          ...resolveOwnership({ ownerAddress: ALICE, inscriptionId: INSCRIPTION }, ALICE),
          deed: { verdict: 'canonical', canonicalId: INSCRIPTION, checkedAt: null, unreachableSince: null },
        },
      }),
    );
    expect(out).toBe(`Held by ${shortenAddress(ALICE)}`);
  });

  it('never says "Held by" off the deed rule, even when the stored id’s holder matches', () => {
    const stored = resolveOwnership({ ownerAddress: ALICE, inscriptionId: INSCRIPTION }, ALICE);
    for (const ownership of [
      stored,
      { ...stored, deed: { verdict: 'undetermined' as const, canonicalId: null, checkedAt: null, unreachableSince: null } },
    ]) {
      const out = describeBlock(data({ ownership }));
      expect(out).not.toContain('Held by');
      expect(out).toBe(`Registered to ${shortenAddress(ALICE)} (not verified)`);
    }
  });

  it('labels an unchecked record as registered, not held', () => {
    // No inscription id on file: the chain was never asked (the 840000 case).
    const out = describeBlock(
      data({ ownership: resolveOwnership({ ownerAddress: ALICE, inscriptionId: null }, null) }),
    );
    expect(out).toBe(`Registered to ${shortenAddress(ALICE)} (not verified)`);
    expect(out).not.toContain('Held by');
  });

  it('labels the record, not the live holder, when the chain disagrees with it', () => {
    const out = describeBlock(
      data({ ownership: resolveOwnership({ ownerAddress: ALICE, inscriptionId: INSCRIPTION }, BOB) }),
    );
    expect(out).toBe(`Registered to ${shortenAddress(ALICE)} (not verified)`);
    expect(out).not.toContain('Held by');
  });

  it('includes chain stats and build counts, singular and plural', () => {
    const one = describeBlock(data({ objectCount: 1, experienceCount: 1 }));
    expect(one).toContain('1 object built');
    expect(one).toContain('1 experience');

    const many = describeBlock(data({ objectCount: 42, experienceCount: 3 }));
    expect(many).toContain('42 objects built');
    expect(many).toContain('3 experiences');
  });

  it('omits build counts entirely at zero rather than saying "0 objects"', () => {
    expect(describeBlock(data())).not.toContain('object');
    expect(describeBlock(data())).not.toContain('experience');
  });
});

// ── Aggregate ───────────────────────────────────────────────────────────

describe('fetchBlockPageData()', () => {
  it('renders an unclaimed height as a real, empty page rather than an error', async () => {
    emptyBlockFixture(null);

    const data = await fetchBlockPageData(999999);

    expect(data.claimed).toBe(false);
    expect(data.degraded).toBe(false);
    expect(data.objects).toEqual([]);
    expect(data.objectCount).toBe(0);
    expect(data.ownership.indeterminate).toBe(true);
    expect(data.ownership.onChainOwner).toBeNull();
  });

  it('does not call the indexer when no id is on file and the deed rule has no canonical deed', async () => {
    emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: null, label: null });
    mockCanonicalDeedFor.mockImplementation(async (h: number) => deedAnswer(h, 'undetermined', null, 'ord answered 403'));

    const data = await fetchBlockPageData(BLOCK);

    expect(mockGetInscriptionOwner).not.toHaveBeenCalled();
    expect(data.ownership.indeterminate).toBe(true);
    expect(data.ownership.registeredOwner).toBe(ALICE);
  });

  it('reports the live deed holder over the stale app record', async () => {
    emptyBlockFixture({
      height: BLOCK,
      ownerAddress: ALICE,
      inscriptionId: INSCRIPTION,
      label: 'Genesis Plaza',
    });
    mockGetInscriptionOwner.mockResolvedValue(BOB);

    const data = await fetchAfterWarm(BLOCK);

    expect(data.ownership.onChainOwner).toBe(BOB);
    expect(data.ownership.registeredOwner).toBe(ALICE);
    expect(data.ownership.inSync).toBe(false);
    expect(data.label).toBe('Genesis Plaza');
  });

  it('flags degraded and does not imply zero builds when the database is down', async () => {
    mockBlockFindUnique.mockRejectedValue(new Error('ECONNREFUSED'));
    mockObjectFindMany.mockRejectedValue(new Error('ECONNREFUSED'));
    mockObjectCount.mockRejectedValue(new Error('ECONNREFUSED'));
    mockParcelFindMany.mockRejectedValue(new Error('ECONNREFUSED'));
    mockParcelCount.mockRejectedValue(new Error('ECONNREFUSED'));
    mockExperienceFindMany.mockRejectedValue(new Error('ECONNREFUSED'));
    mockExperienceCount.mockRejectedValue(new Error('ECONNREFUSED'));

    const data = await fetchBlockPageData(BLOCK);

    expect(data.degraded).toBe(true);
    expect(data.claimed).toBe(false);
    expect(data.ownership.indeterminate).toBe(true);
  });

  it('still renders when mempool.space fails', async () => {
    emptyBlockFixture(null);
    mockFetchOgSummary.mockRejectedValue(new Error('timeout'));

    const data = await fetchBlockPageData(BLOCK);

    expect(data.chain).toBeNull();
    expect(data.degraded).toBe(false);
  });

  it('attributes each object to its creator, not to the current deed holder', async () => {
    // The provenance case: Alice built it, Bob now owns the block. The object
    // must still read as Alice's work.
    mockBlockFindUnique.mockResolvedValue({
      height: BLOCK,
      ownerAddress: BOB,
      inscriptionId: INSCRIPTION,
      label: null,
    });
    mockObjectFindMany.mockResolvedValue([
      {
        id: 'obj1',
        objectType: 'building',
        name: 'Tower',
        ownerAddress: ALICE,
        createdAt: new Date('2026-01-02T03:04:05Z'),
      },
    ]);
    mockObjectCount.mockResolvedValue(1);
    mockParcelFindMany.mockResolvedValue([]);
    mockParcelCount.mockResolvedValue(0);
    mockExperienceFindMany.mockResolvedValue([]);
    mockExperienceCount.mockResolvedValue(0);
    mockUserFindMany.mockResolvedValue([
      { walletAddress: ALICE, handle: 'alice', displayName: 'Alice' },
    ]);
    mockProfileFindMany.mockResolvedValue([]);
    mockGetInscriptionOwner.mockResolvedValue(BOB);

    const data = await fetchAfterWarm(BLOCK);

    expect(data.objects[0].creator.address).toBe(ALICE);
    expect(data.objects[0].creator.handle).toBe('alice');
    expect(data.objects[0].createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(data.ownership.onChainOwner).toBe(BOB);
  });

  it('keeps the real total when the object list is capped', async () => {
    emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: null, label: null });
    mockObjectCount.mockResolvedValue(500);

    const data = await fetchBlockPageData(BLOCK);

    expect(data.objectCount).toBe(500);
    expect(data.objects.length).toBe(0);
  });

  it('only queries experiences the Brain has judged', async () => {
    emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: null, label: null });

    await fetchBlockPageData(BLOCK);

    expect(mockExperienceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ soulJudged: true }),
      }),
    );
    expect(mockExperienceCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ soulJudged: true }),
      }),
    );
  });

  it('only lists visible objects', async () => {
    emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: null, label: null });

    await fetchBlockPageData(BLOCK);

    expect(mockObjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ visible: true }) }),
    );
  });

  it('renders an object whose creator has no profile using the raw address', async () => {
    mockBlockFindUnique.mockResolvedValue({
      height: BLOCK,
      ownerAddress: null,
      inscriptionId: null,
      label: null,
    });
    mockObjectFindMany.mockResolvedValue([
      {
        id: 'obj1',
        objectType: 'light',
        name: null,
        ownerAddress: ALICE,
        createdAt: new Date('2026-01-02T03:04:05Z'),
      },
    ]);
    mockObjectCount.mockResolvedValue(1);
    mockParcelFindMany.mockResolvedValue([]);
    mockParcelCount.mockResolvedValue(0);
    mockExperienceFindMany.mockResolvedValue([]);
    mockExperienceCount.mockResolvedValue(0);
    mockUserFindMany.mockResolvedValue([]);
    mockProfileFindMany.mockResolvedValue([]);

    const data = await fetchBlockPageData(BLOCK);

    expect(data.objects[0].creator).toEqual({ address: ALICE, handle: null, displayName: null });
    expect(creatorLabel(data.objects[0].creator)).toBe(shortenAddress(ALICE));
  });

  it('survives an identity lookup failure without losing the builds', async () => {
    mockBlockFindUnique.mockResolvedValue({
      height: BLOCK,
      ownerAddress: ALICE,
      inscriptionId: null,
      label: null,
    });
    mockObjectFindMany.mockResolvedValue([
      {
        id: 'obj1',
        objectType: 'building',
        name: 'Tower',
        ownerAddress: ALICE,
        createdAt: new Date('2026-01-02T03:04:05Z'),
      },
    ]);
    mockObjectCount.mockResolvedValue(1);
    mockParcelFindMany.mockResolvedValue([]);
    mockParcelCount.mockResolvedValue(0);
    mockExperienceFindMany.mockResolvedValue([]);
    mockExperienceCount.mockResolvedValue(0);
    mockUserFindMany.mockRejectedValue(new Error('identity lookup failed'));
    mockProfileFindMany.mockRejectedValue(new Error('identity lookup failed'));

    const data = await fetchBlockPageData(BLOCK);

    expect(data.objects).toHaveLength(1);
    expect(data.objects[0].creator.handle).toBeNull();
  });

  it('never throws when the indexer itself throws', async () => {
    emptyBlockFixture({
      height: BLOCK,
      ownerAddress: ALICE,
      inscriptionId: INSCRIPTION,
      label: null,
    });
    mockGetInscriptionOwner.mockRejectedValue(new Error('ord exploded'));

    const data = await fetchBlockPageData(BLOCK);

    expect(data.ownership.indeterminate).toBe(true);
    expect(data.ownership.onChainOwner).toBeNull();
  });

  it('maps experiences with their creator and status', async () => {
    mockBlockFindUnique.mockResolvedValue({
      height: BLOCK,
      ownerAddress: ALICE,
      inscriptionId: null,
      label: null,
    });
    mockObjectFindMany.mockResolvedValue([]);
    mockObjectCount.mockResolvedValue(0);
    mockParcelFindMany.mockResolvedValue([]);
    mockParcelCount.mockResolvedValue(0);
    mockExperienceFindMany.mockResolvedValue([
      {
        id: 'exp1',
        name: 'Arena',
        description: 'A place',
        experienceType: 'game',
        status: 'live',
        version: '1.0.0',
        parcelIndex: 3,
        capabilities: ['multiplayer'],
        walletAddress: ALICE,
      },
    ]);
    mockExperienceCount.mockResolvedValue(1);
    mockUserFindMany.mockResolvedValue([
      { walletAddress: ALICE, handle: 'alice', displayName: 'Alice' },
    ]);
    mockProfileFindMany.mockResolvedValue([]);

    const data = await fetchBlockPageData(BLOCK);

    expect(data.experiences).toEqual([
      {
        id: 'exp1',
        name: 'Arena',
        description: 'A place',
        experienceType: 'game',
        status: 'live',
        version: '1.0.0',
        parcelIndex: 3,
        capabilities: ['multiplayer'],
        creator: { address: ALICE, handle: 'alice', displayName: 'Alice' },
      },
    ]);
  });

  it('a claimed block asks the deed rule once, within the render budget', async () => {
    emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: INSCRIPTION, label: null });

    await fetchBlockPageData(BLOCK);

    expect(mockCanonicalDeedFor).toHaveBeenCalledTimes(1);
    const [height, opts] = mockCanonicalDeedFor.mock.calls[0];
    expect(height).toBe(BLOCK);
    expect(opts.budgetMs).toBeLessThanOrEqual(300);
  });

  it('looks up the holder of the canonical deed, not of the stored id', async () => {
    const STORED = 'storedinscription0i0';
    const CANONICAL = 'canonicalinscription0i0';
    emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: STORED, label: null });
    mockCanonicalDeedFor.mockImplementation(async (h: number) => deedAnswer(h, 'canonical', CANONICAL));
    mockGetInscriptionOwner.mockImplementation(async (id: string) => (id === CANONICAL ? ALICE : BOB));

    const data = await fetchAfterWarm(BLOCK);

    const asked = mockGetInscriptionOwner.mock.calls.map((c) => c[0]);
    expect(asked).toContain(CANONICAL);
    expect(asked).not.toContain(STORED);
    expect(data.ownership.onChainOwner).toBe(ALICE);
    expect(data.ownership.inSync).toBe(true);
    expect(data.ownership.deed).toMatchObject({ verdict: 'canonical', canonicalId: CANONICAL });
    // The stored id stays on the page as the one on record.
    expect(data.ownership.inscriptionId).toBe(STORED);
  });

  it('an unclaimed block starts no deed lookup', async () => {
    emptyBlockFixture(null);

    await fetchBlockPageData(999999);

    expect(mockCanonicalDeedFor).not.toHaveBeenCalled();
    expect(mockGetInscriptionOwner).not.toHaveBeenCalled();
  });

  it('undetermined → not in sync and indeterminate, even when the stored id’s holder equals the record', async () => {
    emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: INSCRIPTION, label: null });
    mockCanonicalDeedFor.mockImplementation(async (h: number) => deedAnswer(h, 'undetermined', null, 'ord answered 403'));
    mockGetInscriptionOwner.mockResolvedValue(ALICE);

    const data = await fetchAfterWarm(BLOCK);

    expect(data.ownership.inSync).toBe(false);
    expect(data.ownership.indeterminate).toBe(true);
    expect(data.ownership.deed?.verdict).toBe('undetermined');
    expect(describeBlock(data)).not.toContain('Held by');
  });

  it('never calls verifyBlockOwnership and never writes a Block row', async () => {
    const cases: Array<() => void> = [
      () => emptyBlockFixture(null),
      () => emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: INSCRIPTION, label: null }),
      () => {
        emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: null, label: null });
        mockCanonicalDeedFor.mockImplementation(async (h: number) => deedAnswer(h, 'undetermined', null, 'ord answered 403'));
      },
    ];
    for (const setup of cases) {
      setup();
      await fetchAfterWarm(BLOCK);
    }

    expect(mockVerifyBlockOwnership).not.toHaveBeenCalled();
    expect(mockBlockWrite).not.toHaveBeenCalled();
  });

  it('skips the identity query entirely when nothing references an address', async () => {
    emptyBlockFixture(null);

    await fetchBlockPageData(BLOCK);

    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockProfileFindMany).not.toHaveBeenCalled();
  });
});

// ── OG card facts ───────────────────────────────────────────────────────

describe('fetchBlockCardFacts()', () => {
  it('returns unclaimed facts for a block with no record', async () => {
    mockBlockFindUnique.mockResolvedValue(null);
    mockObjectCount.mockResolvedValue(0);

    expect(await fetchBlockCardFacts(BLOCK)).toEqual({
      owner: null,
      verified: false,
      objectCount: 0,
      claimed: false,
    });
  });

  it('marks the card verified only on a live match with the record', async () => {
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: INSCRIPTION });
    mockObjectCount.mockResolvedValue(7);
    mockGetInscriptionOwner.mockResolvedValue(ALICE);
    // The cached deed-rule answer names the stored inscription.
    mockDeedVerdictFindUnique.mockResolvedValue({ height: BLOCK, inscriptionId: INSCRIPTION, ruleId: 'test-rule' });

    await fetchBlockCardFacts(BLOCK);
    await settleWarm();

    expect(await fetchBlockCardFacts(BLOCK)).toEqual({
      owner: ALICE,
      verified: true,
      objectCount: 7,
      claimed: true,
    });
  });

  it('keeps the record, unverified, when the live holder differs from it', async () => {
    // The card says "LAST RECORDED" for this; naming BOB under that label
    // would be false, and "HELD BY" is reserved for a confirmed record.
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: INSCRIPTION });
    mockObjectCount.mockResolvedValue(7);
    mockGetInscriptionOwner.mockResolvedValue(BOB);
    mockDeedVerdictFindUnique.mockResolvedValue({ height: BLOCK, inscriptionId: INSCRIPTION, ruleId: 'test-rule' });

    await fetchBlockCardFacts(BLOCK);
    await settleWarm();

    expect(await fetchBlockCardFacts(BLOCK)).toEqual({
      owner: ALICE,
      verified: false,
      objectCount: 7,
      claimed: true,
    });
  });

  it('falls back to the recorded owner, unverified, when the indexer is silent', async () => {
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: INSCRIPTION });
    mockObjectCount.mockResolvedValue(2);
    mockGetInscriptionOwner.mockResolvedValue(null);

    const facts = await fetchBlockCardFacts(BLOCK);
    expect(facts.owner).toBe(ALICE);
    expect(facts.verified).toBe(false);
  });

  it('never verifies a record with no inscription id on file', async () => {
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: null });
    mockObjectCount.mockResolvedValue(0);

    expect(await fetchBlockCardFacts(BLOCK)).toEqual({
      owner: ALICE,
      verified: false,
      objectCount: 0,
      claimed: true,
    });
    expect(mockGetInscriptionOwner).not.toHaveBeenCalled();
  });

  it('degrades to blank facts rather than throwing inside a crawler request', async () => {
    mockBlockFindUnique.mockRejectedValue(new Error('db down'));
    mockObjectCount.mockRejectedValue(new Error('db down'));

    expect(await fetchBlockCardFacts(BLOCK)).toEqual({
      owner: null,
      verified: false,
      objectCount: 0,
      claimed: false,
    });
  });
});

// ── The share card on the deed rule ─────────────────────────────────────

describe('fetchBlockCardFacts() on the deed rule, from cached answers only', () => {
  const STORED = 'storedcopyinscription0i0';
  const CANONICAL = 'canonicaldeedinscription0i0';

  it('a row whose stored inscription id is not the canonical deed renders "LAST RECORDED"', async () => {
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: STORED });
    mockObjectCount.mockResolvedValue(1);
    mockDeedVerdictFindUnique.mockResolvedValue({ height: BLOCK, inscriptionId: CANONICAL, ruleId: 'test-rule' });
    // The copy's holder matches the record; the deed's holder does not.
    mockGetInscriptionOwner.mockImplementation(async (id: string) => (id === STORED ? ALICE : BOB));

    await fetchBlockCardFacts(BLOCK);
    await settleWarm();
    const facts = await fetchBlockCardFacts(BLOCK);

    // verified: false is what prints "LAST RECORDED" (og/block/[height]/route.tsx).
    expect(facts).toEqual({ owner: ALICE, verified: false, objectCount: 1, claimed: true });
    expect(mockGetInscriptionOwner.mock.calls.map((c) => c[0])).not.toContain(STORED);
  });

  it('no cached deed answer: "LAST RECORDED", even when the stored id’s holder equals the record', async () => {
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: INSCRIPTION });
    mockObjectCount.mockResolvedValue(0);
    mockGetInscriptionOwner.mockResolvedValue(ALICE);

    await fetchBlockCardFacts(BLOCK);
    await settleWarm();

    expect((await fetchBlockCardFacts(BLOCK)).verified).toBe(false);
  });

  it('a stored deed answer from another rule is not used', async () => {
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: INSCRIPTION });
    mockObjectCount.mockResolvedValue(0);
    mockDeedVerdictFindUnique.mockResolvedValue({ height: BLOCK, inscriptionId: INSCRIPTION, ruleId: 'an-older-rule' });
    mockGetInscriptionOwner.mockResolvedValue(ALICE);

    await fetchBlockCardFacts(BLOCK);
    await settleWarm();

    expect((await fetchBlockCardFacts(BLOCK)).verified).toBe(false);
  });

  it('the card never starts a deed resolution', async () => {
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: INSCRIPTION });
    mockObjectCount.mockResolvedValue(0);

    await fetchBlockCardFacts(BLOCK);

    expect(mockCanonicalDeedFor).not.toHaveBeenCalled();
  });

  it('a canonical deed the page already learned in this process verifies the card without the table', async () => {
    emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: INSCRIPTION, label: null });
    mockGetInscriptionOwner.mockResolvedValue(ALICE);
    mockDeedVerdictFindUnique.mockRejectedValue(new Error('relation "DeedVerdict" does not exist'));

    await fetchAfterWarm(BLOCK);
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: INSCRIPTION });

    expect((await fetchBlockCardFacts(BLOCK)).verified).toBe(true);
    expect(mockCanonicalDeedFor).toHaveBeenCalledTimes(2); // the two page renders, none from the card
  });
});

// ── Page-started deed checks are capped ─────────────────────────────────

describe('page-started deed checks', () => {
  const COLD = 900_000;
  const budgetReason = (ms: number) => `no deed answer within ${ms} ms; the check continues in the background`;

  /** Claimed rows for any height, nothing built. */
  function claimedAnywhere() {
    emptyBlockFixture(null);
    mockBlockFindUnique.mockImplementation(async (q: { where: { height: number } }) => ({
      height: q.where.height,
      ownerAddress: ALICE,
      inscriptionId: `${q.where.height}i0`,
      label: null,
    }));
  }

  /**
   * The deed rule for a cold height: the render's short wait runs out and the
   * resolution keeps going. `watchers` collects the resolutions still running.
   */
  function coldDeedRule(watchers: Array<() => void> = []) {
    mockCanonicalDeedFor.mockImplementation((h: number, opts: { budgetMs?: number }) => {
      const ms = opts?.budgetMs ?? 8000;
      if (ms <= 300) {
        return new Promise((resolve) => setTimeout(() => resolve(deedAnswer(h, 'undetermined', null, budgetReason(ms))), 5));
      }
      return new Promise((resolve) => {
        watchers.push(() => resolve(deedAnswer(h, 'undetermined', null, 'ord answered 403')));
      });
    });
  }

  const startedHeights = () => new Set(mockCanonicalDeedFor.mock.calls.map((c) => c[0] as number));

  it('20 concurrent renders of cold claimed heights start at most 8 resolutions', async () => {
    claimedAnywhere();
    coldDeedRule();

    const pages = await Promise.all(Array.from({ length: 20 }, (_, i) => fetchBlockPageData(COLD + i)));

    expect(pages).toHaveLength(20);
    expect(startedHeights().size).toBeGreaterThan(0);
    expect(startedHeights().size).toBeLessThanOrEqual(8);
    // Every render still answers, from the states that already exist.
    for (const p of pages) {
      expect(p.claimed).toBe(true);
      expect(p.ownership.inSync).toBe(false);
      expect(p.ownership.checkPending).toBe(true);
    }
  });

  it('past the cap a render answers from the stored deed row and starts nothing', async () => {
    claimedAnywhere();
    coldDeedRule();
    await Promise.all(Array.from({ length: 8 }, (_, i) => fetchBlockPageData(COLD + i)));
    mockDeedVerdictFindUnique.mockImplementation(async (q: { where: { height: number } }) =>
      q.where.height === BLOCK ? { height: BLOCK, inscriptionId: INSCRIPTION, ruleId: 'test-rule' } : null,
    );

    const page = await fetchBlockPageData(BLOCK);

    expect(startedHeights().has(BLOCK)).toBe(false);
    expect(page.ownership.deed).toMatchObject({ verdict: 'canonical', canonicalId: INSCRIPTION });
  });

  it('a slot frees when its resolution lands', async () => {
    claimedAnywhere();
    const watchers: Array<() => void> = [];
    coldDeedRule(watchers);
    await Promise.all(Array.from({ length: 8 }, (_, i) => fetchBlockPageData(COLD + i)));

    await fetchBlockPageData(COLD + 8);
    expect(startedHeights().has(COLD + 8)).toBe(false);

    for (const done of watchers) done();
    await settleWarm();

    await fetchBlockPageData(COLD + 9);
    expect(startedHeights().has(COLD + 9)).toBe(true);
  });

  it('a render of a height already being checked joins it and takes no new slot', async () => {
    claimedAnywhere();
    coldDeedRule();
    await Promise.all(Array.from({ length: 8 }, (_, i) => fetchBlockPageData(COLD + i)));
    const before = mockCanonicalDeedFor.mock.calls.length;

    await fetchBlockPageData(COLD + 3);

    expect(mockCanonicalDeedFor.mock.calls.length).toBeGreaterThan(before);
    expect(startedHeights().size).toBe(8);
  });
});
