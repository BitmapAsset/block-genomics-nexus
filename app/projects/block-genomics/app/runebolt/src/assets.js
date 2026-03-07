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
    transferMethod: 'runestone',
    estimatedTxSize: 250,
    minTransferAmount: 1,
    icon: '🐕',
    logo: '/assets/dog-logo.png',
    website: 'https://doggotothemoon.io',
    runeNumber: 3,
  },
  BILLY: {
    id: 'BILLY',
    type: 'rune',
    name: '$BILLY (BILLION•DOLLAR•CAT)',
    ticker: 'BILLY',
    decimals: 2,
    fungible: true,
    transferMethod: 'runestone',
    estimatedTxSize: 250,
    minTransferAmount: 1,
    icon: '🐱',
    logo: '/assets/billy-logo.png',
    website: 'https://billiondollarcat.com',
    runeNumber: 845764,
  },
  BITMAP: {
    id: 'BITMAP',
    type: 'bitmap',
    name: 'Bitmap Block',
    ticker: 'BITMAP',
    decimals: 0,
    fungible: false,
    transferMethod: 'ordinal_transfer',
    estimatedTxSize: 200,
    minTransferAmount: 1,
    icon: '🗺️',
    logo: '/assets/bitmap-logo.png',
    website: 'https://bitmap.community',
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
  static calculateFee(assetId, amount, feeRate = 0.001, satPerVbyte = 2, batchSize = 10) {
    const asset = ASSETS[assetId];
    if (!asset) throw new Error(`Unknown asset: ${assetId}. Supported: DOG, BITMAP`);

    // Coordination fee (Lightning — kept minimal, 0.1%)
    let coordinationFee;
    if (asset.fungible) {
      coordinationFee = Math.max(1, Math.ceil(amount * feeRate)); // 0.1%
    } else {
      coordinationFee = 50; // Flat 50 sats for Bitmap transfers
    }

    // On-chain fee BATCHED — RuneBolt batches multiple transfers into one tx
    // Full tx = ~250 vB, but each additional output only adds ~40 vB
    // So 10 transfers in one tx ≈ 250 + (9 × 40) = 610 vB → 61 vB each
    const perTransferVbytes = Math.ceil((asset.estimatedTxSize + (batchSize - 1) * 40) / batchSize);
    const onChainFee = perTransferVbytes * satPerVbyte;

    return {
      coordinationFee,
      onChainFee,
      totalFee: coordinationFee + onChainFee,
      asset: asset.id,
      batchSize,
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
