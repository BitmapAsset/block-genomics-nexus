/**
 * Deed chip copy on the deed rule (bg95, PLAN-bg95 §7).
 *
 * The chip turns green only when the deed rule named the canonical deed, its
 * holder answered, and that holder equals the record. Every other state keeps
 * its own copy: checking (and only while a check runs), not checked because
 * Bitcoin could not be reached (with the time), not checked because no deed is
 * on file, disputed, and the registry behind the chain.
 */

import { deedStatus, formatChainTime, ageOf } from '@/app/(site)/block/[height]/deed-status';
import * as pageData from '@/lib/blockPageData';
import type { BlockOwnership } from '@/lib/blockPageData';
import type { CanonicalDeed } from '@/lib/onchain/deed';

const { resolveOwnership } = pageData;
// Absent on code before bg95; the cases that need it fail rather than crash the file.
const resolveDeedOwnership = (pageData as Record<string, unknown>).resolveDeedOwnership as
  | ((...a: unknown[]) => BlockOwnership)
  | undefined;

const ALICE = 'bc1palice';
const BOB = 'bc1pbob';
const STORED = 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0';
const CANON = 'aa11bb22cc33dd44ee55ff6677889900aa11bb22cc33dd44ee55ff6677889900i0';
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const record = { ownerAddress: ALICE, inscriptionId: STORED };

function deed(verdict: CanonicalDeed['verdict'], over: Partial<CanonicalDeed> = {}): CanonicalDeed {
  return {
    height: 612888,
    inscriptionId: verdict === 'canonical' ? CANON : null,
    ruleId: 'test-rule',
    verdict,
    resolvedAt: '2026-11-02T11:40:12.000Z',
    source: 'memory',
    ...over,
  };
}

const holder = (address: string | null, pending = false) => jest.fn(() => ({ address, pending }));
const avail = (over: Record<string, unknown> = {}) =>
  jest.fn(() => ({ chain: 'unchecked', checkedAt: null, lastVerifiedAt: null, unavailableSince: null, ...over }));

function owned(d: CanonicalDeed, h = holder(null), a = avail(), rec: { ownerAddress: string | null; inscriptionId: string | null } = record) {
  if (!resolveDeedOwnership) throw new Error('resolveDeedOwnership is missing');
  return resolveDeedOwnership(rec, d, h, a);
}

describe('green only on the deed rule', () => {
  it('verified: canonical deed, holder answered, equals the record → green with its age', () => {
    const s = deedStatus(owned(deed('canonical'), holder(ALICE), avail({ chain: 'ok', checkedAt: new Date(NOW - 7 * 60_000).toISOString() })), NOW);
    expect(s.tone).toBe('verified');
    expect(s.badge).toBe('Verified on Bitcoin · 7 min ago');
  });

  it('no green when the verdict is undetermined, even if the stored id’s holder equals the record', () => {
    // Before bg95 the page asked about the stored id and turned green here.
    const stored = resolveOwnership(record, ALICE);
    const undetermined: BlockOwnership = {
      ...stored,
      deed: { verdict: 'undetermined', canonicalId: null, checkedAt: null, unreachableSince: '2026-11-02T11:40:12.000Z' },
    };
    expect(deedStatus(undetermined, NOW).tone).not.toBe('verified');
    expect(deedStatus(stored, NOW).tone).not.toBe('verified');
  });

  it('the holder is looked up for the canonical id, never the stored one', () => {
    const h = holder(ALICE);
    owned(deed('canonical'), h);
    expect(h).toHaveBeenCalledWith(CANON);
    expect(h).not.toHaveBeenCalledWith(STORED);
  });

  it('no green for a verdict other than canonical, whatever else is set', () => {
    for (const v of ['undetermined', 'disputed', 'none'] as const) {
      expect(deedStatus(owned(deed(v), holder(ALICE)), NOW).tone).not.toBe('verified');
    }
  });
});

describe('every other state of PLAN §7', () => {
  it('checking: a holder lookup started this request', () => {
    const s = deedStatus(owned(deed('canonical'), holder(null, true)), NOW);
    expect(s.badge).toBe('Checking…');
    expect(s.tone).toBe('neutral');
    expect(s.detail).not.toMatch(/updates on its own/);
  });

  it('checking: the deed rule ran out of the render budget and keeps resolving', () => {
    const d = deed('undetermined', { reason: 'no deed answer within 300 ms; the check continues in the background', source: 'resolver' });
    expect(deedStatus(owned(d), NOW).badge).toBe('Checking…');
  });

  it('not checked: indexer unreachable since HH:MM UTC (deed rule failed)', () => {
    const s = deedStatus(owned(deed('undetermined', { reason: 'ord answered 403' })), NOW);
    expect(s.badge).toBe('Not checked · Bitcoin indexer unreachable since 11:40 UTC');
    expect(s.tone).toBe('outage');
    expect(s.detail).toContain('Last recorded holder');
  });

  it('not checked: indexer unreachable since HH:MM UTC (holder lookup failed)', () => {
    const s = deedStatus(
      owned(deed('canonical'), holder(null), avail({ chain: 'unavailable', unavailableSince: '2026-11-02T09:05:00.000Z', lastVerifiedAt: '2026-11-01T21:05:00.000Z' })),
      NOW,
    );
    expect(s.badge).toBe('Not checked · Bitcoin indexer unreachable since 09:05 UTC');
    expect(s.detail).toContain('Last verified 2026-11-01 21:05 UTC');
  });

  it('not checked: no deed on file', () => {
    const s = deedStatus(owned(deed('undetermined', { reason: 'ord answered 403' }), holder(null), avail(), { ownerAddress: ALICE, inscriptionId: null }), NOW);
    expect(s.badge).toBe('Not checked · no deed on file');
    expect(s.tone).toBe('neutral');
  });

  it('disputed', () => {
    const s = deedStatus(owned(deed('disputed')), NOW);
    expect(s.badge).toBe('Deed disputed · under review');
    expect(s.tone).toBe('outage');
  });

  it('registry behind: canonical holder answered and differs from the record', () => {
    const s = deedStatus(owned(deed('canonical'), holder(BOB), avail({ chain: 'ok' })), NOW);
    expect(s.badge).toBe('Holder on Bitcoin · record catching up');
    expect(s.tone).toBe('neutral');
  });

  it('no copy says "live"', () => {
    const all = [
      owned(deed('canonical'), holder(ALICE)),
      owned(deed('canonical'), holder(BOB)),
      owned(deed('canonical'), holder(null, true)),
      owned(deed('undetermined')),
      owned(deed('disputed')),
      owned(deed('none')),
      owned(deed('undetermined'), holder(null), avail(), { ownerAddress: ALICE, inscriptionId: null }),
    ].map((o) => deedStatus(o, NOW));
    for (const s of all) expect(`${s.badge} ${s.detail}`).not.toMatch(/\blive\b/i);
  });
});

it('formats chain times in one fixed zone', () => {
  expect(formatChainTime('2026-10-22T23:36:49.123Z')).toBe('2026-10-22 23:36 UTC');
});

it('ages', () => {
  expect(ageOf(new Date(NOW - 20_000).toISOString(), NOW)).toBe('just now');
  expect(ageOf(new Date(NOW - 7 * 60_000).toISOString(), NOW)).toBe('7 min ago');
  expect(ageOf(new Date(NOW - 5 * 3_600_000).toISOString(), NOW)).toBe('5 h ago');
});
