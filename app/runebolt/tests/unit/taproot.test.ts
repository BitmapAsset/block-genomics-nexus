import { ProofVerifier } from '../../src/taproot/ProofVerifier';
import { RuneWrapper } from '../../src/taproot/RuneWrapper';
import { AssetChannelManager } from '../../src/taproot/AssetChannelManager';
import { TaprootAssetManager } from '../../src/taproot/TaprootAssetManager';
import { RuneBoltConfig } from '../../src/types';

const mockConfig: RuneBoltConfig = {
  network: 'regtest',
  bitcoin: { rpcUrl: 'http://localhost:18443', rpcUser: 'bitcoin', rpcPass: 'bitcoin' },
  lnd: { host: 'localhost', port: 10009, tlsCertPath: '/tmp/tls.cert', macaroonPath: '/tmp/admin.macaroon' },
  tapd: { host: 'localhost', port: 10029, tlsCertPath: '/tmp/tls.cert', macaroonPath: '/tmp/admin.macaroon' },
  indexer: { ordApiUrl: 'http://localhost:80' },
  wallet: { dataDir: '/tmp/runebolt', walletFile: '/tmp/runebolt/wallet.enc', auditLogFile: '/tmp/runebolt/audit.log', unlockTimeoutMs: 600000, maxUnlockAttempts: 5, lockoutDurationMs: 300000 },
  server: { port: 3000, host: '127.0.0.1', corsOrigins: ['http://localhost:3000'] },
};

describe('ProofVerifier', () => {
  test('verifyWrappedRuneMetadata returns true for valid metadata', () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const verifier = new ProofVerifier(tapd);

    const metadata = Buffer.from(JSON.stringify({
      type: 'wrapped_rune',
      runeId: '840000:1',
      runeName: 'MY.RUNE',
    }));

    expect(verifier.verifyWrappedRuneMetadata(metadata, '840000:1', 'MY.RUNE')).toBe(true);
  });

  test('verifyWrappedRuneMetadata returns false for wrong type', () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const verifier = new ProofVerifier(tapd);

    const metadata = Buffer.from(JSON.stringify({
      type: 'something_else',
      runeId: '840000:1',
      runeName: 'MY.RUNE',
    }));

    expect(verifier.verifyWrappedRuneMetadata(metadata, '840000:1', 'MY.RUNE')).toBe(false);
  });

  test('verifyWrappedRuneMetadata returns false for wrong runeId', () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const verifier = new ProofVerifier(tapd);

    const metadata = Buffer.from(JSON.stringify({
      type: 'wrapped_rune',
      runeId: '999999:0',
      runeName: 'MY.RUNE',
    }));

    expect(verifier.verifyWrappedRuneMetadata(metadata, '840000:1', 'MY.RUNE')).toBe(false);
  });

  test('verifyWrappedRuneMetadata returns false for invalid JSON', () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const verifier = new ProofVerifier(tapd);
    expect(verifier.verifyWrappedRuneMetadata(Buffer.from('not json'), '1:0', 'X')).toBe(false);
  });

  test('computeAssetId returns deterministic hash', () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const verifier = new ProofVerifier(tapd);
    const id1 = verifier.computeAssetId('TEST', Buffer.from('meta'), 'aa'.repeat(32), 0);
    const id2 = verifier.computeAssetId('TEST', Buffer.from('meta'), 'aa'.repeat(32), 0);
    expect(id1).toBe(id2);
    expect(id1.length).toBe(64);
  });

  test('computeAssetId differs for different inputs', () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const verifier = new ProofVerifier(tapd);
    const id1 = verifier.computeAssetId('A', Buffer.from('meta'), 'aa'.repeat(32), 0);
    const id2 = verifier.computeAssetId('B', Buffer.from('meta'), 'aa'.repeat(32), 0);
    expect(id1).not.toBe(id2);
  });
});

describe('RuneWrapper', () => {
  test('wrap creates a pending operation', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const wrapper = new RuneWrapper(tapd);

    const op = await wrapper.wrap({
      runeId: { block: 840000, tx: 1 },
      runeName: 'TEST.RUNE',
      amount: 1000n,
      sourceUtxo: { txid: 'aa'.repeat(32), vout: 0, value: 546 },
      destinationPubkey: Buffer.alloc(32),
    });

    expect(op.state).toBe('pending');
    expect(op.runeName).toBe('TEST.RUNE');
    expect(op.runeAmount).toBe(1000n);
    expect(op.id).toBeTruthy();
  });

  test('wrap rejects invalid amount', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const wrapper = new RuneWrapper(tapd);

    await expect(wrapper.wrap({
      runeId: { block: 1, tx: 0 },
      runeName: 'X',
      amount: 0n,
      sourceUtxo: { txid: 'aa'.repeat(32), vout: 0, value: 546 },
      destinationPubkey: Buffer.alloc(32),
    })).rejects.toThrow('Invalid wrap amount');
  });

  test('getOperation retrieves stored operation', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const wrapper = new RuneWrapper(tapd);

    const op = await wrapper.wrap({
      runeId: { block: 1, tx: 0 },
      runeName: 'FIND.ME',
      amount: 5n,
      sourceUtxo: { txid: 'bb'.repeat(32), vout: 0, value: 546 },
      destinationPubkey: Buffer.alloc(32),
    });

    const found = wrapper.getOperation(op.id);
    expect(found.runeName).toBe('FIND.ME');
  });

  test('getOperation throws for unknown id', () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const wrapper = new RuneWrapper(tapd);
    expect(() => wrapper.getOperation('nonexistent')).toThrow('Wrap operation not found');
  });

  test('getAllOperations returns all', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const wrapper = new RuneWrapper(tapd);

    await wrapper.wrap({ runeId: { block: 1, tx: 0 }, runeName: 'A', amount: 1n, sourceUtxo: { txid: 'aa'.repeat(32), vout: 0, value: 546 }, destinationPubkey: Buffer.alloc(32) });
    await wrapper.wrap({ runeId: { block: 2, tx: 0 }, runeName: 'B', amount: 2n, sourceUtxo: { txid: 'bb'.repeat(32), vout: 0, value: 546 }, destinationPubkey: Buffer.alloc(32) });

    expect(wrapper.getAllOperations()).toHaveLength(2);
  });
});

describe('AssetChannelManager', () => {
  test('listChannels returns empty initially', () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const mgr = new AssetChannelManager(tapd, mockConfig);
    expect(mgr.listChannels()).toHaveLength(0);
  });

  test('getChannelsForAsset filters correctly', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    // Mock getAssetBalance
    (tapd as any).getAssetBalance = async () => 10000n;
    const mgr = new AssetChannelManager(tapd, mockConfig);

    await mgr.openChannel('02' + 'a'.repeat(64), 'aa'.repeat(32), 1000n);
    await mgr.openChannel('02' + 'b'.repeat(64), 'bb'.repeat(32), 2000n);

    const aaChannels = mgr.getChannelsForAsset('aa'.repeat(32));
    expect(aaChannels).toHaveLength(1);
    expect(aaChannels[0].assetId).toBe('aa'.repeat(32));
  });

  test('getTotalCapacity sums correctly', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    (tapd as any).getAssetBalance = async () => 50000n;
    const mgr = new AssetChannelManager(tapd, mockConfig);

    await mgr.openChannel('02' + 'a'.repeat(64), 'aa'.repeat(32), 1000n);
    await mgr.openChannel('02' + 'b'.repeat(64), 'aa'.repeat(32), 2000n);

    const cap = mgr.getTotalCapacity('aa'.repeat(32));
    expect(cap.local).toBe(3000n);
    expect(cap.total).toBe(3000n);
  });

  test('closeChannel removes channel', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    (tapd as any).getAssetBalance = async () => 10000n;
    const mgr = new AssetChannelManager(tapd, mockConfig);

    const ch = await mgr.openChannel('02' + 'a'.repeat(64), 'aa'.repeat(32), 1000n);
    expect(mgr.listChannels()).toHaveLength(1);
    await mgr.closeChannel(ch.channelId);
    expect(mgr.listChannels()).toHaveLength(0);
  });

  test('closeChannel throws for unknown channel', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    const mgr = new AssetChannelManager(tapd, mockConfig);
    await expect(mgr.closeChannel('nonexistent')).rejects.toThrow('Channel not found');
  });

  test('updateBalance adjusts local and remote', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    (tapd as any).getAssetBalance = async () => 10000n;
    const mgr = new AssetChannelManager(tapd, mockConfig);

    const ch = await mgr.openChannel('02' + 'a'.repeat(64), 'aa'.repeat(32), 1000n);
    mgr.updateBalance(ch.channelId, -200n);

    const channels = mgr.listChannels();
    expect(channels[0].localBalance).toBe(800n);
    expect(channels[0].remoteBalance).toBe(200n);
  });

  test('openChannel rejects insufficient balance', async () => {
    const tapd = new TaprootAssetManager(mockConfig);
    (tapd as any).getAssetBalance = async () => 100n;
    const mgr = new AssetChannelManager(tapd, mockConfig);

    await expect(
      mgr.openChannel('02' + 'a'.repeat(64), 'aa'.repeat(32), 1000n)
    ).rejects.toThrow('Insufficient asset balance');
  });
});
