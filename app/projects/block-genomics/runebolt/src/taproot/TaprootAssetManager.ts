import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import fs from 'fs';
import { createLogger } from '../utils/logger';
import { TaprootAsset, AssetProof, RuneBoltConfig } from '../types';

const log = createLogger('TaprootAssetManager');

export class TaprootAssetManager {
  private client: any = null;
  private universeClient: any = null;
  private readonly config: RuneBoltConfig['tapd'];

  constructor(config: RuneBoltConfig) {
    this.config = config.tapd;
  }

  async connect(): Promise<void> {
    log.info({ host: this.config.host, port: this.config.port }, 'Connecting to tapd');

    const tlsCert = fs.readFileSync(this.config.tlsCertPath);
    const macaroon = fs.readFileSync(this.config.macaroonPath).toString('hex');

    const tlsCredentials = grpc.credentials.createSsl(tlsCert);
    const macaroonCredentials = grpc.credentials.createFromMetadataGenerator(
      (_args, callback) => {
        const metadata = new grpc.Metadata();
        metadata.add('macaroon', macaroon);
        callback(null, metadata);
      },
    );

    const credentials = grpc.credentials.combineChannelCredentials(tlsCredentials, macaroonCredentials);
    const target = `${this.config.host}:${this.config.port}`;

    // Create a generic gRPC client for tapd
    // In production, use the taprpc proto definitions
    this.client = new grpc.Client(target, credentials);
    log.info('Connected to tapd');
  }

  private promisify<T>(method: string, request: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('tapd client not connected'));
        return;
      }
      this.client.makeUnaryRequest(
        `/taprpc.TaprootAssets/${method}`,
        (arg: any) => Buffer.from(JSON.stringify(arg)),
        (buf: Buffer) => JSON.parse(buf.toString()),
        request,
        (err: Error | null, response: T) => {
          if (err) reject(new Error(`tapd ${method}: ${err.message}`));
          else resolve(response);
        },
      );
    });
  }

  /**
   * Mint a new Taproot Asset representing wrapped Runes.
   */
  async mintAsset(name: string, amount: bigint, metaData: Buffer): Promise<{ assetId: string; batchTxid: string }> {
    log.info({ name, amount: amount.toString() }, 'Minting Taproot Asset');

    const response = await this.promisify<any>('MintAsset', {
      asset: {
        asset_type: 'NORMAL',
        name,
        amount: amount.toString(),
        asset_meta: {
          data: metaData.toString('base64'),
          type: 'META_TYPE_JSON',
        },
        new_grouped_asset: false,
      },
      enable_emission: false,
    });

    return {
      assetId: response.pending_batch?.batch_key || '',
      batchTxid: response.pending_batch?.batch_txid || '',
    };
  }

  /**
   * Finalize a mint batch (broadcast the anchor transaction).
   */
  async finalizeBatch(): Promise<{ batchTxid: string }> {
    log.info('Finalizing mint batch');
    const response = await this.promisify<any>('FinalizeBatch', {});
    return { batchTxid: response.batch?.batch_txid || '' };
  }

  /**
   * List all assets owned by this wallet.
   */
  async listAssets(): Promise<TaprootAsset[]> {
    const response = await this.promisify<any>('ListAssets', {
      with_witness: false,
      include_spent: false,
    });

    return (response.assets || []).map((a: any) => ({
      assetId: a.asset_genesis?.asset_id || '',
      name: a.asset_genesis?.name || '',
      amount: BigInt(a.amount || '0'),
      scriptKey: Buffer.from(a.script_key || '', 'base64'),
      groupKey: a.asset_group?.raw_group_key ? Buffer.from(a.asset_group.raw_group_key, 'base64') : undefined,
      anchorTxid: a.chain_anchor?.anchor_txid || '',
      anchorVout: a.chain_anchor?.anchor_vout || 0,
      proofData: Buffer.alloc(0),
    }));
  }

  /**
   * Get asset balance.
   */
  async getAssetBalance(assetId: string): Promise<bigint> {
    const response = await this.promisify<any>('ListBalances', {
      asset_id: true,
      asset_filter: Buffer.from(assetId, 'hex').toString('base64'),
    });

    const balances = response.asset_balances || {};
    const balance = balances[assetId];
    return balance ? BigInt(balance.balance || '0') : 0n;
  }

  /**
   * Send a Taproot Asset on-chain (for unwrapping).
   */
  async sendAsset(assetId: string, amount: bigint, scriptKey: Buffer): Promise<{ txid: string }> {
    log.info({ assetId, amount: amount.toString() }, 'Sending Taproot Asset');

    const response = await this.promisify<any>('SendAsset', {
      tap_addrs: [],
      inputs: [{
        asset_id: Buffer.from(assetId, 'hex').toString('base64'),
        amount: amount.toString(),
        script_key: scriptKey.toString('base64'),
      }],
    });

    return { txid: response.transfer?.anchor_tx_hash || '' };
  }

  /**
   * Create a new Taproot Asset address for receiving.
   */
  async newAddress(assetId: string, amount: bigint): Promise<string> {
    const response = await this.promisify<any>('NewAddr', {
      asset_id: Buffer.from(assetId, 'hex').toString('base64'),
      amt: amount.toString(),
    });
    return response.encoded || '';
  }

  /**
   * Export a proof for a specific asset.
   */
  async exportProof(assetId: string, scriptKey: Buffer): Promise<AssetProof> {
    const response = await this.promisify<any>('ExportProof', {
      asset_id: Buffer.from(assetId, 'hex').toString('base64'),
      script_key: scriptKey.toString('base64'),
    });

    return {
      assetId,
      proofFile: Buffer.from(response.raw_proof_file || '', 'base64'),
      anchorTx: response.genesis_point || '',
      merkleRoot: Buffer.from(response.merkle_root || '', 'base64'),
      verified: true,
    };
  }

  /**
   * Verify a received proof.
   */
  async verifyProof(proofFile: Buffer): Promise<{ valid: boolean; assetId: string }> {
    const response = await this.promisify<any>('VerifyProof', {
      raw_proof_file: proofFile.toString('base64'),
    });

    return {
      valid: response.valid || false,
      assetId: response.decoded_proof?.asset?.asset_genesis?.asset_id || '',
    };
  }

  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
      log.info('tapd client disconnected');
    }
  }
}
