/**
 * Real-keypair / real-BIP-322 helpers for isolated simulation tests.
 * Generates genuine P2PKH / P2SH-P2WPKH / P2WPKH / P2TR mainnet keypairs and
 * produces real signatures — no live chain, no network.
 *
 * The BIP-322 `to_spend` / `to_sign` construction is deliberately written out
 * here rather than imported from `src/lib/bip322-verify.ts`: an independent
 * signer is what makes the verifier's tests meaningful. Both sides are pinned
 * against reference `bip322-js` output in `__tests__/fixtures/bip322-vectors.json`.
 *
 * NOT collected by Jest (filename is not *.test.ts).
 */

import * as btc from '@scure/btc-signer';
import { secp256k1, schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';

export type AddrKind = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr';

export interface SimWallet {
  /** 32-byte private key, hex encoded. */
  privKey: string;
  address: string;
  kind: AddrKind;
}

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

const hash160 = (b: Uint8Array) => ripemd160(sha256(b));
const sha256d = (b: Uint8Array) => sha256(sha256(b));

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

function p2pkhScript(h: Uint8Array): Uint8Array {
  return concat(Uint8Array.from([0x76, 0xa9, 0x14]), h, Uint8Array.from([0x88, 0xac]));
}

/** Serialise a witness stack the way `finalScriptWitness` encodes it. */
function encodeWitness(stack: Uint8Array[]): string {
  const parts = [varint(stack.length)];
  for (const item of stack) parts.push(varint(item.length), item);
  return Buffer.from(concat(...parts)).toString('base64');
}

function bip322MessageHash(message: string): Uint8Array {
  const tag = sha256(utf8.encode('BIP0322-signed-message'));
  return sha256(concat(tag, tag, utf8.encode(message)));
}

/** `to_spend` hash in display byte order (what `addInput({txid})` expects). */
function toSpendTxid(message: string, spk: Uint8Array): Uint8Array {
  const scriptSig = concat(Uint8Array.from([0x00, 0x20]), bip322MessageHash(message));
  return sha256d(
    concat(
      u32le(0),
      varint(1),
      new Uint8Array(32),
      u32le(0xffffffff),
      varint(scriptSig.length),
      scriptSig,
      u32le(0),
      varint(1),
      new Uint8Array(8),
      varint(spk.length),
      spk,
      u32le(0)
    )
  ).reverse();
}

function buildToSignTx(message: string, spk: Uint8Array): btc.Transaction {
  const tx = new btc.Transaction({ version: 0, allowUnknownOutputs: true });
  tx.addInput({
    txid: toSpendTxid(message, spk),
    index: 0,
    sequence: 0,
    witnessUtxo: { script: spk, amount: BigInt(0) },
  });
  tx.addOutput({ script: Uint8Array.from([0x6a]), amount: BigInt(0) });
  return tx;
}

/** BIP-341 key-path private key tweak: `d' = (±d + H_TapTweak(P)) mod n`. */
function tweakPrivateKey(priv: Uint8Array, internalKey: Uint8Array): Uint8Array {
  const point = secp256k1.ProjectivePoint.fromPrivateKey(priv);
  const n = secp256k1.CURVE.n;
  const d0 = bytesToNumberBE(priv);
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

export function makeWallet(kind: AddrKind = 'p2tr'): SimWallet {
  const priv = secp256k1.utils.randomPrivateKey();
  const pub = secp256k1.getPublicKey(priv, true);

  let address: string | undefined;
  if (kind === 'p2wpkh') address = btc.p2wpkh(pub).address;
  else if (kind === 'p2sh-p2wpkh') address = btc.p2sh(btc.p2wpkh(pub)).address;
  else if (kind === 'p2tr') address = btc.p2tr(pub.subarray(1, 33)).address;
  else address = btc.p2pkh(pub).address;

  if (!address) throw new Error(`failed to derive ${kind} address`);
  return { privKey: Buffer.from(priv).toString('hex'), address, kind };
}

/**
 * Produce a real signature for `message` by `address`.
 *
 * P2PKH signs a legacy BIP-137 message; the segwit and taproot forms produce
 * full BIP-322 witness signatures.
 */
export function sign(privKeyHex: string, address: string, message: string): string {
  const priv = Uint8Array.from(Buffer.from(privKeyHex, 'hex'));
  const pub = secp256k1.getPublicKey(priv, true);
  const spk = btc.OutScript.encode(btc.Address().decode(address));

  // Legacy P2PKH → BIP-137 recoverable signature.
  if (address[0] === '1' || address[0] === 'm' || address[0] === 'n') {
    const sig = secp256k1.sign(magicHash(message), priv);
    // Header byte: 27 + recovery id, +4 to flag a compressed public key.
    const header = 27 + sig.recovery + 4;
    return Buffer.from(concat(Uint8Array.from([header]), sig.toCompactRawBytes())).toString('base64');
  }

  // Taproot key-path → BIP-322 with a Schnorr signature over the BIP-341 sighash.
  if (address.startsWith('bc1p') || address.startsWith('tb1p') || address.startsWith('bcrt1p')) {
    const sighash = buildToSignTx(message, spk).preimageWitnessV1(0, [spk], 0x00, [BigInt(0)]);
    const sig = schnorr.sign(sighash, tweakPrivateKey(priv, pub.subarray(1, 33)));
    return encodeWitness([sig]);
  }

  // Native or wrapped segwit → BIP-322 with an ECDSA signature over the BIP-143
  // sighash. The scriptCode is always the P2WPKH-equivalent P2PKH template,
  // even for P2SH-wrapped keys.
  const sighash = buildToSignTx(message, spk).preimageWitnessV0(0, p2pkhScript(hash160(pub)), 0x01, BigInt(0));
  const der = secp256k1.sign(sighash, priv).toDERRawBytes();
  return encodeWitness([concat(der, Uint8Array.from([0x01])), pub]);
}

let nonceCounter = 0;
/** Deterministic 64-hex nonce (avoids Date.now / Math.random for reproducibility). */
export function freshNonce(): string {
  nonceCounter += 1;
  return (nonceCounter.toString(16).padStart(8, '0') + 'ab'.repeat(28)).slice(0, 64);
}

/** The exact message format /api/v1/challenge issues (wallet signs this). */
export function challengeMessage(nonce: string): string {
  return `Block Genomics verification: ${nonce}`;
}
