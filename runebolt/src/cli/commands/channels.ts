import { Command } from 'commander';
import { RuneBolt } from '../../core/RuneBolt';
import { loadConfig } from '../../utils/config';

export const channelsCommand = new Command('channels')
  .description('Manage Taproot Asset Lightning channels')
  .addCommand(
    new Command('list')
      .description('List all channels')
      .action(async () => {
        try {
          const config = loadConfig();
          const bolt = new RuneBolt(config);
          const channels = bolt.assetChannels.listChannels();

          console.log('\n=== Taproot Asset Channels ===\n');
          if (channels.length === 0) {
            console.log('No channels found.');
          } else {
            for (const ch of channels) {
              console.log(`Channel: ${ch.channelId}`);
              console.log(`  Peer: ${ch.peerPubkey}`);
              console.log(`  Asset: ${ch.assetId}`);
              console.log(`  Local: ${ch.localBalance} | Remote: ${ch.remoteBalance}`);
              console.log(`  Status: ${ch.active ? 'active' : 'inactive'}`);
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
    new Command('open')
      .description('Open a new Taproot Asset channel')
      .requiredOption('--peer <pubkey>', 'Peer public key')
      .requiredOption('--asset <assetId>', 'Taproot Asset ID')
      .requiredOption('--amount <amount>', 'Local funding amount')
      .action(async (options) => {
        try {
          const config = loadConfig();
          const bolt = new RuneBolt(config);

          process.stdout.write('Password: ');
          const stdin = process.stdin;
          stdin.resume();
          stdin.setEncoding('utf-8');
          const password = await new Promise<string>((resolve) => {
            stdin.once('data', (data: string) => { stdin.pause(); resolve(data.trim()); });
          });
          await bolt.unlock(password);
          await bolt.connect();

          const channel = await bolt.openChannel(
            options.peer,
            options.asset,
            BigInt(options.amount),
          );

          console.log(`Channel opened: ${channel.channelId}`);
          console.log(`Local balance: ${channel.localBalance}`);

          bolt.lock();
          await bolt.disconnect();
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('close')
      .description('Close a channel')
      .requiredOption('--id <channelId>', 'Channel ID')
      .action(async (options) => {
        try {
          const config = loadConfig();
          const bolt = new RuneBolt(config);

          process.stdout.write('Password: ');
          const stdin = process.stdin;
          stdin.resume();
          stdin.setEncoding('utf-8');
          const password = await new Promise<string>((resolve) => {
            stdin.once('data', (data: string) => { stdin.pause(); resolve(data.trim()); });
          });
          await bolt.unlock(password);
          await bolt.connect();

          await bolt.closeChannel(options.id);
          console.log(`Channel ${options.id} closed.`);

          bolt.lock();
          await bolt.disconnect();
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }
      }),
  );
