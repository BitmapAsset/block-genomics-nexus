import { RoutingEngine } from '../../src/lightning/RoutingEngine';
import { PeerDiscovery } from '../../src/lightning/PeerDiscovery';
import { InvoiceManager } from '../../src/lightning/InvoiceManager';
import { AssetChannel, LightningPeer } from '../../src/types';

describe('RoutingEngine', () => {
  const makeChannel = (id: string, peer: string, asset: string, local: bigint): AssetChannel => ({
    channelId: id,
    peerPubkey: peer,
    assetId: asset,
    localBalance: local,
    remoteBalance: 0n,
    capacity: local,
    active: true,
  });

  test('findRoute returns null when no channels', () => {
    const engine = new RoutingEngine(() => []);
    expect(engine.findRoute('aa'.repeat(32), 100n, '02' + 'ff'.repeat(32))).toBeNull();
  });

  test('findRoute returns direct route when available', () => {
    const dest = '02' + 'dd'.repeat(32);
    const channels = [makeChannel('ch1', dest, 'aa'.repeat(32), 1000n)];
    const engine = new RoutingEngine(() => channels);

    const route = engine.findRoute('aa'.repeat(32), 100n, dest);
    expect(route).not.toBeNull();
    expect(route!.hops).toHaveLength(1);
    expect(route!.totalFee).toBe(0n);
    expect(route!.hops[0].pubkey).toBe(dest);
  });

  test('findRoute returns multi-hop when no direct', () => {
    const channels = [makeChannel('ch1', '02' + 'aa'.repeat(32), 'bb'.repeat(32), 5000n)];
    const engine = new RoutingEngine(() => channels);

    const route = engine.findRoute('bb'.repeat(32), 1000n, '02' + 'ff'.repeat(32));
    expect(route).not.toBeNull();
    expect(route!.hops.length).toBeGreaterThan(1);
    expect(route!.totalFee).toBeGreaterThan(0n);
  });

  test('findRoute returns null for insufficient balance', () => {
    const channels = [makeChannel('ch1', '02' + 'aa'.repeat(32), 'bb'.repeat(32), 10n)];
    const engine = new RoutingEngine(() => channels);
    expect(engine.findRoute('bb'.repeat(32), 100n, '02' + 'ff'.repeat(32))).toBeNull();
  });

  test('findRoutes returns at most maxRoutes', () => {
    const dest = '02' + 'dd'.repeat(32);
    const channels = [makeChannel('ch1', dest, 'aa'.repeat(32), 1000n)];
    const engine = new RoutingEngine(() => channels);

    const routes = engine.findRoutes('aa'.repeat(32), 100n, dest, 5);
    expect(routes.length).toBeLessThanOrEqual(5);
  });

  test('estimateFee returns 0 for no route', () => {
    const engine = new RoutingEngine(() => []);
    expect(engine.estimateFee('aa'.repeat(32), 100n, '02' + 'ff'.repeat(32))).toBe(0n);
  });
});

describe('PeerDiscovery', () => {
  test('addPeer and listPeers', () => {
    const discovery = new PeerDiscovery(null as any);
    const peer: LightningPeer = {
      pubkey: '02' + 'ab'.repeat(32),
      address: 'localhost:9735',
      alias: 'TestNode',
      supportsTaprootAssets: true,
      assetChannels: [],
    };
    discovery.addPeer(peer);
    expect(discovery.listPeers()).toHaveLength(1);
    expect(discovery.listPeers()[0].alias).toBe('TestNode');
  });

  test('removePeer', () => {
    const discovery = new PeerDiscovery(null as any);
    const pubkey = '02' + 'ab'.repeat(32);
    discovery.addPeer({ pubkey, address: 'a', alias: '', supportsTaprootAssets: true, assetChannels: [] });
    discovery.removePeer(pubkey);
    expect(discovery.listPeers()).toHaveLength(0);
  });

  test('getPeer', () => {
    const discovery = new PeerDiscovery(null as any);
    const pubkey = '02' + 'cd'.repeat(32);
    discovery.addPeer({ pubkey, address: 'b', alias: 'Node', supportsTaprootAssets: true, assetChannels: [] });
    expect(discovery.getPeer(pubkey)!.alias).toBe('Node');
    expect(discovery.getPeer('nonexistent')).toBeUndefined();
  });

  test('findPeersForAsset', () => {
    const discovery = new PeerDiscovery(null as any);
    const assetId = 'aa'.repeat(32);
    discovery.addPeer({ pubkey: '02' + 'a'.repeat(64), address: 'a', alias: 'A', supportsTaprootAssets: true, assetChannels: [assetId] });
    discovery.addPeer({ pubkey: '02' + 'b'.repeat(64), address: 'b', alias: 'B', supportsTaprootAssets: true, assetChannels: [] });
    discovery.addPeer({ pubkey: '02' + 'c'.repeat(64), address: 'c', alias: 'C', supportsTaprootAssets: false, assetChannels: [assetId] });

    const found = discovery.findPeersForAsset(assetId);
    expect(found).toHaveLength(1);
    expect(found[0].alias).toBe('A');
  });

  test('discoverPeers filters for TA support', async () => {
    const discovery = new PeerDiscovery(null as any);
    discovery.addPeer({ pubkey: '02' + 'a'.repeat(64), address: 'a', alias: 'Supports', supportsTaprootAssets: true, assetChannels: [] });
    discovery.addPeer({ pubkey: '02' + 'b'.repeat(64), address: 'b', alias: 'NoSupport', supportsTaprootAssets: false, assetChannels: [] });

    const peers = await discovery.discoverPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].alias).toBe('Supports');
  });
});

describe('InvoiceManager', () => {
  test('createAssetInvoice returns valid invoice', async () => {
    const mgr = new InvoiceManager(null as any);
    const invoice = await mgr.createAssetInvoice('aa'.repeat(32), 1000n, 'test');
    expect(invoice.paymentRequest).toBeTruthy();
    expect(invoice.paymentHash).toBeTruthy();
    expect(invoice.assetId).toBe('aa'.repeat(32));
    expect(invoice.assetAmount).toBe(1000n);
  });

  test('lookupInvoice retrieves stored invoice', async () => {
    const mgr = new InvoiceManager(null as any);
    const invoice = await mgr.createAssetInvoice('aa'.repeat(32), 500n);
    const found = mgr.lookupInvoice(invoice.paymentHash);
    expect(found).toBeDefined();
    expect(found!.assetAmount).toBe(500n);
  });

  test('listInvoices returns all', async () => {
    const mgr = new InvoiceManager(null as any);
    await mgr.createAssetInvoice('aa'.repeat(32), 100n);
    await mgr.createAssetInvoice('bb'.repeat(32), 200n);
    expect(mgr.listInvoices()).toHaveLength(2);
  });

  test('payAssetInvoice returns payment', async () => {
    const mgr = new InvoiceManager(null as any);
    const payment = await mgr.payAssetInvoice('lntb1000...', 'aa'.repeat(32));
    expect(payment.status).toBe('succeeded');
    expect(payment.paymentHash).toBeTruthy();
    expect(payment.preimage).toBeTruthy();
  });

  test('lookupPayment retrieves stored payment', async () => {
    const mgr = new InvoiceManager(null as any);
    const payment = await mgr.payAssetInvoice('lntb1000...', 'aa'.repeat(32));
    const found = mgr.lookupPayment(payment.paymentHash);
    expect(found).toBeDefined();
    expect(found!.status).toBe('succeeded');
  });

  test('listPayments returns all', async () => {
    const mgr = new InvoiceManager(null as any);
    await mgr.payAssetInvoice('ln1', 'aa'.repeat(32));
    await mgr.payAssetInvoice('ln2', 'bb'.repeat(32));
    expect(mgr.listPayments()).toHaveLength(2);
  });
});
