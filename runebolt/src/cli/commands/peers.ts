import { Command } from 'commander';
import { RuneBolt } from '../../core/RuneBolt';
import { loadConfig } from '../../utils/config';

export const peersCommand = new Command('peers')
  .description('Manage Lightning peers')
  .addCommand(
    new Command('list')
      .description('List known peers')
      .action(async () => {
        try {
          const config = loadConfig();
          const bolt = new RuneBolt(config);
          const peers = bolt.peerDiscovery.listPeers();

          console.log('\n=== Known Peers ===\n');
          if (peers.length === 0) {
            console.log('No peers found. Use "peers discover" to find Taproot Asset peers.');
          } else {
            for (const peer of peers) {
              console.log(`${peer.alias || 'unnamed'} (${peer.pubkey.substring(0, 16)}...)`);
              console.log(`  Address: ${peer.address}`);
              console.log(`  Taproot Assets: ${peer.supportsTaprootAssets ? 'yes' : 'no'}`);
              console.log(`  Asset channels: ${peer.assetChannels.length}`);
              console.log();
            }
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('discover')
      .description('Discover peers supporting Taproot Assets')
      .action(async () => {
        try {
          const config = loadConfig();
          const bolt = new RuneBolt(config);
          await bolt.connect();

          console.log('Discovering Taproot Asset capable peers...');
          const peers = await bolt.peerDiscovery.discoverPeers();

          if (peers.length === 0) {
            console.log('No Taproot Asset peers found on the network.');
          } else {
            for (const peer of peers) {
              console.log(`Found: ${peer.alias} (${peer.pubkey.substring(0, 16)}...)`);
            }
          }

          await bolt.disconnect();
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('add')
      .description('Add a peer manually')
      .requiredOption('--pubkey <pubkey>', 'Peer public key')
      .requiredOption('--address <address>', 'Peer address (host:port)')
      .option('--alias <alias>', 'Peer alias', '')
      .action(async (options) => {
        try {
          const config = loadConfig();
          const bolt = new RuneBolt(config);

          bolt.peerDiscovery.addPeer({
            pubkey: options.pubkey,
            address: options.address,
            alias: options.alias,
            supportsTaprootAssets: true,
            assetChannels: [],
          });

          console.log(`Peer added: ${options.pubkey.substring(0, 16)}...`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }
      }),
  );
