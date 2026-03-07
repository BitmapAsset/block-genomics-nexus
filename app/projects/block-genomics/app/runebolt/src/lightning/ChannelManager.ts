import * as grpc from '@grpc/grpc-js';
import fs from 'fs';
import { createLogger } from '../utils/logger';
import { RuneBoltConfig } from '../types';

const log = createLogger('ChannelManager');

interface LndChannelInfo {
  channelId: string;
  remotePubkey: string;
  capacity: string;
  localBalance: string;
  remoteBalance: string;
  active: boolean;
}

export class ChannelManager {
  private client: any = null;
  private readonly config: RuneBoltConfig['lnd'];

  constructor(config: RuneBoltConfig) {
    this.config = config.lnd;
  }

  async connect(): Promise<void> {
    log.info({ host: this.config.host, port: this.config.port }, 'Connecting to LND');

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
    this.client = new grpc.Client(`${this.config.host}:${this.config.port}`, credentials);

    await this.getInfo();
    log.info('Connected to LND');
  }

  private promisify<T>(method: string, request: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('LND client not connected'));
        return;
      }
      this.client.makeUnaryRequest(
        `/lnrpc.Lightning/${method}`,
        (arg: any) => Buffer.from(JSON.stringify(arg)),
        (buf: Buffer) => JSON.parse(buf.toString()),
        request,
        (err: Error | null, response: T) => {
          if (err) reject(new Error(`LND ${method}: ${err.message}`));
          else resolve(response);
        },
      );
    });
  }

  async getInfo(): Promise<{ alias: string; blockHeight: number; syncedToChain: boolean; pubkey: string }> {
    const info = await this.promisify<any>('GetInfo');
    return {
      alias: info.alias || '',
      blockHeight: info.block_height || 0,
      syncedToChain: info.synced_to_chain || false,
      pubkey: info.identity_pubkey || '',
    };
  }

  async listChannels(): Promise<LndChannelInfo[]> {
    const response = await this.promisify<any>('ListChannels', { active_only: false });
    return (response.channels || []).map((ch: any) => ({
      channelId: ch.chan_id || '',
      remotePubkey: ch.remote_pubkey || '',
      capacity: ch.capacity || '0',
      localBalance: ch.local_balance || '0',
      remoteBalance: ch.remote_balance || '0',
      active: ch.active || false,
    }));
  }

  async connectPeer(pubkey: string, host: string): Promise<void> {
    log.info({ pubkey: pubkey.substring(0, 16) + '...' }, 'Connecting to peer');
    await this.promisify('ConnectPeer', {
      addr: { pubkey, host },
    });
  }

  async openChannel(peerPubkey: string, localFundingSats: number, pushSats: number = 0): Promise<string> {
    log.info({ peer: peerPubkey.substring(0, 16) + '...', amount: localFundingSats }, 'Opening channel');
    const response = await this.promisify<any>('OpenChannelSync', {
      node_pubkey_string: peerPubkey,
      local_funding_amount: localFundingSats.toString(),
      push_sat: pushSats.toString(),
    });
    return response.funding_txid_str || '';
  }

  async closeChannel(channelPoint: string, force: boolean = false): Promise<string> {
    const [txid, vout] = channelPoint.split(':');
    log.info({ channelPoint, force }, 'Closing channel');
    const response = await this.promisify<any>('CloseChannel', {
      channel_point: {
        funding_txid_str: txid,
        output_index: parseInt(vout),
      },
      force,
    });
    return response.closing_txid || '';
  }

  async getChannelBalance(): Promise<{ local: number; remote: number }> {
    const response = await this.promisify<any>('ChannelBalance');
    return {
      local: parseInt(response.local_balance?.sat || '0'),
      remote: parseInt(response.remote_balance?.sat || '0'),
    };
  }

  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
      log.info('LND client disconnected');
    }
  }
}
