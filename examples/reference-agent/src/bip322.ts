/**
 * BIP-322 message signing on audited primitives.
 *
 * This is the signing counterpart to the server's verifier
 * (`app/src/lib/bip322-verify.ts`). Both sides are built on `@noble/curves`
 * (ECDSA + Schnorr) and `@scure/btc-signer` (address parsing, BIP-143/BIP-341
 * sighash) rather than `bip322-js`, whose transitive `elliptic` dependency has
 * been unmaintained since 2024-11 and carries unpatchable advisories.
 *
 * Copy this file if you are writing your own agent: it is the whole of what
 * "prove you hold the key" requires, and it never leaves the process.
 *
 * The `to_spend` transaction is serialised by hand because no wallet library
 * will build a transaction spending the null outpoint `0000…00:0xFFFFFFFF`.
 */

import * as btc from '@scure/btc-signer';
import { secp256k1, schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';

/** Address forms this signer can produce a signature for. */
export type AddressType = 'p2wpkh' | 'p2tr' | 'p2pkh';

const utf8 = new TextEncoder();
const { taggedHash, bytesToNumberBE, numberToBytesBE, mod } = schnorr.utils;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const hash160 = (b: Uint8Array): Uint8Array => ripemd160(sha256(b));
const sha256d = (b: Uint8Array): Uint8Array => sha256(sha256(b));

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.from([n]);
  if (n <= 0xffff) return Uint8Array.from([0xfd, n & 0xff, (n >> 8) & 0xff]);
  return concat(Uint8Array.from([0xfe]), u32le(n));
}

/** `OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG` — the BIP-143 scriptCode for P2WPKH. */
function p2pkhScript(pubkeyHash: Uint8Array): Uint8Array {
  return concat(Uint8Array.from([0x76, 0xa9, 0x14]), pubkeyHash, Uint8Array.from([0x88, 0xac]));
}

/** Serialise a witness stack the way `finalScriptWitness` encodes it: count, then length-prefixed items. */
function encodeWitness(stack: Uint8Array[]): string {
  const parts = [varint(stack.length)];
  for (const item of stack) parts.push(varint(item.length), item);
  return Buffer.from(concat(...parts)).toString('base64');
}

/** BIP-322 message hash: `tagged_hash("BIP0322-signed-message", message)`. */
function bip322MessageHash(message: string): Uint8Array {
  const tag = sha256(utf8.encode('BIP0322-signed-message'));
  return sha256(concat(tag, tag, utf8.encode(message)));
}

/**
 * `to_spend` hash in display (big-endian) byte order, which is what
 * `addInput({ txid })` expects.
 *
 * Fixed shape: version 0, locktime 0, one input spending the null outpoint with
 * `OP_0 PUSH32 <message_hash>`, one zero-value output carrying the signer's
 * scriptPubKey.
 */
function toSpendTxid(message: string, scriptPubKey: Uint8Array): Uint8Array {
  const scriptSig = concat(Uint8Array.from([0x00, 0x20]), bip322MessageHash(message));
  return sha256d(
    concat(
      u32le(0), // nVersion
      varint(1), // input count
      new Uint8Array(32), // prevout hash — all zeroes
      u32le(0xffffffff), // prevout index
      varint(scriptSig.length),
      scriptSig,
      u32le(0), // nSequence
      varint(1), // output count
      new Uint8Array(8), // nValue = 0
      varint(scriptPubKey.length),
      scriptPubKey,
      u32le(0) // nLockTime
    )
  ).reverse();
}

/** `to_sign`: spends `to_spend` output 0 and pays a single zero-value `OP_RETURN`. */
function buildToSignTx(message: string, scriptPubKey: Uint8Array): btc.Transaction {
  const tx = new btc.Transaction({ version: 0, allowUnknownOutputs: true });
  tx.addInput({
    txid: toSpendTxid(message, scriptPubKey),
    index: 0,
    sequence: 0,
    witnessUtxo: { script: scriptPubKey, amount: BigInt(0) },
  });
  tx.addOutput({ script: Uint8Array.from([0x6a]), amount: BigInt(0) });
  return tx;
}

/** BIP-341 key-path private key tweak: `d' = (±d + H_TapTweak(P)) mod n`. */
function tweakPrivateKey(priv: Uint8Array, internalKey: Uint8Array): Uint8Array {
  const point = secp256k1.ProjectivePoint.fromPrivateKey(priv);
  const n = secp256k1.CURVE.n;
  const d0 = bytesToNumberBE(priv);
  // BIP-340 signs with the key whose point has an even Y; negate when it is odd.
  const d = point.toAffine().y % BigInt(2) === BigInt(0) ? d0 : n - d0;
  const t = bytesToNumberBE(taggedHash('TapTweak', internalKey));
  return numberToBytesBE(mod(d + t, n), 32);
}

/** Legacy "Bitcoin Signed Message" hash (BIP-137). */
function magicHash(message: string): Uint8Array {
  const msg = utf8.encode(message);
  // 0x18 is the byte length of the prefix text that follows it.
  return sha256d(concat(utf8.encode('\x18Bitcoin Signed Message:\n'), varint(msg.length), msg));
}

/** Derive the mainnet address of `type` for a compressed public key. */
export function addressFromPublicKey(publicKey: Uint8Array, type: AddressType): string {
  const address =
    type === 'p2wpkh'
      ? btc.p2wpkh(publicKey).address
      : type === 'p2tr'
        ? btc.p2tr(publicKey.subarray(1, 33)).address
        : btc.p2pkh(publicKey).address;
  if (!address) throw new Error(`could not derive a ${type} address for this key`);
  return address;
}

/**
 * Sign `message` as `address`.
 *
 * P2PKH produces a legacy BIP-137 recoverable signature — what every wallet
 * emits for a base58 address, and what the server accepts for one. The segwit
 * and taproot forms produce full BIP-322 witness signatures.
 *
 * @param privateKey 32-byte secp256k1 private key.
 * @param address    Mainnet address derived from that key.
 * @returns Standard-base64 signature, ready to send as `signature`.
 */
export function signBip322(privateKey: Uint8Array, address: string, message: string): string {
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const scriptPubKey = btc.OutScript.encode(btc.Address().decode(address));

  // Legacy P2PKH → BIP-137 recoverable signature.
  if (address[0] === '1') {
    const sig = secp256k1.sign(magicHash(message), privateKey);
    // Header byte: 27 + recovery id, +4 to flag a compressed public key.
    const header = 27 + sig.recovery + 4;
    return Buffer.from(concat(Uint8Array.from([header]), sig.toCompactRawBytes())).toString('base64');
  }

  // Taproot key-path → BIP-322 with a Schnorr signature over the BIP-341 sighash.
  if (address.startsWith('bc1p')) {
    const sighash = buildToSignTx(message, scriptPubKey).preimageWitnessV1(0, [scriptPubKey], 0x00, [BigInt(0)]);
    return encodeWitness([schnorr.sign(sighash, tweakPrivateKey(privateKey, publicKey.subarray(1, 33)))]);
  }

  // Native segwit → BIP-322 with an ECDSA signature over the BIP-143 sighash.
  // The scriptCode is the P2WPKH-equivalent P2PKH template, and SIGHASH_ALL is
  // fixed by BIP-322.
  const sighash = buildToSignTx(message, scriptPubKey).preimageWitnessV0(
    0,
    p2pkhScript(hash160(publicKey)),
    0x01,
    BigInt(0)
  );
  const der = secp256k1.sign(sighash, privateKey).toDERRawBytes();
  return encodeWitness([concat(der, Uint8Array.from([0x01])), publicKey]);
}
