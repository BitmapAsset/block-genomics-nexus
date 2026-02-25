/**
 * Block Genomics — Bitcoin-Native E2E Encryption
 * 
 * Uses Bitcoin wallet keypairs (secp256k1) for end-to-end encrypted DMs.
 * The Bitcoin private key NEVER leaves the wallet extension.
 * Instead, we derive a deterministic encryption keypair from a wallet signature.
 * 
 * Architecture:
 *   1. User signs a deterministic challenge with their Bitcoin wallet
 *   2. SHA-256(signature) → encryption private key (secp256k1)
 *   3. Derive encryption public key from that
 *   4. ECDH(my_enc_priv, their_enc_pub) → shared secret
 *   5. HKDF(shared_secret, salt) → AES-256-GCM key
 *   6. Encrypt message client-side, server stores only ciphertext
 * 
 * Security properties:
 *   - Bitcoin private key never exposed (stays in Unisat/Xverse/Leather)
 *   - Deterministic: same wallet always produces same encryption keypair
 *   - ECDH: shared secret without transmitting any private material
 *   - AES-256-GCM: authenticated encryption (integrity + confidentiality)
 *   - Unique nonce per message: no nonce reuse
 *   - HKDF: proper key derivation with domain separation
 *   - Server is zero-knowledge: cannot decrypt any messages
 *   - Forward secrecy via ephemeral session keys (Phase 2)
 * 
 * Zero private material stored or transmitted:
 *   - DB stores: encryption public key (safe to share)
 *   - Wire sends: ciphertext + nonce + sender public key
 *   - Browser memory: encryption private key (derived per session, cleared on disconnect)
 *   - Server: NOTHING decryptable
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { sha512 } from '@noble/hashes/sha512';
import { randomBytes } from '@noble/hashes/utils';

// ═══════════════════════════════════════════════════════════
// CONSTANTS — Domain separation prevents cross-protocol attacks
// ═══════════════════════════════════════════════════════════

/** Deterministic message signed by wallet to derive encryption keypair */
const DERIVATION_MESSAGE = 'Block Genomics E2E Encryption Key Derivation v1\n\nSigning this message derives your encryption identity.\nYour Bitcoin private key is never exposed.\nThis signature is used locally and never sent to any server.';

/** HKDF info tag for domain separation */
const HKDF_INFO = new TextEncoder().encode('block-genomics-e2e-v1');

/** HKDF salt — fixed per protocol version (changed = new keys, by design) */
const HKDF_SALT = new TextEncoder().encode('bg-e2e-salt-v1-2026');

/** AES-256-GCM nonce size (96 bits per NIST recommendation) */
const NONCE_SIZE = 12;

/** Maximum message size before encryption (16KB — prevents abuse) */
const MAX_MESSAGE_SIZE = 16384;

/** Message format version for future compatibility */
const MESSAGE_VERSION = 1;

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface EncryptionKeypair {
  privateKey: Uint8Array;  // 32 bytes — NEVER stored or transmitted
  publicKey: Uint8Array;   // 33 bytes (compressed) — safe to store in DB
}

export interface EncryptedMessage {
  version: number;        // Protocol version
  nonce: string;          // Base64 — unique per message (12 bytes)
  ciphertext: string;     // Base64 — AES-256-GCM encrypted
  senderPubKey: string;   // Hex — sender's encryption public key
  timestamp: number;      // Unix ms — included in AAD to prevent replay
}

export interface DecryptedMessage {
  text: string;
  senderPubKey: string;
  timestamp: number;
  verified: boolean;      // AAD integrity check passed
}

// ═══════════════════════════════════════════════════════════
// KEY DERIVATION — Bitcoin wallet → encryption keypair
// ═══════════════════════════════════════════════════════════

/**
 * Get the deterministic message that the wallet must sign.
 * This is public — it's the "challenge" shown to the user.
 */
export function getDerivationMessage(): string {
  return DERIVATION_MESSAGE;
}

/**
 * Derive an encryption keypair from a Bitcoin wallet signature.
 * 
 * The wallet signs DERIVATION_MESSAGE → we SHA-256 the signature
 * to get a valid secp256k1 private key → derive public key.
 * 
 * SECURITY:
 * - Signature is deterministic for the same wallet (BIP-322/legacy)
 * - SHA-256 output is uniform in [0, 2^256) — valid as secp256k1 scalar
 *   with overwhelming probability (n ≈ 2^256, failure odds ≈ 2^-128)
 * - The Bitcoin private key never leaves the wallet extension
 * - The derived key is independent of the Bitcoin key (one-way hash)
 * 
 * @param walletSignature - Base64 or hex signature from wallet.signMessage()
 * @returns Encryption keypair (private key in memory only, public key for DB)
 */
export function deriveEncryptionKeypair(walletSignature: string): EncryptionKeypair {
  if (!walletSignature || walletSignature.length < 40) {
    throw new Error('Invalid wallet signature — too short');
  }

  // Normalize signature to bytes
  const sigBytes = new TextEncoder().encode(walletSignature);
  
  // SHA-256(signature) → 32-byte private key
  // Double-hash for extra safety (like Bitcoin's hash256)
  const firstHash = sha256(sigBytes);
  const privateKey = sha256(firstHash);
  
  // Validate it's a valid secp256k1 scalar (extremely unlikely to fail)
  try {
    secp256k1.getPublicKey(privateKey);
  } catch {
    // In the astronomically unlikely case SHA-256 output ≥ curve order,
    // hash again with a counter
    const fallback = sha256(new Uint8Array([...privateKey, 0x01]));
    const pubKey = secp256k1.getPublicKey(fallback);
    return { privateKey: fallback, publicKey: pubKey };
  }

  const publicKey = secp256k1.getPublicKey(privateKey); // compressed (33 bytes)

  return { privateKey, publicKey };
}

// ═══════════════════════════════════════════════════════════
// ECDH — Shared secret derivation
// ═══════════════════════════════════════════════════════════

/**
 * Derive a shared AES-256 key from ECDH + HKDF.
 * 
 * ECDH(myPriv, theirPub) = shared point on secp256k1.
 * HKDF(shared_point, salt, info) = 256-bit AES key.
 * 
 * Both parties derive the SAME key independently:
 *   ECDH(A_priv, B_pub) === ECDH(B_priv, A_pub)
 * 
 * SECURITY:
 * - ECDH on secp256k1 (same curve as Bitcoin — battle-tested)
 * - HKDF with SHA-512 for key derivation (NIST SP 800-56C)
 * - Domain-separated salt and info prevent cross-protocol attacks
 * - Sorted public keys in HKDF input = same key regardless of direction
 * 
 * @param myPrivateKey - My encryption private key (32 bytes)
 * @param theirPublicKey - Their encryption public key (33 bytes compressed)
 * @returns 32-byte AES-256 key
 */
export function deriveSharedKey(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  if (myPrivateKey.length !== 32) throw new Error('Invalid private key length');
  if (theirPublicKey.length !== 33 && theirPublicKey.length !== 65) {
    throw new Error('Invalid public key length — expected compressed (33) or uncompressed (65)');
  }

  // ECDH: shared secret = x-coordinate of (myPriv × theirPub)
  const sharedPoint = secp256k1.getSharedSecret(myPrivateKey, theirPublicKey);
  
  // Use only x-coordinate (first 32 bytes after the 0x04 prefix for uncompressed,
  // or use the shared secret directly which noble returns as x-coord)
  const sharedSecret = sharedPoint.subarray(1, 33); // x-coordinate only

  // Sort both public keys for deterministic HKDF input
  // This ensures both parties derive the same key regardless of who initiates
  const myPublicKey = secp256k1.getPublicKey(myPrivateKey);
  const sortedKeys = [myPublicKey, theirPublicKey]
    .sort((a, b) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
      }
      return a.length - b.length;
    });
  
  // Combine shared secret with sorted public keys for HKDF input
  const ikm = new Uint8Array([...sharedSecret, ...sortedKeys[0], ...sortedKeys[1]]);

  // HKDF-SHA512: Extract + Expand → 32-byte AES key
  const aesKey = hkdf(sha512, ikm, HKDF_SALT, HKDF_INFO, 32);
  
  return aesKey;
}

// ═══════════════════════════════════════════════════════════
// ENCRYPTION — AES-256-GCM with authenticated additional data
// ═══════════════════════════════════════════════════════════

/**
 * Encrypt a message for a specific recipient.
 * 
 * Uses AES-256-GCM with:
 * - Unique random nonce per message (96 bits)
 * - AAD (Additional Authenticated Data) = version + timestamp + both pubkeys
 *   → prevents tampering with metadata, replay attacks, recipient confusion
 * 
 * @param plaintext - Message text to encrypt
 * @param myKeypair - Sender's encryption keypair
 * @param recipientPubKey - Recipient's encryption public key (hex string)
 * @returns EncryptedMessage ready to send to server
 */
export async function encryptMessage(
  plaintext: string,
  myKeypair: EncryptionKeypair,
  recipientPubKeyHex: string
): Promise<EncryptedMessage> {
  if (!plaintext || plaintext.length === 0) {
    throw new Error('Cannot encrypt empty message');
  }
  
  const plaintextBytes = new TextEncoder().encode(plaintext);
  if (plaintextBytes.length > MAX_MESSAGE_SIZE) {
    throw new Error(`Message too large (${plaintextBytes.length} bytes, max ${MAX_MESSAGE_SIZE})`);
  }

  // Parse recipient public key
  const recipientPubKey = hexToBytes(recipientPubKeyHex);
  
  // Validate recipient public key is a valid curve point
  try {
    secp256k1.ProjectivePoint.fromHex(recipientPubKey);
  } catch {
    throw new Error('Invalid recipient public key');
  }

  // Derive shared AES key via ECDH
  const aesKey = deriveSharedKey(myKeypair.privateKey, recipientPubKey);
  
  // Generate unique random nonce (CSPRNG)
  const nonce = randomBytes(NONCE_SIZE);
  
  // Timestamp for AAD (prevents replay)
  const timestamp = Date.now();
  
  // Build AAD: version (1 byte) + timestamp (8 bytes) + sender pubkey + recipient pubkey
  // AAD is authenticated but NOT encrypted — ensures metadata integrity
  const senderPubKeyHex = bytesToHex(myKeypair.publicKey);
  const aad = buildAAD(MESSAGE_VERSION, timestamp, senderPubKeyHex, recipientPubKeyHex);
  
  // AES-256-GCM encrypt
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new Uint8Array(aesKey).buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt']
  );
  
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonce) as unknown as BufferSource, additionalData: new Uint8Array(aad) as unknown as BufferSource },
    cryptoKey,
    new Uint8Array(plaintextBytes) as unknown as BufferSource
  );

  // Zero out the AES key from memory (best-effort)
  aesKey.fill(0);

  return {
    version: MESSAGE_VERSION,
    nonce: bufToBase64(nonce),
    ciphertext: bufToBase64(new Uint8Array(ciphertextBuf)),
    senderPubKey: senderPubKeyHex,
    timestamp,
  };
}

/**
 * Decrypt a message from a sender.
 * 
 * Verifies AAD integrity (version, timestamp, pubkeys) — if ANY metadata
 * was tampered with, GCM authentication fails and decryption throws.
 * 
 * @param encrypted - EncryptedMessage from server
 * @param myKeypair - Recipient's encryption keypair
 * @returns DecryptedMessage with verified flag
 */
export async function decryptMessage(
  encrypted: EncryptedMessage,
  myKeypair: EncryptionKeypair
): Promise<DecryptedMessage> {
  if (encrypted.version !== MESSAGE_VERSION) {
    throw new Error(`Unsupported message version: ${encrypted.version}`);
  }

  // Parse sender public key
  const senderPubKey = hexToBytes(encrypted.senderPubKey);
  
  // Validate sender public key
  try {
    secp256k1.ProjectivePoint.fromHex(senderPubKey);
  } catch {
    throw new Error('Invalid sender public key');
  }

  // Reject messages with timestamps too far in the future (>5 min)
  // Prevents timestamp manipulation attacks
  if (encrypted.timestamp > Date.now() + 300_000) {
    throw new Error('Message timestamp is in the future — possible replay attack');
  }

  // Derive shared AES key via ECDH (same key as sender derived)
  const aesKey = deriveSharedKey(myKeypair.privateKey, senderPubKey);
  
  const nonce = base64ToBuf(encrypted.nonce);
  const ciphertext = base64ToBuf(encrypted.ciphertext);
  
  // Rebuild AAD — must match exactly what sender used
  const myPubKeyHex = bytesToHex(myKeypair.publicKey);
  const aad = buildAAD(encrypted.version, encrypted.timestamp, encrypted.senderPubKey, myPubKeyHex);
  
  // AES-256-GCM decrypt + verify
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new Uint8Array(aesKey).buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt']
  );

  let plaintextBuf: ArrayBuffer;
  try {
    plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(nonce) as unknown as BufferSource, additionalData: new Uint8Array(aad) as unknown as BufferSource },
      cryptoKey,
      new Uint8Array(ciphertext) as unknown as BufferSource
    );
  } catch {
    // GCM authentication failed — message was tampered with
    aesKey.fill(0);
    throw new Error('Decryption failed — message may have been tampered with');
  }

  // Zero out the AES key
  aesKey.fill(0);

  const text = new TextDecoder().decode(plaintextBuf);

  return {
    text,
    senderPubKey: encrypted.senderPubKey,
    timestamp: encrypted.timestamp,
    verified: true, // GCM auth passed = integrity verified
  };
}

// ═══════════════════════════════════════════════════════════
// KEY MANAGEMENT — Public key storage and retrieval
// ═══════════════════════════════════════════════════════════

/**
 * Export encryption public key as hex string for DB storage.
 * This is the ONLY key material that should ever be stored or transmitted.
 */
export function exportPublicKey(keypair: EncryptionKeypair): string {
  return bytesToHex(keypair.publicKey);
}

/**
 * Verify that a public key hex string is a valid secp256k1 point.
 * Use before accepting public keys from the network.
 */
export function isValidPublicKey(pubKeyHex: string): boolean {
  try {
    const bytes = hexToBytes(pubKeyHex);
    secp256k1.ProjectivePoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Securely wipe a keypair from memory.
 * Call this on wallet disconnect or page unload.
 * 
 * NOTE: JavaScript doesn't guarantee memory zeroing (GC may keep copies),
 * but this is best-effort. The private key is also ephemeral —
 * it's re-derived from the wallet signature each session.
 */
export function wipeKeypair(keypair: EncryptionKeypair): void {
  keypair.privateKey.fill(0);
  keypair.publicKey.fill(0);
}

// ═══════════════════════════════════════════════════════════
// HELPERS — Encoding, AAD construction
// ═══════════════════════════════════════════════════════════

/** Build Additional Authenticated Data for GCM */
function buildAAD(
  version: number,
  timestamp: number,
  senderPubKeyHex: string,
  recipientPubKeyHex: string
): Uint8Array {
  // Sort pubkeys so both sides build identical AAD
  const [first, second] = [senderPubKeyHex, recipientPubKeyHex].sort();
  const aadString = `bg-e2e:v${version}:${timestamp}:${first}:${second}`;
  return new TextEncoder().encode(aadString);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

function bufToBase64(buf: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buf).toString('base64');
  }
  // Browser fallback
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  // Browser fallback
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
