import { createLogger } from '../utils/logger';
import {
  RuneBoltConfig,
  WalletUpdate,
  WalletEvent,
  WrapRequest,
  UnwrapRequest,
  WalletInfo,
  TaprootAsset,
  AssetChannel,
  AssetInvoice,
  AssetPayment,
  InscriptionInfo,
} from '../types';
import { KeyManager, UTXOManager, SigningEngine, WalletEncryption } from '../wallet';
import { TaprootAssetManager, RuneWrapper, AssetChannelManager, ProofVerifier } from '../taproot';
import { ChannelManager, InvoiceManager, PeerDiscovery, RoutingEngine } from '../lightning';
import { BitmapDetector, InscriptionTransfer } from '../bitmap';
import { RateLimiter, AuditLog, InputValidator } from '../security';

const log = createLogger('RuneBolt');

type UpdateListener = (update: WalletUpdate) => void;

/**
 * RuneBolt - Self-sovereign Runes-over-Lightning wallet.
 *
 * This is WALLET SOFTWARE, not a service. Users control their own keys.
 * No custodial moments. No telemetry. Everything runs locally.
 */
export class RuneBolt {
  readonly keyManager: KeyManager;
  readonly utxoManager: UTXOManager;
  readonly signingEngine: SigningEngine;
  readonly tapd: TaprootAssetManager;
  readonly runeWrapper: RuneWrapper;
  readonly assetChannels: AssetChannelManager;
  readonly proofVerifier: ProofVerifier;
  readonly channelManager: ChannelManager;
  readonly invoiceManager: InvoiceManager;
  readonly peerDiscovery: PeerDiscovery;
  readonly routingEngine: RoutingEngine;
  readonly bitmapDetector: BitmapDetector;
  readonly inscriptionTransfer: InscriptionTransfer;
  readonly auditLog: AuditLog;

  private readonly config: RuneBoltConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly listeners: UpdateListener[] = [];
  private lockTimeout: NodeJS.Timeout | null = null;

  constructor(config: RuneBoltConfig) {
    this.config = config;

    // Security
    this.rateLimiter = new RateLimiter(
      config.wallet.maxUnlockAttempts,
      config.wallet.lockoutDurationMs,
    );
    this.auditLog = new AuditLog(config.wallet.auditLogFile);

    // Wallet
    this.keyManager = new KeyManager(config.network);
    this.utxoManager = new UTXOManager(
      config.bitcoin.rpcUrl,
      config.bitcoin.rpcUser,
      config.bitcoin.rpcPass,
    );
    this.signingEngine = new SigningEngine(this.keyManager, config.network);

    // Taproot Assets
    this.tapd = new TaprootAssetManager(config);
    this.runeWrapper = new RuneWrapper(this.tapd);
    this.assetChannels = new AssetChannelManager(this.tapd, config);
    this.proofVerifier = new ProofVerifier(this.tapd);

    // Lightning
    this.channelManager = new ChannelManager(config);
    this.invoiceManager = new InvoiceManager(this.channelManager);
    this.peerDiscovery = new PeerDiscovery(this.channelManager);
    this.routingEngine = new RoutingEngine(() => this.assetChannels.listChannels(true));

    // Bitmap
    this.bitmapDetector = new BitmapDetector(config.indexer.ordApiUrl);
    this.inscriptionTransfer = new InscriptionTransfer(this.tapd, this.bitmapDetector);
  }

  // ── Wallet Lifecycle ──

  /**
   * Initialize a new wallet from a freshly generated mnemonic.
   * Returns the mnemonic ONCE - user must back it up.
   */
  async initWallet(password: string): Promise<{ mnemonic: string; fingerprint: string }> {
    if (WalletEncryption.exists(this.config.wallet.walletFile)) {
      throw new Error('Wallet already exists. Use unlock() or delete the wallet file first.');
    }

    const mnemonic = this.keyManager.generateMnemonic();
    await this.keyManager.initFromMnemonic(mnemonic);

    // Encrypt and save
    const xprv = this.keyManager.exportXprv();
    const encrypted = await WalletEncryption.encrypt(xprv, password);
    WalletEncryption.save(encrypted, this.config.wallet.walletFile);

    const fingerprint = this.keyManager.getFingerprint();

    this.auditLog.log('wallet_created', { fingerprint });
    this.resetLockTimer();

    log.info({ fingerprint }, 'New wallet created');
    return { mnemonic, fingerprint };
  }

  /**
   * Import a wallet from an existing mnemonic.
   */
  async importWallet(mnemonic: string, password: string): Promise<{ fingerprint: string }> {
    if (WalletEncryption.exists(this.config.wallet.walletFile)) {
      throw new Error('Wallet already exists.');
    }

    await this.keyManager.initFromMnemonic(mnemonic);

    const xprv = this.keyManager.exportXprv();
    const encrypted = await WalletEncryption.encrypt(xprv, password);
    WalletEncryption.save(encrypted, this.config.wallet.walletFile);

    const fingerprint = this.keyManager.getFingerprint();

    this.auditLog.log('wallet_imported', { fingerprint });
    this.resetLockTimer();

    log.info({ fingerprint }, 'Wallet imported');
    return { fingerprint };
  }

  /**
   * Unlock the wallet with password.
   */
  async unlock(password: string): Promise<WalletInfo> {
    const key = 'wallet_unlock';
    if (!this.rateLimiter.isAllowed(key)) {
      const remaining = this.rateLimiter.getRemainingLockout(key);
      this.auditLog.log('unlock_rate_limited', { remainingMs: remaining });
      throw new Error(`Too many unlock attempts. Try again in ${Math.ceil(remaining / 1000)} seconds.`);
    }

    try {
      const encrypted = WalletEncryption.load(this.config.wallet.walletFile);
      const xprv = await WalletEncryption.decrypt(encrypted, password);
      this.keyManager.initFromXprv(xprv);

      this.rateLimiter.recordAttempt(key, true);
      this.auditLog.log('wallet_unlocked', { fingerprint: this.keyManager.getFingerprint() });
      this.resetLockTimer();

      log.info('Wallet unlocked');
      return this.getWalletInfo();
    } catch (err) {
      this.rateLimiter.recordAttempt(key, false);
      this.auditLog.log('unlock_failed');
      throw new Error('Invalid password');
    }
  }

  /**
   * Lock the wallet - zero keys from memory.
   */
  lock(): void {
    this.keyManager.lock();
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }
    this.auditLog.log('wallet_locked');
    log.info('Wallet locked');
  }

  /**
   * Get wallet info (addresses, fingerprint, etc).
   */
  getWalletInfo(): WalletInfo {
    const addresses = [];
    for (let i = 0; i < 5; i++) {
      addresses.push(this.keyManager.deriveTaprootAddress(i));
    }
    return {
      fingerprint: this.keyManager.getFingerprint(),
      createdAt: new Date(),
      network: this.config.network,
      addresses,
    };
  }

  // ── Connections ──

  /**
   * Connect to LND and tapd daemons.
   */
  async connect(): Promise<void> {
    log.info('Connecting to daemons');
    await this.channelManager.connect();
    await this.tapd.connect();
    log.info('Connected to LND and tapd');
  }

  /**
   * Disconnect from daemons.
   */
  async disconnect(): Promise<void> {
    await this.channelManager.close();
    await this.tapd.close();
    log.info('Disconnected from daemons');
  }

  // ── Wrap/Unwrap ──

  /**
   * Wrap Runes into Taproot Assets for Lightning transport.
   */
  async wrap(request: WrapRequest): Promise<{ operationId: string; assetId: string | null }> {
    this.ensureUnlocked();
    this.auditLog.log('wrap_initiated', {
      runeName: request.runeName,
      amount: request.amount.toString(),
    });

    const op = await this.runeWrapper.wrap(request);
    this.emit(WalletEvent.WRAP_STARTED, { operationId: op.id });

    return { operationId: op.id, assetId: op.assetId };
  }

  /**
   * Unwrap Taproot Assets back to native Runes.
   */
  async unwrap(request: UnwrapRequest): Promise<{ operationId: string }> {
    this.ensureUnlocked();
    this.auditLog.log('unwrap_initiated', {
      assetId: request.assetId,
      amount: request.amount.toString(),
    });

    const op = await this.runeWrapper.unwrap(request);
    this.emit(WalletEvent.UNWRAP_COMPLETED, { operationId: op.id });

    return { operationId: op.id };
  }

  // ── Lightning Payments ──

  /**
   * Send a Taproot Asset payment over Lightning.
   */
  async sendAssetPayment(
    assetId: string,
    invoice: string,
  ): Promise<AssetPayment> {
    this.ensureUnlocked();

    if (!InputValidator.validateHex(assetId, 32)) {
      throw new Error('Invalid asset ID');
    }

    this.auditLog.log('payment_initiated', { assetId, invoice: invoice.substring(0, 20) + '...' });

    const payment = await this.invoiceManager.payAssetInvoice(invoice, assetId);

    this.emit(WalletEvent.PAYMENT_SENT, {
      paymentHash: payment.paymentHash,
      assetId,
    });

    this.auditLog.log('payment_completed', {
      paymentHash: payment.paymentHash,
      status: payment.status,
    });

    return payment;
  }

  /**
   * Create an invoice to receive a Taproot Asset payment.
   */
  async createInvoice(
    assetId: string,
    amount: bigint,
    memo: string = '',
  ): Promise<AssetInvoice> {
    this.ensureUnlocked();

    const invoice = await this.invoiceManager.createAssetInvoice(assetId, amount, memo);

    this.emit(WalletEvent.PAYMENT_RECEIVED, {
      paymentHash: invoice.paymentHash,
      assetId,
    });

    return invoice;
  }

  // ── Channels ──

  /**
   * Open a Taproot Asset channel.
   */
  async openChannel(
    peerPubkey: string,
    assetId: string,
    localAmount: bigint,
  ): Promise<AssetChannel> {
    this.ensureUnlocked();

    if (!InputValidator.validatePubkey(peerPubkey)) {
      throw new Error('Invalid peer pubkey');
    }

    this.auditLog.log('channel_open', {
      peer: peerPubkey.substring(0, 16),
      assetId: assetId.substring(0, 16),
      amount: localAmount.toString(),
    });

    const channel = await this.assetChannels.openChannel(peerPubkey, assetId, localAmount);
    this.emit(WalletEvent.CHANNEL_OPENED, { channelId: channel.channelId });

    return channel;
  }

  /**
   * Close a Taproot Asset channel.
   */
  async closeChannel(channelId: string): Promise<void> {
    this.auditLog.log('channel_close', { channelId });
    await this.assetChannels.closeChannel(channelId);
    this.emit(WalletEvent.CHANNEL_CLOSED, { channelId });
  }

  // ── Balances ──

  /**
   * Get all balances: BTC, Runes, Taproot Assets.
   */
  async getBalances(): Promise<{
    btcSats: number;
    runes: Map<string, { runeId: { block: number; tx: number }; total: bigint }>;
    taprootAssets: TaprootAsset[];
    channels: AssetChannel[];
  }> {
    const addresses = [];
    for (let i = 0; i < 20; i++) {
      addresses.push(this.keyManager.deriveTaprootAddress(i).address);
    }

    await this.utxoManager.scanAddresses(addresses);

    const taprootAssets = await this.tapd.listAssets();

    return {
      btcSats: this.utxoManager.getBitcoinBalance(),
      runes: this.utxoManager.getRuneBalances(),
      taprootAssets,
      channels: this.assetChannels.listChannels(true),
    };
  }

  // ── Bitmaps ──

  /**
   * Scan wallet UTXOs for bitmap inscriptions.
   */
  async scanBitmaps(): Promise<InscriptionInfo[]> {
    const utxos = this.utxoManager.getAll();
    return this.bitmapDetector.scanForBitmaps(utxos);
  }

  // ── Events ──

  onUpdate(listener: UpdateListener): void {
    this.listeners.push(listener);
  }

  private emit(event: WalletEvent, data: Record<string, unknown>): void {
    const update: WalletUpdate = { event, data, timestamp: new Date() };
    for (const listener of this.listeners) {
      try { listener(update); } catch { /* best effort */ }
    }
  }

  // ── Internal ──

  private ensureUnlocked(): void {
    if (!this.keyManager.isUnlocked()) {
      throw new Error('Wallet is locked. Unlock first.');
    }
  }

  private resetLockTimer(): void {
    if (this.lockTimeout) clearTimeout(this.lockTimeout);
    this.lockTimeout = setTimeout(() => {
      this.lock();
      log.info('Wallet auto-locked due to inactivity');
    }, this.config.wallet.unlockTimeoutMs);
  }
}
