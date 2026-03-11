import { createLogger } from '../utils/logger';
import { PaymentRoute, RouteHop, AssetChannel } from '../types';

const log = createLogger('RoutingEngine');

export class RoutingEngine {
  private readonly getChannels: () => AssetChannel[];

  constructor(getChannels: () => AssetChannel[]) {
    this.getChannels = getChannels;
  }

  /**
   * Find a route for a Taproot Asset payment.
   * Routes through channels that support the specific asset.
   */
  findRoute(
    assetId: string,
    amount: bigint,
    destinationPubkey: string,
  ): PaymentRoute | null {
    log.info({
      assetId: assetId.substring(0, 16) + '...',
      amount: amount.toString(),
      dest: destinationPubkey.substring(0, 16) + '...',
    }, 'Finding route');

    const channels = this.getChannels().filter(
      ch => ch.assetId === assetId && ch.active && ch.localBalance >= amount
    );

    if (channels.length === 0) {
      log.warn('No channels with sufficient balance found');
      return null;
    }

    // Direct route: check if we have a direct channel to the destination
    const directChannel = channels.find(ch => ch.peerPubkey === destinationPubkey);
    if (directChannel) {
      const route: PaymentRoute = {
        hops: [{
          pubkey: destinationPubkey,
          channelId: directChannel.channelId,
          assetId,
          fee: 0n,
        }],
        totalFee: 0n,
        estimatedTime: 1,
      };
      log.info('Direct route found');
      return route;
    }

    // Multi-hop: find a path through intermediate nodes
    // In production, this would use a proper pathfinding algorithm
    // (modified Dijkstra's) on the channel graph filtered for asset support
    const firstHopChannel = channels[0];
    const route: PaymentRoute = {
      hops: [
        {
          pubkey: firstHopChannel.peerPubkey,
          channelId: firstHopChannel.channelId,
          assetId,
          fee: amount / 1000n, // 0.1% routing fee estimate
        },
        {
          pubkey: destinationPubkey,
          channelId: '',
          assetId,
          fee: 0n,
        },
      ],
      totalFee: amount / 1000n,
      estimatedTime: 2,
    };

    log.info({ hops: route.hops.length, totalFee: route.totalFee.toString() }, 'Route found');
    return route;
  }

  /**
   * Find multiple routes for redundancy.
   */
  findRoutes(
    assetId: string,
    amount: bigint,
    destinationPubkey: string,
    maxRoutes: number = 3,
  ): PaymentRoute[] {
    const routes: PaymentRoute[] = [];
    const primary = this.findRoute(assetId, amount, destinationPubkey);
    if (primary) routes.push(primary);
    // Additional routes would be found by excluding channels from previous routes
    return routes.slice(0, maxRoutes);
  }

  /**
   * Estimate fee for a payment amount.
   */
  estimateFee(assetId: string, amount: bigint, destinationPubkey: string): bigint {
    const route = this.findRoute(assetId, amount, destinationPubkey);
    return route?.totalFee ?? 0n;
  }
}
