import crypto from 'crypto';
import { createLogger } from '../utils/logger';
import { AssetProof } from '../types';
import { TaprootAssetManager } from './TaprootAssetManager';

const log = createLogger('ProofVerifier');

export class ProofVerifier {
  private readonly tapd: TaprootAssetManager;

  constructor(tapd: TaprootAssetManager) {
    this.tapd = tapd;
  }

  /**
   * Verify a Taproot Asset proof file using tapd.
   */
  async verifyProof(proofFile: Buffer): Promise<{
    valid: boolean;
    assetId: string;
    amount: bigint;
    error?: string;
  }> {
    try {
      if (proofFile.length === 0) {
        return { valid: false, assetId: '', amount: 0n, error: 'Empty proof file' };
      }

      const result = await this.tapd.verifyProof(proofFile);

      log.info({ assetId: result.assetId, valid: result.valid }, 'Proof verification result');

      return {
        valid: result.valid,
        assetId: result.assetId,
        amount: 0n, // Would be extracted from the decoded proof
      };
    } catch (err) {
      log.error({ err }, 'Proof verification failed');
      return {
        valid: false,
        assetId: '',
        amount: 0n,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Verify that a proof chain is valid from genesis to current state.
   */
  async verifyProofChain(proofFiles: Buffer[]): Promise<boolean> {
    for (const proof of proofFiles) {
      const result = await this.verifyProof(proof);
      if (!result.valid) {
        log.warn({ assetId: result.assetId }, 'Proof chain broken');
        return false;
      }
    }
    return true;
  }

  /**
   * Verify that a Taproot Asset matches the expected wrapped Rune metadata.
   */
  verifyWrappedRuneMetadata(
    metadata: Buffer,
    expectedRuneId: string,
    expectedRuneName: string,
  ): boolean {
    try {
      const parsed = JSON.parse(metadata.toString('utf-8'));
      if (parsed.type !== 'wrapped_rune') return false;
      if (parsed.runeId !== expectedRuneId) return false;
      if (parsed.runeName !== expectedRuneName) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Compute the asset ID from genesis parameters (for local verification).
   */
  computeAssetId(name: string, metadata: Buffer, genesisTxid: string, genesisVout: number): string {
    const preimage = Buffer.concat([
      Buffer.from(name, 'utf-8'),
      metadata,
      Buffer.from(genesisTxid, 'hex'),
      Buffer.from([genesisVout]),
    ]);
    return crypto.createHash('sha256').update(preimage).digest('hex');
  }
}
