/**
 * RuneBolt Asset Registry
 * 
 * Two supported assets only:
 * 1. $DOG (Rune) — Fungible token, the flagship Rune on Bitcoin
 * 2. Bitmap  — Non-fungible block ownership inscriptions
 * 
 * Users toggle between these two on the RuneBolt page.
 */

const ASSETS = {
  DOG: {
    id: 'DOG',
    type: 'rune',
    name: '$DOG (DOG•GO•TO•THE•MOON)',
    ticker: 'DOG',
    decimals: 5,
    fungible: true,
    transferMethod: 'runestone', // OP_RETURN Runestone encoding
    estimatedTxSize: 250, // vbytes
    minTransferAmount: 1,
    icon: '🐕',
  },
  BITMAP: {
    id: 'BITMAP',
    type: 'bitmap',
    name: 'Bitmap Block',
    ticker: 'BITMAP',
    decimals: 0,
    fungible: false, // Each block is unique
    transferMethod: 'ordinal_transfer', // Ordinal inscription transfer
    estimatedTxSize: 200, // vbytes
    minTransferAmount: 1,
    icon: '🗺️',
  },
};

class AssetRegistry {
  /**
   * Get asset by ID
   */
  static get(assetId) {
    return ASSETS[assetId] || null;
  }

  /**
   * List all supported assets
   */
  static list() {
    return Object.values(ASSETS);
  }

  /**
   * Calculate relay fee for a transfer
   */
  static calculateFee(assetId, amount, feeRate = 0.003, satPerVbyte = 2) {
    const asset = ASSETS[assetId];
    if (!asset) throw new Error(`Unknown asset: ${assetId}. Supported: DOG, BITMAP`);

    // Coordination fee (paid via Lightning)
    let coordinationFee;
    if (asset.fungible) {
      coordinationFee = Math.max(1, Math.ceil(amount * feeRate)); // % of amount
    } else {
      coordinationFee = 500; // Flat 500 sats for Bitmap transfers
    }

    // On-chain fee (RuneBolt covers from treasury)
    const onChainFee = asset.estimatedTxSize * satPerVbyte;

    return {
      coordinationFee,
      onChainFee,
      totalFee: coordinationFee + onChainFee,
      asset: asset.id,
    };
  }

  /**
   * Validate a transfer request
   */
  static validateTransfer(assetId, amount) {
    const asset = ASSETS[assetId];
    if (!asset) return { valid: false, error: `Unknown asset: ${assetId}. RuneBolt supports DOG and BITMAP only.` };
    if (amount < asset.minTransferAmount) return { valid: false, error: `Minimum transfer: ${asset.minTransferAmount}` };
    if (!asset.fungible && amount !== 1) return { valid: false, error: 'Bitmap blocks are transferred one at a time' };
    return { valid: true };
  }
}

module.exports = { AssetRegistry, ASSETS };
