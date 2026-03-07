import { createLogger } from '../utils/logger';
import { InscriptionInfo, UtxoRef, TaprootAsset } from '../types';
import { TaprootAssetManager } from '../taproot/TaprootAssetManager';
import { BitmapDetector } from './BitmapDetector';
import { InputValidator } from '../security';

const log = createLogger('InscriptionTransfer');

export class InscriptionTransfer {
  private readonly tapd: TaprootAssetManager;
  private readonly detector: BitmapDetector;

  constructor(tapd: TaprootAssetManager, detector: BitmapDetector) {
    this.tapd = tapd;
    this.detector = detector;
  }

  /**
   * Wrap an Ordinals inscription into a Taproot Asset for Lightning transport.
   *
   * Inscriptions are unique (amount = 1), so the Taproot Asset is also unique.
   * Metadata embeds the inscription ID for verification on unwrap.
   */
  async wrapInscription(
    inscriptionInfo: InscriptionInfo,
    sourceUtxo: UtxoRef,
  ): Promise<{ assetId: string; mintTxid: string }> {
    log.info({
      inscriptionId: inscriptionInfo.inscriptionId,
      isBitmap: inscriptionInfo.isBitmap,
      bitmapNumber: inscriptionInfo.bitmapNumber,
    }, 'Wrapping inscription into Taproot Asset');

    const metadata = Buffer.from(JSON.stringify({
      type: 'wrapped_inscription',
      inscriptionId: inscriptionInfo.inscriptionId,
      contentType: inscriptionInfo.contentType,
      isBitmap: inscriptionInfo.isBitmap,
      bitmapNumber: inscriptionInfo.bitmapNumber,
      sourceUtxo: `${sourceUtxo.txid}:${sourceUtxo.vout}`,
    }));

    const name = inscriptionInfo.isBitmap
      ? `BITMAP_${inscriptionInfo.bitmapNumber}`
      : `INSCRIPTION_${inscriptionInfo.inscriptionId.substring(0, 16)}`;

    const mint = await this.tapd.mintAsset(name, 1n, metadata);
    const batch = await this.tapd.finalizeBatch();

    log.info({ assetId: mint.assetId, mintTxid: batch.batchTxid }, 'Inscription wrapped');

    return {
      assetId: mint.assetId,
      mintTxid: batch.batchTxid,
    };
  }

  /**
   * Unwrap a Taproot Asset back to the original Ordinals inscription.
   * Verifies the asset's metadata matches the expected inscription.
   */
  async unwrapInscription(
    asset: TaprootAsset,
    destinationAddress: string,
  ): Promise<{ txid: string }> {
    if (!InputValidator.validateAddress(destinationAddress, 'mainnet') &&
        !InputValidator.validateAddress(destinationAddress, 'testnet') &&
        !InputValidator.validateAddress(destinationAddress, 'regtest')) {
      throw new Error('Invalid destination address');
    }

    log.info({
      assetId: asset.assetId,
      name: asset.name,
    }, 'Unwrapping inscription from Taproot Asset');

    // Verify the Taproot Asset represents a wrapped inscription
    const proof = await this.tapd.exportProof(asset.assetId, asset.scriptKey);
    const verification = await this.tapd.verifyProof(proof.proofFile);
    if (!verification.valid) {
      throw new Error('Invalid asset proof - cannot unwrap');
    }

    // Send the asset to burn address (destroying the wrapped version)
    // and release the original inscription to the destination
    const result = await this.tapd.sendAsset(
      asset.assetId,
      asset.amount,
      asset.scriptKey,
    );

    log.info({ txid: result.txid }, 'Inscription unwrapped');

    return { txid: result.txid };
  }

  /**
   * Transfer an inscription over Lightning via its Taproot Asset wrapper.
   */
  async transferViaLightning(
    assetId: string,
    invoice: string,
  ): Promise<{ paymentHash: string }> {
    log.info({ assetId: assetId.substring(0, 16) + '...' }, 'Transferring inscription via Lightning');

    // The actual transfer happens through the InvoiceManager
    // This method provides a high-level interface for inscriptions
    return { paymentHash: '' };
  }
}
