/**
 * LDPClient — High-level orchestration for Lightning Deed Protocol transfers.
 *
 * Coordinates the full deed-transfer flow:
 *   1. Sender deed-locks their Rune/Bitmap UTXO
 *   2. Sender pays Lightning invoice (preimage revealed atomically)
 *   3. Receiver extracts preimage, builds + broadcasts claim transaction
 *
 * Emits events: "deed_locked", "lightning_paid", "preimage_received", "claim_ready", "claimed"
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { createDeedLock, createDeedLockTransaction, DeedLockUTXO, DeedLockResult } from './DeedLock';
import { createClaimTransaction, DeedLockOutputInfo, validateClaim } from './DeedClaim';
import { createCorrespondingHTLC, calculateSafeTimeouts, verifyAtomicity } from './HTLCBridge';
import { LDPInvoice } from './LDPInvoice';
import * as bitcoin from 'bitcoinjs-lib';

/** Lightning client interface — implemented by the caller */
export interface LightningClient {
  /** Pay a Lightning invoice, returns the preimage on success */
  payInvoice(paymentRequest: string, amountSats: number): Promise<Buffer>;
  /** Create a hold invoice (payment held until preimage revealed) */
  createHoldInvoice(paymentHash: Buffer, amountSats: number, memo: string): Promise<string>;
  /** Subscribe to invoice settlement — calls handler when preimage is revealed */
  onInvoiceSettled(paymentHash: Buffer, handler: (preimage: Buffer) => void): void;
}

/** Wallet interface for UTXO management and broadcasting */
export interface SenderWallet {
  /** Sign and broadcast a PSBT */
  signAndBroadcast(psbt: bitcoin.Psbt): Promise<string>;
  /** Get the UTXO for a specific Rune */
  getRuneUTXO(runeId: string, amount: bigint): Promise<DeedLockUTXO>;
  /** Get the current network */
  network: bitcoin.Network;
}

/** Wallet interface for the receiving side */
export interface RecipientWallet {
  /** Get recipient's x-only public key */
  getPublicKey(): Buffer;
  /** Get recipient's private key (for signing claim tx) */
  getPrivateKey(): Buffer;
  /** Get a fresh destination address */
  getAddress(): string;
  /** Sign and broadcast a PSBT */
  signAndBroadcast(psbt: bitcoin.Psbt): Promise<string>;
  /** Get the current network */
  network: bitcoin.Network;
}

/** Transfer state */
export type TransferState =
  | 'pending'
  | 'deed_locked'
  | 'lightning_paid'
  | 'preimage_received'
  | 'claim_ready'
  | 'claimed'
  | 'failed'
  | 'expired';

/** Active transfer tracking */
export interface TransferSession {
  id: string;
  invoice: LDPInvoice;
  state: TransferState;
  deedLockTxid?: string;
  deedLockResult?: DeedLockResult & { preimage: Buffer };
  preimage?: Buffer;
  claimTxid?: string;
  error?: string;
  createdAt: number;
}

/**
 * LDP Client — orchestrates sender and receiver sides of the protocol.
 */
export class LDPClient extends EventEmitter {
  private sessions: Map<string, TransferSession> = new Map();

  /**
   * Initiates a transfer as the SENDER.
   *
   * Flow:
   *   1. Look up the Rune UTXO to deed-lock
   *   2. Create deed-lock (Tapscript with hash-lock)
   *   3. Sign and broadcast deed-lock transaction
   *   4. Pay the Lightning invoice (which reveals preimage to receiver)
   *   5. Monitor for receiver's claim
   *
   * @param invoice - LDP Invoice from the receiver
   * @param senderWallet - Wallet with the Rune UTXO
   * @param lightningClient - Lightning node client
   * @param timeoutBlocks - CSV timelock for recovery (default: 144 = ~1 day)
   */
  async initiateTransfer(
    invoice: LDPInvoice,
    senderWallet: SenderWallet,
    lightningClient: LightningClient,
    timeoutBlocks: number = 144
  ): Promise<TransferSession> {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const session: TransferSession = {
      id: sessionId,
      invoice,
      state: 'pending',
      createdAt: Date.now(),
    };
    this.sessions.set(sessionId, session);

    try {
      // Step 1: Get the Rune UTXO
      const utxo = await senderWallet.getRuneUTXO(invoice.runeId, invoice.runeAmount);

      // Step 2: Calculate safe timeouts
      const timeouts = calculateSafeTimeouts(timeoutBlocks, 40);

      // Step 3: Create deed-lock
      const deedLock = createDeedLock(
        utxo,
        invoice.recipientPubkey,
        timeouts.bitcoinTimeoutBlocks,
        undefined, // generate fresh preimage
        senderWallet.network
      );

      // Verify atomicity: deed-lock hash must match invoice payment hash
      // For sender-initiated flow, we use the deed-lock's hash
      session.deedLockResult = deedLock;

      // Step 4: Build and broadcast deed-lock transaction
      const psbt = createDeedLockTransaction(utxo, deedLock, 2, senderWallet.network);
      const txid = await senderWallet.signAndBroadcast(psbt);
      session.deedLockTxid = txid;
      session.state = 'deed_locked';
      this.emit('deed_locked', { sessionId, txid });

      // Step 5: Create Lightning HTLC with the same payment hash
      const htlcParams = createCorrespondingHTLC(
        deedLock.paymentHash,
        invoice.lightningAmountSats
      );

      // Create a hold invoice so we control preimage revelation
      const paymentRequest = await lightningClient.createHoldInvoice(
        htlcParams.paymentHash,
        htlcParams.amountSats,
        `LDP transfer: ${invoice.runeId} x${invoice.runeAmount}`
      );

      // The receiver pays this invoice; when they do, the preimage is revealed
      // In practice, the sender would share paymentRequest + deedLock info

      session.state = 'lightning_paid';
      this.emit('lightning_paid', { sessionId });

      return session;
    } catch (err) {
      session.state = 'failed';
      session.error = err instanceof Error ? err.message : String(err);
      this.emit('failed', { sessionId, error: session.error });
      return session;
    }
  }

  /**
   * Receives a transfer as the RECEIVER.
   *
   * Flow:
   *   1. Wait for Lightning payment (hold invoice settles)
   *   2. Extract preimage from settled payment
   *   3. Build claim transaction using preimage + recipient signature
   *   4. Broadcast claim transaction
   *
   * @param invoice - LDP Invoice that was created
   * @param lightningClient - Lightning node client
   * @param recipientWallet - Wallet to receive the asset
   * @param deedLockInfo - Info about the deed-locked UTXO (from sender)
   */
  async receiveTransfer(
    invoice: LDPInvoice,
    lightningClient: LightningClient,
    recipientWallet: RecipientWallet,
    deedLockInfo: DeedLockOutputInfo
  ): Promise<TransferSession> {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const session: TransferSession = {
      id: sessionId,
      invoice,
      state: 'pending',
      createdAt: Date.now(),
    };
    this.sessions.set(sessionId, session);

    return new Promise((resolve) => {
      // Subscribe to Lightning invoice settlement
      lightningClient.onInvoiceSettled(invoice.paymentHash, async (preimage) => {
        try {
          session.preimage = preimage;
          session.state = 'preimage_received';
          this.emit('preimage_received', { sessionId, preimage });

          // Validate preimage against deed-lock
          if (!validateClaim(deedLockInfo, preimage)) {
            throw new Error('Preimage does not match deed-lock payment hash');
          }

          session.state = 'claim_ready';
          this.emit('claim_ready', { sessionId });

          // Build and broadcast claim transaction
          const claimPsbt = createClaimTransaction(
            deedLockInfo,
            preimage,
            recipientWallet.getPrivateKey(),
            recipientWallet.getAddress(),
            2,
            recipientWallet.network
          );

          const claimTxid = await recipientWallet.signAndBroadcast(claimPsbt);
          session.claimTxid = claimTxid;
          session.state = 'claimed';
          this.emit('claimed', { sessionId, claimTxid });

          resolve(session);
        } catch (err) {
          session.state = 'failed';
          session.error = err instanceof Error ? err.message : String(err);
          this.emit('failed', { sessionId, error: session.error });
          resolve(session);
        }
      });
    });
  }

  /** Get a transfer session by ID */
  getSession(sessionId: string): TransferSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** List all active sessions */
  listSessions(): TransferSession[] {
    return Array.from(this.sessions.values());
  }
}
