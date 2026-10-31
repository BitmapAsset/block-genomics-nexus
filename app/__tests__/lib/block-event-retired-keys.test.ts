/**
 * Retired system keys stay published, so a rotation of BG_EVENT_SIGNING_KEY
 * does not make earlier attestations unverifiable.
 *
 * `/.well-known/bg-event-keys.json` lists the current key plus every retired
 * one with its `retiredAt`; `verifyEventProof` accepts a retired key only for
 * an event dated before that key's `retiredAt`.
 */

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));
jest.mock('@/lib/brain', () => ({ getBrainState: () => null, getContentScanner: () => ({}), buildSoulDocument: () => ({}) }));

import {
  BG_EVENT_FORMAT,
  BG_EVENT_KEYS_FORMAT,
  eventHash,
  parseSystemKey,
  publishedKeys,
  sha256Tagged,
  signEd25519,
  systemProofMessage,
  toBase64,
  verifyEventProof,
  type EventProof,
  type HashedEvent,
  type SystemKey,
} from '@/lib/block-event-core';
import { RETIRED_SYSTEM_KEYS, type RetiredSystemKey } from '@/lib/bg-event-retired-keys';
import { buildActionMessage } from '@/lib/action-message';
import { makeWallet, sign, freshNonce } from '../helpers/wallet-sim';
import { GET as KEYS_ROUTE } from '@/app/.well-known/bg-event-keys.json/route';

// Low-entropy test seeds, never a real key.
const OLD = parseSystemKey('22'.repeat(32))!;
const NEW = parseSystemKey('33'.repeat(32))!;
const BLOCK = 840000;
const EVENT_TS = '2026-10-30T00:00:01.000Z';

const retired = (k: SystemKey, retiredAt: string): RetiredSystemKey => ({
  kid: k.kid,
  publicKey: toBase64(k.publicKey),
  retiredAt,
});

const owner = makeWallet('p2tr');

function walletEventAttestedBy(k: SystemKey, ts = EVENT_TS): EventProof {
  const message = buildActionMessage({
    action: 'world.create', method: 'POST', path: '/api/v1/world', blockHeight: BLOCK,
    bodyHash: 'ab'.repeat(32), nonce: freshNonce(), expiresAt: 1792000000000,
  });
  const h: HashedEvent = {
    id: '01JBBBBBBBBBBBBBBBBBBBBBBB', block: BLOCK, seq: 2, kind: 'build.placed',
    actor: { type: 'owner', id: owner.address, handle: null },
    signer: { scheme: 'bip322', address: owner.address },
    summary: 'Placed a tree',
    payloadHash: sha256Tagged(message),
    prev: 'sha256:' + '1'.repeat(64),
    ts,
  };
  const hash = eventHash(h);
  return {
    format: BG_EVENT_FORMAT,
    event: { ...h, format: BG_EVENT_FORMAT, hash, proof: { url: `/api/v1/blocks/${BLOCK}/events/${h.id}/proof` } },
    scheme: 'bip322',
    address: owner.address,
    message,
    signature: sign(owner.privKey, owner.address, message),
    payloadHash: h.payloadHash,
    attestation: { kid: k.kid, signature: signEd25519(k.seed, hash) },
  };
}

function systemEventSignedBy(k: SystemKey, ts = EVENT_TS): EventProof {
  const kind = 'guardian.registered';
  const message = systemProofMessage(BLOCK, kind, { guardianId: 'g1' });
  const h: HashedEvent = {
    id: '01JAAAAAAAAAAAAAAAAAAAAAAA', block: BLOCK, seq: 1, kind,
    actor: { type: 'system', id: null, handle: null },
    signer: { scheme: 'ed25519', address: k.kid },
    summary: 'A guardian was registered on this block',
    payloadHash: sha256Tagged(message),
    prev: 'sha256:' + '0'.repeat(64),
    ts,
  };
  const hash = eventHash(h);
  return {
    format: BG_EVENT_FORMAT,
    event: { ...h, format: BG_EVENT_FORMAT, hash, proof: { url: `/api/v1/blocks/${BLOCK}/events/${h.id}/proof` } },
    scheme: 'ed25519',
    address: k.kid,
    message,
    signature: signEd25519(k.seed, message),
    payloadHash: h.payloadHash,
    attestation: { kid: k.kid, signature: signEd25519(k.seed, hash) },
  };
}

describe('publishedKeys with retired keys', () => {
  it('lists the current key and every retired key, the retired ones with retiredAt', () => {
    const out = publishedKeys(NEW, [retired(OLD, '2026-11-01T00:00:00.000Z')]);
    expect(out.format).toBe(BG_EVENT_KEYS_FORMAT);
    expect(out.keys.map((k) => k.kid)).toEqual([NEW.kid, OLD.kid]);
    expect(out.keys[0].retiredAt).toBeUndefined();
    expect(out.keys[1]).toMatchObject({ kid: OLD.kid, alg: 'ed25519', publicKey: toBase64(OLD.publicKey), retiredAt: '2026-11-01T00:00:00.000Z' });
  });

  it('lists retired keys even with no current key', () => {
    expect(publishedKeys(null, [retired(OLD, '2026-11-01T00:00:00.000Z')]).keys.map((k) => k.kid)).toEqual([OLD.kid]);
  });

  it('no keys at all: unchanged (an empty list)', () => {
    expect(publishedKeys(null, [])).toEqual({ format: BG_EVENT_KEYS_FORMAT, keys: [] });
    expect(publishedKeys(null)).toEqual({ format: BG_EVENT_KEYS_FORMAT, keys: [] });
  });

  it('the checked-in retired list is empty today and holds public keys only', () => {
    expect(RETIRED_SYSTEM_KEYS).toEqual([]);
    for (const k of RETIRED_SYSTEM_KEYS) expect(Object.keys(k).sort()).toEqual(['kid', 'publicKey', 'retiredAt']);
  });

  it('the well-known route serves the same list (empty with no key configured)', async () => {
    const prev = process.env.BG_EVENT_SIGNING_KEY;
    delete process.env.BG_EVENT_SIGNING_KEY;
    try {
      expect(await KEYS_ROUTE().json()).toEqual({ format: BG_EVENT_KEYS_FORMAT, keys: [] });
    } finally {
      if (prev !== undefined) process.env.BG_EVENT_SIGNING_KEY = prev;
    }
  });
});

describe('verifyEventProof under a retired key', () => {
  const keysAfterRotation = (retiredAt: string) => publishedKeys(NEW, [retired(OLD, retiredAt)]).keys;

  it('accepts an attestation under the retired key for an event dated before retiredAt', () => {
    const r = verifyEventProof(walletEventAttestedBy(OLD), keysAfterRotation('2026-11-01T00:00:00.000Z'));
    expect(r.ok).toBe(true);
  });

  it('refuses an attestation under the retired key for an event dated after retiredAt', () => {
    const r = verifyEventProof(walletEventAttestedBy(OLD), keysAfterRotation('2026-10-29T00:00:00.000Z'));
    expect(r.ok).toBe(false);
    expect(r.checks.attestation).toBe(false);
  });

  it('refuses an event dated exactly at retiredAt', () => {
    expect(verifyEventProof(walletEventAttestedBy(OLD), keysAfterRotation(EVENT_TS)).ok).toBe(false);
  });

  it('applies the same date rule to a system signature under the retired key', () => {
    expect(verifyEventProof(systemEventSignedBy(OLD), keysAfterRotation('2026-11-01T00:00:00.000Z')).ok).toBe(true);
    expect(verifyEventProof(systemEventSignedBy(OLD), keysAfterRotation('2026-10-29T00:00:00.000Z')).ok).toBe(false);
  });

  it('refuses a retired key with an unreadable retiredAt', () => {
    expect(verifyEventProof(walletEventAttestedBy(OLD), keysAfterRotation('not a date')).ok).toBe(false);
  });

  it('the current key still verifies any date', () => {
    expect(verifyEventProof(walletEventAttestedBy(NEW, '2030-01-01T00:00:00.000Z'), keysAfterRotation('2026-10-29T00:00:00.000Z')).ok).toBe(true);
  });

  it('no keys: unchanged (an attestation cannot verify)', () => {
    const r = verifyEventProof(walletEventAttestedBy(OLD), []);
    expect(r.ok).toBe(false);
    expect(r.checks.attestation).toBe(false);
  });
});
