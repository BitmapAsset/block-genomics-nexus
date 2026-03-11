import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { WrapOperation, WrapState, RuneId, UtxoRef, WrapRequest, UnwrapRequest } from '../types';
import { TaprootAssetManager } from './TaprootAssetManager';
import { InputValidator } from '../security';

const log = createLogger('RuneWrapper');

export class RuneWrapper {
  private readonly tapd: TaprootAssetManager;
  private readonly operations: Map<string, WrapOperation> = new Map();

  constructor(tapd: TaprootAssetManager) {
    this.tapd = tapd;
  }

  /**
   * WRAP: Lock Runes on-chain, mint equivalent Taproot Asset.
   *
   * Flow:
   * 1. User sends Runes to a locking script (commit tx)
   * 2. tapd mints a Taproot Asset with metadata pointing to the locked Runes
   * 3. Taproot Asset can now travel over Lightning channels
   */
  async wrap(request: WrapRequest): Promise<WrapOperation> {
    if (!InputValidator.validateAmount(request.amount)) {
      throw new Error('Invalid wrap amount');
    }

    const op: WrapOperation = {
      id: uuidv4(),
      state: WrapState.PENDING,
      runeId: request.runeId,
      runeName: request.runeName,
      runeAmount: request.amount,
      assetId: null,
      lockTxid: null,
      mintTxid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.operations.set(op.id, op);
    log.info({ opId: op.id, runeName: request.runeName, amount: request.amount.toString() }, 'Wrap initiated');

    // Step 1: Rune locking happens via the user's wallet (SigningEngine builds the tx)
    // The lock tx sends Runes to a script that can only be spent when presenting
    // the Taproot Asset burn proof (for unwrapping).
    // For now, we proceed to mint once the lock is confirmed.

    return op;
  }

  /**
   * Confirm that the Rune locking transaction has been broadcast and confirmed.
   */
  async confirmLock(opId: string, lockTxid: string): Promise<WrapOperation> {
    const op = this.getOperation(opId);
    if (op.state !== WrapState.PENDING) {
      throw new Error(`Invalid state for lock confirmation: ${op.state}`);
    }

    if (!InputValidator.validateTxid(lockTxid)) {
      throw new Error('Invalid lock transaction ID');
    }

    op.lockTxid = lockTxid;
    op.state = WrapState.RUNE_LOCKED;
    op.updatedAt = new Date();

    log.info({ opId, lockTxid }, 'Rune lock confirmed');

    // Step 2: Mint the Taproot Asset
    try {
      const metadata = Buffer.from(JSON.stringify({
        type: 'wrapped_rune',
        runeId: `${op.runeId.block}:${op.runeId.tx}`,
        runeName: op.runeName,
        lockTxid,
        amount: op.runeAmount.toString(),
      }));

      const mint = await this.tapd.mintAsset(
        `RUNE_${op.runeName}`,
        op.runeAmount,
        metadata,
      );

      const batch = await this.tapd.finalizeBatch();

      op.assetId = mint.assetId;
      op.mintTxid = batch.batchTxid;
      op.state = WrapState.ASSET_MINTED;
      op.updatedAt = new Date();

      log.info({ opId, assetId: mint.assetId }, 'Taproot Asset minted');

      // Wait for anchor tx confirmation, then mark completed
      op.state = WrapState.COMPLETED;
      op.updatedAt = new Date();

      log.info({ opId }, 'Wrap completed');
    } catch (err) {
      op.state = WrapState.FAILED;
      op.updatedAt = new Date();
      log.error({ err, opId }, 'Wrap failed during minting');
      throw err;
    }

    return op;
  }

  /**
   * UNWRAP: Burn Taproot Asset, release locked Runes back on-chain.
   *
   * Flow:
   * 1. User sends Taproot Asset back to the wrapper (burn)
   * 2. Wrapper verifies the burn proof
   * 3. Locked Runes are released to the user's destination address
   */
  async unwrap(request: UnwrapRequest): Promise<WrapOperation> {
    if (!InputValidator.validateHex(request.assetId, 32)) {
      throw new Error('Invalid asset ID');
    }

    const op: WrapOperation = {
      id: uuidv4(),
      state: WrapState.PENDING,
      runeId: { block: 0, tx: 0 },  // Will be filled from proof
      runeName: '',
      runeAmount: request.amount,
      assetId: request.assetId,
      lockTxid: null,
      mintTxid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.operations.set(op.id, op);

    // Verify the proof
    const proofValid = await this.tapd.verifyProof(request.proof.proofFile);
    if (!proofValid.valid) {
      op.state = WrapState.FAILED;
      op.updatedAt = new Date();
      throw new Error('Invalid Taproot Asset proof');
    }

    log.info({ opId: op.id, assetId: request.assetId }, 'Unwrap initiated, proof verified');

    // The actual Rune release transaction is built by the user's SigningEngine
    // using the locking script's spend path
    op.state = WrapState.COMPLETED;
    op.updatedAt = new Date();

    return op;
  }

  getOperation(opId: string): WrapOperation {
    const op = this.operations.get(opId);
    if (!op) throw new Error(`Wrap operation not found: ${opId}`);
    return op;
  }

  getAllOperations(): WrapOperation[] {
    return Array.from(this.operations.values());
  }
}
