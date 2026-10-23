/**
 * Deed card copy: a chain outage says so.
 *
 * Before 2026-10-22 an unreachable chain rendered the same "Unverified" badge
 * as a deed nobody could vouch for. Every state keeps its own copy, and the
 * outage state names when answers stopped and when the deed was last verified.
 */

import { deedStatus, formatChainTime } from '@/app/block/[height]/deed-status';
import { resolveOwnership, type DeedAvailability } from '@/lib/blockPageData';

const ALICE = 'bc1palice';
const BOB = 'bc1pbob';
const INSCRIPTION = 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0';
const record = { ownerAddress: ALICE, inscriptionId: INSCRIPTION };

const down = (lastVerifiedAt: string | null): DeedAvailability => ({
  chain: 'unavailable',
  unavailableSince: '2026-10-22T23:36:49.000Z',
  lastVerifiedAt,
});

describe('deed card when the chain is unreachable', () => {
  it('says "Chain unreachable since <t>, last verified <t>" instead of "Unverified"', () => {
    const s = deedStatus(resolveOwnership(record, null, false, down('2026-10-22T21:05:00.000Z')));
    expect(s.badge).toBe('Chain unreachable');
    expect(s.tone).toBe('outage');
    expect(s.detail).toMatch(/^Chain unreachable since 2026-10-22 23:36 UTC, last verified 2026-10-22 21:05 UTC\./);
    expect(s.detail).toContain('last recorded holder');
    expect(s.badge).not.toBe('Unverified');
  });

  it('leaves out "last verified" when this server never saw a good answer', () => {
    const s = deedStatus(resolveOwnership(record, null, false, down(null)));
    expect(s.badge).toBe('Chain unreachable');
    expect(s.detail).toMatch(/^Chain unreachable since 2026-10-22 23:36 UTC\. /);
    expect(s.detail).not.toContain('last verified');
  });
});

describe('the other states keep their copy', () => {
  it('verified', () => {
    expect(deedStatus(resolveOwnership(record, ALICE))).toMatchObject({ badge: 'Verified on-chain', tone: 'verified' });
  });

  it('chain moved ahead of the registry', () => {
    const s = deedStatus(resolveOwnership(record, BOB, false, { chain: 'ok', unavailableSince: null, lastVerifiedAt: null }));
    expect(s.badge).toBe('Unverified');
    expect(s.detail).toContain('Live holder on-chain');
  });

  it('still checking beats an older outage record', () => {
    const s = deedStatus(resolveOwnership(record, null, true, down(null)));
    expect(s.badge).toBe('Checking');
  });

  it('no inscription on file is never called an outage', () => {
    const s = deedStatus(resolveOwnership({ ownerAddress: ALICE, inscriptionId: null }, null, false, down(null)));
    expect(s.badge).toBe('Unverified');
    expect(s.detail).toContain('no inscription id on file');
  });

  it('no availability record falls back to the plain unverified copy', () => {
    const s = deedStatus(resolveOwnership(record, null));
    expect(s.badge).toBe('Unverified');
    expect(s.detail).toContain('could not be reached');
  });
});

it('formats chain times in one fixed zone', () => {
  expect(formatChainTime('2026-10-22T23:36:49.123Z')).toBe('2026-10-22 23:36 UTC');
});
