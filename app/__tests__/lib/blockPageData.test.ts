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

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    block: { findUnique: (...a: unknown[]) => mockBlockFindUnique(...a) },
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
  },
}));

jest.mock('@/lib/ownership-sync', () => ({
  getInscriptionOwner: (...a: unknown[]) => mockGetInscriptionOwner(...a),
}));

jest.mock('@/lib/blockOgData', () => ({
  fetchBlockOgSummary: (...a: unknown[]) => mockFetchOgSummary(...a),
}));

import {
  fetchBlockPageData,
  fetchBlockCardFacts,
  resolveOwnership,
  buildCreatorIndex,
  describeBlock,
  displayOwner,
  shortenAddress,
  creatorLabel,
  type BlockPageData,
} from '@/lib/blockPageData';
import { __resetPublicOwnerLookup } from '@/lib/publicOwnerLookup';

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

beforeEach(() => {
  jest.clearAllMocks();
  __resetPublicOwnerLookup();
  mockFetchOgSummary.mockResolvedValue(null);
  mockGetInscriptionOwner.mockResolvedValue(null);
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

  it('says Unclaimed only when we actually looked and found no owner', () => {
    expect(describeBlock(data())).toBe('Unclaimed');
  });

  it('stays silent about ownership when the lookup was degraded', () => {
    // The regression this guards: a database blip must never publish
    // "Unclaimed" about a block somebody owns.
    expect(describeBlock(data({ degraded: true }))).toBe('');
    expect(describeBlock(data({ degraded: true }))).not.toContain('Unclaimed');
  });

  it('names the holder when there is one', () => {
    const out = describeBlock(
      data({ ownership: resolveOwnership({ ownerAddress: ALICE, inscriptionId: INSCRIPTION }, ALICE) }),
    );
    expect(out).toBe(`Held by ${shortenAddress(ALICE)}`);
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

  it('does not call the indexer for a block with no inscription', async () => {
    emptyBlockFixture({ height: BLOCK, ownerAddress: ALICE, inscriptionId: null, label: null });

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
      objectCount: 0,
      claimed: false,
    });
  });

  it('prefers the live deed holder for the card', async () => {
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: INSCRIPTION });
    mockObjectCount.mockResolvedValue(7);
    mockGetInscriptionOwner.mockResolvedValue(BOB);

    await fetchBlockCardFacts(BLOCK);
    await settleWarm();

    expect(await fetchBlockCardFacts(BLOCK)).toEqual({
      owner: BOB,
      objectCount: 7,
      claimed: true,
    });
  });

  it('falls back to the recorded owner when the indexer is silent', async () => {
    mockBlockFindUnique.mockResolvedValue({ ownerAddress: ALICE, inscriptionId: INSCRIPTION });
    mockObjectCount.mockResolvedValue(2);
    mockGetInscriptionOwner.mockResolvedValue(null);

    expect((await fetchBlockCardFacts(BLOCK)).owner).toBe(ALICE);
  });

  it('degrades to blank facts rather than throwing inside a crawler request', async () => {
    mockBlockFindUnique.mockRejectedValue(new Error('db down'));
    mockObjectCount.mockRejectedValue(new Error('db down'));

    expect(await fetchBlockCardFacts(BLOCK)).toEqual({
      owner: null,
      objectCount: 0,
      claimed: false,
    });
  });
});
