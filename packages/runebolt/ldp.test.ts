/**
 * Lightning Deed Protocol — Unit Tests
 */

import * as crypto from 'crypto';
import * as bitcoin from 'bitcoinjs-lib';
import { initEccLib } from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

initEccLib(ecc);

import {
  buildDeedLockScript,
  buildClaimScript,
  buildRecoveryScript,
  createDeedLock,
  createDeedLockTransaction,
  DeedLockUTXO,
} from '../src/ldp/DeedLock';

import {
  validateClaim,
  batchClaim,
  DeedLockOutputInfo,
} from '../src/ldp/DeedClaim';

import {
  createLDPInvoice,
  encodeLDPInvoice,
  decodeLDPInvoice,
} from '../src/ldp/LDPInvoice';

import {
  verifyAtomicity,
  calculateSafeTimeouts,
  validateTimeoutSafety,
  createCorrespondingHTLC,
} from '../src/ldp/HTLCBridge';

import {
  createBitmapDeed,
  validateBitmapClaim,
} from '../src/ldp/BitmapDeed';

import { LDP_VERSION } from '../src/ldp';

const network = bitcoin.networks.regtest;

/** Generate a random x-only pubkey (32 bytes) for testing */
function randomXOnlyPubkey(): Buffer {
  const privkey = crypto.randomBytes(32);
  const full = Buffer.from(ecc.pointFromScalar(privkey)!);
  // x-only: drop the 0x02/0x03 prefix byte
  return full.subarray(1, 33);
}

/** Create a mock DeedLockUTXO */
function mockUTXO(ownerPubkey: Buffer): DeedLockUTXO {
  return {
    txid: crypto.randomBytes(32).toString('hex'),
    vout: 0,
    value: 10000,
    scriptPubKey: Buffer.alloc(34, 0x51), // dummy P2TR script
    ownerPubkey,
    runeId: '840000:1',
    runeAmount: 1000n,
  };
}

describe('LDP Version', () => {
  it('should export version 0.1.0', () => {
    expect(LDP_VERSION).toBe('0.1.0');
  });
});

describe('DeedLock Script Construction', () => {
  const paymentHash = crypto.createHash('sha256').update(Buffer.from('test-preimage-32-bytes-long!!!!!')).digest();
  const recipientPubkey = randomXOnlyPubkey();
  const ownerPubkey = randomXOnlyPubkey();

  it('should build a valid claim script', () => {
    const claimScript = buildClaimScript(paymentHash, recipientPubkey);
    expect(claimScript).toBeInstanceOf(Buffer);
    expect(claimScript.length).toBeGreaterThan(0);
    // Should contain the payment hash
    expect(claimScript.includes(paymentHash)).toBe(true);
    // Should contain the recipient pubkey
    expect(claimScript.includes(recipientPubkey)).toBe(true);
  });

  it('should build a valid recovery script', () => {
    const recoveryScript = buildRecoveryScript(ownerPubkey, 144);
    expect(recoveryScript).toBeInstanceOf(Buffer);
    expect(recoveryScript.length).toBeGreaterThan(0);
    // Should contain the owner pubkey
    expect(recoveryScript.includes(ownerPubkey)).toBe(true);
  });

  it('should build a full deed-lock script tree', () => {
    const result = buildDeedLockScript(paymentHash, recipientPubkey, ownerPubkey, 144);
    expect(result.claimScript).toBeInstanceOf(Buffer);
    expect(result.recoveryScript).toBeInstanceOf(Buffer);
    expect(result.taprootTree).toBeInstanceOf(Array);
    expect(result.taprootTree).toHaveLength(2);
  });

  it('should reject invalid payment hash length', () => {
    expect(() => buildDeedLockScript(Buffer.alloc(16), recipientPubkey, ownerPubkey, 144))
      .toThrow('paymentHash must be 32 bytes');
  });

  it('should reject invalid pubkey length', () => {
    expect(() => buildDeedLockScript(paymentHash, Buffer.alloc(33), ownerPubkey, 144))
      .toThrow('recipientPubkey must be 32 bytes');
  });

  it('should reject invalid timeout', () => {
    expect(() => buildDeedLockScript(paymentHash, recipientPubkey, ownerPubkey, 0))
      .toThrow('timeoutBlocks must be 1-65535');
    expect(() => buildDeedLockScript(paymentHash, recipientPubkey, ownerPubkey, 70000))
      .toThrow('timeoutBlocks must be 1-65535');
  });
});

describe('DeedLock Creation', () => {
  const ownerPubkey = randomXOnlyPubkey();
  const recipientPubkey = randomXOnlyPubkey();

  it('should create a deed-lock with a valid P2TR address', () => {
    const utxo = mockUTXO(ownerPubkey);
    const result = createDeedLock(utxo, recipientPubkey, 144, undefined, network);

    expect(result.address).toBeTruthy();
    expect(result.address.startsWith('bcrt1p')).toBe(true); // regtest P2TR
    expect(result.paymentHash).toHaveLength(32);
    expect(result.preimage).toHaveLength(32);
    expect(result.outputScript).toBeInstanceOf(Buffer);

    // Verify preimage -> hash relationship
    const computedHash = crypto.createHash('sha256').update(result.preimage).digest();
    expect(computedHash.equals(result.paymentHash)).toBe(true);
  });

  it('should accept a custom preimage', () => {
    const utxo = mockUTXO(ownerPubkey);
    const customPreimage = crypto.randomBytes(32);
    const result = createDeedLock(utxo, recipientPubkey, 144, customPreimage, network);

    expect(result.preimage.equals(customPreimage)).toBe(true);
    const expectedHash = crypto.createHash('sha256').update(customPreimage).digest();
    expect(result.paymentHash.equals(expectedHash)).toBe(true);
  });

  it('should create a deed-lock transaction PSBT', () => {
    const utxo = mockUTXO(ownerPubkey);
    const deedLock = createDeedLock(utxo, recipientPubkey, 144, undefined, network);
    const psbt = createDeedLockTransaction(utxo, deedLock, 2, network);

    expect(psbt).toBeInstanceOf(bitcoin.Psbt);
    expect(psbt.txInputs).toHaveLength(1);
    expect(psbt.txOutputs).toHaveLength(1);
    expect(psbt.txOutputs[0].value).toBeLessThan(utxo.value); // fee deducted
    expect(psbt.txOutputs[0].value).toBeGreaterThanOrEqual(546); // above dust
  });

  it('should reject if output would be below dust', () => {
    const utxo = mockUTXO(ownerPubkey);
    utxo.value = 300; // too small
    const deedLock = createDeedLock(utxo, recipientPubkey, 144, undefined, network);
    expect(() => createDeedLockTransaction(utxo, deedLock, 2, network))
      .toThrow('below dust limit');
  });
});

describe('DeedClaim Validation', () => {
  it('should validate a correct preimage', () => {
    const preimage = crypto.randomBytes(32);
    const paymentHash = crypto.createHash('sha256').update(preimage).digest();

    const deedInfo: DeedLockOutputInfo = {
      txid: crypto.randomBytes(32).toString('hex'),
      vout: 0,
      value: 10000,
      scriptPubKey: Buffer.alloc(34),
      paymentHash,
      recipientPubkey: randomXOnlyPubkey(),
      ownerPubkey: randomXOnlyPubkey(),
      timeoutBlocks: 144,
    };

    expect(validateClaim(deedInfo, preimage)).toBe(true);
  });

  it('should reject an incorrect preimage', () => {
    const preimage = crypto.randomBytes(32);
    const wrongPreimage = crypto.randomBytes(32);
    const paymentHash = crypto.createHash('sha256').update(preimage).digest();

    const deedInfo: DeedLockOutputInfo = {
      txid: crypto.randomBytes(32).toString('hex'),
      vout: 0,
      value: 10000,
      scriptPubKey: Buffer.alloc(34),
      paymentHash,
      recipientPubkey: randomXOnlyPubkey(),
      ownerPubkey: randomXOnlyPubkey(),
      timeoutBlocks: 144,
    };

    expect(validateClaim(deedInfo, wrongPreimage)).toBe(false);
  });
});

describe('Batch Claim', () => {
  it('should reject mismatched arrays', () => {
    expect(() => batchClaim([], [Buffer.alloc(32)], Buffer.alloc(32), 'addr', 2, network))
      .toThrow('Must provide one preimage per deed-locked UTXO');
  });

  it('should reject empty arrays', () => {
    expect(() => batchClaim([], [], Buffer.alloc(32), 'addr', 2, network))
      .toThrow('Must provide at least one deed-locked UTXO');
  });
});

describe('LDP Invoice Encode/Decode', () => {
  it('should round-trip encode and decode an invoice', () => {
    const recipientPubkey = randomXOnlyPubkey();
    const { preimage, ...invoice } = createLDPInvoice(
      '840000:1',
      1000n,
      recipientPubkey,
      5000,
      3600
    );

    const encoded = encodeLDPInvoice(invoice);
    expect(encoded.startsWith('ldp1')).toBe(true);

    const decoded = decodeLDPInvoice(encoded);
    expect(decoded.version).toBe(invoice.version);
    expect(decoded.runeId).toBe('840000:1');
    expect(decoded.runeAmount).toBe(1000n);
    expect(decoded.lightningAmountSats).toBe(5000);
    expect(decoded.paymentHash.equals(invoice.paymentHash)).toBe(true);
    expect(decoded.recipientPubkey.equals(recipientPubkey)).toBe(true);
    expect(decoded.expiry).toBe(3600);
    expect(decoded.timestamp).toBe(invoice.timestamp);
  });

  it('should preserve optional senderUTXO field', () => {
    const recipientPubkey = randomXOnlyPubkey();
    const { preimage, ...invoice } = createLDPInvoice(
      '840000:1',
      500n,
      recipientPubkey,
      1000,
      7200,
      'abc123:0'
    );

    const encoded = encodeLDPInvoice(invoice);
    const decoded = decodeLDPInvoice(encoded);
    expect(decoded.senderUTXO).toBe('abc123:0');
  });

  it('should reject invalid bech32', () => {
    expect(() => decodeLDPInvoice('invalid')).toThrow();
  });

  it('should reject wrong HRP', () => {
    // This is a valid bech32 string with wrong HRP
    expect(() => decodeLDPInvoice('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toThrow();
  });
});

describe('HTLCBridge — Atomicity Verification', () => {
  it('should verify matching hashes', () => {
    const hash = crypto.randomBytes(32);
    expect(verifyAtomicity(hash, Buffer.from(hash))).toBe(true);
  });

  it('should reject mismatched hashes', () => {
    const hash1 = crypto.randomBytes(32);
    const hash2 = crypto.randomBytes(32);
    expect(verifyAtomicity(hash1, hash2)).toBe(false);
  });

  it('should reject wrong-length hashes', () => {
    expect(verifyAtomicity(Buffer.alloc(16), Buffer.alloc(32))).toBe(false);
  });
});

describe('HTLCBridge — Timeout Safety', () => {
  it('should calculate safe timeouts', () => {
    const config = calculateSafeTimeouts(144, 40);
    expect(config.bitcoinTimeoutBlocks).toBeGreaterThan(config.lightningCltvDelta);
    expect(config.safetyMarginBlocks).toBeGreaterThanOrEqual(6);
    expect(config.claimWindowSecs).toBeGreaterThan(0);
  });

  it('should extend bitcoin timeout if too short', () => {
    const config = calculateSafeTimeouts(42, 40); // 42 < 40+6
    expect(config.bitcoinTimeoutBlocks).toBe(46); // 40 + 6
    expect(config.lightningCltvDelta).toBe(40);
    expect(config.safetyMarginBlocks).toBe(6);
  });

  it('should validate safe configs', () => {
    const config = calculateSafeTimeouts(144, 40);
    const result = validateTimeoutSafety(config);
    expect(result.safe).toBe(true);
  });

  it('should reject unsafe configs', () => {
    const unsafeConfig = {
      bitcoinTimeoutBlocks: 30,
      lightningCltvDelta: 40,
      safetyMarginBlocks: -10,
      claimWindowSecs: 0,
    };
    const result = validateTimeoutSafety(unsafeConfig);
    expect(result.safe).toBe(false);
  });

  it('should create corresponding HTLC params', () => {
    const hash = crypto.randomBytes(32);
    const htlc = createCorrespondingHTLC(hash, 5000, 40);
    expect(htlc.paymentHash.equals(hash)).toBe(true);
    expect(htlc.amountSats).toBe(5000);
    expect(htlc.cltvDelta).toBe(40);
  });

  it('should reject invalid HTLC params', () => {
    expect(() => createCorrespondingHTLC(Buffer.alloc(16), 1000)).toThrow('paymentHash must be 32 bytes');
    expect(() => createCorrespondingHTLC(Buffer.alloc(32), 0)).toThrow('amountSats must be >= 1');
    expect(() => createCorrespondingHTLC(Buffer.alloc(32), 1000, 5)).toThrow('cltvDelta must be >= 9');
  });
});

describe('BitmapDeed', () => {
  it('should create a bitmap deed-lock', () => {
    const ownerPubkey = randomXOnlyPubkey();
    const recipientPubkey = randomXOnlyPubkey();

    const bitmapUtxo = {
      txid: crypto.randomBytes(32).toString('hex'),
      vout: 0,
      value: 10000,
      scriptPubKey: Buffer.alloc(34, 0x51),
      ownerPubkey,
      blockHeight: 840000,
      inscriptionId: `${crypto.randomBytes(32).toString('hex')}:0`,
    };

    const result = createBitmapDeed(bitmapUtxo, recipientPubkey, 144, undefined, network);

    expect(result.address.startsWith('bcrt1p')).toBe(true);
    expect(result.blockHeight).toBe(840000);
    expect(result.preimage).toHaveLength(32);
    expect(result.paymentHash).toHaveLength(32);
  });

  it('should validate bitmap claim with correct preimage', () => {
    const preimage = crypto.randomBytes(32);
    const paymentHash = crypto.createHash('sha256').update(preimage).digest();

    const deedInfo: DeedLockOutputInfo = {
      txid: crypto.randomBytes(32).toString('hex'),
      vout: 0,
      value: 10000,
      scriptPubKey: Buffer.alloc(34),
      paymentHash,
      recipientPubkey: randomXOnlyPubkey(),
      ownerPubkey: randomXOnlyPubkey(),
      timeoutBlocks: 144,
    };

    expect(validateBitmapClaim(deedInfo, preimage)).toBe(true);
    expect(validateBitmapClaim(deedInfo, crypto.randomBytes(32))).toBe(false);
  });
});
