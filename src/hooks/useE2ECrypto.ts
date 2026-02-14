'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  deriveEncryptionKeypair,
  exportPublicKey,
  encryptMessage,
  decryptMessage,
  wipeKeypair,
  getDerivationMessage,
  isValidPublicKey,
  type EncryptionKeypair,
  type EncryptedMessage,
  type DecryptedMessage,
} from '@/lib/e2e-crypto';
import { signWithWallet } from '@/lib/wallet-utils';

/**
 * React hook for Bitcoin-native E2E encryption.
 * 
 * Usage:
 *   const { isReady, setupEncryption, encrypt, decrypt } = useE2ECrypto();
 *   
 *   // On wallet connect:
 *   await setupEncryption(walletType, walletAddress);
 *   
 *   // To send encrypted DM:
 *   const encrypted = await encrypt("hello", recipientHandle);
 *   
 *   // To decrypt received DM:
 *   const decrypted = await decrypt(encryptedMessage);
 */
export function useE2ECrypto() {
  const [isReady, setIsReady] = useState(false);
  const [myPubKeyHex, setMyPubKeyHex] = useState<string | null>(null);
  const keypairRef = useRef<EncryptionKeypair | null>(null);
  
  // Cache of recipient public keys: handle → pubKeyHex
  const pubKeyCache = useRef<Map<string, string>>(new Map());

  /**
   * Initialize E2E encryption for the current wallet session.
   * Asks wallet to sign the derivation message → derives keypair → registers public key.
   */
  const setupEncryption = useCallback(async (
    walletType: 'unisat' | 'xverse' | 'leather',
    walletAddress: string
  ): Promise<boolean> => {
    try {
      // 1. Sign derivation message with Bitcoin wallet
      const message = getDerivationMessage();
      const signature = await signWithWallet(walletType, message);
      if (!signature) throw new Error('Wallet signature failed');

      // 2. Derive encryption keypair
      const keypair = deriveEncryptionKeypair(signature);
      keypairRef.current = keypair;

      // 3. Export public key
      const pubHex = exportPublicKey(keypair);
      setMyPubKeyHex(pubHex);

      // 4. Register public key on server
      const res = await fetch('/api/v1/encryption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          encryptionPubKey: pubHex,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Failed to register encryption key:', err);
        // Still usable locally even if server registration fails
      }

      setIsReady(true);
      return true;
    } catch (err) {
      console.error('E2E setup failed:', err);
      return false;
    }
  }, []);

  /**
   * Fetch a recipient's encryption public key by handle or wallet.
   */
  const getRecipientPubKey = useCallback(async (
    identifier: string // handle or wallet address
  ): Promise<string | null> => {
    // Check cache first
    const cached = pubKeyCache.current.get(identifier.toLowerCase());
    if (cached) return cached;

    try {
      const isWallet = identifier.startsWith('bc1') || identifier.startsWith('1') || identifier.startsWith('3');
      const param = isWallet ? `wallet=${identifier}` : `handle=${identifier.toLowerCase()}`;
      const res = await fetch(`/api/v1/encryption?${param}`);
      if (!res.ok) return null;

      const json = await res.json();
      const pubKey = json.data?.encryptionPubKey;
      if (!pubKey || !isValidPublicKey(pubKey)) return null;

      // Cache it
      pubKeyCache.current.set(identifier.toLowerCase(), pubKey);
      return pubKey;
    } catch {
      return null;
    }
  }, []);

  /**
   * Encrypt a message for a recipient.
   * Returns EncryptedMessage to store on server (server cannot decrypt it).
   */
  const encrypt = useCallback(async (
    plaintext: string,
    recipientIdentifier: string
  ): Promise<EncryptedMessage | null> => {
    if (!keypairRef.current) {
      console.error('E2E not initialized — call setupEncryption first');
      return null;
    }

    const recipientPubKey = await getRecipientPubKey(recipientIdentifier);
    if (!recipientPubKey) {
      console.error('Recipient has no encryption key — they need to set up E2E first');
      return null;
    }

    try {
      return await encryptMessage(plaintext, keypairRef.current, recipientPubKey);
    } catch (err) {
      console.error('Encryption failed:', err);
      return null;
    }
  }, [getRecipientPubKey]);

  /**
   * Decrypt a received message.
   */
  const decrypt = useCallback(async (
    encrypted: EncryptedMessage
  ): Promise<DecryptedMessage | null> => {
    if (!keypairRef.current) {
      console.error('E2E not initialized — call setupEncryption first');
      return null;
    }

    try {
      return await decryptMessage(encrypted, keypairRef.current);
    } catch (err) {
      console.error('Decryption failed:', err);
      return null;
    }
  }, []);

  /**
   * Clean up — wipe private key from memory on unmount or disconnect.
   */
  const teardown = useCallback(() => {
    if (keypairRef.current) {
      wipeKeypair(keypairRef.current);
      keypairRef.current = null;
    }
    setIsReady(false);
    setMyPubKeyHex(null);
    pubKeyCache.current.clear();
  }, []);

  // Wipe on unmount
  useEffect(() => {
    return () => {
      if (keypairRef.current) {
        wipeKeypair(keypairRef.current);
      }
    };
  }, []);

  return {
    isReady,
    myPubKeyHex,
    setupEncryption,
    encrypt,
    decrypt,
    getRecipientPubKey,
    teardown,
  };
}
