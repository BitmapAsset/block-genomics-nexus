/**
 * LDPInvoice — Lightning Deed Protocol invoice encoding/decoding.
 *
 * An LDP Invoice is like a Lightning invoice but for Runes. It encodes all the
 * information needed for a sender to deed-lock their Rune UTXO and the recipient
 * to claim it after Lightning payment.
 *
 * Format: bech32-encoded with "ldp" human-readable part.
 */

import * as crypto from 'crypto';

/** LDP Invoice data structure */
export interface LDPInvoice {
  /** Protocol version */
  version: number;
  /** Rune ID (block:tx format, e.g. "840000:1") */
  runeId: string;
  /** Amount of Rune in base units */
  runeAmount: bigint;
  /** Lightning payment amount in satoshis */
  lightningAmountSats: number;
  /** SHA256 payment hash (binds Lightning HTLC to deed-lock) */
  paymentHash: Buffer;
  /** Recipient's x-only public key (32 bytes) */
  recipientPubkey: Buffer;
  /** Invoice expiry in seconds from creation */
  expiry: number;
  /** Optional: sender's UTXO (txid:vout) for the deed-lock source */
  senderUTXO?: string;
  /** Creation timestamp (unix seconds) */
  timestamp: number;
}

// Simple bech32 implementation for LDP invoice encoding
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function bech32Checksum(hrp: string, data: number[]): number[] {
  const values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const polymod = bech32Polymod(values) ^ 1;
  const ret: number[] = [];
  for (let i = 0; i < 6; i++) ret.push((polymod >> (5 * (5 - i))) & 31);
  return ret;
}

function bech32Encode(hrp: string, data: number[]): string {
  const checksum = bech32Checksum(hrp, data);
  let ret = hrp + '1';
  for (const d of data.concat(checksum)) ret += CHARSET[d];
  return ret;
}

function bech32Decode(str: string): { hrp: string; data: number[] } | null {
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) return null;
  const hrp = str.substring(0, pos);
  const data: number[] = [];
  for (let i = pos + 1; i < str.length; i++) {
    const idx = CHARSET.indexOf(str[i]);
    if (idx === -1) return null;
    data.push(idx);
  }
  if (bech32Polymod(bech32HrpExpand(hrp).concat(data)) !== 1) return null;
  return { hrp, data: data.slice(0, -6) };
}

/** Convert 8-bit bytes to 5-bit groups for bech32 */
function to5bit(data: Buffer): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const byte of data) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

/** Convert 5-bit groups back to 8-bit bytes */
function from5bit(data: number[]): Buffer {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const val of data) {
    acc = (acc << 5) | val;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return Buffer.from(out);
}

/**
 * Serializes an LDP invoice to a binary buffer.
 * TLV-ish format: [version:1][timestamp:4][runeId:var][runeAmount:8][sats:4][hash:32][pubkey:32][expiry:4][senderUTXO:var]
 */
function serializeInvoice(invoice: LDPInvoice): Buffer {
  const runeIdBuf = Buffer.from(invoice.runeId, 'utf8');
  const senderUTXOBuf = invoice.senderUTXO ? Buffer.from(invoice.senderUTXO, 'utf8') : Buffer.alloc(0);

  const buf = Buffer.alloc(1 + 4 + 1 + runeIdBuf.length + 8 + 4 + 32 + 32 + 4 + 1 + senderUTXOBuf.length);
  let offset = 0;

  buf.writeUInt8(invoice.version, offset); offset += 1;
  buf.writeUInt32BE(invoice.timestamp, offset); offset += 4;
  buf.writeUInt8(runeIdBuf.length, offset); offset += 1;
  runeIdBuf.copy(buf, offset); offset += runeIdBuf.length;
  buf.writeBigUInt64BE(invoice.runeAmount, offset); offset += 8;
  buf.writeUInt32BE(invoice.lightningAmountSats, offset); offset += 4;
  invoice.paymentHash.copy(buf, offset); offset += 32;
  invoice.recipientPubkey.copy(buf, offset); offset += 32;
  buf.writeUInt32BE(invoice.expiry, offset); offset += 4;
  buf.writeUInt8(senderUTXOBuf.length, offset); offset += 1;
  if (senderUTXOBuf.length > 0) {
    senderUTXOBuf.copy(buf, offset); offset += senderUTXOBuf.length;
  }

  return buf.subarray(0, offset);
}

/**
 * Deserializes an LDP invoice from a binary buffer.
 */
function deserializeInvoice(buf: Buffer): LDPInvoice {
  let offset = 0;

  const version = buf.readUInt8(offset); offset += 1;
  const timestamp = buf.readUInt32BE(offset); offset += 4;
  const runeIdLen = buf.readUInt8(offset); offset += 1;
  const runeId = buf.subarray(offset, offset + runeIdLen).toString('utf8'); offset += runeIdLen;
  const runeAmount = buf.readBigUInt64BE(offset); offset += 8;
  const lightningAmountSats = buf.readUInt32BE(offset); offset += 4;
  const paymentHash = Buffer.from(buf.subarray(offset, offset + 32)); offset += 32;
  const recipientPubkey = Buffer.from(buf.subarray(offset, offset + 32)); offset += 32;
  const expiry = buf.readUInt32BE(offset); offset += 4;
  const senderUTXOLen = buf.readUInt8(offset); offset += 1;
  const senderUTXO = senderUTXOLen > 0
    ? buf.subarray(offset, offset + senderUTXOLen).toString('utf8')
    : undefined;

  return {
    version,
    runeId,
    runeAmount,
    lightningAmountSats,
    paymentHash,
    recipientPubkey,
    expiry,
    senderUTXO,
    timestamp,
  };
}

/**
 * Creates a new LDP Invoice for a Rune transfer.
 *
 * @param runeId - Rune ID (e.g. "840000:1")
 * @param runeAmount - Amount of Rune to transfer
 * @param recipientPubkey - Recipient's 32-byte x-only pubkey
 * @param lightningAmountSats - Lightning payment amount in sats
 * @param expiry - Invoice expiry in seconds (default: 3600 = 1 hour)
 * @param senderUTXO - Optional sender UTXO reference
 */
export function createLDPInvoice(
  runeId: string,
  runeAmount: bigint,
  recipientPubkey: Buffer,
  lightningAmountSats: number,
  expiry: number = 3600,
  senderUTXO?: string
): LDPInvoice & { preimage: Buffer } {
  const preimage = crypto.randomBytes(32);
  const paymentHash = crypto.createHash('sha256').update(preimage).digest();

  const invoice: LDPInvoice = {
    version: 1,
    runeId,
    runeAmount,
    lightningAmountSats,
    paymentHash,
    recipientPubkey,
    expiry,
    senderUTXO,
    timestamp: Math.floor(Date.now() / 1000),
  };

  return { ...invoice, preimage };
}

/**
 * Encodes an LDP Invoice as a bech32 string with "ldp" prefix.
 */
export function encodeLDPInvoice(invoice: LDPInvoice): string {
  const serialized = serializeInvoice(invoice);
  const data5bit = to5bit(serialized);
  return bech32Encode('ldp', data5bit);
}

/**
 * Decodes a bech32-encoded LDP Invoice string.
 */
export function decodeLDPInvoice(encoded: string): LDPInvoice {
  const decoded = bech32Decode(encoded.toLowerCase());
  if (!decoded) throw new Error('Invalid bech32 encoding');
  if (decoded.hrp !== 'ldp') throw new Error(`Invalid HRP: expected "ldp", got "${decoded.hrp}"`);

  const buf = from5bit(decoded.data);
  return deserializeInvoice(buf);
}
