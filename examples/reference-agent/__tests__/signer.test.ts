/**
 * The migration guard for this example's signer.
 *
 * `src/bip322.ts` replaced `bip322-js` (and its unmaintained `elliptic`
 * dependency) with `@noble/curves` + `@scure/btc-signer`. The property that has
 * to survive that swap is interoperability, so the suite checks it in both
 * directions against the SERVER'S OWN verifier — the exact module the API runs
 * (`app/src/lib/bip322-verify.ts`), imported here rather than reimplemented, so
 * a divergence cannot hide behind a second copy of the rules.
 *
 * WHY NOT ASSERT THE SIGNATURE BYTES: BIP-322 signatures are not canonical.
 * The signatures published in the BIP-322 specification were produced by a
 * signer that grinds the RFC-6979 nonce until `r` fits in 32 bytes without a
 * leading zero (Bitcoin Core does this to save one byte of DER). Ours is plain
 * RFC-6979, so it lands on a different — equally valid — nonce. Both verify;
 * only the bytes differ. Asserting byte equality here would fail for a signer
 * that is completely correct, so the spec vectors are pinned on the two things
 * that ARE canonical: the derived address, and the verifier's verdict.
 */

import { describe, expect, it } from 'vitest';
import { walletSigner, generateWallet } from '../src/signer.js';
import { signBip322, addressFromPublicKey, type AddressType } from '../src/bip322.js';
import { secp256k1 } from '@noble/curves/secp256k1';
import { verifyBip322Signature } from '../../../app/src/lib/bip322-verify';

/** BIP-322 specification test key, and the P2WPKH address it derives. */
const SPEC_WIF = 'L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k';
const SPEC_P2WPKH = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';

/** Signatures from the BIP-322 specification, over the same key. */
const SPEC_SIGNATURES: Record<string, string> = {
  '': 'AkcwRAIgM2gBAQqvZX15ZiysmKmQpDrG83avLIT492QBzLnQIxYCIBaTpOaD20qRlEylyxFSeEA2ba9YOixpX8z46TSDtS40ASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=',
  'Hello World':
    'AkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=',
};

const TYPES: AddressType[] = ['p2wpkh', 'p2tr', 'p2pkh'];

/** The message format `POST /api/v1/session/start` issues. */
const CHALLENGE = 'Block Genomics verification: 0000000aababababababababababababababababababababababababababababab';

const MESSAGES = [
  '',
  'Hello World',
  CHALLENGE,
  'unicode: ⛓️🐸 — em-dash, emoji, accents éü',
  'x'.repeat(1000),
];

describe('BIP-322 specification vectors', () => {
  it('derives the address the specification publishes for its test key', () => {
    expect(walletSigner(SPEC_WIF, 'p2wpkh').address).toBe(SPEC_P2WPKH);
  });

  it.each(Object.keys(SPEC_SIGNATURES))('accepts the published signature for %j', (message) => {
    // Interop, their-signature → our-verifier. Guards against the migration
    // having quietly redefined what a valid signature is.
    expect(verifyBip322Signature(SPEC_P2WPKH, message, SPEC_SIGNATURES[message])).toBe(true);
  });

  it.each(Object.keys(SPEC_SIGNATURES))('produces a verifying signature for %j', async (message) => {
    const signer = walletSigner(SPEC_WIF, 'p2wpkh');
    const signature = await signer.signMessage(message);
    expect(verifyBip322Signature(SPEC_P2WPKH, message, signature)).toBe(true);
  });
});

describe('walletSigner', () => {
  it.each(TYPES)('signs a message that the server verifier accepts (%s)', async (type) => {
    const signer = walletSigner(SPEC_WIF, type);
    for (const message of MESSAGES) {
      const signature = await signer.signMessage(message);
      expect(verifyBip322Signature(signer.address, message, signature), `message ${JSON.stringify(message.slice(0, 24))}`).toBe(true);
    }
  });

  // ECDSA here is RFC-6979 deterministic, so a repeat signature is byte-identical.
  it.each(['p2wpkh', 'p2pkh'] as const)('signs deterministically (%s)', async (type) => {
    const signer = walletSigner(SPEC_WIF, type);
    expect(await signer.signMessage(CHALLENGE)).toBe(await signer.signMessage(CHALLENGE));
  });

  // Taproot is deliberately NOT deterministic: BIP-340 mixes in fresh auxiliary
  // randomness per signature, which is a defence against fault and side-channel
  // attacks on the nonce. Pinned so nobody "fixes" the varying output by
  // pinning auxRand to zero — that would trade a real protection for tidiness.
  it('signs taproot with fresh auxiliary randomness each time', async () => {
    const signer = walletSigner(SPEC_WIF, 'p2tr');
    const first = await signer.signMessage(CHALLENGE);
    const second = await signer.signMessage(CHALLENGE);
    expect(first).not.toBe(second);
    for (const signature of [first, second]) {
      expect(verifyBip322Signature(signer.address, CHALLENGE, signature)).toBe(true);
    }
  });

  it('derives a distinct address per type from one key', () => {
    const addresses = TYPES.map((t) => walletSigner(SPEC_WIF, t).address);
    expect(new Set(addresses).size).toBe(TYPES.length);
    expect(addresses).toEqual([SPEC_P2WPKH, expect.stringMatching(/^bc1p/), expect.stringMatching(/^1/)]);
  });

  it('defaults to p2wpkh', () => {
    expect(walletSigner(SPEC_WIF).address).toBe(SPEC_P2WPKH);
  });

  it('rejects a malformed WIF instead of signing with a garbage key', () => {
    expect(() => walletSigner('not-a-wif')).toThrow();
    // Valid base58check, wrong version byte — must not silently decode.
    expect(() => walletSigner('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toThrow();
  });
});

describe('signature rejection', () => {
  it.each(TYPES)('a signature does not verify for a different message (%s)', async (type) => {
    const signer = walletSigner(SPEC_WIF, type);
    const signature = await signer.signMessage(CHALLENGE);
    expect(verifyBip322Signature(signer.address, `${CHALLENGE} `, signature)).toBe(false);
  });

  it.each(TYPES)('a signature does not verify for a different address (%s)', async (type) => {
    const signer = walletSigner(SPEC_WIF, type);
    const other = walletSigner(generateWallet(type).wif, type);
    const signature = await signer.signMessage(CHALLENGE);
    expect(verifyBip322Signature(other.address, CHALLENGE, signature)).toBe(false);
  });

  it.each(TYPES)("another wallet's signature cannot be replayed onto this address (%s)", async (type) => {
    const victim = walletSigner(SPEC_WIF, type);
    const attackerWallet = generateWallet(type);
    const attacker = walletSigner(attackerWallet.wif, type);
    const signature = await attacker.signMessage(CHALLENGE);
    expect(verifyBip322Signature(victim.address, CHALLENGE, signature)).toBe(false);
  });

  it('a single flipped bit invalidates the signature', async () => {
    const signer = walletSigner(SPEC_WIF, 'p2wpkh');
    const raw = Buffer.from(await signer.signMessage(CHALLENGE), 'base64');
    raw[Math.floor(raw.length / 2)] ^= 0x01;
    expect(verifyBip322Signature(signer.address, CHALLENGE, raw.toString('base64'))).toBe(false);
  });
});

describe('generateWallet', () => {
  it.each(TYPES)('produces a WIF that round-trips to the same address (%s)', (type) => {
    const { wif, address } = generateWallet(type);
    expect(walletSigner(wif, type).address).toBe(address);
  });

  it.each(TYPES)('produces a usable signing key (%s)', async (type) => {
    const { wif, address } = generateWallet(type);
    const signature = await walletSigner(wif, type).signMessage(CHALLENGE);
    expect(verifyBip322Signature(address, CHALLENGE, signature)).toBe(true);
  });

  it('never returns the same key twice', () => {
    const wifs = Array.from({ length: 8 }, () => generateWallet().wif);
    expect(new Set(wifs).size).toBe(8);
  });
});

describe('addressFromPublicKey / signBip322', () => {
  it('signs for an address derived straight from a raw private key', () => {
    // The lower-level entry point, for agents that hold raw key bytes rather
    // than a WIF (an HSM, a KMS, a BIP-32 derivation).
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, true);
    for (const type of TYPES) {
      const address = addressFromPublicKey(publicKey, type);
      expect(verifyBip322Signature(address, CHALLENGE, signBip322(privateKey, address, CHALLENGE))).toBe(true);
    }
  });
});
