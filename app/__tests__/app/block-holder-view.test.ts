/**
 * The holder rule and the "Your deed" holder status line (bg98a2), both pure.
 *
 * (a) `isHolderWallet` is exactly the rule bg95's OwnerBar used (typed out
 * below), including the empty-address rows; (b) every row of the holder line,
 * on ownerships built by `resolveDeedOwnership`; (c) "You hold this deed" only
 * on the deed rule; (d) an unclaimed block has no holder.
 */

import { displayOwner, resolveDeedOwnership, verifiedOnDeedRule, type BlockOwnership } from '@/lib/blockPageData';
import { deedStatus } from '@/app/(site)/block/[height]/deed-status';
import { holderDeedLine, isHolderWallet } from '@/app/(site)/block/[height]/holder-view';

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const HEIGHT = 612888;
const A = 'bc1pholderviewexampleaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const B = 'bc1pholderviewexamplebbbbbbbbbbbbbbbbbbbbbbbbbbb2';
const STORED = 'storedinscriptionforholderview0i0';
const RECORD_LINE = 'On record for your wallet · not checked';

/** bg95's OwnerBar rule, as it was in owner-bar.tsx. */
function ownerBarRule(w: { isConnected: boolean; walletAddress: string | null }, o: { onChainOwner: string | null; registeredOwner: string | null }) {
  if (!w.isConnected || !w.walletAddress) return false;
  const holds = o.onChainOwner === w.walletAddress;
  const recordedOnly = o.onChainOwner === null && o.registeredOwner === w.walletAddress;
  return holds || recordedOnly;
}

describe('isHolderWallet: the OwnerBar rule, row by row', () => {
  const wallets: (string | null)[] = [null, '', A, B];
  const owners: (string | null)[] = [null, A, B];
  const rows: [boolean, string | null, string | null, string | null][] = [];
  for (const isConnected of [true, false])
    for (const walletAddress of wallets)
      for (const onChainOwner of owners) for (const registeredOwner of owners) rows.push([isConnected, walletAddress, onChainOwner, registeredOwner]);

  it('covers the empty-address rows', () => {
    expect(rows.filter((r) => r[1] === '').length).toBe(18);
    expect(rows).toHaveLength(72);
  });

  it.each(rows)('connected %s · wallet %p · on chain %p · record %p', (isConnected, walletAddress, onChainOwner, registeredOwner) => {
    const w = { isConnected, walletAddress };
    const o = { onChainOwner, registeredOwner };
    expect(isHolderWallet(w, o)).toBe(ownerBarRule(w, o));
  });

  it('an empty address is never a holder, even against an empty record', () => {
    expect(isHolderWallet({ isConnected: true, walletAddress: '' }, { onChainOwner: null, registeredOwner: '' })).toBe(false);
  });

  it('compares exact strings, no case folding', () => {
    expect(isHolderWallet({ isConnected: true, walletAddress: A.toUpperCase() }, { onChainOwner: A, registeredOwner: A })).toBe(false);
  });
});

describe('an unclaimed block has no holder', () => {
  it.each([null, '', A])('wallet %p', (walletAddress) => {
    const o = { onChainOwner: null, registeredOwner: null };
    expect(displayOwner({ ...o, inscriptionId: null, inSync: false, indeterminate: true, checkPending: false })).toBeNull();
    expect(isHolderWallet({ isConnected: true, walletAddress }, o)).toBe(false);
  });
});

// ── Ownerships for every deed key, through the deed rule ──

const deedAt = (verdict: 'canonical' | 'disputed' | 'none' | 'undetermined', reason?: string) => ({
  height: HEIGHT,
  inscriptionId: verdict === 'canonical' ? STORED : null,
  ruleId: 'test-rule',
  verdict,
  resolvedAt: new Date(NOW).toISOString(),
  ...(reason ? { reason } : {}),
  source: 'resolver',
});
const okChain = () => ({ chain: 'ok' as const, checkedAt: null, lastVerifiedAt: null, unavailableSince: null });
const unchecked = () => ({ chain: 'unchecked' as const, checkedAt: null, lastVerifiedAt: null, unavailableSince: null });

function own(
  record: { ownerAddress: string | null; inscriptionId: string | null },
  verdict: 'canonical' | 'disputed' | 'none' | 'undetermined',
  holder: { address: string | null; pending: boolean; checkedAt?: string } = { address: null, pending: false },
  reason?: string,
): BlockOwnership {
  return resolveDeedOwnership(record, deedAt(verdict, reason) as Parameters<typeof resolveDeedOwnership>[1], () => holder, holder.address ? okChain : unchecked);
}

const FOUR_MIN = new Date(NOW - 4 * 60_000).toISOString();

const CASES: { name: string; o: BlockOwnership; key: string; line: string | null }[] = [
  { name: 'verified with its age', o: own({ ownerAddress: A, inscriptionId: STORED }, 'canonical', { address: A, pending: false, checkedAt: FOUR_MIN }), key: 'verified', line: 'You hold this deed · checked 4 min ago' },
  { name: 'verified without a check time', o: own({ ownerAddress: A, inscriptionId: STORED }, 'canonical', { address: A, pending: false }), key: 'verified', line: 'You hold this deed' },
  { name: 'registry behind', o: own({ ownerAddress: B, inscriptionId: STORED }, 'canonical', { address: A, pending: false, checkedAt: FOUR_MIN }), key: 'registry-behind', line: null },
  { name: 'disputed', o: own({ ownerAddress: A, inscriptionId: STORED }, 'disputed'), key: 'disputed', line: null },
  { name: 'no deed found', o: own({ ownerAddress: A, inscriptionId: STORED }, 'none'), key: 'no-deed-found', line: null },
  { name: 'unreachable', o: own({ ownerAddress: A, inscriptionId: STORED }, 'undetermined', undefined, 'ord answered 403'), key: 'unreachable', line: RECORD_LINE },
  { name: 'checking', o: own({ ownerAddress: A, inscriptionId: STORED }, 'undetermined', undefined, 'no deed answer within 800 ms'), key: 'checking', line: RECORD_LINE },
  { name: 'no deed on file', o: own({ ownerAddress: A, inscriptionId: null }, 'undetermined', undefined, 'ord answered 403'), key: 'no-deed-on-file', line: RECORD_LINE },
];

describe('holderDeedLine: one line per deed key', () => {
  it.each(CASES.map((c) => [c.name, c]))('%s', (_n, c) => {
    const status = deedStatus(c.o, NOW);
    expect(status.key).toBe(c.key);
    expect(holderDeedLine(c.o, status, NOW)).toBe(c.line);
  });

  it('covers every deed key', () => {
    expect(new Set(CASES.map((c) => c.key)).size).toBe(7);
  });

  it('"You hold this deed" only when the deed rule holds', () => {
    for (const c of CASES) {
      const line = holderDeedLine(c.o, deedStatus(c.o, NOW), NOW) ?? '';
      expect(line.startsWith('You hold this deed')).toBe(verifiedOnDeedRule(c.o));
    }
  });

  it('a "verified" key without the deed rule keeps the visitor text', () => {
    const o = own({ ownerAddress: A, inscriptionId: STORED }, 'disputed');
    expect(holderDeedLine(o, { key: 'verified', badge: 'x', tone: 'verified', detail: 'x' }, NOW)).toBeNull();
  });

  it('a long age is said in full (no cap)', () => {
    const o = own({ ownerAddress: A, inscriptionId: STORED }, 'canonical', { address: A, pending: false, checkedAt: new Date(NOW - 123 * 86_400_000).toISOString() });
    expect(holderDeedLine(o, deedStatus(o, NOW), NOW)).toBe('You hold this deed · checked 123 days ago');
  });
});
