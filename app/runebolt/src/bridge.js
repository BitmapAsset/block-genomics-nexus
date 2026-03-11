/**
 * RuneBolt Bridge — Relay Model
 * 
 * Transfers $DOG (Runes) and Bitmap blocks using Lightning for coordination.
 * 
 * DOG Flow:
 * 1. Sender requests DOG transfer (amount + receiver address)
 * 2. RuneBolt creates Lightning invoice (coordination fee)
 * 3. Sender pays invoice → proves intent
 * 4. RuneBolt sends DOG from inventory to receiver (on-chain)
 * 5. Sender sends their DOG to RuneBolt to replenish
 * 
 * Bitmap Flow:
 * 1. Sender requests Bitmap transfer (block number + receiver address)
 * 2. RuneBolt creates Lightning invoice (flat 500 sat fee)
 * 3. Sender pays invoice → proves intent
 * 4. RuneBolt transfers the Bitmap inscription to receiver (on-chain)
 * 5. Sender transfers their Bitmap to RuneBolt to replenish
 */

const { v4: uuidv4 } = require('uuid');
const { AssetRegistry } = require('./assets');

class RuneBoltBridge {
  constructor(lndClient, options = {}) {
    this.lnd = lndClient;
    this.feeRate = options.feeRate || 0.003;
    this.transfers = new Map();
    this.inventory = {
      DOG: 0,          // Total $DOG available
      bitmaps: new Set(), // Set of block numbers available (e.g., "720143")
    };
  }

  /**
   * Get bridge status
   */
  async getStatus() {
    const info = await this.lnd.getInfo();
    const walletBalance = await this.lnd.getWalletBalance();
    const channelBalance = await this.lnd.getChannelBalance();
    const channels = await this.lnd.listChannels();

    return {
      node: {
        alias: info.alias,
        pubkey: info.identity_pubkey,
        synced: info.synced_to_chain,
        blockHeight: info.block_height,
      },
      wallet: {
        onChainSats: parseInt(walletBalance.confirmed_balance || '0'),
        channelSats: parseInt(channelBalance.local_balance?.sat || '0'),
      },
      channels: {
        active: channels.channels?.filter(c => c.active).length || 0,
        totalCapacity: channels.channels?.reduce((sum, c) => sum + parseInt(c.capacity || '0'), 0) || 0,
      },
      inventory: {
        dogAvailable: this.inventory.DOG,
        bitmapsAvailable: Array.from(this.inventory.bitmaps),
        bitmapCount: this.inventory.bitmaps.size,
      },
      supportedAssets: AssetRegistry.list().map(a => ({ id: a.id, name: a.name, icon: a.icon })),
      activeTransfers: this.transfers.size,
    };
  }

  /**
   * Initiate a DOG transfer
   */
  async transferDog(amount, senderAddress, receiverAddress) {
    const validation = AssetRegistry.validateTransfer('DOG', amount);
    if (!validation.valid) throw new Error(validation.error);

    if (this.inventory.DOG < amount) {
      throw new Error(`Insufficient DOG inventory. Available: ${this.inventory.DOG}, Requested: ${amount}`);
    }

    const fee = AssetRegistry.calculateFee('DOG', amount, this.feeRate);
    const transferId = uuidv4();
    const memo = `RuneBolt: ${amount} DOG → ${receiverAddress.slice(0, 8)}...`;
    const invoice = await this.lnd.createInvoice(fee.coordinationFee, memo, 1800);

    const transfer = {
      id: transferId,
      asset: 'DOG',
      amount,
      senderAddress,
      receiverAddress,
      feeSats: fee.coordinationFee,
      onChainFeeSats: fee.onChainFee,
      status: 'awaiting_payment',
      paymentRequest: invoice.payment_request,
      paymentHash: Buffer.from(invoice.r_hash, 'base64').toString('hex'),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
    };

    this.transfers.set(transferId, transfer);
    return { transferId, paymentRequest: invoice.payment_request, feeSats: fee.coordinationFee, expiresAt: transfer.expiresAt };
  }

  /**
   * Initiate a Bitmap transfer
   */
  async transferBitmap(blockNumber, senderAddress, receiverAddress) {
    const blockStr = String(blockNumber);

    if (!this.inventory.bitmaps.has(blockStr)) {
      throw new Error(`Bitmap block ${blockStr} not in inventory. Available: ${Array.from(this.inventory.bitmaps).join(', ') || 'none'}`);
    }

    const fee = AssetRegistry.calculateFee('BITMAP', 1, this.feeRate);
    const transferId = uuidv4();
    const memo = `RuneBolt: Bitmap #${blockStr} → ${receiverAddress.slice(0, 8)}...`;
    const invoice = await this.lnd.createInvoice(fee.coordinationFee, memo, 1800);

    const transfer = {
      id: transferId,
      asset: 'BITMAP',
      blockNumber: blockStr,
      amount: 1,
      senderAddress,
      receiverAddress,
      feeSats: fee.coordinationFee,
      onChainFeeSats: fee.onChainFee,
      status: 'awaiting_payment',
      paymentRequest: invoice.payment_request,
      paymentHash: Buffer.from(invoice.r_hash, 'base64').toString('hex'),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
    };

    this.transfers.set(transferId, transfer);
    return { transferId, paymentRequest: invoice.payment_request, feeSats: fee.coordinationFee, expiresAt: transfer.expiresAt };
  }

  /**
   * Check and process a transfer
   */
  async checkTransfer(transferId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) throw new Error('Transfer not found');

    if (transfer.status === 'awaiting_payment') {
      try {
        const inv = await this.lnd.lookupInvoice(transfer.paymentHash);
        if (inv.state === 'SETTLED') {
          transfer.status = 'paid';
          transfer.paidAt = new Date().toISOString();

          // Deduct from inventory
          if (transfer.asset === 'DOG') {
            this.inventory.DOG -= transfer.amount;
          } else if (transfer.asset === 'BITMAP') {
            this.inventory.bitmaps.delete(transfer.blockNumber);
          }

          // TODO: Execute on-chain transfer
          // DOG: Runestone OP_RETURN tx
          // BITMAP: Ordinal inscription transfer
          transfer.status = 'fulfilling';

          // For now, mark complete (on-chain logic TBD)
          transfer.status = 'complete';
          transfer.completedAt = new Date().toISOString();
        }
      } catch {
        if (new Date() > new Date(transfer.expiresAt)) {
          transfer.status = 'expired';
        }
      }
    }

    return {
      id: transfer.id,
      asset: transfer.asset,
      amount: transfer.amount,
      blockNumber: transfer.blockNumber || null,
      status: transfer.status,
      feeSats: transfer.feeSats,
      createdAt: transfer.createdAt,
      completedAt: transfer.completedAt || null,
    };
  }

  /**
   * Add DOG to inventory
   */
  addDogInventory(amount) {
    this.inventory.DOG += amount;
    return { asset: 'DOG', available: this.inventory.DOG };
  }

  /**
   * Add a Bitmap block to inventory
   */
  addBitmapInventory(blockNumber) {
    this.inventory.bitmaps.add(String(blockNumber));
    return { asset: 'BITMAP', block: String(blockNumber), totalBlocks: this.inventory.bitmaps.size };
  }

  /**
   * Get full inventory
   */
  getInventory() {
    return {
      DOG: this.inventory.DOG,
      bitmaps: Array.from(this.inventory.bitmaps).sort((a, b) => parseInt(a) - parseInt(b)),
      bitmapCount: this.inventory.bitmaps.size,
    };
  }

  /**
   * List transfers
   */
  listTransfers(asset = null, status = null) {
    let all = Array.from(this.transfers.values());
    if (asset) all = all.filter(t => t.asset === asset);
    if (status) all = all.filter(t => t.status === status);
    return all;
  }
}

module.exports = RuneBoltBridge;
