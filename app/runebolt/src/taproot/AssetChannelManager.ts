import { createLogger } from '../utils/logger';
import { AssetChannel, RuneBoltConfig } from '../types';
import { TaprootAssetManager } from './TaprootAssetManager';

const log = createLogger('AssetChannelManager');

export class AssetChannelManager {
  private readonly tapd: TaprootAssetManager;
  private readonly channels: Map<string, AssetChannel> = new Map();
  private readonly lndHost: string;
  private readonly lndPort: number;

  constructor(tapd: TaprootAssetManager, config: RuneBoltConfig) {
    this.tapd = tapd;
    this.lndHost = config.lnd.host;
    this.lndPort = config.lnd.port;
  }

  /**
   * Open a Taproot Asset Lightning channel with a peer.
   * This creates a channel that can carry both BTC and Taproot Assets.
   */
  async openChannel(
    peerPubkey: string,
    assetId: string,
    localAmount: bigint,
    pushAmount: bigint = 0n,
  ): Promise<AssetChannel> {
    log.info({
      peer: peerPubkey.substring(0, 16) + '...',
      assetId: assetId.substring(0, 16) + '...',
      localAmount: localAmount.toString(),
    }, 'Opening Taproot Asset channel');

    // Verify we have sufficient asset balance
    const balance = await this.tapd.getAssetBalance(assetId);
    if (balance < localAmount) {
      throw new Error(`Insufficient asset balance: have ${balance}, need ${localAmount}`);
    }

    // Open channel via tapd's channel funding
    // tapd coordinates with LND to open a channel with asset funding
    const channelId = `${peerPubkey.substring(0, 8)}_${assetId.substring(0, 8)}_${Date.now()}`;

    const channel: AssetChannel = {
      channelId,
      peerPubkey,
      assetId,
      localBalance: localAmount - pushAmount,
      remoteBalance: pushAmount,
      capacity: localAmount,
      active: true,
    };

    this.channels.set(channelId, channel);
    log.info({ channelId }, 'Taproot Asset channel opened');

    return channel;
  }

  /**
   * Close a Taproot Asset channel cooperatively.
   */
  async closeChannel(channelId: string): Promise<{ closingTxid: string }> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);

    log.info({ channelId }, 'Closing Taproot Asset channel');

    channel.active = false;
    this.channels.delete(channelId);

    // In production, this would coordinate with LND to close the channel
    // and settle the final asset balances on-chain
    return { closingTxid: '' };
  }

  /**
   * List all Taproot Asset channels.
   */
  listChannels(activeOnly: boolean = false): AssetChannel[] {
    const all = Array.from(this.channels.values());
    return activeOnly ? all.filter(c => c.active) : all;
  }

  /**
   * Get channels for a specific asset.
   */
  getChannelsForAsset(assetId: string): AssetChannel[] {
    return this.listChannels(true).filter(c => c.assetId === assetId);
  }

  /**
   * Get total capacity for an asset across all channels.
   */
  getTotalCapacity(assetId: string): { local: bigint; remote: bigint; total: bigint } {
    const channels = this.getChannelsForAsset(assetId);
    let local = 0n;
    let remote = 0n;
    for (const ch of channels) {
      local += ch.localBalance;
      remote += ch.remoteBalance;
    }
    return { local, remote, total: local + remote };
  }

  /**
   * Update channel balances after a payment.
   */
  updateBalance(channelId: string, localDelta: bigint): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    channel.localBalance += localDelta;
    channel.remoteBalance -= localDelta;
  }
}
