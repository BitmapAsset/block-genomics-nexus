/**
 * My Bitmaps reconciliation: the chain scan decides what a wallet holds, the
 * database only decides whether a held block is already verified.
 *
 * The regression this guards is audit P0-4: the old portfolio listed 7 blocks
 * from the database for a wallet that held 5 on-chain (0 and 840000 were
 * database-only).
 */

import {
  reconcileBitmaps,
  heightsToRead,
  mergeGuardians,
  parseScanResponse,
  addressType,
  describeVerifyFailure,
  isUserRejection,
  readVerifyResponse,
  recordedInscription,
  applySessionVerifications,
  describeEmptyScan,
  shortAddress,
  SCAN_CAP,
  type ChainScan,
  type WalletRecords,
} from '@/lib/my-bitmaps';

const W = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const OTHER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

const block = (height: number, id = `${height}i0`) => ({ type: 'block' as const, height, inscriptionId: id });

/** The audit's test wallet: 5 held on-chain, 7 on record (0 and 840000 extra). */
const AUDIT_SCAN: ChainScan = {
  status: 'ok',
  capped: false,
  inscriptions: [block(738505), block(718840), block(720143), block(745506), block(745966)],
};
const AUDIT_RECORDS: WalletRecords = {
  recordedHeights: [0, 718840, 720143, 738505, 745506, 745966, 840000],
  blocks: [
    { height: 718840, ownerAddress: W, inscriptionId: '718840i0' },
    { height: 720143, ownerAddress: W, inscriptionId: '720143i0' },
    { height: 738505, ownerAddress: null },
    { height: 745506, ownerAddress: W, inscriptionId: '745506i0' },
    { height: 745966, ownerAddress: OTHER, inscriptionId: '745966i0' },
  ],
  profiles: [
    { blockHeight: 720143, handle: 'pepe' },
    { blockHeight: 745506, handle: 'elonmusk' },
  ],
  guardians: [{ blockHeight: 720143, status: 'active', name: 'Ribbit' }],
};

describe('reconcileBitmaps', () => {
  it('lists exactly what the chain says the wallet holds, never the database list', () => {
    const view = reconcileBitmaps(W, AUDIT_SCAN, AUDIT_RECORDS, true);

    expect(view.held.map((c) => c.height).sort((a, b) => a - b)).toEqual([718840, 720143, 738505, 745506, 745966]);
    expect(view.counts.held).toBe(5);
  });

  it('moves database-only heights to "previously linked", not to the held grid', () => {
    const view = reconcileBitmaps(W, AUDIT_SCAN, AUDIT_RECORDS, true);

    expect(view.recordedOnly.map((c) => [c.height, c.status])).toEqual([
      [0, 'previous'],
      [840000, 'previous'],
    ]);
    expect(view.held.some((c) => c.height === 840000)).toBe(false);
  });

  it('calls a held block verified only when the record names this wallet', () => {
    const view = reconcileBitmaps(W, AUDIT_SCAN, AUDIT_RECORDS, true);
    const status = Object.fromEntries(view.held.map((c) => [c.height, c.status]));

    expect(status).toEqual({
      718840: 'verified',
      720143: 'verified',
      745506: 'verified',
      738505: 'unverified', // no Block row
      745966: 'unverified', // row names another wallet
    });
    expect(view.counts.verified).toBe(3);
  });

  it('needs the record to name the inscription the wallet holds, as the deed check does', () => {
    const records: WalletRecords = {
      recordedHeights: [1, 2, 3],
      blocks: [
        { height: 1, ownerAddress: W, inscriptionId: '1i0' },
        { height: 2, ownerAddress: W, inscriptionId: 'some-other-inscriptioni0' },
        { height: 3, ownerAddress: W, inscriptionId: null },
      ],
      profiles: [],
      guardians: [],
    };
    const view = reconcileBitmaps(W, { status: 'ok', capped: false, inscriptions: [block(1), block(2), block(3)] }, records, true);
    const byHeight = Object.fromEntries(view.held.map((c) => [c.height, c]));

    expect(byHeight[1]).toMatchObject({ status: 'verified', unlinked: false });
    expect(byHeight[2]).toMatchObject({ status: 'unverified', unlinked: true, recordedToOther: false });
    expect(byHeight[3]).toMatchObject({ status: 'unverified', unlinked: true });
  });

  // REVIEW bg57 P1-2: the ownership sync records a buyer on Block rows without
  // creating or verifying a User; such a wallet must still be offered Verify.
  it('calls nothing verified for a wallet with no verified account, even when the records match', () => {
    const view = reconcileBitmaps(W, AUDIT_SCAN, AUDIT_RECORDS, false);
    const byHeight = Object.fromEntries(view.held.map((c) => [c.height, c]));

    expect(view.counts.verified).toBe(0);
    expect(view.held.every((c) => c.status === 'unverified')).toBe(true);
    // record-only: the record names this wallet and the held inscription, no verified User
    expect(byHeight[718840]).toMatchObject({ recordOnly: true, recordedToOther: false, unlinked: false });
    expect(byHeight[720143]).toMatchObject({ recordOnly: true });
    expect(byHeight[745506]).toMatchObject({ recordOnly: true });
    // the other reasons keep their own wording
    expect(byHeight[738505]).toMatchObject({ recordOnly: false, recordedToOther: false });
    expect(byHeight[745966]).toMatchObject({ recordOnly: false, recordedToOther: true });
  });

  it('record-only match + verified account → verified', () => {
    const view = reconcileBitmaps(W, AUDIT_SCAN, AUDIT_RECORDS, true);

    expect(view.held.filter((c) => c.status === 'verified').map((c) => c.height)).toEqual([718840, 720143, 745506]);
    expect(view.held.some((c) => c.recordOnly)).toBe(false);
  });

  it('a verified account alone verifies nothing: the record must still name the held inscription', () => {
    const view = reconcileBitmaps(W, { status: 'ok', capped: false, inscriptions: [block(208)] }, { recordedHeights: [], blocks: [], profiles: [], guardians: [] }, true);

    expect(view.held[0]).toMatchObject({ height: 208, status: 'unverified', recordOnly: false });
  });

  it('flags a record that still names a previous holder', () => {
    const view = reconcileBitmaps(W, AUDIT_SCAN, AUDIT_RECORDS, true);
    const c745966 = view.held.find((c) => c.height === 745966)!;
    const c738505 = view.held.find((c) => c.height === 738505)!;

    expect(c745966.recordedToOther).toBe(true);
    expect(c738505.recordedToOther).toBe(false);
  });

  it('puts verified cards first, each group by height', () => {
    const view = reconcileBitmaps(W, AUDIT_SCAN, AUDIT_RECORDS, true);

    expect(view.held.map((c) => c.height)).toEqual([718840, 720143, 745506, 738505, 745966]);
  });

  it('carries the held inscription id, handle and guardian onto the card', () => {
    const view = reconcileBitmaps(W, AUDIT_SCAN, AUDIT_RECORDS, true);
    const card = view.held.find((c) => c.height === 720143)!;

    expect(card.inscriptionId).toBe('720143i0');
    expect(card.handle).toBe('pepe');
    expect(card.guardian).toEqual({ status: 'active', name: 'Ribbit', online: true });
    expect(view.counts.guardians).toBe(1);
  });

  it('never calls anything owned when the chain could not be asked', () => {
    for (const scan of [{ status: 'unavailable' }, { status: 'error', message: 'HTTP 429' }] as ChainScan[]) {
      const view = reconcileBitmaps(W, scan, AUDIT_RECORDS, true);

      expect(view.held).toEqual([]);
      expect(view.counts).toEqual({ held: 0, verified: 0, guardians: 0 });
      expect(view.recordedOnly.every((c) => c.status === 'unconfirmed' && c.inscriptionId === null)).toBe(true);
      expect(view.recordedOnly).toHaveLength(7);
    }
  });

  it('shows a wallet the database has never seen (unregistered bitmaps are not invisible)', () => {
    const view = reconcileBitmaps(W, { status: 'ok', capped: false, inscriptions: [block(208)] }, {
      recordedHeights: [],
      blocks: [],
      profiles: [],
      guardians: [],
    }, true);

    expect(view.held).toEqual([
      expect.objectContaining({ height: 208, status: 'unverified', inscriptionId: '208i0', recordedToOther: false }),
    ]);
  });

  it('reports a real empty wallet as empty, not as an outage', () => {
    const view = reconcileBitmaps(W, { status: 'ok', capped: false, inscriptions: [] }, { recordedHeights: [], blocks: [], profiles: [], guardians: [] }, true);

    expect(view.scan).toBe('ok');
    expect(view.held).toEqual([]);
    expect(view.recordedOnly).toEqual([]);
  });

  it('keeps one card per height when the wallet holds two inscriptions naming the same block', () => {
    const view = reconcileBitmaps(
      W,
      { status: 'ok', capped: false, inscriptions: [block(840000, 'firsti0'), block(840000, 'secondi0')] },
      { recordedHeights: [], blocks: [], profiles: [], guardians: [] },
      true,
    );

    expect(view.held).toHaveLength(1);
    expect(view.held[0].inscriptionId).toBe('firsti0');
  });

  // REVIEW bg57 P1-3: the scan reads the first 50 inscriptions and lists only
  // the bitmaps among them. A capped answer proves nothing about the rest.
  describe('when the scan may have stopped at its cap', () => {
    const capped: ChainScan = { status: 'ok', capped: true, inscriptions: [block(718840)] };

    it('files recorded heights it did not list as unscanned (maybe held), not previous', () => {
      const view = reconcileBitmaps(W, capped, AUDIT_RECORDS, true);

      expect(view.capped).toBe(true);
      expect(view.held.map((c) => c.height)).toEqual([718840]);
      expect(view.recordedOnly.map((c) => c.status)).toEqual(Array(6).fill('unscanned'));
      expect(view.recordedOnly.some((c) => c.status === 'previous')).toBe(false);
    });

    it('below the cap they are "previous": not found, never claimed held, inscription unknown', () => {
      // The response lists only matched bitmaps, so 1 listed proves nothing about
      // the rest of the wallet; the page keeps a Verify path for these too.
      const view = reconcileBitmaps(W, { ...capped, capped: false }, AUDIT_RECORDS, true);

      expect(view.capped).toBe(false);
      expect(view.recordedOnly.every((c) => c.status === 'previous' && c.inscriptionId === null)).toBe(true);
    });
  });

  it('lists parcels separately, sorted', () => {
    const view = reconcileBitmaps(
      W,
      {
        status: 'ok',
        capped: false,
        inscriptions: [
          { type: 'parcel', height: 840000, parcelIndex: 12, inscriptionId: 'p2' },
          { type: 'parcel', height: 840000, parcelIndex: 3, inscriptionId: 'p1' },
          block(5),
        ],
      },
      { recordedHeights: [], blocks: [], profiles: [], guardians: [] },
      true,
    );

    expect(view.parcels.map((p) => p.parcelIndex)).toEqual([3, 12]);
    expect(view.held.map((c) => c.height)).toEqual([5]);
  });
});

describe('applySessionVerifications', () => {
  const merge = (scan: ChainScan, done: [number, { inscriptionId: string | null; holderCheck: 'live' | 'previous' }][]) => {
    const m = applySessionVerifications(W, scan, AUDIT_RECORDS, new Map(done));
    return reconcileBitmaps(W, m.scan, m.records, true);
  };

  it('flips a held card verified just now (record rewritten to this wallet and its inscription)', () => {
    const view = merge(AUDIT_SCAN, [[738505, { inscriptionId: '738505i0', holderCheck: 'live' }]]);

    expect(view.held.find((c) => c.height === 738505)?.status).toBe('verified');
  });

  it('moves a recorded height the scan did not list into the grid after a live check of its inscription', () => {
    const scan: ChainScan = { status: 'ok', capped: false, inscriptions: [block(718840)] };
    const view = merge(scan, [[720143, { inscriptionId: '720143i0', holderCheck: 'live' }]]);

    expect(view.held.find((c) => c.height === 720143)).toMatchObject({ status: 'verified', inscriptionId: '720143i0' });
    expect(view.recordedOnly.some((c) => c.height === 720143)).toBe(false);
  });

  it('leaves it in its list when no chain check ran (previous) or no inscription was known', () => {
    const scan: ChainScan = { status: 'ok', capped: false, inscriptions: [block(718840)] };
    for (const v of [{ inscriptionId: '720143i0', holderCheck: 'previous' as const }, { inscriptionId: null, holderCheck: 'live' as const }]) {
      const view = merge(scan, [[720143, v]]);

      expect(view.held.some((c) => c.height === 720143)).toBe(false);
      expect(view.recordedOnly.some((c) => c.height === 720143)).toBe(true);
    }
  });

  it('changes nothing without a verification', () => {
    const m = applySessionVerifications(W, AUDIT_SCAN, AUDIT_RECORDS, new Map());
    expect(m).toEqual({ scan: AUDIT_SCAN, records: AUDIT_RECORDS });
  });
});

describe('recordedInscription', () => {
  const row = (data: Record<string, unknown>) => ({ success: true, data: { height: 720143, ...data } });

  it('gives the inscription on record when the row names this wallet', () => {
    expect(recordedInscription(W, 200, row({ ownerAddress: W, inscriptionId: 'abci0' }))).toBe('abci0');
  });

  it('gives nothing for a row naming another wallet, no inscription, no row or an error', () => {
    expect(recordedInscription(W, 200, row({ ownerAddress: OTHER, inscriptionId: 'abci0' }))).toBeNull();
    expect(recordedInscription(W, 200, row({ ownerAddress: W, inscriptionId: null }))).toBeNull();
    expect(recordedInscription(W, 200, row({ ownerAddress: W, inscriptionId: '' }))).toBeNull();
    expect(recordedInscription(W, 404, { success: false, error: 'Block not found' })).toBeNull();
    expect(recordedInscription(W, 500, null)).toBeNull();
  });
});

describe('heightsToRead', () => {
  it('skips held heights with no record anywhere (they would only 404)', () => {
    expect(heightsToRead([1, 2, 3], [2, 99], [])).toEqual([2]);
  });

  it('always reads heights recorded to this wallet, even if the claimed list misses them', () => {
    expect(heightsToRead([1, 2, 3], [], [3])).toEqual([3]);
  });

  it('reads every held height when there is no usable claimed list', () => {
    expect(heightsToRead([1, 2, 3], null, [])).toEqual([1, 2, 3]);
  });
});

describe('mergeGuardians', () => {
  it('finds a guardian the owner-keyed list missed (malformed owner field)', () => {
    expect(mergeGuardians([], [{ blockHeight: 720143, status: 'active', name: 'Guardian #720143' }])).toEqual([
      { blockHeight: 720143, status: 'active', name: 'Guardian #720143' },
    ]);
  });

  it('keeps one guardian per block, preferring the per-block answer', () => {
    expect(
      mergeGuardians(
        [{ blockHeight: 1, status: 'paused', name: 'Old' }, { blockHeight: 2, status: 'active', name: 'B' }],
        [{ blockHeight: 1, status: 'active', name: 'New' }],
      ),
    ).toEqual([
      { blockHeight: 1, status: 'active', name: 'New' },
      { blockHeight: 2, status: 'active', name: 'B' },
    ]);
  });
});

describe('parseScanResponse', () => {
  it('reads a successful scan', () => {
    const scan = parseScanResponse(200, {
      success: true,
      data: {
        inscriptions: [
          { type: 'block', height: 720143, inscriptionId: 'abci0', label: '720,143.bitmap' },
          { type: 'parcel', height: 1, parcelIndex: 2, inscriptionId: 'defi0', label: '1:2.bitmap' },
        ],
        count: 2,
      },
    });

    expect(scan).toEqual({
      status: 'ok',
      capped: false,
      inscriptions: [
        { type: 'block', height: 720143, inscriptionId: 'abci0' },
        { type: 'parcel', height: 1, parcelIndex: 2, inscriptionId: 'defi0' },
      ],
    });
  });

  it('flags a scan that listed SCAN_CAP bitmaps as capped (it may have stopped early)', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'block', height: 700000 + i, inscriptionId: `${i}i0` }));
    expect(parseScanResponse(200, { success: true, data: { inscriptions: rows(50), count: 50 } })).toMatchObject({ status: 'ok', capped: true });
    expect(parseScanResponse(200, { success: true, data: { inscriptions: rows(49), count: 49 } })).toMatchObject({ status: 'ok', capped: false });
    // the count field is what the response exposes; trust it if it says more than it lists
    expect(parseScanResponse(200, { success: true, data: { inscriptions: rows(1), count: 50 } })).toMatchObject({ capped: true });
    // malformed rows still count toward the cap: the server read them
    expect(parseScanResponse(200, { success: true, data: { inscriptions: [...rows(49), { type: 'block', height: 'x' }] } })).toMatchObject({ capped: true });
    expect(SCAN_CAP).toBe(50);
  });

  it('treats 503 onchain_unavailable as an outage, not as an empty wallet', () => {
    expect(parseScanResponse(503, { success: false, code: 'onchain_unavailable' })).toEqual({ status: 'unavailable' });
  });

  it('treats a rate limit or a 500 as an error with the server message', () => {
    expect(parseScanResponse(429, { success: false, error: 'Rate limit exceeded' })).toEqual({
      status: 'error',
      message: 'Rate limit exceeded',
    });
    expect(parseScanResponse(500, null)).toEqual({ status: 'error', message: 'HTTP 500' });
  });

  it('drops malformed rows instead of inventing heights', () => {
    const scan = parseScanResponse(200, {
      success: true,
      data: { inscriptions: [{ type: 'block', height: '7', inscriptionId: 'x' }, { type: 'brc20', height: 1, inscriptionId: 'y' }] },
    });

    expect(scan).toEqual({ status: 'ok', capped: false, inscriptions: [] });
  });
});

describe('addressType', () => {
  it.each([
    ['bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297', 'taproot'],
    [W, 'taproot'],
    ['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'native-segwit'],
    ['bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3', 'native-segwit'],
    ['3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'nested-segwit'],
    ['1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'legacy'],
    ['tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'unknown'],
    ['not an address', 'unknown'],
  ])('%s → %s', (addr, expected) => {
    expect(addressType(addr)).toBe(expected);
  });
});

// REVIEW bg57-r2 P1-3: `count` is the number of bitmaps listed, so a wallet
// whose bitmaps all sit past the first 50 inscriptions answers `count: 0`,
// below the cap. The empty state must not state an empty wallet as a chain fact.
describe('describeEmptyScan', () => {
  it('owner wallet, scan {inscriptions: [], count: 0}: hedged, nothing asserted about the chain', () => {
    const scan = parseScanResponse(200, { success: true, data: { inscriptions: [], count: 0 } });
    const view = reconcileBitmaps(W, scan, AUDIT_RECORDS, true);

    // below the cap, no block listed: the empty state, above the 7 recorded heights
    expect(view).toMatchObject({ scan: 'ok', capped: false, held: [] });
    expect(view.recordedOnly.map((c) => c.status)).toEqual(Array(7).fill('previous'));

    const copy = describeEmptyScan(W, 'Unisat');
    expect(copy.heading).toBe('No bitmaps found');
    expect(copy.body).toBe(
      "No .bitmap inscription found in the first 50 inscriptions at bc1ps8…ae8978. The scan reads only that many, so a bitmap further in isn't listed here. If yours sits in another wallet, connect that one.",
    );
    expect(`${copy.heading} ${copy.body}`).not.toMatch(/in this wallet|chain shows|no \.bitmap inscription at/i);
  });

  it('keeps the address-type hint for a SegWit wallet', () => {
    const copy = describeEmptyScan(OTHER, 'Xverse');

    expect(copy.body).toMatch(/^No \.bitmap inscription found in the first 50 inscriptions at bc1qar…wf5mdq\. The scan reads only that many/);
    expect(copy.body).toContain(
      'Bitmaps usually sit on a Taproot address (bc1p…), and Xverse connected with its Native SegWit address. Switch Xverse to your Taproot or Ordinals address, then connect again.',
    );
  });

  it('a capped scan with no block (50 parcels) reaches the same empty state; the words take no cap input', () => {
    const parcels = Array.from({ length: 50 }, (_, i) => ({ type: 'parcel', height: 718840, parcelIndex: i, inscriptionId: `p${i}i0` }));
    const view = reconcileBitmaps(W, parseScanResponse(200, { success: true, data: { inscriptions: parcels, count: 50 } }), AUDIT_RECORDS, true);

    expect(view).toMatchObject({ scan: 'ok', capped: true, held: [] });
    expect(view.recordedOnly.map((c) => c.status)).toEqual(Array(7).fill('unscanned'));
    expect(describeEmptyScan).toHaveLength(2); // (address, walletName)
    expect(shortAddress(W)).toBe('bc1ps8…ae8978');
  });
});

describe('describeVerifyFailure', () => {
  it('says a declined prompt recorded nothing', () => {
    const f = describeVerifyFailure(720143, new Error('User rejected the request.'));
    expect(f.kind).toBe('rejected');
    expect(f.message).toMatch(/declined/);
    expect(f.message).toMatch(/Nothing was recorded/);
  });

  it('separates an indexer outage (retry) from not holding the block (no retry)', () => {
    expect(describeVerifyFailure(720143, new Error('x'), 503)).toMatchObject({ kind: 'chain-unavailable', retryable: true });
    const notHeld = describeVerifyFailure(720143, new Error('x'), 403);
    expect(notHeld).toMatchObject({ kind: 'not-held', retryable: false });
    expect(notHeld.message).toContain('720143.bitmap');
  });

  it('says "not found in the first 50", not "not held", when the server only scanned (no inscription id sent)', () => {
    const f = describeVerifyFailure(720143, new Error('No .bitmap inscription for block 720143 found in this wallet.'), 403, { byScan: true });

    expect(f).toMatchObject({ kind: 'not-held', retryable: false });
    expect(f.message).toContain('first 50 inscriptions');
    expect(f.message).not.toMatch(/doesn't hold/);
    expect(readVerifyResponse(720143, 403, { success: false }, { byScan: true })).toMatchObject({ ok: false, failure: { message: f.message } });
  });

  it('maps 401 to a fresh-signature retry', () => {
    expect(describeVerifyFailure(1, new Error('Invalid signature'), 401)).toMatchObject({ kind: 'expired', retryable: true });
  });

  it('recognises the rejection wording of the supported wallets', () => {
    for (const msg of ['User rejected the request', 'Request denied', 'User declined', 'User cancelled', 'user closed the popup']) {
      expect(isUserRejection(new Error(msg))).toBe(true);
    }
    expect(isUserRejection(new Error('Network error'))).toBe(false);
  });
});

// REVIEW bg57 P1-4: auth/verify answers 200 with holderCheck 'none' when it
// checked no block (height 0 today). That must not read "Verified just now".
describe('readVerifyResponse', () => {
  const ok = (data: Record<string, unknown>) => ({ success: true, data: { verified: true, walletAddress: W, tier: 1, ...data } });

  it('accepts a live holder check for this block', () => {
    expect(readVerifyResponse(738505, 200, ok({ anchorBlock: 738505, holderCheck: 'live' }))).toEqual({ ok: true, holderCheck: 'live' });
  });

  it('accepts a previous verification of this block', () => {
    expect(readVerifyResponse(720143, 200, ok({ anchorBlock: 720143, holderCheck: 'previous' }))).toEqual({ ok: true, holderCheck: 'previous' });
  });

  it('rejects the 200 the route gives for 0.bitmap (holderCheck none, another anchor, tier 3)', () => {
    const out = readVerifyResponse(0, 200, ok({ handle: 'elonmusk', tier: 3, anchorBlock: 745506, holderCheck: 'none' }));

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe('unchecked');
    expect(out.failure.message).toMatch(/^Couldn't verify this block\./);
    expect(out.failure.message).toContain('0.bitmap');
    expect(out.failure.message).not.toMatch(/Verified just now|Recorded on|chain confirms/);
  });

  it('rejects a 200 that does not say how the holder was checked', () => {
    for (const data of [{}, { holderCheck: 'LIVE' }, { holderCheck: true }]) {
      expect(readVerifyResponse(718840, 200, ok(data))).toMatchObject({ ok: false, failure: { kind: 'unchecked' } });
    }
    expect(readVerifyResponse(718840, 200, null)).toMatchObject({ ok: false });
  });

  it('rejects an answer about another block', () => {
    const out = readVerifyResponse(718840, 200, ok({ anchorBlock: 720143, holderCheck: 'live' }));

    expect(out).toMatchObject({ ok: false, failure: { kind: 'unchecked' } });
    if (!out.ok) expect(out.failure.message).toContain('720143.bitmap, not 718840.bitmap');
  });

  it('keeps the honest failure for every error status', () => {
    expect(readVerifyResponse(1, 403, { success: false, error: 'Ownership verification failed' })).toMatchObject({ ok: false, failure: { kind: 'not-held' } });
    expect(readVerifyResponse(1, 503, { success: false })).toMatchObject({ ok: false, failure: { kind: 'chain-unavailable' } });
    expect(readVerifyResponse(1, 401, { success: false, error: 'Invalid signature' })).toMatchObject({ ok: false, failure: { kind: 'expired' } });
    expect(readVerifyResponse(1, 200, { success: false, error: 'Odd' })).toMatchObject({ ok: false, failure: { kind: 'other', message: 'Odd' } });
  });
});
