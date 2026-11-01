/**
 * Signature checks accept main-network addresses only.
 *
 * Every holder a gate compares against is a main-network address, and the
 * wallets people sign with are main-network wallets. A key's test-network and
 * regtest addresses carry the same output script as its main-network address,
 * so the very same signature used to verify for all three; now only the
 * main-network address verifies.
 *
 * Real verifier, real signatures (the wallet-sim signer). No mocks.
 */

import * as btc from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { verifyBip322Signature } from '@/lib/bip322-verify';
import { verifyBip322 } from '@/lib/bip322';
import { makeWallet, sign, challengeMessage, freshNonce } from '../helpers/wallet-sim';

const REGTEST: typeof btc.NETWORK = { ...btc.TEST_NETWORK, bech32: 'bcrt' };

function addressesOf(privKeyHex: string) {
  const pub = secp256k1.getPublicKey(Uint8Array.from(Buffer.from(privKeyHex, 'hex')), true);
  const xonly = pub.subarray(1, 33);
  return {
    p2wpkh: {
      main: btc.p2wpkh(pub).address!,
      test: btc.p2wpkh(pub, btc.TEST_NETWORK).address!,
      regtest: btc.p2wpkh(pub, REGTEST).address!,
    },
    p2tr: {
      main: btc.p2tr(xonly).address!,
      test: btc.p2tr(xonly, undefined, btc.TEST_NETWORK).address!,
      regtest: btc.p2tr(xonly, undefined, REGTEST).address!,
    },
  };
}

describe.each(['p2wpkh', 'p2tr'] as const)('%s', (kind) => {
  const wallet = makeWallet(kind);
  const addrs = addressesOf(wallet.privKey)[kind];
  const message = challengeMessage(freshNonce());
  // The output script is the same on every network, so one signature serves all three.
  const signature = sign(wallet.privKey, addrs.main, message);

  it('the address shapes are what this test assumes', () => {
    expect(addrs.main).toBe(wallet.address);
    expect(addrs.test.startsWith('tb1')).toBe(true);
    expect(addrs.regtest.startsWith('bcrt1')).toBe(true);
  });

  it('the main-network address verifies', () => {
    expect(verifyBip322Signature(addrs.main, message, signature)).toBe(true);
    expect(verifyBip322(addrs.main, message, signature)).toBe(true);
  });

  it('the same key\'s test-network address does not', () => {
    expect(verifyBip322Signature(addrs.test, message, signature)).toBe(false);
    expect(verifyBip322(addrs.test, message, signature)).toBe(false);
  });

  it('the same key\'s regtest address does not', () => {
    expect(verifyBip322Signature(addrs.regtest, message, signature)).toBe(false);
    expect(verifyBip322(addrs.regtest, message, signature)).toBe(false);
  });
});

it('a legacy signature by a test-network P2PKH address does not verify', () => {
  const wallet = makeWallet('p2pkh');
  const pub = secp256k1.getPublicKey(Uint8Array.from(Buffer.from(wallet.privKey, 'hex')), true);
  const testAddr = btc.p2pkh(pub, btc.TEST_NETWORK).address!;
  expect(testAddr[0] === 'm' || testAddr[0] === 'n').toBe(true);
  const message = challengeMessage(freshNonce());
  // A BIP-137 signature does not depend on the address it is checked against.
  const signature = sign(wallet.privKey, wallet.address, message);
  expect(verifyBip322Signature(wallet.address, message, signature)).toBe(true);
  expect(verifyBip322Signature(testAddr, message, signature)).toBe(false);
});
