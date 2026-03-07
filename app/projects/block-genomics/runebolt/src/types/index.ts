import { z } from 'zod';

// ── Network ──

export type BitcoinNetwork = 'mainnet' | 'testnet' | 'regtest';

// ── Runes Types ──

export interface RuneId {
  block: number;
  tx: number;
}

export interface RuneBalance {
  runeId: RuneId;
  runeName: string;
  amount: bigint;
  address: string;
  utxo: UtxoRef;
}

export interface UtxoRef {
  txid: string;
  vout: number;
  value: number;
}

export interface RuneTransfer {
  runeId: RuneId;
  amount: bigint;
  from: string;
  to: string;
}

// ── UTXO Types ──

export interface Utxo extends UtxoRef {
  scriptPubKey: string;
  confirmations: number;
  runeBalance?: RuneBalance;
}

// ── Taproot Asset Types ──

export interface TaprootAsset {
  assetId: string;
  name: string;
  amount: bigint;
  scriptKey: Buffer;
  groupKey?: Buffer;
  anchorTxid: string;
  anchorVout: number;
  proofData: Buffer;
}

export interface AssetProof {
  assetId: string;
  proofFile: Buffer;
  anchorTx: string;
  merkleRoot: Buffer;
  verified: boolean;
}

export interface WrapRequest {
  runeId: RuneId;
  runeName: string;
  amount: bigint;
  sourceUtxo: UtxoRef;
  destinationPubkey: Buffer;
}

export interface UnwrapRequest {
  assetId: string;
  amount: bigint;
  destinationAddress: string;
  proof: AssetProof;
}

export enum WrapState {
  PENDING = 'pending',
  RUNE_LOCKED = 'rune_locked',
  ASSET_MINTED = 'asset_minted',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface WrapOperation {
  id: string;
  state: WrapState;
  runeId: RuneId;
  runeName: string;
  runeAmount: bigint;
  assetId: string | null;
  lockTxid: string | null;
  mintTxid: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Lightning Channel Types ──

export interface AssetChannel {
  channelId: string;
  peerPubkey: string;
  assetId: string;
  localBalance: bigint;
  remoteBalance: bigint;
  capacity: bigint;
  active: boolean;
}

export interface AssetInvoice {
  paymentRequest: string;
  paymentHash: string;
  assetId: string;
  assetAmount: bigint;
  expiry: number;
  createdAt: Date;
}

export interface AssetPayment {
  paymentHash: string;
  preimage: string;
  assetId: string;
  assetAmount: bigint;
  feeSat: number;
  status: 'succeeded' | 'failed' | 'in_flight';
}

export interface LightningPeer {
  pubkey: string;
  address: string;
  alias: string;
  supportsTaprootAssets: boolean;
  assetChannels: string[];
}

export interface RouteHop {
  pubkey: string;
  channelId: string;
  assetId: string;
  fee: bigint;
}

export interface PaymentRoute {
  hops: RouteHop[];
  totalFee: bigint;
  estimatedTime: number;
}

// ── Wallet Types ──

export interface WalletInfo {
  fingerprint: string;
  createdAt: Date;
  network: BitcoinNetwork;
  addresses: WalletAddress[];
}

export interface WalletAddress {
  path: string;
  address: string;
  type: 'p2tr' | 'p2wpkh';
  index: number;
}

export interface EncryptedWallet {
  version: number;
  salt: Buffer;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
  argon2Params: {
    timeCost: number;
    memoryCost: number;
    parallelism: number;
  };
}

// ── Bitmap / Inscription Types ──

export interface InscriptionInfo {
  inscriptionId: string;
  contentType: string;
  contentLength: number;
  genesisHeight: number;
  genesisFee: number;
  address: string;
  utxo: UtxoRef;
  isBitmap: boolean;
  bitmapNumber?: number;
}

// ── Audit Log Types ──

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  details: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

// ── Config Types ──

export interface RuneBoltConfig {
  network: BitcoinNetwork;
  bitcoin: {
    rpcUrl: string;
    rpcUser: string;
    rpcPass: string;
  };
  lnd: {
    host: string;
    port: number;
    tlsCertPath: string;
    macaroonPath: string;
  };
  tapd: {
    host: string;
    port: number;
    tlsCertPath: string;
    macaroonPath: string;
  };
  indexer: {
    ordApiUrl: string;
  };
  wallet: {
    dataDir: string;
    walletFile: string;
    auditLogFile: string;
    unlockTimeoutMs: number;
    maxUnlockAttempts: number;
    lockoutDurationMs: number;
  };
  server: {
    port: number;
    host: string;
    corsOrigins: string[];
  };
}

// ── API Schema Validation ──

export const WrapRequestSchema = z.object({
  runeName: z.string().min(1).max(100).regex(/^[A-Z0-9.]+$/, 'Invalid rune name'),
  runeAmount: z.string().regex(/^\d+$/, 'Must be a positive integer').max(30),
});

export const UnwrapRequestSchema = z.object({
  assetId: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid asset ID'),
  amount: z.string().regex(/^\d+$/, 'Must be a positive integer').max(30),
  destinationAddress: z.string().min(1).max(200),
});

export const SendAssetSchema = z.object({
  assetId: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid asset ID'),
  amount: z.string().regex(/^\d+$/, 'Must be a positive integer').max(30),
  invoice: z.string().startsWith('ln').max(1500),
});

export const OpenChannelSchema = z.object({
  peerPubkey: z.string().regex(/^[a-f0-9]{66}$/, 'Invalid pubkey'),
  assetId: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid asset ID'),
  localAmount: z.string().regex(/^\d+$/).max(30),
});

// ── Event Types ──

export enum WalletEvent {
  WRAP_STARTED = 'wrap:started',
  WRAP_RUNE_LOCKED = 'wrap:rune_locked',
  WRAP_ASSET_MINTED = 'wrap:asset_minted',
  WRAP_COMPLETED = 'wrap:completed',
  UNWRAP_STARTED = 'unwrap:started',
  UNWRAP_COMPLETED = 'unwrap:completed',
  CHANNEL_OPENED = 'channel:opened',
  CHANNEL_CLOSED = 'channel:closed',
  PAYMENT_SENT = 'payment:sent',
  PAYMENT_RECEIVED = 'payment:received',
  BALANCE_UPDATED = 'balance:updated',
}

export interface WalletUpdate {
  event: WalletEvent;
  data: Record<string, unknown>;
  timestamp: Date;
}

// ── Fee Estimation ──

export interface FeeEstimate {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  minimumFee: number;
}
