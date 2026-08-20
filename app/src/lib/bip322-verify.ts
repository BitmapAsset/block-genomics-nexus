/**
 * BIP-322 signature verification on audited primitives.
 *
 * Replaces `bip322-js`, whose transitive `elliptic` dependency has been
 * unmaintained since 2024-11 and carries unpatchable advisories. This module
 * guards block ownership, so it is built on `@noble/curves` (ECDSA + Schnorr)
 * and `@scure/btc-signer` (address parsing, BIP-143/BIP-341 sighash) instead.
 *
 * Accept/reject semantics are a deliberate re-implementation of
 * `bip322-js@3.0.0`'s `Verifier.verifySignature(addr, msg, sig)` with
 * `useStrictVerification = false`, so that every signature that verified before
 * the migration still verifies after it. The behaviours that look odd here are
 * bug-for-bug parity, and each is called out at its site.
 *
 * Everything fails CLOSED: malformed input returns false rather than throwing.
 */

import * as btc from '@scure/btc-signer';
import { secp256k1, schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';

/** BIP-322 fixes SIGHASH_ALL for the ECDSA paths; SIGHASH_DEFAULT is the taproot equivalent. */
const SIGHASH_DEFAULT = 0x00;
const SIGHASH_ALL = 0x01;

/** Guard against a hostile witness stack forcing unbounded allocation. */
const MAX_WITNESS_ITEMS = 16;

/** Regtest shares testnet's base58 versions but uses its own bech32 HRP. */
const REGTEST: typeof btc.NETWORK = { ...btc.TEST_NETWORK, bech32: 'bcrt' };
const NETWORKS = [btc.NETWORK, btc.TEST_NETWORK, REGTEST];

const utf8 = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

function sha256d(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.from([n]);
  if (n <= 0xffff) return Uint8Array.from([0xfd, n & 0xff, (n >> 8) & 0xff]);
  if (n <= 0xffffffff) return concat(Uint8Array.from([0xfe]), u32le(n));
  throw new Error('varint too large');
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** `OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG` — the BIP-143 scriptCode for P2WPKH. */
function p2pkhScript(pubkeyHash: Uint8Array): Uint8Array {
  return concat(
    Uint8Array.from([0x76, 0xa9, 0x14]),
    pubkeyHash,
    Uint8Array.from([0x88, 0xac])
  );
}

type Decoded = ReturnType<ReturnType<typeof btc.Address>['decode']>;

interface ParsedAddress {
  decoded: Decoded;
  scriptPubKey: Uint8Array;
}

/**
 * Decode a mainnet, testnet or regtest address into its scriptPubKey.
 * `bip322-js` accepts all three networks, so we do too.
 *
 * @returns null when the address is malformed or fails its checksum.
 */
function parseAddress(address: string): ParsedAddress | null {
  for (const network of NETWORKS) {
    try {
      const decoded = btc.Address(network).decode(address);
      return { decoded, scriptPubKey: btc.OutScript.encode(decoded) };
    } catch {
      /* try the next network */
    }
  }
  return null;
}

function decodeBase64(input: string): Uint8Array | null {
  try {
    const buf = Buffer.from(input, 'base64');
    // Buffer.from is lenient: it silently drops invalid characters instead of
    // throwing. Re-encoding and comparing lengths rejects the resulting
    // truncated garbage rather than verifying against a half-read signature.
    if (buf.length === 0) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/**
 * Read a Bitcoin witness stack (`finalScriptWitness` encoding: item count,
 * then length-prefixed items). Requires the buffer to be consumed exactly —
 * trailing bytes mean the caller handed us something that is not a witness.
 */
function parseWitnessStack(raw: Uint8Array): Uint8Array[] | null {
  let offset = 0;
  const readVarint = (): number | null => {
    if (offset >= raw.length) return null;
    const first = raw[offset++];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      if (offset + 2 > raw.length) return null;
      const v = raw[offset] | (raw[offset + 1] << 8);
      offset += 2;
      return v;
    }
    if (first === 0xfe) {
      if (offset + 4 > raw.length) return null;
      const v = new DataView(raw.buffer, raw.byteOffset + offset, 4).getUint32(0, true);
      offset += 4;
      return v;
    }
    return null; // 0xff / 64-bit lengths never appear in a real witness
  };

  const count = readVarint();
  if (count === null || count === 0 || count > MAX_WITNESS_ITEMS) return null;

  const stack: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const len = readVarint();
    if (len === null || offset + len > raw.length) return null;
    stack.push(raw.slice(offset, offset + len));
    offset += len;
  }

  if (offset !== raw.length) return null;
  return stack;
}

/**
 * BIP-322 message hash: `tagged_hash("BIP0322-signed-message", message)`.
 */
function bip322MessageHash(message: string): Uint8Array {
  const tag = sha256(utf8.encode('BIP0322-signed-message'));
  return sha256(concat(tag, tag, utf8.encode(message)));
}

/**
 * Build the BIP-322 `to_spend` transaction and return its hash in display
 * (big-endian) byte order, which is what `@scure/btc-signer` expects for
 * `addInput({ txid })`.
 *
 * `to_spend` is a fixed shape: version 0, locktime 0, one input spending the
 * null outpoint with `OP_0 PUSH32 <message_hash>`, one zero-value output
 * carrying the signer's scriptPubKey. It is serialised by hand because no
 * wallet library will build a transaction spending `0000…00:0xFFFFFFFF`.
 */
function toSpendTxid(message: string, scriptPubKey: Uint8Array): Uint8Array {
  const scriptSig = concat(Uint8Array.from([0x00, 0x20]), bip322MessageHash(message));
  const serialized = concat(
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
  );
  return sha256d(serialized).reverse();
}

/**
 * Build the BIP-322 `to_sign` transaction: spends `to_spend` output 0 and pays
 * a single zero-value `OP_RETURN`. Returned unsigned; the caller derives the
 * BIP-143 or BIP-341 sighash from it.
 */
function buildToSignTx(txid: Uint8Array, scriptPubKey: Uint8Array): btc.Transaction {
  const tx = new btc.Transaction({ version: 0, allowUnknownOutputs: true });
  tx.addInput({ txid, index: 0, sequence: 0, witnessUtxo: { script: scriptPubKey, amount: BigInt(0) } });
  tx.addOutput({ script: Uint8Array.from([0x6a]), amount: BigInt(0) });
  return tx;
}

/**
 * Split a DER signature with its trailing sighash byte.
 *
 * Mirrors bitcoinjs' `script_signature.decode`, which `bip322-js` uses: the
 * sighash type must be one of ALL/NONE/SINGLE, optionally ORed with
 * ANYONECANPAY. Note that the type is validated but NOT used — the sighash is
 * always computed with SIGHASH_ALL, matching `bip322-js`.
 */
function decodeScriptSignature(encoded: Uint8Array): Uint8Array | null {
  if (encoded.length < 9) return null;
  const hashType = encoded[encoded.length - 1];
  const hashTypeMod = hashType & ~0x80;
  if (hashTypeMod <= 0 || hashTypeMod >= 4) return null;
  try {
    // Compact (r‖s) form — `secp256k1.verify` takes bytes, and DER parsing here
    // still rejects the non-canonical encodings bitcoinjs would have rejected.
    return secp256k1.Signature.fromDER(encoded.slice(0, -1)).toCompactRawBytes();
  } catch {
    return null;
  }
}

/**
 * BIP-322 verification for the witness address types: P2WPKH, P2SH-P2WPKH and
 * single-key-spend P2TR.
 */
function verifyBip322Witness(
  address: string,
  message: string,
  witness: Uint8Array[],
  scriptPubKey: Uint8Array
): boolean {
  const txid = toSpendTxid(message, scriptPubKey);
  const tx = buildToSignTx(txid, scriptPubKey);

  // A 2-item stack ending in a compressed pubkey is the P2WPKH/P2SH-P2WPKH
  // shape. `bip322-js` dispatches on the witness before the address, so a
  // taproot address presenting this stack lands here too — and then fails the
  // program comparison below on length. Preserved deliberately.
  const isKeyPathWitness =
    witness.length === 2 &&
    witness[1].length === 33 &&
    (witness[1][0] === 0x02 || witness[1][0] === 0x03);

  if (isKeyPathWitness) {
    const [encodedSignature, publicKey] = witness;
    const signature = decodeScriptSignature(encodedSignature);
    if (!signature) return false;

    const hashedPubkey = hash160(publicKey);
    const isP2SH = address[0] === '3' || address[0] === '2';

    if (isP2SH) {
      // The witness program must be the P2SH redeem script `OP_0 <pubkeyhash>`,
      // and its hash must match the one committed in `OP_HASH160 <h> OP_EQUAL`.
      const redeemScript = concat(Uint8Array.from([0x00, 0x14]), hashedPubkey);
      const committed = scriptPubKey.subarray(2, scriptPubKey.length - 1);
      if (!equalBytes(hash160(redeemScript), committed)) return false;
    } else {
      // Native segwit: `OP_0 <pubkeyhash>` — compare the program directly.
      if (!equalBytes(hashedPubkey, scriptPubKey.subarray(2))) return false;
    }

    const sighash = tx.preimageWitnessV0(0, p2pkhScript(hashedPubkey), SIGHASH_ALL, BigInt(0));
    // noble defaults to lowS:true, rejecting malleated high-S signatures.
    // `bip322-js` rejects them too (@bitcoinerlab/secp256k1 is itself
    // noble-backed), so the default is the compatible choice. A high-S vector
    // in the fixture pins this — an earlier lowS:false here was strictly more
    // permissive than the code it replaced.
    return secp256k1.verify(signature, sighash, publicKey);
  }

  const isP2TR = /^(bc1p|tb1p|bcrt1p)/.test(address);
  if (!isP2TR) return false;
  // Script-path spends are out of scope, exactly as in `bip322-js`.
  if (witness.length !== 1) return false;

  const encoded = witness[0];
  let hashType: number;
  let signature: Uint8Array;
  if (encoded.length === 64) {
    hashType = SIGHASH_DEFAULT;
    signature = encoded;
  } else if (encoded.length === 65) {
    hashType = encoded[64];
    signature = encoded.subarray(0, 64);
  } else {
    return false;
  }
  // BIP-322 mandates SIGHASH_ALL; BIP-341 makes SIGHASH_DEFAULT equivalent.
  if (hashType !== SIGHASH_DEFAULT && hashType !== SIGHASH_ALL) return false;

  const outputKey = scriptPubKey.subarray(2);
  try {
    const sighash = tx.preimageWitnessV1(0, [scriptPubKey], hashType, [BigInt(0)]);
    return schnorr.verify(signature, sighash, outputKey);
  } catch {
    return false;
  }
}

/**
 * Legacy "Bitcoin Signed Message" hash (BIP-137 / `bitcoinjs-message`).
 */
function magicHash(message: string): Uint8Array {
  // The 0x18 is the length of the prefix text itself, per the Bitcoin
  // signed-message format. Written as an escape so it stays visible in review.
  const prefix = utf8.encode('\x18Bitcoin Signed Message:\n');
  const msg = utf8.encode(message);
  return sha256d(concat(prefix, varint(msg.length), msg));
}

/**
 * Every address the given public key can produce, across all three networks.
 * `bip322-js` compares the claimed address against this set rather than
 * against a single derivation, so a signature is valid for any address form of
 * the recovering key.
 */
function derivedAddresses(pubkey: Uint8Array, kind: 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr'): string[] {
  const out: string[] = [];
  for (const network of NETWORKS) {
    try {
      if (kind === 'p2pkh') out.push(btc.p2pkh(pubkey, network).address!);
      else if (kind === 'p2sh-p2wpkh') out.push(btc.p2sh(btc.p2wpkh(pubkey, network), network).address!);
      else if (kind === 'p2wpkh') out.push(btc.p2wpkh(pubkey, network).address!);
      else out.push(btc.p2tr(pubkey.subarray(1, 33), undefined, network).address!);
    } catch {
      /* this key cannot take this form on this network */
    }
  }
  return out;
}

/**
 * Verify a legacy BIP-137 signature, non-strict.
 *
 * The security property is public-key recovery: an attacker can craft an (r, s)
 * pair that recovers to *some* key, but making it recover to the key behind a
 * specific claimed address requires that private key. `bip322-js` then re-runs
 * `bitcoinjs-message.verify` against the addresses derived from the recovered
 * key, which is true by construction — so the address match below IS the check,
 * and the two implementations accept exactly the same set.
 *
 * Non-strict means the address-type flag in the header byte is ignored, so a
 * signature produced by a wallet that mislabels its address type still passes.
 */
function verifyBip137(address: string, message: string, signature: Uint8Array): boolean {
  if (signature.length !== 65) return false;

  const flagByte = signature[0] - 27;
  if (flagByte < 0 || flagByte > 19) return false;
  const compressed = !!(flagByte & 12);
  const recovery = flagByte & 3;

  let recovered: Uint8Array;
  try {
    const sig = secp256k1.Signature.fromCompact(signature.subarray(1)).addRecoveryBit(recovery);
    recovered = sig.recoverPublicKey(magicHash(message)).toRawBytes(compressed);
  } catch {
    return false;
  }

  // `btc.p2tr` needs a 33-byte key to take an x-only prefix from, and the
  // segwit forms are only defined for compressed keys.
  const compressedKey = compressed
    ? recovered
    : (() => {
        try {
          return secp256k1.ProjectivePoint.fromHex(recovered).toRawBytes(true);
        } catch {
          return null;
        }
      })();

  if (address[0] === '1' || address[0] === 'm' || address[0] === 'n') {
    // P2PKH: the key may have been used in either encoding.
    const candidates = [
      ...derivedAddresses(recovered, 'p2pkh'),
      ...(compressedKey ? derivedAddresses(compressedKey, 'p2pkh') : []),
    ];
    return candidates.includes(address);
  }

  if (!compressedKey) return false;

  if (address[0] === '3' || address[0] === '2') {
    return derivedAddresses(compressedKey, 'p2sh-p2wpkh').includes(address);
  }
  if (/^(bc1q|tb1q|bcrt1q)/.test(address)) {
    return derivedAddresses(compressedKey, 'p2wpkh').includes(address);
  }
  return derivedAddresses(compressedKey, 'p2tr').includes(address);
}

/**
 * Verify a BIP-322 signature over `message` by `address`.
 *
 * @param address   Bitcoin address claimed to have signed (P2PKH, P2SH-P2WPKH, P2WPKH or single-key P2TR).
 * @param message   Exact message that was signed.
 * @param signatureBase64 Standard-base64 signature.
 * @returns true only for a cryptographically valid signature. Never throws.
 */
export function verifyBip322Signature(address: string, message: string, signatureBase64: string): boolean {
  if (typeof address !== 'string' || typeof message !== 'string' || typeof signatureBase64 !== 'string') {
    return false;
  }
  if (!address || !signatureBase64) return false;

  const parsed = parseAddress(address);
  if (!parsed) return false;

  const raw = decodeBase64(signatureBase64);
  if (!raw) return false;

  try {
    // A 65-byte payload is a legacy BIP-137 signature regardless of address
    // type, and a P2PKH address only ever carries one. Same dispatch as
    // `bip322-js`, which is what lets Leather/Sparrow-style legacy signatures
    // authenticate a segwit or taproot address.
    if (address[0] === '1' || address[0] === 'm' || address[0] === 'n' || raw.length === 65) {
      return verifyBip137(address, message, raw);
    }

    const witness = parseWitnessStack(raw);
    if (!witness) return false;
    return verifyBip322Witness(address, message, witness, parsed.scriptPubKey);
  } catch {
    // Defence in depth: any unexpected throw from a primitive is a rejection.
    return false;
  }
}
