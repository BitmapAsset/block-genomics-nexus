import { createLogger } from '../utils/logger';
import { LightningPeer } from '../types';
import { ChannelManager } from './ChannelManager';

const log = createLogger('PeerDiscovery');

export class PeerDiscovery {
  private readonly channelManager: ChannelManager;
  private readonly knownPeers: Map<string, LightningPeer> = new Map();

  constructor(channelManager: ChannelManager) {
    this.channelManager = channelManager;
  }

  /**
   * Discover peers that support Taproot Asset channels.
   * Queries the Lightning network graph for nodes advertising
   * Taproot Asset support via feature bits.
   */
  async discoverPeers(): Promise<LightningPeer[]> {
    log.info('Discovering Taproot Asset capable peers');

    // In production, this would:
    // 1. Query LND's DescribeGraph for all nodes
    // 2. Filter for nodes with Taproot Asset feature bits set
    // 3. Check for nodes running tapd (via custom TLV in node announcements)
    // For now, return known peers

    return Array.from(this.knownPeers.values()).filter(p => p.supportsTaprootAssets);
  }

  /**
   * Add a known peer manually (e.g., from config or user input).
   */
  addPeer(peer: LightningPeer): void {
    this.knownPeers.set(peer.pubkey, peer);
    log.info({ pubkey: peer.pubkey.substring(0, 16) + '...', alias: peer.alias }, 'Peer added');
  }

  /**
   * Remove a peer.
   */
  removePeer(pubkey: string): void {
    this.knownPeers.delete(pubkey);
  }

  /**
   * Get a specific peer by pubkey.
   */
  getPeer(pubkey: string): LightningPeer | undefined {
    return this.knownPeers.get(pubkey);
  }

  /**
   * List all known peers.
   */
  listPeers(): LightningPeer[] {
    return Array.from(this.knownPeers.values());
  }

  /**
   * Find peers that have channels for a specific asset.
   */
  findPeersForAsset(assetId: string): LightningPeer[] {
    return this.listPeers().filter(p =>
      p.supportsTaprootAssets && p.assetChannels.includes(assetId)
    );
  }

  /**
   * Connect to a peer via LND.
   */
  async connectToPeer(pubkey: string, address: string): Promise<void> {
    await this.channelManager.connectPeer(pubkey, address);
    const peer = this.knownPeers.get(pubkey);
    if (peer) {
      log.info({ pubkey: pubkey.substring(0, 16) + '...' }, 'Connected to peer');
    }
  }
}
