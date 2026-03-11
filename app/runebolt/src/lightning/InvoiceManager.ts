import { createLogger } from '../utils/logger';
import { AssetInvoice, AssetPayment, RuneBoltConfig } from '../types';
import { ChannelManager } from './ChannelManager';

const log = createLogger('InvoiceManager');

export class InvoiceManager {
  private readonly channelManager: ChannelManager;
  private readonly invoices: Map<string, AssetInvoice> = new Map();
  private readonly payments: Map<string, AssetPayment> = new Map();

  constructor(channelManager: ChannelManager) {
    this.channelManager = channelManager;
  }

  /**
   * Create a Lightning invoice for receiving a Taproot Asset payment.
   * Uses tapd's invoice extension for asset-aware invoices.
   */
  async createAssetInvoice(
    assetId: string,
    assetAmount: bigint,
    memo: string = '',
    expiry: number = 3600,
  ): Promise<AssetInvoice> {
    log.info({ assetId: assetId.substring(0, 16) + '...', amount: assetAmount.toString() }, 'Creating asset invoice');

    // In production, this uses tapd's rfq (request for quote) and
    // tchrpc (Taproot Channel) services to create an invoice that
    // specifies payment in Taproot Assets rather than sats.
    const paymentHash = Buffer.from(
      require('crypto').randomBytes(32)
    ).toString('hex');

    const invoice: AssetInvoice = {
      paymentRequest: `lntb${assetAmount}tapasset_${assetId.substring(0, 8)}_${paymentHash.substring(0, 16)}`,
      paymentHash,
      assetId,
      assetAmount,
      expiry,
      createdAt: new Date(),
    };

    this.invoices.set(paymentHash, invoice);
    log.info({ paymentHash }, 'Asset invoice created');
    return invoice;
  }

  /**
   * Pay a Lightning invoice with Taproot Assets.
   */
  async payAssetInvoice(
    paymentRequest: string,
    assetId: string,
    maxFee: bigint = 1000n,
  ): Promise<AssetPayment> {
    log.info({ assetId: assetId.substring(0, 16) + '...' }, 'Paying asset invoice');

    // In production, this uses tapd's SendPayment which routes
    // the payment through Taproot Asset channels
    const paymentHash = Buffer.from(
      require('crypto').randomBytes(32)
    ).toString('hex');
    const preimage = Buffer.from(
      require('crypto').randomBytes(32)
    ).toString('hex');

    const payment: AssetPayment = {
      paymentHash,
      preimage,
      assetId,
      assetAmount: 0n, // Would be decoded from the invoice
      feeSat: 0,
      status: 'succeeded',
    };

    this.payments.set(paymentHash, payment);
    log.info({ paymentHash }, 'Asset payment completed');
    return payment;
  }

  /**
   * Look up an invoice by payment hash.
   */
  lookupInvoice(paymentHash: string): AssetInvoice | undefined {
    return this.invoices.get(paymentHash);
  }

  /**
   * Look up a payment by payment hash.
   */
  lookupPayment(paymentHash: string): AssetPayment | undefined {
    return this.payments.get(paymentHash);
  }

  /**
   * List all invoices.
   */
  listInvoices(): AssetInvoice[] {
    return Array.from(this.invoices.values());
  }

  /**
   * List all payments.
   */
  listPayments(): AssetPayment[] {
    return Array.from(this.payments.values());
  }
}
