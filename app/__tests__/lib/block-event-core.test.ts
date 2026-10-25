/**
 * `bg-event/1` core: the chain, the hash, the ids, the system key, the summaries.
 * Pure functions only; the emitter and routes have their own suites.
 */

import { ed25519 } from '@noble/curves/ed25519';
import {
  GENESIS_PREV,
  SUMMARY_MAX,
  BLOCK_EVENT_KINDS,
  ULID_RE,
  eventHash,
  keyId,
  parseSystemKey,
  publishedKeys,
  sha256Tagged,
  signEd25519,
  summaryFor,
  ulid,
  verifyChain,
  verifyEd25519,
  type ChainRow,
} from '@/lib/block-event-core';

/** Build a valid chain of `n` synthetic events on one block. */
function syntheticChain(n: number, block = 718840): ChainRow[] {
  const rows: ChainRow[] = [];
  let prev = GENESIS_PREV;
  const t0 = Date.UTC(2026, 9, 23, 0, 0, 0);
  for (let seq = 1; seq <= n; seq++) {
    const ts = new Date(t0 + seq * 1000).toISOString();
    const base = {
      id: ulid(t0 + seq * 1000),
      block,
      seq,
      kind: BLOCK_EVENT_KINDS[seq % BLOCK_EVENT_KINDS.length],
      actor: { type: 'owner' as const, id: 'bc1pexampleholder', handle: null },
      signer: { scheme: 'ed25519' as const, address: 'bg-sys-0123456789abcdef' },
      summary: `Synthetic event ${seq}`,
      payloadHash: sha256Tagged(`payload ${seq}`),
      prev,
      ts,
    };
    const hash = eventHash(base);
    rows.push({ ...base, hash });
    prev = hash;
  }
  return rows;
}

describe('the per-block hash chain', () => {
  it('verifies over 1,000 synthetic events', () => {
    const rows = syntheticChain(1000);
    const res = verifyChain(rows);
    expect(res).toEqual({ ok: true, checked: 1000, head: rows[999].hash });
  });

  it('fails at the edited row when one row is edited (summary changed, hash kept)', () => {
    const rows = syntheticChain(1000);
    rows[499] = { ...rows[499], summary: 'Something else entirely' };
    const res = verifyChain(rows);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.brokenAt).toBe(500);
      expect(res.reason).toMatch(/hash does not match/);
    }
  });

  it('fails at the next row when an edited row also has its hash recomputed', () => {
    const rows = syntheticChain(1000);
    const edited = { ...rows[499], summary: 'Rewritten history' };
    rows[499] = { ...edited, hash: eventHash(edited) };
    const res = verifyChain(rows);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.brokenAt).toBe(501);
      expect(res.reason).toMatch(/prev does not match/);
    }
  });

  it('fails when a row is deleted (seq gap)', () => {
    const rows = syntheticChain(50);
    rows.splice(10, 1);
    const res = verifyChain(rows);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/gap/);
  });

  it('checks a window from a known head', () => {
    const rows = syntheticChain(100);
    const window = rows.slice(60);
    expect(verifyChain(window).ok).toBe(false);
    expect(verifyChain(window, { prev: rows[59].hash, seq: 61 }).ok).toBe(true);
  });

  it('hash covers every public field', () => {
    const [row] = syntheticChain(1);
    const fields: Array<[string, (r: ChainRow) => ChainRow]> = [
      ['block', (r) => ({ ...r, block: r.block + 1 })],
      ['kind', (r) => ({ ...r, kind: 'deed.moved' })],
      ['actor.id', (r) => ({ ...r, actor: { ...r.actor, id: 'someone-else' } })],
      ['signer.address', (r) => ({ ...r, signer: { ...r.signer, address: 'x' } })],
      ['payloadHash', (r) => ({ ...r, payloadHash: sha256Tagged('other') })],
      ['ts', (r) => ({ ...r, ts: new Date(0).toISOString() })],
      ['id', (r) => ({ ...r, id: ulid(1) })],
    ];
    for (const [, mutate] of fields) expect(eventHash(mutate(row))).not.toBe(row.hash);
  });
});

describe('ULID', () => {
  it('is 26 Crockford chars and sorts by time', () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(a).toMatch(ULID_RE);
    expect(b).toMatch(ULID_RE);
    expect(a < b).toBe(true);
  });
});

describe('system key (BG_EVENT_SIGNING_KEY)', () => {
  const seed = new Uint8Array(32).map((_, i) => i + 1);
  const seedHex = Buffer.from(seed).toString('hex');

  it('accepts a 32-byte seed as hex or base64 and derives the same key id', () => {
    const a = parseSystemKey(seedHex)!;
    const b = parseSystemKey(Buffer.from(seed).toString('base64'))!;
    expect(a.kid).toBe(b.kid);
    expect(a.kid).toMatch(/^bg-sys-[0-9a-f]{16}$/);
    expect(Buffer.from(a.publicKey).equals(Buffer.from(ed25519.getPublicKey(seed)))).toBe(true);
    expect(keyId(a.publicKey)).toBe(a.kid);
  });

  it('rejects anything that is not a 32-byte seed (runs unsigned instead)', () => {
    for (const bad of [undefined, '', 'short', 'zz'.repeat(32), Buffer.alloc(31).toString('base64'), Buffer.alloc(64).toString('hex')]) {
      expect(parseSystemKey(bad)).toBeNull();
    }
  });

  it('signs and verifies; a different message or key fails', () => {
    const k = parseSystemKey(seedHex)!;
    const sig = signEd25519(k.seed, 'hello');
    expect(verifyEd25519(k.publicKey, 'hello', sig)).toBe(true);
    expect(verifyEd25519(k.publicKey, 'hello!', sig)).toBe(false);
    const other = parseSystemKey('11'.repeat(32))!;
    expect(verifyEd25519(other.publicKey, 'hello', sig)).toBe(false);
  });

  it('publishes the public key only, and no key when unset', () => {
    const k = parseSystemKey(seedHex)!;
    const pub = publishedKeys(k);
    expect(pub.keys).toHaveLength(1);
    expect(JSON.stringify(pub)).not.toContain(seedHex);
    expect(JSON.stringify(pub)).not.toContain(Buffer.from(seed).toString('base64'));
    expect(publishedKeys(null)).toEqual({ format: 'bg-event-keys/1', keys: [] });
  });
});

describe('summaries', () => {
  it('stay within 140 chars for every kind, even with long names', () => {
    const long = 'N'.repeat(500);
    for (const kind of BLOCK_EVENT_KINDS) {
      const s = summaryFor(kind, { name: long, guardianName: long, experienceName: long, objectType: long, count: 1, status: 'idle' });
      expect(s.length).toBeLessThanOrEqual(SUMMARY_MAX);
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('counts a batch instead of naming one object', () => {
    expect(summaryFor('build.placed', { count: 3 })).toBe('3 objects placed');
    expect(summaryFor('build.placed', { objectType: 'lantern' })).toBe('Placed a lantern');
  });
});
