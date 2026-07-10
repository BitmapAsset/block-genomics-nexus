/**
 * ISOLATED SIMULATION — real Bitcoin keypairs + real BIP-322.
 *
 * auth-bypass.test.ts mocks bip322-js; these tests exercise the REAL verifier
 * with locally-generated P2PKH / P2WPKH / P2TR keypairs, closing the coverage
 * gap where the cryptographic path (esp. Taproot/bc1p) was never really run.
 */

import { Verifier } from 'bip322-js';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { verifyAgentSignature } from '@/lib/agent-protocol';
import { makeWallet, sign, freshNonce, challengeMessage, AddrKind } from '../helpers/wallet-sim';

const KINDS: AddrKind[] = ['p2pkh', 'p2wpkh', 'p2tr'];

describe('SIM: real BIP-322 wallet signatures', () => {
  describe.each(KINDS)('address type: %s', (kind) => {
    it('Scenario 1 — a legit owner signature is accepted (wallet + agent verifiers)', () => {
      const w = makeWallet(kind);
      const msg = challengeMessage(freshNonce());
      const sig = sign(w.wif, w.address, msg);
      expect(Verifier.verifySignature(w.address, msg, sig)).toBe(true);
      expect(verifyWalletSignature(w.address, msg, sig)).toBe(true);
      expect(verifyAgentSignature(w.address, msg, sig)).toBe(true);
    });

    it('Scenario 2 — a signature from the wrong key is rejected', () => {
      const owner = makeWallet(kind);
      const attacker = makeWallet(kind);
      const msg = challengeMessage(freshNonce());
      const forged = sign(attacker.wif, attacker.address, msg); // attacker's own valid sig
      expect(verifyWalletSignature(owner.address, msg, forged)).toBe(false);
      expect(verifyAgentSignature(owner.address, msg, forged)).toBe(false);
    });

    it('a tampered message is rejected', () => {
      const w = makeWallet(kind);
      const msg = challengeMessage(freshNonce());
      const sig = sign(w.wif, w.address, msg);
      expect(verifyWalletSignature(w.address, msg + 'x', sig)).toBe(false);
    });

    it('garbage / crafted signatures are rejected (no bypass)', () => {
      const w = makeWallet(kind);
      const crafted = [
        Buffer.alloc(64, 0x00).toString('base64'),
        Buffer.alloc(64, 0xff).toString('base64'),
        'AAAA'.repeat(22),
      ];
      for (const bad of crafted) {
        expect(verifyWalletSignature(w.address, 'login', bad)).toBe(false);
      }
    });
  });

  it('Scenario 5 (crypto basis) — agent A cannot forge agent B: A key vs B address fails', () => {
    const a = makeWallet('p2tr');
    const b = makeWallet('p2wpkh');
    const msg = challengeMessage(freshNonce());
    const aSig = sign(a.wif, a.address, msg);
    expect(verifyAgentSignature(a.address, msg, aSig)).toBe(true); // A over A ✓
    expect(verifyAgentSignature(b.address, msg, aSig)).toBe(false); // A's sig replayed as B ✗
  });
});
