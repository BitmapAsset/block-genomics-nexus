/**
 * An event proof is authentic only when a pinned published key attests the
 * full event hash, and the signed message names the event's own block and kind
 * (and, for a wallet proof, the event's signer).
 *
 * Integrity alone (hashes that agree with each other) proves nothing: anyone
 * can rewrite an event and recompute an unkeyed hash.
 */

import {
  BG_EVENT_FORMAT,
  eventHash,
  parseSystemKey,
  publishedKeys,
  sha256Tagged,
  signEd25519,
  systemProofMessage,
  verifyEventProof,
  type EventProof,
  type HashedEvent,
} from '@/lib/block-event-core';
import { buildActionMessage } from '@/lib/action-message';
import { makeWallet, sign, freshNonce } from '../helpers/wallet-sim';

const SEED = '11'.repeat(32);
const key = parseSystemKey(SEED)!;
const keys = publishedKeys(key).keys;
const BLOCK = 840000;

function finish(h: HashedEvent, message: string, signature: string | null, attest = true): EventProof {
  const hash = eventHash(h);
  return {
    format: BG_EVENT_FORMAT,
    event: { ...h, format: BG_EVENT_FORMAT, hash, proof: { url: `/api/v1/blocks/${h.block}/events/${h.id}/proof` } },
    scheme: h.signer.scheme,
    address: h.signer.address,
    message,
    signature,
    payloadHash: h.payloadHash,
    attestation: attest ? { kid: key.kid, signature: signEd25519(key.seed, hash) } : null,
  };
}

function systemEvent(block = BLOCK, kind = 'guardian.registered'): EventProof {
  const payload = { guardianId: 'g1' };
  const message = systemProofMessage(block, kind, payload);
  const h: HashedEvent = {
    id: '01JAAAAAAAAAAAAAAAAAAAAAAA', block, seq: 1, kind,
    actor: { type: 'system', id: null, handle: null },
    signer: { scheme: 'ed25519', address: key.kid },
    summary: 'A guardian was registered on this block',
    payloadHash: sha256Tagged(message),
    prev: 'sha256:' + '0'.repeat(64),
    ts: '2026-10-30T00:00:00.000Z',
  };
  return finish(h, message, signEd25519(key.seed, message));
}

const owner = makeWallet('p2tr');

function walletEvent(opts: { signedBlock?: number; action?: string; kind?: string } = {}): EventProof {
  const message = buildActionMessage({
    action: opts.action ?? 'world.create', method: 'POST', path: '/api/v1/world', blockHeight: opts.signedBlock ?? BLOCK,
    bodyHash: 'ab'.repeat(32), nonce: freshNonce(), expiresAt: 1792000000000,
  });
  const h: HashedEvent = {
    id: '01JBBBBBBBBBBBBBBBBBBBBBBB', block: BLOCK, seq: 2, kind: opts.kind ?? 'build.placed',
    actor: { type: 'owner', id: owner.address, handle: null },
    signer: { scheme: 'bip322', address: owner.address },
    summary: 'Placed a tree',
    payloadHash: sha256Tagged(message),
    prev: 'sha256:' + '1'.repeat(64),
    ts: '2026-10-30T00:00:01.000Z',
  };
  return finish(h, message, sign(owner.privKey, owner.address, message));
}

/** Rewrite the public facts, recompute the unkeyed hash, remove the attestation. */
function rewritten(p: EventProof): EventProof {
  const { hash: _h, format: _f, proof: _p, ...h } = p.event;
  void _h; void _f; void _p;
  const forged: HashedEvent = {
    ...h,
    block: 840001,
    kind: 'deed.moved',
    actor: { type: 'owner', id: 'bc1qsomeoneelse', handle: 'x' },
    summary: 'The deed moved to a new holder',
  };
  return finish(forged, p.message, p.signature, false);
}

describe('verifyEventProof', () => {
  it('accepts a genuine system event', () => {
    const r = verifyEventProof(systemEvent(), keys);
    expect(r.ok).toBe(true);
    expect(r.authenticated).toBe(true);
  });

  it('accepts a genuine wallet event', () => {
    expect(verifyEventProof(walletEvent(), keys).ok).toBe(true);
  });

  it('refuses a system event with the attestation removed and block/kind/actor rewritten', () => {
    const r = verifyEventProof(rewritten(systemEvent()), keys);
    expect(r.ok).toBe(false);
    expect(r.authenticated).toBe(false);
  });

  it('refuses a wallet event with the attestation removed and block/kind/actor rewritten', () => {
    expect(verifyEventProof(rewritten(walletEvent()), keys).ok).toBe(false);
  });

  it('refuses a proof without an attestation, saying so', () => {
    const p = systemEvent();
    const r = verifyEventProof({ ...p, attestation: null }, keys);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('attestation missing');
  });

  it('refuses an attestation under a key that is not pinned', () => {
    const other = parseSystemKey('22'.repeat(32))!;
    const p = systemEvent();
    const r = verifyEventProof({ ...p, attestation: { kid: other.kid, signature: signEd25519(other.seed, p.event.hash) } }, [
      ...keys,
    ]);
    expect(r.ok).toBe(false);
  });

  it('keeps accepting events attested by a previously published key', () => {
    const old = parseSystemKey('33'.repeat(32))!;
    const p = systemEvent();
    const reattested = { ...p, attestation: { kid: old.kid, signature: signEd25519(old.seed, p.event.hash) } };
    expect(verifyEventProof(reattested, [...keys, ...publishedKeys(old).keys]).ok).toBe(true);
  });

  it('never accepts an unknown or unsigned scheme', () => {
    for (const scheme of ['unsigned', 'rsa', '']) {
      const p = systemEvent();
      const h = { ...p.event, signer: { scheme, address: p.event.signer.address } } as unknown as HashedEvent;
      const proof = { ...finish(h, p.message, p.signature), scheme } as unknown as EventProof;
      const r = verifyEventProof(proof, keys);
      expect(r.ok).toBe(false);
    }
  });

  it('refuses a system message that names another block or kind', () => {
    const other = systemEvent(BLOCK + 1);
    const p = systemEvent();
    const h = { ...p.event } as HashedEvent;
    const swapped = finish({ ...h, payloadHash: other.payloadHash }, other.message, other.signature);
    expect(verifyEventProof(swapped, keys).ok).toBe(false);

    const otherKind = systemEvent(BLOCK, 'guardian.status');
    const swappedKind = finish({ ...h, payloadHash: otherKind.payloadHash }, otherKind.message, otherKind.signature);
    expect(verifyEventProof(swappedKind, keys).ok).toBe(false);
  });

  it('refuses a wallet message that names another block', () => {
    expect(verifyEventProof(walletEvent({ signedBlock: BLOCK + 1 }), keys).ok).toBe(false);
  });

  it('refuses a wallet message whose action does not fit the event kind', () => {
    expect(verifyEventProof(walletEvent({ action: 'experience.register' }), keys).ok).toBe(false);
  });

  it('refuses a wallet message that is not an action message', () => {
    const p = walletEvent();
    const message = `Block Genomics verification: ${freshNonce()}`;
    const { hash: _h, format: _f, proof: _p, ...h } = p.event;
    void _h; void _f; void _p;
    const proof = finish({ ...h, payloadHash: sha256Tagged(message) }, message, sign(owner.privKey, owner.address, message));
    expect(verifyEventProof(proof, keys).ok).toBe(false);
  });
});
